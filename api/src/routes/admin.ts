// Operator surface. Every route requires `Authorization: Bearer $ADMIN_TOKEN`.
//
// This used to be a BFF for issuing and revoking `ana_*` API keys. Anatome is keyless now, so
// all that is left is looking at aggregate traffic and un-sticking a fair-use bucket for someone
// who got wedged.

import type { Context } from "hono";
import { resetDayBucket, type Env } from "../lib/rateLimit.ts";

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

/** Zero today's fair-use counter for one IP or one MCP session. */
export async function postAdminRateLimitReset(c: Context<{ Bindings: Env }>): Promise<Response> {
  if (!requireAdmin(c)) return unauthorized();
  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { /* empty body ok if query used */ }
  const ip = typeof body.ip === "string" ? body.ip : c.req.query("ip") || undefined;
  const session = typeof body.session === "string" ? body.session : c.req.query("session") || undefined;
  const result = await resetDayBucket(c.env, { ip, session });
  if (!result.ok) return c.json({ ok: false, error: result.error }, 400);
  return c.json({ ok: true, reset: true, scope: result.scope, key: result.key });
}
