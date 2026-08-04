// Rate limiting — ported from the Base44 functions, with the RateLimit entity
// replaced by Cloudflare KV. Model (see ../../AGENTS.md §8):
//   - Bearer ana_live_/ana_test_          -> per-key monthly quota (exact DO)
//   - localhost / private IP              -> unlimited (free for testing)
//   - public IP (no referer)               -> 1000/day
//   - public host (Referer/Origin-keyed)   -> 100/day
//   - bypass on X-RapidAPI-Proxy-Secret (== PROXY_SECRET)
//                or X-Mcp-Trusted-Key (== MCP_TRUSTED_KEY)
//
// The Basic plan on RapidAPI: 300 requests/month included, $0.001/request overage
// (enforced at the RapidAPI layer; PROXY_SECRET bypasses Worker day limits).
// Direct public access to the Worker still uses per-day fair-use limits below.
// First-party keys are the system of record for paid direct access.

import {
  currentMonthUtc,
  nextMonthStartUnix,
  OVERAGE_HARD_CEILING,
  resolveBearerKey,
  type KeyRecord,
} from "./apiKeys.ts";
export interface Env {
  RATE_LIMIT_KV: KVNamespace;
  RATE_LIMIT_DO?: DurableObjectNamespace;
  ASSETS?: Fetcher;
  ANALYTICS?: AnalyticsEngineDataset;
  PROXY_SECRET?: string;
  MCP_TRUSTED_KEY?: string;
  RAPIDAPI_KEY?: string;
  PUBLIC_BASE_URL?: string;
  ADMIN_TOKEN?: string;
  GITHUB_TOKEN?: string;
  STRIPE_SECRET_KEY?: string;
}

export const IP_DAY_LIMIT = 1000;
/** Per-Referer/Origin day bucket. Playground traffic from anatome.dev shares one
 *  counter — 100 was too low (one docs session exhausted it). Still metered so
 *  spoofed Referer cannot unlock unlimited (An-M2). */
export const HOST_DAY_LIMIT = 5000;
const UPGRADE_URL = "https://rapidapi.com/anatome/api/anatome";
const KEY_TTL_SECONDS = 36 * 60 * 60; // ~36h: auto-expire after the day rolls over

export interface RateResult {
  allowed: boolean;
  source?: string;
  bypass?: boolean;
  key_type?: string;
  key_id?: string;
  key_record?: KeyRecord;
  overage?: boolean;
  limit?: number;
  used?: number;
  remaining?: number;
  reset?: number;
  reset_at?: string;
  retry_after?: number;
}

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown";
}
export { clientIp };

export function isPrivateIp(ip: string): boolean {
  if (!ip || ip === "unknown") return true;
  if (ip === "::1" || ip === "localhost") return true;
  if (ip.startsWith("127.") || ip.startsWith("192.168.") || ip.startsWith("10.")) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m) { const o = Number(m[1]); if (o >= 16 && o <= 31) return true; }
  return false;
}

function referrerHost(req: Request): string | null {
  const raw = req.headers.get("referer") || req.headers.get("origin") || "";
  if (!raw) return null;
  try { return new URL(raw).hostname; } catch { return raw.replace(/^https?:\/\//, "").split("/")[0] || null; }
}

export function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
}

function nextUtcMidnightUnix(): number {
  const n = new Date();
  return Math.floor(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 0, 0) / 1000);
}
export { nextUtcMidnightUnix };

/**
 * Cheap bypass check — returns the RateResult for callers that skip the KV
 * counter (RapidAPI proxy / MCP trusted key / localhost), or null when the
 * request must go through the KV-backed per-day counter. Touches no KV, so it
 * is safe to run on every request including edge-cache HITs.
 */
export function bypassCheck(req: Request, env: Env): RateResult | null {
  const proxy = req.headers.get("x-rapidapi-proxy-secret");
  if (proxy && env.PROXY_SECRET && proxy === env.PROXY_SECRET) {
    return { allowed: true, source: "rapidapi", bypass: true };
  }
  const mcpKey = req.headers.get("x-mcp-trusted-key");
  if (mcpKey && env.MCP_TRUSTED_KEY && mcpKey === env.MCP_TRUSTED_KEY) {
    return { allowed: true, source: "mcp_trusted", bypass: true };
  }
  // Localhost bypass is keyed ONLY on the edge IP (cf-connecting-ip). The
  // Origin/Referer header is client-controlled, so trusting it for identity
  // (isLocalHost(host)) let any public client spoof `Origin: http://localhost`
  // to get unlimited rate limit (An-M2, live-confirmed). Keep the private-IP
  // check so the Worker calling itself / dev from a private network still
  // bypasses; drop the spoofable host check entirely.
  const ip = clientIp(req);
  if (isPrivateIp(ip)) return { allowed: true, source: "localhost", bypass: true };
  return null;
}

export async function checkRateLimit(req: Request, env: Env): Promise<RateResult> {
  // First-party keys take precedence over RapidAPI/MCP/IP fair-use so a
  // paying customer presenting a Bearer token is never bucketed as anonymous.
  const keyResult = await checkApiKeyLimit(req, env);
  if (keyResult) return keyResult;

  const bypass = bypassCheck(req, env);
  if (bypass) return bypass;

  const ip = clientIp(req);
  const host = referrerHost(req);
  // Defense-in-depth: bypassCheck already covers the private-IP localhost case,
  // but keep the guard here too. Do NOT consult isLocalHost(host) — Origin/Referer
  // is client-controlled and was spoofable to bypass the limit (An-M2).
  if (isPrivateIp(ip)) return { allowed: true, source: "localhost", bypass: true };

  const reset = nextUtcMidnightUnix();
  const reset_at = new Date(reset * 1000).toISOString();
  const date = new Date().toISOString().slice(0, 10);

  const useHost = !!host;
  const limit = useHost ? HOST_DAY_LIMIT : IP_DAY_LIMIT;
  const key_type = useHost ? "host_day" : "ip_day";
  const hash = await sha256(useHost ? (host as string) : ip);
  const key = `${key_type}:${hash}:${date}`;

  // Prefer the Durable Object counter (no KV quota; single-threaded per key).
  // Fall back to KV when the DO binding is absent (local dev / older deploys).
  if (env.RATE_LIMIT_DO) {
    const stub = env.RATE_LIMIT_DO.get(env.RATE_LIMIT_DO.idFromName(key));
    const doUrl = new URL("https://do/check");
    doUrl.searchParams.set("limit", String(limit));
    doUrl.searchParams.set("key_type", key_type);
    doUrl.searchParams.set("date", date);
    doUrl.searchParams.set("reset", String(reset));
    const res = await stub.fetch(doUrl.toString());
    const result = (await res.json()) as RateResult;
    // The DO returns `reset` but not `reset_at`; add it here for response parity.
    result.reset_at = reset_at;
    return result;
  }

  return checkRateLimitKv(env, key, key_type, limit, reset, reset_at);
}

/** Build today's host_day / ip_day storage key (same scheme as checkRateLimit). */
export async function rateLimitBucketKey(
  kind: "host_day" | "ip_day",
  identity: string,
  date = new Date().toISOString().slice(0, 10),
): Promise<string> {
  const hash = await sha256(identity);
  return `${kind}:${hash}:${date}`;
}

/**
 * Operator unlock: zero today's counter for a host or IP bucket.
 * Clears KV fallback + Durable Object storage when bound.
 */
export async function resetDayBucket(
  env: Env,
  opts: { host?: string; ip?: string },
): Promise<{ ok: true; key: string; kind: "host_day" | "ip_day" } | { ok: false; error: string }> {
  const host = (opts.host || "").trim().toLowerCase();
  const ip = (opts.ip || "").trim();
  if (!host && !ip) return { ok: false, error: "host or ip required" };
  if (host && ip) return { ok: false, error: "pass host or ip, not both" };
  const kind: "host_day" | "ip_day" = host ? "host_day" : "ip_day";
  const identity = host || ip;
  const key = await rateLimitBucketKey(kind, identity);
  try {
    await env.RATE_LIMIT_KV?.delete(key);
  } catch { /* optional binding in tests */ }
  if (env.RATE_LIMIT_DO) {
    const stub = env.RATE_LIMIT_DO.get(env.RATE_LIMIT_DO.idFromName(key));
    await stub.fetch("https://do/reset", { method: "POST" });
  }
  return { ok: true, key, kind };
}

/**
 * Resolve + enforce a first-party API key. Returns null when no Bearer ana_*
 * token is present (caller falls through to fair-use / bypass). Returns a
 * denied RateResult for unknown / revoked / suspended / exhausted keys.
 */
async function checkApiKeyLimit(req: Request, env: Env): Promise<RateResult | null> {
  const record = await resolveBearerKey(req, env);
  if (!record) {
    // Present but unrecognised Bearer ana_* → hard deny (do not fall through
    // to anonymous fair-use — that would let a revoked key keep working).
    const tokenAttempt = req.headers.get("authorization") || "";
    if (/^Bearer\s+ana_(?:live|test)_/i.test(tokenAttempt)) {
      return {
        allowed: false,
        source: "api_key",
        key_type: "key_month",
        limit: 0,
        used: 0,
        remaining: 0,
        reset: nextMonthStartUnix(),
        reset_at: new Date(nextMonthStartUnix() * 1000).toISOString(),
        retry_after: nextMonthStartUnix() - Math.floor(Date.now() / 1000),
      };
    }
    return null;
  }

  if (record.status !== "active") {
    return {
      allowed: false,
      source: "api_key",
      key_type: "key_month",
      key_id: record.key_id,
      key_record: record,
      limit: 0,
      used: 0,
      remaining: 0,
      reset: nextMonthStartUnix(),
      reset_at: new Date(nextMonthStartUnix() * 1000).toISOString(),
      retry_after: 3600,
    };
  }

  const month = currentMonthUtc();
  const reset = nextMonthStartUnix();
  const reset_at = new Date(reset * 1000).toISOString();
  const included = Math.max(0, Number(record.included_requests) || 0);
  const limit = record.allow_overage ? OVERAGE_HARD_CEILING : included;
  const key = `key_month:${record.key_id}:${month}`;
  const key_type = "key_month";

  let result: RateResult;
  if (env.RATE_LIMIT_DO) {
    const stub = env.RATE_LIMIT_DO.get(env.RATE_LIMIT_DO.idFromName(key));
    const doUrl = new URL("https://do/check");
    doUrl.searchParams.set("limit", String(limit));
    doUrl.searchParams.set("key_type", key_type);
    doUrl.searchParams.set("date", month);
    doUrl.searchParams.set("reset", String(reset));
    const res = await stub.fetch(doUrl.toString());
    result = (await res.json()) as RateResult;
  } else {
    result = await checkRateLimitKv(env, key, key_type, limit, reset, reset_at);
  }

  result.source = "api_key";
  result.key_type = key_type;
  result.key_id = record.key_id;
  result.key_record = record;
  result.reset_at = reset_at;
  // Surface the soft (included) quota in headers when overage is on.
  if (record.allow_overage && result.allowed) {
    const used = result.used ?? 0;
    result.overage = used > included;
    result.limit = included;
    result.remaining = Math.max(0, included - used);
    // Stripe meter events are fired by gateMetered via waitUntil — not here —
    // so unit tests of checkRateLimit do not hit the network.
  }
  return result;
}

/** Legacy KV-backed counter — used when no Durable Object binding is configured. */
async function checkRateLimitKv(
  env: Env,
  key: string,
  key_type: string,
  limit: number,
  reset: number,
  reset_at: string,
): Promise<RateResult> {
  const current = await env.RATE_LIMIT_KV.get(key);
  const count = current ? parseInt(current, 10) || 0 : 0;

  if (count >= limit) {
    return {
      allowed: false, key_type, limit, used: count, remaining: 0, reset, reset_at,
      retry_after: reset - Math.floor(Date.now() / 1000),
    };
  }

  await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: KEY_TTL_SECONDS });
  return {
    allowed: true, source: "free", key_type, limit, used: count + 1,
    remaining: limit - (count + 1), reset, reset_at,
  };
}

export function rateHeaders(rl: RateResult): Record<string, string> {
  if (rl.bypass) return { "X-RateLimit-Limit": "unlimited", "X-RateLimit-Remaining": "unlimited" };
  return {
    "X-RateLimit-Limit": String(rl.limit ?? IP_DAY_LIMIT),
    "X-RateLimit-Remaining": String(rl.remaining != null ? rl.remaining : ""),
    "X-RateLimit-Reset": String(rl.reset ?? nextUtcMidnightUnix()),
  };
}

export function rateLimitBody(rl: RateResult) {
  if (rl.key_type === "key_month") {
    const suspended = rl.key_record && rl.key_record.status !== "active";
    return {
      ok: false,
      error: suspended ? "key_inactive" : "quota_exceeded",
      limit_type: rl.key_type,
      key_id: rl.key_id,
      status: rl.key_record?.status,
      limit: rl.limit,
      used: rl.used,
      reset_at: rl.reset_at,
      retry_after_seconds: rl.retry_after,
      upgrade_url: "https://anatome.dev/pricing",
      message: suspended
        ? `API key is ${rl.key_record?.status || "inactive"}.`
        : `Monthly included quota (${rl.limit}) exhausted. Enable overage or upgrade at anatome.dev.`,
    };
  }
  return {
    ok: false,
    error: "rate_limit_exceeded",
    limit_type: rl.key_type,
    limit: rl.limit,
    used: rl.used,
    reset_at: rl.reset_at,
    retry_after_seconds: rl.retry_after,
    upgrade_url: UPGRADE_URL,
    message: rl.key_type === "host_day"
      ? `Daily fair-use limit (${rl.limit}/day per host). Basic on RapidAPI: 300 requests/month included, $0.001/request overage.`
      : `Daily fair-use limit (${rl.limit}/day per IP). Basic on RapidAPI: 300 requests/month included, $0.001/request overage.`,
  };
}
