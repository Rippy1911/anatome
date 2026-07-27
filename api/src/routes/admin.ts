// Operator / Base44 BFF admin surface. All routes require
// `Authorization: Bearer $ADMIN_TOKEN`. Never call these from the browser —
// Base44 functions proxy them server-side.

import type { Context } from "hono";
import {
  deleteKey,
  getKeyById,
  putKey,
  sha256Hex,
  type KeyRecord,
  type KeyStatus,
} from "../lib/apiKeys.ts";
import { readUsageSeries } from "../lib/usage.ts";
import type { Env } from "../lib/rateLimit.ts";

function unauthorized(): Response {
  // 404 (not 401) so the admin surface is not trivially enumerable — same
  // pattern as /selfTest.
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

function isKeyStatus(v: unknown): v is KeyStatus {
  return v === "active" || v === "revoked" || v === "suspended";
}

export async function putAdminKey(c: Context<{ Bindings: Env }>): Promise<Response> {
  if (!requireAdmin(c)) return unauthorized();
  const keyId = c.req.param("key_id");
  if (!keyId || !/^[A-Za-z0-9_-]{4,64}$/.test(keyId)) {
    return c.json({ ok: false, error: "invalid_key_id" }, 400);
  }

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch {
    return c.json({ ok: false, error: "invalid_json" }, 400);
  }

  const key_hash = typeof body.key_hash === "string" ? body.key_hash.toLowerCase() : "";
  if (!/^[a-f0-9]{64}$/.test(key_hash)) {
    return c.json({ ok: false, error: "key_hash must be sha256 hex (64 chars)" }, 400);
  }
  if (!isKeyStatus(body.status)) {
    return c.json({ ok: false, error: "status must be active|revoked|suspended" }, 400);
  }

  const record: KeyRecord = {
    key_id: keyId,
    key_hash,
    plan: typeof body.plan === "string" ? body.plan : "free",
    status: body.status,
    included_requests: Math.max(0, Number(body.included_requests) || 0),
    allow_overage: Boolean(body.allow_overage),
    stripe_customer_id: typeof body.stripe_customer_id === "string"
      ? body.stripe_customer_id
      : undefined,
    owner_email: typeof body.owner_email === "string" ? body.owner_email : undefined,
    updated_at: new Date().toISOString(),
  };

  await putKey(c.env, record);
  return c.json({ ok: true, key_id: keyId, status: record.status, plan: record.plan });
}

export async function deleteAdminKey(c: Context<{ Bindings: Env }>): Promise<Response> {
  if (!requireAdmin(c)) return unauthorized();
  const keyId = c.req.param("key_id");
  if (!keyId) return c.json({ ok: false, error: "invalid_key_id" }, 400);
  const removed = await deleteKey(c.env, keyId);
  if (!removed) return c.json({ ok: false, error: "not_found" }, 404);
  return c.json({ ok: true, key_id: keyId, deleted: true });
}

export async function getAdminUsage(c: Context<{ Bindings: Env }>): Promise<Response> {
  if (!requireAdmin(c)) return unauthorized();
  const keyId = c.req.query("key_id");
  if (!keyId) return c.json({ ok: false, error: "key_id required" }, 400);

  const fromRaw = c.req.query("from");
  const toRaw = c.req.query("to");
  const granularity = (c.req.query("granularity") === "day" ? "day" : "hour") as "hour" | "day";
  const to = toRaw ? new Date(toRaw) : new Date();
  const from = fromRaw ? new Date(fromRaw) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return c.json({ ok: false, error: "invalid from/to" }, 400);
  }

  const series = await readUsageSeries(c.env, keyId, from, to, granularity);
  const totals = series.reduce(
    (acc, b) => ({
      requests: acc.requests + b.requests,
      errors: acc.errors + b.errors,
      cached: acc.cached + b.cached,
      rate_limited: acc.rate_limited + b.rate_limited,
    }),
    { requests: 0, errors: 0, cached: 0, rate_limited: 0 },
  );

  const meta = await getKeyById(c.env, keyId);
  return c.json({
    ok: true,
    data: { series, totals, key: meta ? { key_id: meta.key_id, plan: meta.plan, status: meta.status } : null },
  });
}

export async function getAdminStats(c: Context<{ Bindings: Env }>): Promise<Response> {
  if (!requireAdmin(c)) return unauthorized();
  // Full AE aggregation belongs in a Cloudflare GraphQL query from the BFF.
  // Until ANALYTICS is wired and queried, return an honest empty skeleton so
  // the Base44 admin panel degrades to empty states instead of inventing numbers.
  const from = c.req.query("from") || null;
  const to = c.req.query("to") || null;
  return c.json({
    ok: true,
    data: {
      from,
      to,
      totals: { requests: 0, errors: 0, cached: 0, rate_limited: 0 },
      by_endpoint: [],
      by_key: [],
      by_referrer: [],
      by_country: [],
      cache_hit_rate: null,
      p50_ms: null,
      p95_ms: null,
      error_rate: null,
      rate_limit_rejections: 0,
      quota_exhaustions: [],
      top_consumers: [],
      note: "Aggregate stats require Analytics Engine binding + BFF GraphQL query. Per-key series are available via GET /admin/usage.",
    },
  });
}

/** Test helper — hash a plaintext token the same way Base44 will. */
export { sha256Hex };
