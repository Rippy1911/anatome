// Metering helpers used by route handlers. Quota enforcement MUST run before
// withEdgeCache so cache HITs still burn the caller's budget (Part A contract).

import type { Context } from "hono";
import {
  checkRateLimit,
  rateHeaders,
  rateLimitBody,
  refundRateLimitUnit,
  type Env,
  type RateResult,
} from "./rateLimit.ts";
import { recordUsage } from "./usage.ts";
import { reportOverageMeterEvent } from "./stripeMeter.ts";

export type MeterGate =
  | { ok: true; rl: RateResult; headers: Record<string, string> }
  | { ok: false; response: Response };

function referrerHost(req: Request): string | null {
  const raw = req.headers.get("referer") || req.headers.get("origin") || "";
  if (!raw) return null;
  try { return new URL(raw).hostname; } catch { return null; }
}

/** Vitest's `app.request` has no ExecutionContext — accessing it throws. */
export function execCtx(c: Context<{ Bindings: Env }>): ExecutionContext | undefined {
  try { return c.executionCtx; } catch { return undefined; }
}

/** waitUntil when an ExecutionContext exists; otherwise fire-and-forget (vitest). */
function background(c: Context<{ Bindings: Env }>, task: Promise<unknown>): void {
  const ctx = execCtx(c);
  if (ctx) ctx.waitUntil(task);
  else void task;
}

/** Enforce quota. On deny returns a ready 429 Response. */
export async function gateMetered(
  c: Context<{ Bindings: Env }>,
  endpoint: string,
): Promise<MeterGate> {
  const rl = await checkRateLimit(c.req.raw, c.env);
  if (!rl.allowed) {
    background(c, recordUsage(c.env, {
      key_id: rl.key_id,
      endpoint,
      status: 429,
      rate_limited: true,
      referrer: referrerHost(c.req.raw),
      country: c.req.raw.headers.get("cf-ipcountry"),
    }));
    return {
      ok: false,
      response: new Response(JSON.stringify(rateLimitBody(rl)), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...rateHeaders(rl),
          "Retry-After": String(rl.retry_after ?? 60),
        },
      }),
    };
  }

  if (rl.overage && rl.key_record?.stripe_customer_id && rl.key_id) {
    background(c, reportOverageMeterEvent(c.env, {
      stripe_customer_id: rl.key_record.stripe_customer_id,
      key_id: rl.key_id,
      overage_count: 1,
    }));
  }

  return { ok: true, rl, headers: rateHeaders(rl) };
}

/** Record a completed request (success or handler error). */
export function noteUsage(
  c: Context<{ Bindings: Env }>,
  rl: RateResult,
  res: Response,
  endpoint: string,
): void {
  // Server faults are our bug — don't burn the caller's fair-use / key quota.
  if (res.status >= 500 && !rl.bypass && rl.bucket_key) {
    background(c, refundRateLimitUnit(c.env, rl));
  }
  background(c, recordUsage(c.env, {
    key_id: rl.key_id,
    endpoint,
    status: res.status,
    cached: res.headers.get("X-Cache") === "HIT",
    referrer: referrerHost(c.req.raw),
    country: c.req.raw.headers.get("cf-ipcountry"),
  }));
}
