// OAuth 2.1 authorization server, self-contained.
//
// This is what makes onboarding one click. An MCP client that gets a 401 with a
// `WWW-Authenticate: Bearer resource_metadata=...` header discovers this server, registers itself
// (RFC 7591), opens a browser, and comes back with a token — the user pastes a URL and signs in,
// nothing else. That is the same flow nutrition-mcp.com uses, and it is why neither of us needs
// an API key.
//
// Deliberately small and dependency-free:
//   - Only the authorization-code grant, only PKCE S256. No implicit, no password grant, no
//     client_credentials — OAuth 2.1 removes them and there is no reason to carry them.
//   - Public clients only. A remote MCP client cannot keep a secret, so pretending otherwise
//     would be theatre; security comes from PKCE plus exact redirect-URI matching.
//   - Codes and tokens are stored as SHA-256 hashes. A database read cannot replay a session.
//   - The sign-in page always asks for the password, even when a session cookie exists. It costs
//     the user one password entry every couple of months and removes consent-hijacking (CSRF
//     against an approve button) as a category.

import type { Context } from "hono";
import {
  hasDb, findUserByEmail, insertUser, newId, nowIso, nowUnix, sha256Hex, type DbEnv, type UserRow,
} from "../lib/db.ts";
import {
  ACCESS_TOKEN_TTL, AUTH_CODE_TTL, REFRESH_TOKEN_TTL, SESSION_TTL,
  buildSessionCookie, emailProblem, hashPassword, issueToken, newSalt, passwordProblem,
  PBKDF2_ITERATIONS, resolveToken, revokeToken, s256Challenge, timingSafeEqual, verifyPassword,
} from "../lib/auth.ts";
import { DEFAULT_TIMEZONE } from "../lib/tz.ts";

type Ctx = Context<{ Bindings: DbEnv }>;

const SCOPE = "anatome.logging";

function baseUrl(c: Ctx): string {
  return c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin;
}

function noDb(c: Ctx): Response {
  // An honest 501 rather than a 500: this deployment simply has no accounts.
  return c.json({
    error: "accounts_unavailable",
    error_description:
      "This Anatome deployment has no database bound, so it has no accounts and no personal logging. The catalog, diagram and search tools work without signing in.",
  }, 501);
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/** RFC 9728 — tells a client which authorization server guards this resource. */
export function protectedResourceMetadata(c: Ctx): Response {
  const base = baseUrl(c);
  return c.json({
    resource: base,
    authorization_servers: [base],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://anatome.dev/docs",
  });
}

/** RFC 8414 — the authorization server's own capabilities. */
export function authorizationServerMetadata(c: Ctx): Response {
  const base = baseUrl(c);
  return c.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    scopes_supported: [SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
  });
}

/** The 401 that starts the whole dance. */
export function unauthorizedWithDiscovery(c: Ctx, description: string): Response {
  const base = baseUrl(c);
  return new Response(JSON.stringify({
    error: "unauthorized",
    error_description: description,
    sign_in: `${base}/oauth/authorize`,
  }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer realm="anatome", resource_metadata="${base}/.well-known/oauth-protected-resource"`,
    },
  });
}

// ---------------------------------------------------------------------------
// Dynamic client registration (RFC 7591)
// ---------------------------------------------------------------------------

export async function registerClient(c: Ctx): Promise<Response> {
  if (!hasDb(c.env)) return noDb(c);
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: "invalid_client_metadata" }, 400); }

  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u) => typeof u === "string") as string[] : [];
  if (!uris.length) {
    return c.json({ error: "invalid_redirect_uri", error_description: "redirect_uris is required." }, 400);
  }
  for (const uri of uris) {
    let parsed: URL;
    try { parsed = new URL(uri); } catch {
      return c.json({ error: "invalid_redirect_uri", error_description: `Not a URL: ${uri}` }, 400);
    }
    // http is allowed only on loopback, which is how a desktop client receives the callback.
    const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
      return c.json({
        error: "invalid_redirect_uri",
        error_description: `redirect_uri must be https, or http on loopback: ${uri}`,
      }, 400);
    }
  }

  const clientId = newId("client");
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 120) : "";
  await c.env.DB.prepare(
    "INSERT INTO oauth_clients (client_id, client_name, redirect_uris, created_at) VALUES (?, ?, ?, ?)",
  ).bind(clientId, name, JSON.stringify(uris), nowIso()).run();

  return c.json({
    client_id: clientId,
    client_name: name,
    redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }, 201);
}

interface ClientRow { client_id: string; client_name: string; redirect_uris: string }

async function loadClient(env: DbEnv & { DB: D1Database }, clientId: string): Promise<{ row: ClientRow; uris: string[] } | null> {
  const row = await env.DB.prepare("SELECT * FROM oauth_clients WHERE client_id = ?")
    .bind(clientId).first<ClientRow>();
  if (!row) return null;
  let uris: string[] = [];
  try { uris = JSON.parse(row.redirect_uris); } catch { uris = []; }
  return { row, uris };
}

// ---------------------------------------------------------------------------
// Authorize
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * The sign-in page. Server-rendered, no framework, no external asset — it must work on a
 * locked-down network and it must not leak the fact that someone is signing in to a CDN.
 */
function renderAuthorizePage(opts: {
  clientName: string;
  params: Record<string, string>;
  mode: "signin" | "signup";
  error?: string;
}): string {
  const { clientName, params, mode, error } = opts;
  const hidden = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("\n      ");
  const other = mode === "signin" ? "signup" : "signin";
  const otherLabel = mode === "signin" ? "Create one" : "Sign in instead";
  const submit = mode === "signin" ? "Sign in and connect" : "Create account and connect";
  const who = clientName ? esc(clientName) : "An application";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Connect to Anatome</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#0f172a; --muted:#64748b; --line:#e2e8f0; --brand:#dc2626; --card:#fff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0a0e17; --fg:#e2e8f0; --muted:#94a3b8; --line:#1e293b; --card:#0f1522; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px;
         background:var(--bg); color:var(--fg);
         font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  .card { width:100%; max-width:420px; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:28px; }
  h1 { margin:0 0 6px; font-size:20px; letter-spacing:-0.01em; }
  p.sub { margin:0 0 20px; color:var(--muted); font-size:14px; }
  label { display:block; font-size:13px; font-weight:600; margin:14px 0 5px; }
  input[type=email], input[type=password] { width:100%; padding:10px 12px; border:1px solid var(--line);
    border-radius:9px; background:var(--bg); color:var(--fg); font-size:15px; }
  input:focus { outline:2px solid var(--brand); outline-offset:1px; }
  button { width:100%; margin-top:20px; padding:11px 14px; border:0; border-radius:9px;
    background:var(--brand); color:#fff; font-size:15px; font-weight:600; cursor:pointer; }
  button:hover { opacity:.92; }
  .err { margin:14px 0 0; padding:10px 12px; border-radius:9px; font-size:13px;
    background:rgba(220,38,38,.12); color:var(--brand); }
  .alt { margin-top:18px; font-size:13px; color:var(--muted); text-align:center; }
  .alt a { color:var(--brand); }
  .scope { margin:18px 0 0; padding:12px; border:1px solid var(--line); border-radius:9px;
    font-size:13px; color:var(--muted); }
  .scope strong { color:var(--fg); }
  .note { margin-top:14px; font-size:12px; color:var(--muted); }
</style>
</head>
<body>
  <main class="card">
    <h1>Connect to Anatome</h1>
    <p class="sub">${who} wants to log meals and workouts to your Anatome account.</p>

    <div class="scope">
      It will be able to <strong>read and write your own food, workout and body-weight logs</strong>.
      It cannot see anyone else's data, and Anatome never sells or shares yours.
    </div>

    ${error ? `<p class="err">${esc(error)}</p>` : ""}

    <form method="post" action="/oauth/authorize">
      ${hidden}
      <input type="hidden" name="mode" value="${mode}">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" required autofocus>
      <label for="password">Password</label>
      <input id="password" name="password" type="password"
             autocomplete="${mode === "signin" ? "current-password" : "new-password"}"
             minlength="10" required>
      ${mode === "signup" ? '<p class="note">At least 10 characters. There is no password reset — Anatome sends no email — so use a password manager.</p>' : ""}
      <button type="submit">${submit}</button>
    </form>

    <p class="alt">
      ${mode === "signin" ? "No account yet?" : "Already have an account?"}
      <a href="?${esc(new URLSearchParams({ ...params, mode: other }).toString())}">${otherLabel}</a>
    </p>
  </main>
</body>
</html>`;
}

const CARRIED = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"];

function carriedParams(source: URLSearchParams | FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of CARRIED) {
    const v = source.get(key);
    if (typeof v === "string" && v) out[key] = v;
  }
  return out;
}

/** Errors that must NOT redirect: we cannot trust the redirect_uri yet, so we render them. */
function authorizeError(c: Ctx, message: string): Response {
  return c.html(
    `<!doctype html><meta charset="utf-8"><title>Cannot connect</title>
     <body style="font:15px/1.6 system-ui;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
     <div style="max-width:420px"><h1 style="font-size:19px;margin:0 0 8px">Cannot connect</h1>
     <p style="color:#64748b;margin:0">${esc(message)}</p></div></body>`,
    400,
  );
}

export async function getAuthorize(c: Ctx): Promise<Response> {
  if (!hasDb(c.env)) return noDb(c);
  const q = new URL(c.req.url).searchParams;

  const clientId = q.get("client_id") || "";
  const redirectUri = q.get("redirect_uri") || "";
  const challenge = q.get("code_challenge") || "";
  const method = q.get("code_challenge_method") || "";

  if (!clientId) return authorizeError(c, "Missing client_id.");
  const client = await loadClient(c.env, clientId);
  if (!client) return authorizeError(c, "Unknown client. It may need to register again.");
  if (!redirectUri || !client.uris.includes(redirectUri)) {
    // Exact match only. Prefix matching on redirect URIs is how authorization codes get stolen.
    return authorizeError(c, "redirect_uri does not exactly match one registered for this client.");
  }
  if (q.get("response_type") !== "code") {
    return redirectWithError(redirectUri, q.get("state"), "unsupported_response_type", "Only response_type=code is supported.");
  }
  if (!challenge || method !== "S256") {
    return redirectWithError(redirectUri, q.get("state"), "invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }

  const mode = q.get("mode") === "signup" ? "signup" : "signin";
  return c.html(renderAuthorizePage({ clientName: client.row.client_name, params: carriedParams(q), mode }));
}

function redirectWithError(redirectUri: string, state: string | null, error: string, description: string): Response {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  u.searchParams.set("error_description", description);
  if (state) u.searchParams.set("state", state);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

export async function postAuthorize(c: Ctx): Promise<Response> {
  if (!hasDb(c.env)) return noDb(c);
  const form = await c.req.formData();
  const params = carriedParams(form);
  const clientId = params.client_id || "";
  const redirectUri = params.redirect_uri || "";
  const mode = form.get("mode") === "signup" ? "signup" : "signin";
  const email = String(form.get("email") || "");
  const password = String(form.get("password") || "");

  const client = clientId ? await loadClient(c.env, clientId) : null;
  if (!client) return authorizeError(c, "Unknown client.");
  if (!redirectUri || !client.uris.includes(redirectUri)) {
    return authorizeError(c, "redirect_uri does not exactly match one registered for this client.");
  }
  if (params.code_challenge_method !== "S256" || !params.code_challenge) {
    return redirectWithError(redirectUri, params.state || null, "invalid_request", "PKCE S256 is required.");
  }

  const page = (error: string) => c.html(
    renderAuthorizePage({ clientName: client.row.client_name, params, mode, error }), 400,
  );

  let user: UserRow | null;
  if (mode === "signup") {
    const emailErr = emailProblem(email);
    if (emailErr) return page(emailErr);
    const pwErr = passwordProblem(password);
    if (pwErr) return page(pwErr);
    if (await findUserByEmail(c.env.DB, email)) {
      return page("An account with that email already exists. Sign in instead.");
    }
    const salt = newSalt();
    const row: UserRow = {
      id: newId("user"),
      email: email.trim(),
      email_lower: email.trim().toLowerCase(),
      password_hash: await hashPassword(password, salt),
      password_salt: salt,
      iterations: PBKDF2_ITERATIONS,
      timezone: DEFAULT_TIMEZONE,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    await insertUser(c.env.DB, row);
    user = row;
  } else {
    user = await findUserByEmail(c.env.DB, email);
    // One message for "no such user" and "wrong password" — distinguishing them turns the login
    // form into an account-enumeration oracle.
    if (!user || !(await verifyPassword(password, user.password_hash, user.password_salt, user.iterations))) {
      return page("Email or password is incorrect.");
    }
  }

  // Mint a single-use, PKCE-bound authorization code.
  const code = `ana_code_${newId()}`;
  await c.env.DB.prepare(
    `INSERT INTO auth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    await sha256Hex(code), clientId, user.id, redirectUri, params.code_challenge,
    params.scope || SCOPE, nowUnix() + AUTH_CODE_TTL, nowUnix(),
  ).run();

  // A browser session too, so the user lands signed in on /account without a second login.
  const session = await issueToken(c.env.DB, "session", user.id, null, SESSION_TTL);

  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (params.state) target.searchParams.set("state", params.state);
  return new Response(null, {
    status: 302,
    headers: { Location: target.toString(), "Set-Cookie": buildSessionCookie(session.token) },
  });
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

interface CodeRow {
  code_hash: string; client_id: string; user_id: string; redirect_uri: string;
  code_challenge: string; scope: string; expires_at: number; used_at: number | null;
}

export async function postToken(c: Ctx): Promise<Response> {
  if (!hasDb(c.env)) return noDb(c);

  let form: FormData;
  try { form = await c.req.formData(); } catch {
    return c.json({ error: "invalid_request", error_description: "Expected application/x-www-form-urlencoded." }, 400);
  }
  const grant = String(form.get("grant_type") || "");

  if (grant === "authorization_code") {
    const code = String(form.get("code") || "");
    const verifier = String(form.get("code_verifier") || "");
    const clientId = String(form.get("client_id") || "");
    const redirectUri = String(form.get("redirect_uri") || "");
    if (!code || !verifier) {
      return c.json({ error: "invalid_request", error_description: "code and code_verifier are required." }, 400);
    }

    const row = await c.env.DB.prepare("SELECT * FROM auth_codes WHERE code_hash = ?")
      .bind(await sha256Hex(code)).first<CodeRow>();
    if (!row) return c.json({ error: "invalid_grant", error_description: "Unknown or already-used code." }, 400);

    // Burn the code before validating anything else. A code that fails validation is still
    // spent — otherwise a wrong verifier can be retried until it is guessed right.
    await c.env.DB.prepare("DELETE FROM auth_codes WHERE code_hash = ?").bind(row.code_hash).run();

    if (row.used_at || row.expires_at <= nowUnix()) {
      return c.json({ error: "invalid_grant", error_description: "Code expired. Start the sign-in again." }, 400);
    }
    if (clientId && clientId !== row.client_id) {
      return c.json({ error: "invalid_grant", error_description: "client_id does not match the code." }, 400);
    }
    if (redirectUri && redirectUri !== row.redirect_uri) {
      return c.json({ error: "invalid_grant", error_description: "redirect_uri does not match the code." }, 400);
    }
    if (!timingSafeEqual(await s256Challenge(verifier), row.code_challenge)) {
      return c.json({ error: "invalid_grant", error_description: "PKCE verification failed." }, 400);
    }

    return issuePair(c, row.user_id, row.client_id, row.scope);
  }

  if (grant === "refresh_token") {
    const presented = String(form.get("refresh_token") || "");
    const row = await resolveToken(c.env.DB, presented, "refresh");
    if (!row) return c.json({ error: "invalid_grant", error_description: "Unknown, expired or revoked refresh token." }, 400);
    // Rotate: the presented token dies with the response that replaces it.
    await revokeToken(c.env.DB, presented);
    return issuePair(c, row.user_id, row.client_id, row.scope);
  }

  return c.json({
    error: "unsupported_grant_type",
    error_description: "Supported grants: authorization_code, refresh_token.",
  }, 400);
}

async function issuePair(c: Ctx, userId: string, clientId: string | null, scope: string): Promise<Response> {
  const db = (c.env as DbEnv & { DB: D1Database }).DB;
  const access = await issueToken(db, "access", userId, clientId, ACCESS_TOKEN_TTL, scope);
  const refresh = await issueToken(db, "refresh", userId, clientId, REFRESH_TOKEN_TTL, scope);
  return c.json({
    access_token: access.token,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refresh.token,
    scope: scope || SCOPE,
  }, 200, { "Cache-Control": "no-store", Pragma: "no-cache" });
}

/** RFC 7009. Always 200 — telling a caller their token was already invalid helps nobody but them. */
export async function postRevoke(c: Ctx): Promise<Response> {
  if (!hasDb(c.env)) return noDb(c);
  try {
    const form = await c.req.formData();
    const token = String(form.get("token") || "");
    if (token) await revokeToken(c.env.DB, token);
  } catch { /* fall through to 200 */ }
  return c.json({ ok: true });
}
