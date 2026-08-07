// Passwords, tokens and bearer resolution.
//
// Anatome runs its own tiny identity provider rather than delegating to Google or an auth SaaS,
// for one reason: a self-hoster must be able to run the whole product without registering with
// anybody. Adding "create a Google OAuth client" to SELF_HOSTING.md would quietly make the
// project not self-hostable.
//
// The cost of that choice is stated plainly rather than hidden: there is **no password reset**,
// because sending mail needs a provider this project deliberately does not have. A user who
// forgets their password can still export nothing and delete nothing — so account deletion is
// also offered from the signed-in account page, and PRIVACY.md says all of it out loud. Wiring
// Cloudflare Email Service is the obvious follow-up.

import { newId, nowUnix, sha256Hex, type DbEnv } from "./db.ts";

/**
 * PBKDF2-HMAC-SHA256 iterations.
 *
 * **This is the platform maximum, not the number we would choose.** Cloudflare Workers reject
 * anything higher:
 *
 *   NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported
 *
 * OWASP's guidance for PBKDF2-HMAC-SHA256 is 600 000, so this is ~6x weaker than the
 * recommendation. Saying so plainly rather than quietly shipping the cap and calling it best
 * practice: the mitigation available to us is the 10-character minimum in `passwordProblem`,
 * and users should use a password manager — which the sign-up page tells them, since there is
 * no password reset either.
 *
 * The count is stored per user (`users.iterations`) and read back by `verifyPassword`, so if
 * the platform raises the cap — or this moves to a runtime with argon2/scrypt — new and rotated
 * passwords can use a higher number without invalidating anyone's existing login.
 *
 * ⚠️ `wrangler dev --local` does NOT enforce this cap. 600 000 passed the whole test suite and a
 * full local end-to-end sign-up, then 500'd on the first real request in production. A test in
 * test-workers/oauth.test.ts pins this value, because the runtime under test will not.
 */
export const PBKDF2_ITERATIONS = 100_000;
/** The hard ceiling workerd enforces in production. Exceeding it throws NotSupportedError. */
export const PBKDF2_MAX_ITERATIONS = 100_000;

const ACCESS_TOKEN_TTL = 60 * 60;            // 1 hour
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 60; // 60 days
const SESSION_TTL = 60 * 60 * 24 * 14;       // 14 days, browser cookie for /account
const AUTH_CODE_TTL = 60;                    // 1 minute; the code is exchanged immediately

export { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, SESSION_TTL, AUTH_CODE_TTL };

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export function newSalt(): string {
  return b64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(
  password: string,
  salt: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: unb64(salt), iterations, hash: "SHA-256" }, key, 256,
  );
  return b64(new Uint8Array(bits));
}

/**
 * Constant-time comparison. `a === b` on secrets leaks their common prefix through timing;
 * cheap to avoid, so avoid it.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
  iterations: number,
): Promise<boolean> {
  const candidate = await hashPassword(password, salt, iterations);
  return timingSafeEqual(candidate, hash);
}

/** Minimum viable password policy. Length beats composition rules; NIST agrees. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 10) {
    return "Password must be at least 10 characters.";
  }
  if (password.length > 512) return "Password must be at most 512 characters.";
  return null;
}

export function emailProblem(email: unknown): string | null {
  if (typeof email !== "string" || !email.trim()) return "Email is required.";
  const value = email.trim();
  if (value.length > 254) return "Email is too long.";
  // Deliberately permissive: the only authority on whether an address is real is delivering to
  // it, and we do not send mail. Reject the shapes that are certainly wrong and move on.
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value)) return "That does not look like an email address.";
  return null;
}

// ---------------------------------------------------------------------------
// Tokens — stored as SHA-256 hashes, never in plaintext
// ---------------------------------------------------------------------------

export type TokenKind = "access" | "refresh" | "session";

export interface IssuedToken {
  /** The value handed to the client. Never stored. */
  token: string;
  expiresAt: number;
}

export async function issueToken(
  db: D1Database,
  kind: TokenKind,
  userId: string,
  clientId: string | null,
  ttlSeconds: number,
  scope = "",
): Promise<IssuedToken> {
  const token = `ana_${kind[0]}_${newId()}${newId()}`;
  const expiresAt = nowUnix() + ttlSeconds;
  await db.prepare(
    `INSERT INTO tokens (token_hash, kind, user_id, client_id, scope, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(await sha256Hex(token), kind, userId, clientId, scope, expiresAt, nowUnix()).run();
  return { token, expiresAt };
}

export interface TokenRow {
  token_hash: string;
  kind: TokenKind;
  user_id: string;
  client_id: string | null;
  scope: string;
  expires_at: number;
  revoked_at: number | null;
}

/** Resolve a token to its row, or null when unknown, expired or revoked. */
export async function resolveToken(
  db: D1Database,
  token: string,
  kind: TokenKind,
): Promise<TokenRow | null> {
  if (!token) return null;
  const row = await db.prepare("SELECT * FROM tokens WHERE token_hash = ? AND kind = ?")
    .bind(await sha256Hex(token), kind)
    .first<TokenRow>();
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at <= nowUnix()) return null;
  return row;
}

export async function revokeToken(db: D1Database, token: string): Promise<void> {
  await db.prepare("UPDATE tokens SET revoked_at = ? WHERE token_hash = ?")
    .bind(nowUnix(), await sha256Hex(token)).run();
}

/** Sign out everywhere — used after a password change. */
export async function revokeAllUserTokens(db: D1Database, userId: string): Promise<void> {
  await db.prepare("UPDATE tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .bind(nowUnix(), userId).run();
}

/** Best-effort cleanup of expired rows. Cheap, and keeps the tables from growing forever. */
export async function pruneExpired(db: D1Database): Promise<void> {
  const cutoff = nowUnix();
  await db.batch([
    db.prepare("DELETE FROM auth_codes WHERE expires_at < ?").bind(cutoff),
    db.prepare("DELETE FROM tokens WHERE expires_at < ?").bind(cutoff),
  ]);
}

// ---------------------------------------------------------------------------
// Request → identity
// ---------------------------------------------------------------------------

export interface Identity {
  userId: string;
  scope: string;
}

/**
 * Identify the caller from `Authorization: Bearer`. Returns null for anonymous callers, which is
 * a perfectly normal state here — the catalog works signed out.
 */
export async function identifyRequest(req: Request, env: DbEnv): Promise<Identity | null> {
  if (!env.DB) return null;
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const row = await resolveToken(env.DB, m[1].trim(), "access");
  return row ? { userId: row.user_id, scope: row.scope } : null;
}

/** Read the browser session cookie used by the /account page. */
export function sessionCookie(req: Request): string | null {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === "anatome_session") return rest.join("=") || null;
  }
  return null;
}

export function buildSessionCookie(token: string, maxAge = SESSION_TTL): string {
  return `anatome_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export const CLEAR_SESSION_COOKIE = "anatome_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

/** base64url of the SHA-256 of the verifier — the `S256` method, the only one accepted. */
export async function s256Challenge(verifier: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
