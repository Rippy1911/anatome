// Metering helpers used by route handlers. Quota enforcement MUST run before withEdgeCache so
// cache HITs still cost the caller a unit — otherwise a warm cache is a free scraping surface.

import type { Context } from "hono";
import {
  checkRateLimit,
  rateHeaders,
  rateLimitBody,
  refundRateLimitUnit,
  upgradeUrl,
  type Env,
  type RateOptions,
  type RateResult,
} from "./rateLimit.ts";
import { recordUsage } from "./usage.ts";

export type MeterGate =
  | { ok: true; rl: RateResult; headers: Record<string, string> }
  | { ok: false; rl: RateResult; response: Response };

function referrerHost(req: Request): string | null {
  const raw = req.headers.get("referer") || req.headers.get("origin") || "";
  if (!raw) return null;
  try { return new URL(raw).hostname; } catch { return null; }
}

/** Vitest's `app.request` has no ExecutionContext — accessing it throws. */
export function execCtx(c: Context<{ Bindings: Env }>): ExecutionContext | undefined {
  try { return c.executionCtx; } catch { return undefined; }
}

/** Enforce the daily budget. On deny returns a ready 429 Response alongside the result. */
export async function gateMetered(
  c: Context<{ Bindings: Env }>,
  endpoint: string,
  opts: RateOptions = {},
): Promise<MeterGate> {
  const rl = await checkRateLimit(c.req.raw, c.env, opts);
  if (!rl.allowed) {
    recordUsage(c.env, {
      endpoint,
      status: 429,
      scope: rl.scope,
      rate_limited: true,
      referrer: referrerHost(c.req.raw),
      country: c.req.raw.headers.get("cf-ipcountry"),
    });
    return {
      ok: false,
      rl,
      response: new Response(JSON.stringify(rateLimitBody(rl, c.env)), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...rateHeaders(rl, c.env),
          "Retry-After": String(rl.retry_after ?? 60),
          Link: `<${upgradeUrl(c.env)}>; rel="help"`,
        },
      }),
    };
  }

  return { ok: true, rl, headers: rateHeaders(rl, c.env) };
}

/** Record a completed request (success or handler error). */
export function noteUsage(
  c: Context<{ Bindings: Env }>,
  rl: RateResult,
  res: Response,
  endpoint: string,
): void {
  // Server faults are our bug — don't burn the caller's fair-use budget for them.
  if (res.status >= 500 && !rl.bypass && rl.bucket_key) {
    const task = refundRateLimitUnit(c.env, rl);
    const ctx = execCtx(c);
    if (ctx) ctx.waitUntil(task); else void task;
  }
  recordUsage(c.env, {
    endpoint,
    status: res.status,
    scope: rl.scope,
    cached: res.headers.get("X-Cache") === "HIT",
    referrer: referrerHost(c.req.raw),
    country: c.req.raw.headers.get("cf-ipcountry"),
  });
}
