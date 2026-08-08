// Operator surface. Every route requires `Authorization: Bearer $ADMIN_TOKEN`.
//
// This used to be a BFF for issuing and revoking `ana_*` API keys. Anatome is keyless now, so
// all that is left is looking at aggregate traffic and un-sticking a fair-use bucket for someone
// who got wedged.

import type { Context } from "hono";
import { resetDayBucket } from "../lib/rateLimit.ts";
// DbEnv, not the rate limiter's Env: resolving an email to an account needs the (optional) D1
// binding, and `hasDb` is how every other route asks whether this deployment has accounts at all.
import { hasDb, type DbEnv as Env } from "../lib/db.ts";

function unauthorized(): Response {
  // 404 (not 401) so the admin surface is not trivially enumerable — same pattern as /selfTest.
  return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

export function requireAdmin(c: Context<{ Bindings: Env }>): boolean {
  const token = c.env.ADMIN_TOKEN;
  if (!token) return false;
  const auth = c.req.header("authorization") || "";
  return auth === `Bearer ${token}`;
}

export function getAdminStats(c: Context<{ Bindings: Env }>): Response {
  if (!requireAdmin(c)) return unauthorized();
  // Full aggregation belongs in a Cloudflare GraphQL query against the Analytics Engine
  // dataset. Until that is wired, return an honest empty skeleton so a caller degrades to
  // empty states instead of reading invented numbers as real ones.
  const from = c.req.query("from") || null;
  const to = c.req.query("to") || null;
  return c.json({
    ok: true,
    data: {
      from,
      to,
      totals: { requests: 0, errors: 0, cached: 0, rate_limited: 0 },
      by_endpoint: [],
      by_scope: [],
      by_country: [],
      cache_hit_rate: null,
      p50_ms: null,
      p95_ms: null,
      error_rate: null,
      rate_limit_rejections: 0,
      note: "Aggregate stats require an Analytics Engine binding plus a GraphQL query. This endpoint reports zeros until that is wired — the numbers are not measurements.",
    },
  });
}

/**
 * Zero today's fair-use counter for one account, MCP session, or IP.
 *
 * `email` is the useful one and the reason this takes four parameters instead of one: a person
 * asking for help quotes their email address, never their internal id. Making the operator run a
 * D1 query to translate it first is how a support tool goes unused.
 */
export async function postAdminRateLimitReset(c: Context<{ Bindings: Env }>): Promise<Response> {
  if (!requireAdmin(c)) return unauthorized();
  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { /* empty body ok if query used */ }
  const arg = (name: string): string | undefined => {
    const fromBody = body[name];
    return typeof fromBody === "string" ? fromBody : c.req.query(name) || undefined;
  };

  let user = arg("user");
  const email = (arg("email") || "").trim().toLowerCase();
  if (email) {
    if (user) return c.json({ ok: false, error: "pass email or user, not both" }, 400);
    if (!hasDb(c.env)) return c.json({ ok: false, error: "no database bound — reset by user id, session or ip" }, 400);
    const row = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
    // Deliberately not "unknown email": this endpoint is already admin-gated, and an operator who
    // typed a typo needs to know that, not to be told the reset silently did nothing.
    if (!row) return c.json({ ok: false, error: "no account with that email" }, 404);
    user = row.id;
  }

  const result = await resetDayBucket(c.env, { user, session: arg("session"), ip: arg("ip") });
  if (!result.ok) return c.json({ ok: false, error: result.error }, 400);
  return c.json({ ok: true, reset: true, scope: result.scope, key: result.key });
}
