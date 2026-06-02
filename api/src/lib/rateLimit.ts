// Rate limiting — ported from the Base44 functions, with the RateLimit entity
// replaced by Cloudflare KV. Model (see ../../AGENTS.md §8):
//   - localhost / private IP / no-referer  -> unlimited (free for testing)
//   - public IP (no referer)               -> 1000/day
//   - public host (Referer/Origin-keyed)   -> 100/day
//   - bypass on X-RapidAPI-Proxy-Secret (== PROXY_SECRET)
//                or X-Mcp-Trusted-Key (== MCP_TRUSTED_KEY)
//
// The monthly tier gate (~50k/month) is enforced at the RapidAPI layer for paid
// traffic (which bypasses here via PROXY_SECRET); the Worker enforces the per-day
// limits for direct public access.

export interface Env {
  RATE_LIMIT_KV: KVNamespace;
  PROXY_SECRET?: string;
  MCP_TRUSTED_KEY?: string;
  PUBLIC_BASE_URL?: string;
}

export const IP_DAY_LIMIT = 1000;
export const HOST_DAY_LIMIT = 100;
const UPGRADE_URL = "https://rapidapi.com/anatome/api/anatome";
const KEY_TTL_SECONDS = 36 * 60 * 60; // ~36h: auto-expire after the day rolls over

export interface RateResult {
  allowed: boolean;
  source?: string;
  bypass?: boolean;
  key_type?: string;
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

export async function checkRateLimit(req: Request, env: Env): Promise<RateResult> {
  const proxy = req.headers.get("x-rapidapi-proxy-secret");
  if (proxy && env.PROXY_SECRET && proxy === env.PROXY_SECRET) {
    return { allowed: true, source: "rapidapi", bypass: true };
  }
  const mcpKey = req.headers.get("x-mcp-trusted-key");
  if (mcpKey && env.MCP_TRUSTED_KEY && mcpKey === env.MCP_TRUSTED_KEY) {
    return { allowed: true, source: "mcp_trusted", bypass: true };
  }

  const ip = clientIp(req);
  const host = referrerHost(req);
  if (isPrivateIp(ip) || isLocalHost(host)) return { allowed: true, source: "localhost", bypass: true };

  const reset = nextUtcMidnightUnix();
  const reset_at = new Date(reset * 1000).toISOString();
  const date = new Date().toISOString().slice(0, 10);

  const useHost = !!host;
  const limit = useHost ? HOST_DAY_LIMIT : IP_DAY_LIMIT;
  const key_type = useHost ? "host_day" : "ip_day";
  const hash = await sha256(useHost ? (host as string) : ip);
  const key = `${key_type}:${hash}:${date}`;

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
      ? `Free tier: ${rl.limit} requests/day per public host. Upgrade via RapidAPI.`
      : `Free tier: ${rl.limit} requests/day per IP. Upgrade via RapidAPI.`,
  };
}
