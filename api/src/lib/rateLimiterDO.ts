// Durable Object rate limiter — replaces the per-request KV read+write with a
// single-threaded in-DO counter. One DO instance per rate-limit key
// (`ip_day:<hash>:<date>` / `host_day:<hash>:<date>`), so the counter is
// consistent and writes are bounded (one storage.put per counted request, no KV
// quota involved). The DO evicts when idle; on cold start it rehydrates from
// storage. KV is kept as a fallback when the DO binding is absent (local dev /
// older deploys) — see rateLimit.ts `checkRateLimit`.

import type { RateResult } from "./rateLimit.ts";

interface StoredCounter {
  count: number;
  date: string; // YYYY-MM-DD UTC — used to detect day rollover
}

export class RateLimiterDO implements DurableObject {
  private count: number | null = null; // null = not yet loaded this eviction
  private date: string | null = null;

  constructor(protected ctx: DurableObjectState, _env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Operator reset (admin route) — wipe counter so a burned day-bucket can reopen.
    if (request.method === "POST" && (url.pathname === "/reset" || url.searchParams.get("op") === "reset")) {
      await this.ctx.storage.deleteAll();
      this.count = 0;
      this.date = null;
      return new Response(JSON.stringify({ ok: true, reset: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const limit = Number(url.searchParams.get("limit") || "0");
    const keyType = url.searchParams.get("key_type") || "ip_day";
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const resetParam = Number(url.searchParams.get("reset") || "0");
    const reset = resetParam > 0 ? resetParam : nextUtcMidnightUnix();

    // Lazy-load + detect day rollover (the DO may outlive midnight UTC).
    if (this.count === null || this.date !== date) {
      const stored = (await this.ctx.storage.get<StoredCounter>("counter")) || { count: 0, date };
      // If the stored date differs from today, the day rolled over: reset to 0.
      this.count = stored.date === date ? stored.count : 0;
      this.date = date;
    }

    const current = this.count;
    if (current >= limit) {
      const result: RateResult = {
        allowed: false,
        source: "free",
        key_type: keyType,
        limit,
        used: current,
        remaining: 0,
        reset,
        retry_after: reset - Math.floor(Date.now() / 1000),
      };
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
    }

    const next = current + 1;
    this.count = next;
    // Persist so the counter survives eviction. waitUntil-style fire-and-forget
    // would risk losing the last increment on abrupt shutdown; await is safer
    // and the DO is single-threaded so there's no contention cost.
    this.ctx.storage.put("counter", { count: next, date });
    const result: RateResult = {
      allowed: true,
      source: "free",
      key_type: keyType,
      limit,
      used: next,
      remaining: limit - next,
      reset,
    };
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  }
}

function nextUtcMidnightUnix(): number {
  const n = new Date();
  return Math.floor(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 0, 0) / 1000);
}
