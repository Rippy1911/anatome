// OAuth 2.1 against a real workerd + D1.
//
// These are the tests that decide whether "paste a URL and sign in" is safe. A stub database
// would only prove that my mock behaves the way I imagined; this runs the real runtime.

import { env } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";
import app from "../src/index.ts";
import { applySchema, challengeFor, signUp } from "./helpers.ts";

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

beforeAll(applySchema);

async function registerClient(redirectUris = [REDIRECT]) {
  const res = await app.request("https://api.anatome.dev/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Test", redirect_uris: redirectUris }),
  }, env);
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

describe("discovery", () => {
  it("publishes protected-resource metadata pointing at itself", async () => {
    const res = await app.request("https://api.anatome.dev/.well-known/oauth-protected-resource", {}, env);
    const body = await res.json() as { authorization_servers: string[]; resource: string };
    expect(res.status).toBe(200);
    expect(body.authorization_servers[0]).toBe(body.resource);
  });

  it("advertises only the grants and PKCE method OAuth 2.1 allows", async () => {
    const res = await app.request("https://api.anatome.dev/.well-known/oauth-authorization-server", {}, env);
    const body = await res.json() as Record<string, string[]>;
    expect(body.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
    // No implicit, no password grant. They are removed in 2.1 and carrying them would be a
    // downgrade path an attacker could ask for.
    expect(body.response_types_supported).toEqual(["code"]);
  });
});

describe("dynamic client registration", () => {
  it("registers a client with no credentials required", async () => {
    const { status, body } = await registerClient();
    expect(status).toBe(201);
    expect(String(body.client_id)).toMatch(/^client_/);
    expect(body.token_endpoint_auth_method).toBe("none");
  });

  it("rejects a non-https redirect_uri that is not loopback", async () => {
    const { status, body } = await registerClient(["http://evil.example.com/cb"]);
    expect(status).toBe(400);
    expect(body.error).toBe("invalid_redirect_uri");
  });

  it("allows http on loopback, which is how desktop clients receive the callback", async () => {
    const { status } = await registerClient(["http://127.0.0.1:8976/callback"]);
    expect(status).toBe(201);
  });

  it("requires at least one redirect_uri", async () => {
    const { status, body } = await registerClient([]);
    expect(status).toBe(400);
    expect(body.error).toBe("invalid_redirect_uri");
  });
});

describe("authorize", () => {
  it("renders a sign-in page for a valid request", async () => {
    const { body } = await registerClient();
    const url = new URL("https://api.anatome.dev/oauth/authorize");
    url.searchParams.set("client_id", String(body.client_id));
    url.searchParams.set("redirect_uri", REDIRECT);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("code_challenge", await challengeFor("v".repeat(50)));
    url.searchParams.set("code_challenge_method", "S256");
    const res = await app.request(url.toString(), {}, env);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("Connect to Anatome");
    // Self-contained: a page where someone types their password must not load anything from a
    // third party, and must not tell one that a sign-in is happening. Assert on the things that
    // actually fetch — a carried redirect_uri in a link is data, not a load.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link[^>]+rel=["']?stylesheet/i);
    expect(html).not.toMatch(/<img|<iframe|<object|<embed/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/url\(\s*["']?https?:/i);
  });

  it("refuses a redirect_uri that only prefix-matches", async () => {
    const { body } = await registerClient();
    const url = new URL("https://api.anatome.dev/oauth/authorize");
    url.searchParams.set("client_id", String(body.client_id));
    // A prefix match here is how authorization codes get stolen.
    url.searchParams.set("redirect_uri", `${REDIRECT}.evil.example.com`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("code_challenge", "x");
    url.searchParams.set("code_challenge_method", "S256");
    const res = await app.request(url.toString(), {}, env);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("does not exactly match");
  });

  it("refuses to proceed without PKCE S256", async () => {
    const { body } = await registerClient();
    const url = new URL("https://api.anatome.dev/oauth/authorize");
    url.searchParams.set("client_id", String(body.client_id));
    url.searchParams.set("redirect_uri", REDIRECT);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("code_challenge_method", "plain");
    url.searchParams.set("code_challenge", "whatever");
    const res = await app.request(url.toString(), {}, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=invalid_request");
  });

  it("gives the same answer for a wrong password and an unknown account", async () => {
    // Different answers turn the sign-in form into an account-enumeration oracle.
    const { body } = await registerClient();
    const base = {
      client_id: String(body.client_id),
      redirect_uri: REDIRECT,
      code_challenge: await challengeFor("v".repeat(50)),
      code_challenge_method: "S256",
      mode: "signin",
      password: "definitely-wrong-password",
    };
    await signUp(app, "enumeration@example.com");

    const attempt = async (email: string) => {
      const res = await app.request("https://api.anatome.dev/oauth/authorize", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...base, email }).toString(),
      }, env);
      return (await res.text()).match(/class="err">([^<]*)</)?.[1] ?? "";
    };

    const known = await attempt("enumeration@example.com");
    const unknown = await attempt("nobody-here@example.com");
    expect(known).toBe(unknown);
    expect(known).toContain("incorrect");
  });
});

describe("token", () => {
  it("issues an access + refresh pair for a correct verifier", async () => {
    const session = await signUp(app, "pair@example.com");
    expect(session.accessToken).toMatch(/^ana_a_/);
    expect(session.refreshToken).toMatch(/^ana_r_/);
  });

  it("burns the code even when PKCE fails, so a verifier cannot be brute-forced", async () => {
    const { body } = await registerClient();
    const clientId = String(body.client_id);
    const verifier = "v".repeat(60);
    const form = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: await challengeFor(verifier),
      code_challenge_method: "S256",
      mode: "signup",
      email: "burn@example.com",
      password: "correct-horse-battery-staple",
    });
    const authorize = await app.request("https://api.anatome.dev/oauth/authorize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    }, env);
    const code = new URL(authorize.headers.get("location")!).searchParams.get("code")!;

    const exchange = (v: string) => app.request("https://api.anatome.dev/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: v, client_id: clientId }).toString(),
    }, env);

    const wrong = await exchange("not-the-verifier");
    expect((await wrong.json() as { error_description: string }).error_description).toContain("PKCE");

    // The correct verifier must now fail too: one guess is all anyone gets.
    const right = await exchange(verifier);
    expect((await right.json() as { error: string }).error).toBe("invalid_grant");
  });

  it("rotates refresh tokens and invalidates the presented one", async () => {
    const session = await signUp(app, "rotate@example.com");
    const refresh = (token: string) => app.request("https://api.anatome.dev/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: token }).toString(),
    }, env);

    const first = await refresh(session.refreshToken);
    const body = await first.json() as { access_token: string; refresh_token: string };
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).not.toBe(session.refreshToken);

    const replay = await refresh(session.refreshToken);
    expect((await replay.json() as { error: string }).error).toBe("invalid_grant");
  });

  it("rejects grant types OAuth 2.1 removed", async () => {
    for (const grant of ["password", "implicit", "client_credentials"]) {
      const res = await app.request("https://api.anatome.dev/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: grant }).toString(),
      }, env);
      expect((await res.json() as { error: string }).error).toBe("unsupported_grant_type");
    }
  });

  it("revokes a token so it stops working", async () => {
    const session = await signUp(app, "revoke@example.com");
    await app.request("https://api.anatome.dev/oauth/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: session.accessToken }).toString(),
    }, env);

    const res = await app.request("https://api.anatome.dev/v1/profile", {
      headers: { authorization: `Bearer ${session.accessToken}` },
    }, env);
    expect(res.status).toBe(401);
  });
});

describe("the 401 that starts the flow", () => {
  it("points an MCP client at the resource metadata", async () => {
    const res = await app.request("https://api.anatome.dev/v1/meals", {}, env);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata=");
  });
});

describe("password storage", () => {
  it("never stores the password, only a salted hash", async () => {
    const password = "correct-horse-battery-staple";
    await signUp(app, "hashing@example.com", password);
    const row = await env.DB.prepare("SELECT * FROM users WHERE email_lower = ?")
      .bind("hashing@example.com").first<Record<string, unknown>>();
    expect(row).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain(password);
    expect(String(row!.password_salt).length).toBeGreaterThan(10);
    expect(Number(row!.iterations)).toBeGreaterThanOrEqual(600_000);
  });

  it("gives two accounts with the same password different hashes", async () => {
    const password = "correct-horse-battery-staple";
    await signUp(app, "salt-a@example.com", password);
    await signUp(app, "salt-b@example.com", password);
    const rows = await env.DB.prepare(
      "SELECT password_hash FROM users WHERE email_lower IN ('salt-a@example.com','salt-b@example.com')",
    ).all<{ password_hash: string }>();
    expect(rows.results).toHaveLength(2);
    expect(rows.results[0].password_hash).not.toBe(rows.results[1].password_hash);
  });

  it("stores tokens as hashes, not plaintext", async () => {
    const session = await signUp(app, "tokenhash@example.com");
    const hit = await env.DB.prepare("SELECT COUNT(*) AS n FROM tokens WHERE token_hash = ?")
      .bind(session.accessToken).first<{ n: number }>();
    expect(hit?.n).toBe(0);
  });
});
