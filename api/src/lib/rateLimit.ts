// Fair-use rate limiting — one rule, no API keys.
//
// Anatome is keyless: there is nothing to sign up for and nothing to paste. The only gate is a
// daily fair-use budget, counted against whichever identity we can actually see:
//
//   private / loopback IP                     -> unbounded (local dev, self-host smoke tests)
//   X-RapidAPI-Proxy-Secret == PROXY_SECRET   -> unbounded (RapidAPI meters upstream)
//   X-Mcp-Trusted-Key == MCP_TRUSTED_KEY      -> unbounded (first-party bridge)
//   MCP call carrying an Mcp-Session-Id       -> FAIR_USE_DAILY_LIMIT per session per UTC day
//   everything else                           -> FAIR_USE_DAILY_LIMIT per IP per UTC day
//
// Self-hosters raise the ceiling by editing one var in wrangler.toml.
//
// WHY IDENTITY IS NOT SIMPLY THE IP
// A *remote* MCP connector is called by the assistant vendor's servers, not by the end user's
// device — every Claude or ChatGPT user reaches us from the same handful of egress addresses.
// Keying fair use on the IP alone would therefore put the entire planet in one 50/day bucket and
// make the connector look permanently broken. So MCP requests are counted per MCP session when
// the client supplies one (we issue it on `initialize`; the Streamable HTTP spec has clients echo
// it back), and a much larger per-network ceiling sits behind that purely as a runaway guard.
//
// Be honest about what that does and does not buy: a session id is client-supplied and free to
// re-mint, so this is a fair-use speed bump, not an access control. A durable per-user budget
// needs a durable user, which arrives with accounts. Cloudflare's WAF remains the real flood
// layer; ANON_NETWORK_DAILY_LIMIT only stops a script from spinning the Worker forever.
//
// There used to be a second, smaller bucket keyed on Referer/Origin. It existed only so the
// marketing site could not eat a visitor's IP budget, and it had to stay BELOW the IP limit
// because Referer/Origin is client-controlled and so spoofable (An-M2) — a bigger host bucket
// would have been an unlock, not a limit. Both the bucket and the hazard are gone: the site's
// demos are click-to-run, so a page view costs the API nothing.

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
  /** Daily fair-use budget per caller identity. Default DEFAULT_FAIR_USE_DAILY_LIMIT. */
  FAIR_USE_DAILY_LIMIT?: string;
  /** Runaway guard for session-identified callers sharing one egress network. */
  ANON_NETWORK_DAILY_LIMIT?: string;
  /** Where to send callers who need more than fair use. */
  UPGRADE_URL?: string;
}

/** The published fair-use number. Change it in wrangler.toml, not here. */
export const DEFAULT_FAIR_USE_DAILY_LIMIT = 50;
/** Runaway guard for one egress network's share of session-identified traffic. */
export const DEFAULT_ANON_NETWORK_DAILY_LIMIT = 10_000;
/** Where "I need more than this" goes. */
export const DEFAULT_UPGRADE_URL = "https://platform.anatome.dev";

const KEY_TTL_SECONDS = 36 * 60 * 60; // ~36h: auto-expire after the day rolls over

function positiveIntFrom(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

export function fairUseLimit(env: Env): number {
  return positiveIntFrom(env.FAIR_USE_DAILY_LIMIT, DEFAULT_FAIR_USE_DAILY_LIMIT);
}

export function networkCeiling(env: Env): number {
  return positiveIntFrom(env.ANON_NETWORK_DAILY_LIMIT, DEFAULT_ANON_NETWORK_DAILY_LIMIT);
}

export function upgradeUrl(env: Env): string {
  return env.UPGRADE_URL || DEFAULT_UPGRADE_URL;
}

/**
 * Which identity the budget was charged to. `network` is the runaway guard, not fair use.
 *
 * `user` is the only one of these that is durable and unforgeable — which is why the published
 * promise, "50 requests per day per user", is only literally true once someone signs in. The
 * others are the best approximation available for an anonymous caller, and the docs say so.
 */
export type RateScope = "user" | "ip" | "mcp_session" | "network";

export interface RateResult {
  allowed: boolean;
  /** How the decision was reached — for logs, not for callers. */
  source?: "fair_use" | "localhost" | "rapidapi" | "mcp_trusted";
  bypass?: boolean;
  /** Which bucket was charged. Absent on bypass. */
  scope?: RateScope;
  /** Opaque DO/KV counter id — set when a budget was consumed (enables refunds). */
  bucket_key?: string;
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

export function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
}

export function nextUtcMidnightUnix(): number {
  const n = new Date();
  return Math.floor(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 0, 0) / 1000);
}

/** "17h 24m" / "42m" / "51s" — for a message a human (or a model) reads out loud. */
export function humanDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/**
 * Cheap bypass check — returns a RateResult for callers that skip the counter entirely
 * (RapidAPI proxy / trusted MCP bridge / loopback), or null when the request must be counted.
 * Touches no storage, so it is safe on every request including edge-cache HITs.
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
  // Loopback bypass is keyed ONLY on the edge IP (cf-connecting-ip). Origin/Referer is
  // client-controlled, so trusting it for identity let any public client spoof
  // `Origin: http://localhost` into an unlimited budget (An-M2, live-confirmed).
  const ip = clientIp(req);
  if (isPrivateIp(ip)) return { allowed: true, source: "localhost", bypass: true };
  return null;
}

export interface RateOptions {
  /** Signed-in account id. Takes precedence over everything else — it is the real identity. */
  userId?: string;
  /** MCP session id from the request, when the caller is an MCP client. */
  mcpSessionId?: string;
}

/** Storage key for a bucket. Exported so the admin reset route can rebuild one. */
export async function rateLimitBucketKey(
  scope: RateScope,
  identity: string,
  date = new Date().toISOString().slice(0, 10),
): Promise<string> {
  const hash = await sha256(identity);
  return `${scope}:${hash}:${date}`;
}

/**
 * Enforce the daily budget. Returns the charged result; `allowed:false` means the caller is out.
 *
 * Session-identified MCP callers are charged twice: once against their own session budget (the
 * fair-use number users are told about) and once against a far larger per-network ceiling, so a
 * script re-minting sessions cannot spin the Worker forever. The network ceiling is deliberately
 * checked *after* the session budget, so a normal user who is simply out of fair use always gets
 * the fair-use message rather than an unexplained network error.
 */
export async function checkRateLimit(req: Request, env: Env, opts: RateOptions = {}): Promise<RateResult> {
  const bypass = bypassCheck(req, env);
  if (bypass) return bypass;

  const ip = clientIp(req);
  const user = (opts.userId || "").trim();
  const session = (opts.mcpSessionId || "").trim();

  // A signed-in account beats a session id beats an address. Only the first is durable, so
  // signing in is what turns "50 a day" from an approximation into a fact — and it also means a
  // user behind a shared NAT stops competing with strangers for one budget.
  const scope: RateScope = user ? "user" : session ? "mcp_session" : "ip";
  const identity = user || session || ip;

  const primary = await consume(env, scope, identity, fairUseLimit(env));
  // An account is its own accounting unit; the network guard exists to stop *anonymous* callers
  // re-minting session ids, which a signed-in user has no need to do.
  if (!primary.allowed || scope !== "mcp_session") return primary;

  // Session-scoped callers additionally share a network ceiling. Over it, refund the session
  // unit we just took — the caller never got service, so it should not cost them their budget.
  const guard = await consume(env, "network", ip, networkCeiling(env));
  if (!guard.allowed) {
    await refundRateLimitUnit(env, primary);
    return guard;
  }
  return primary;
}

/** Count one request against `scope:identity`, via the Durable Object when bound, else KV. */
async function consume(env: Env, scope: RateScope, identity: string, limit: number): Promise<RateResult> {
  const reset = nextUtcMidnightUnix();
  const reset_at = new Date(reset * 1000).toISOString();
  const date = new Date().toISOString().slice(0, 10);
  const key = await rateLimitBucketKey(scope, identity, date);

  // Prefer the Durable Object counter (no KV write quota; single-threaded per key).
  // KV stays as the fallback for local dev and any deploy without a DO binding.
  if (env.RATE_LIMIT_DO) {
    const stub = env.RATE_LIMIT_DO.get(env.RATE_LIMIT_DO.idFromName(key));
    const doUrl = new URL("https://do/check");
    doUrl.searchParams.set("limit", String(limit));
    doUrl.searchParams.set("scope", scope);
    doUrl.searchParams.set("date", date);
    doUrl.searchParams.set("reset", String(reset));
    const res = await stub.fetch(doUrl.toString());
    const result = (await res.json()) as RateResult;
    // The DO returns `reset` but not `reset_at`; add it here for response parity.
    result.reset_at = reset_at;
    result.bucket_key = key;
    return result;
  }

  const kvResult = await consumeKv(env, key, scope, limit, reset, reset_at);
  kvResult.bucket_key = key;
  return kvResult;
}

/** KV-backed counter — used when no Durable Object binding is configured. */
async function consumeKv(
  env: Env,
  key: string,
  scope: RateScope,
  limit: number,
  reset: number,
  reset_at: string,
): Promise<RateResult> {
  const current = await env.RATE_LIMIT_KV.get(key);
  const count = current ? parseInt(current, 10) || 0 : 0;

  if (count >= limit) {
    return {
      allowed: false, source: "fair_use", scope, limit, used: count, remaining: 0, reset, reset_at,
      retry_after: reset - Math.floor(Date.now() / 1000),
    };
  }

  await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: KEY_TTL_SECONDS });
  return {
    allowed: true, source: "fair_use", scope, limit, used: count + 1,
    remaining: limit - (count + 1), reset, reset_at,
  };
}

/**
 * Operator unlock: zero today's counter for one identity.
 * Clears the KV fallback and the Durable Object storage when bound.
 */
export async function resetDayBucket(
  env: Env,
  opts: { ip?: string; session?: string },
): Promise<{ ok: true; key: string; scope: RateScope } | { ok: false; error: string }> {
  const ip = (opts.ip || "").trim();
  const session = (opts.session || "").trim();
  if (!ip && !session) return { ok: false, error: "ip or session required" };
  if (ip && session) return { ok: false, error: "pass ip or session, not both" };
  const scope: RateScope = session ? "mcp_session" : "ip";
  const key = await rateLimitBucketKey(scope, session || ip);
  try {
    await env.RATE_LIMIT_KV?.delete(key);
  } catch { /* optional binding in tests */ }
  if (env.RATE_LIMIT_DO) {
    const stub = env.RATE_LIMIT_DO.get(env.RATE_LIMIT_DO.idFromName(key));
    await stub.fetch("https://do/reset", { method: "POST" });
  }
  return { ok: true, key, scope };
}

/**
 * Refund one consumed unit after a server-side failure (5xx). No-op for bypass / unknown
 * buckets. Client errors (4xx) stay charged — a malformed request is still a request.
 */
export async function refundRateLimitUnit(env: Env, rl: RateResult): Promise<void> {
  if (!rl || rl.bypass || !rl.bucket_key) return;
  const key = rl.bucket_key;
  if (env.RATE_LIMIT_DO) {
    const stub = env.RATE_LIMIT_DO.get(env.RATE_LIMIT_DO.idFromName(key));
    await stub.fetch("https://do/refund", { method: "POST" });
    return;
  }
  if (!env.RATE_LIMIT_KV) return;
  const current = await env.RATE_LIMIT_KV.get(key);
  const count = current ? parseInt(current, 10) || 0 : 0;
  if (count <= 0) return;
  await env.RATE_LIMIT_KV.put(key, String(count - 1), { expirationTtl: KEY_TTL_SECONDS });
}

/**
 * Standard rate-limit headers. Both the RFC 9331 names and the older `X-` names, because
 * plenty of HTTP clients (and every LLM that has read a Stack Overflow answer) look for `X-`.
 */
export function rateHeaders(rl: RateResult, env?: Env): Record<string, string> {
  if (rl.bypass) {
    return {
      "RateLimit-Limit": "unlimited",
      "RateLimit-Remaining": "unlimited",
      "X-RateLimit-Limit": "unlimited",
      "X-RateLimit-Remaining": "unlimited",
    };
  }
  const limit = String(rl.limit ?? (env ? fairUseLimit(env) : DEFAULT_FAIR_USE_DAILY_LIMIT));
  const remaining = String(rl.remaining ?? 0);
  const reset = String(rl.reset ?? nextUtcMidnightUnix());
  return {
    "RateLimit-Limit": limit,
    "RateLimit-Remaining": remaining,
    "RateLimit-Reset": reset,
    "X-RateLimit-Limit": limit,
    "X-RateLimit-Remaining": remaining,
    "X-RateLimit-Reset": reset,
  };
}

/**
 * The 429 body.
 *
 * This is read far more often by a language model than by a person, so it says, in words, the
 * three things a model has to get right: what happened, that the integration is not broken, and
 * that retrying now will not help. Vague 429s are why assistants tell users "the connector
 * failed" and then hammer the endpoint.
 */
export function rateLimitBody(rl: RateResult, env?: Env) {
  const upgrade = env ? upgradeUrl(env) : DEFAULT_UPGRADE_URL;
  const network = rl.scope === "network";
  return {
    ok: false,
    error: network ? "network_rate_limit_exceeded" : "daily_fair_use_limit_reached",
    scope: rl.scope ?? "ip",
    limit: rl.limit,
    used: rl.used,
    remaining: 0,
    reset_at: rl.reset_at,
    retry_after_seconds: rl.retry_after,
    retryable: false,
    message: rateLimitMessage(rl, upgrade),
    more_info: upgrade,
    documentation: "https://anatome.dev/#fair-use",
  };
}

/** Plain-English explanation shared by the REST 429 body and the MCP tool error. */
export function rateLimitMessage(rl: RateResult, upgrade = DEFAULT_UPGRADE_URL): string {
  const resetAt = rl.reset_at ?? new Date((rl.reset ?? nextUtcMidnightUnix()) * 1000).toISOString();
  const inWords = humanDuration(rl.retry_after ?? 0);

  if (rl.scope === "network") {
    return [
      `Anatome is temporarily rate limiting this network: more than ${rl.limit} requests today came`,
      "from the same address. This is a shared-network guard, not a problem with your integration",
      "and not a problem with your account.",
      `It clears at ${resetAt} (in ${inWords}). Do not retry in a loop.`,
      `If you need a dedicated quota, see ${upgrade}.`,
    ].join(" ");
  }

  return [
    `Daily fair-use limit reached: you have used all ${rl.limit} free Anatome requests for today.`,
    "The connector is working correctly — nothing is broken, this is not an outage, and retrying",
    "now will not help.",
    `Your allowance resets at ${resetAt} (in ${inWords}).`,
    "Tell the user they have reached Anatome's free daily fair-use limit and can continue after",
    "the reset.",
    `For higher limits and a fully featured, AI-assisted version, see ${upgrade}.`,
  ].join(" ");
}
