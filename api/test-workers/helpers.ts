import { env } from "cloudflare:test";

// Every migration, inlined at build time by Vite and applied in filename order.
//
// There is no filesystem inside workerd, so these are imported rather than read. The glob is
// deliberate: naming migrations individually means the day someone adds 0003 the tests keep
// passing against a schema production no longer has — which is exactly what happened when 0002
// was added and this file still said 0001.
const MIGRATIONS = import.meta.glob("../migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** Apply every migration to this test file's isolated D1, in order. */
export async function applySchema(): Promise<void> {
  for (const path of Object.keys(MIGRATIONS).sort()) {
    const statements = MIGRATIONS[path]
      .replace(/--[^\n]*/g, "")   // strip comments; D1's exec wants plain statements
      .split(";")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    for (const statement of statements) {
      await env.DB.exec(statement);
    }
  }
}

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function challengeFor(verifier: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(buf));
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  email: string;
}

/**
 * Register a client and walk the whole OAuth flow, ending with a usable access token.
 * Every logging test starts from a real sign-in rather than a token minted behind the flow's
 * back, so the flow itself is exercised on every run.
 */
export async function signUp(
  app: { request: (url: string, init?: RequestInit, env?: unknown) => Promise<Response> },
  email: string,
  password = "correct-horse-battery-staple",
): Promise<Session> {
  const reg = await app.request("https://api.anatome.dev/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Test client", redirect_uris: [REDIRECT] }),
  }, env);
  const { client_id: clientId } = await reg.json() as { client_id: string };

  const verifier = `verifier-${crypto.randomUUID()}${crypto.randomUUID()}`;
  const challenge = await challengeFor(verifier);

  const form = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    mode: "signup",
    email,
    password,
  });
  const authorize = await app.request("https://api.anatome.dev/oauth/authorize", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  }, env);
  const location = authorize.headers.get("location");
  if (!location) throw new Error(`authorize did not redirect: ${authorize.status} ${await authorize.text()}`);
  const code = new URL(location).searchParams.get("code")!;

  const token = await app.request("https://api.anatome.dev/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: clientId,
    }).toString(),
  }, env);
  const body = await token.json() as { access_token: string; refresh_token: string };
  if (!body.access_token) throw new Error(`token exchange failed: ${JSON.stringify(body)}`);
  return { accessToken: body.access_token, refreshToken: body.refresh_token, clientId, email };
}

/** Call an MCP tool as a signed-in user. */
export async function callTool(
  app: { request: (url: string, init?: RequestInit, env?: unknown) => Promise<Response> },
  session: Session | null,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ isError: boolean; text: string; data: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cf-connecting-ip": "198.51.100.20",
    "mcp-session-id": `test-${name}-${Math.random()}`,
  };
  if (session) headers.authorization = `Bearer ${session.accessToken}`;

  const res = await app.request("https://api.anatome.dev/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  }, env);
  const body = await res.json() as {
    result: { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> };
  };
  return {
    isError: body.result.isError === true,
    text: body.result.content?.[0]?.text ?? "",
    data: body.result.structuredContent ?? {},
  };
}
