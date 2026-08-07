// Request telemetry.
//
// This used to also maintain hourly per-key rollups in KV to feed a billing dashboard. Both the
// keys and the dashboard are gone, and the rollup cost a KV read + write on every single request
// — real latency and real quota for numbers nobody reads. What remains is one Analytics Engine
// data point, written fire-and-forget, which is free of request-path cost.
//
// Nothing here may throw: telemetry must never be the reason a request fails.

import type { Env, RateScope } from "./rateLimit.ts";
import type { AnalyticsEngineDataset } from "@cloudflare/workers-types";

export interface UsageEvent {
  endpoint: string;
  status: number;
  /** Which fair-use bucket the request was charged to, when it was charged to one. */
  scope?: RateScope;
  cached?: boolean;
  rate_limited?: boolean;
  referrer?: string | null;
  country?: string | null;
}

export function recordUsage(env: Env, event: UsageEvent): void {
  const ae = (env as Env & { ANALYTICS?: AnalyticsEngineDataset }).ANALYTICS;
  if (!ae) return;
  try {
    ae.writeDataPoint({
      blobs: [
        event.endpoint,
        event.scope || "anon",
        event.referrer || "",
        event.country || "",
      ],
      doubles: [event.status, event.cached ? 1 : 0, event.rate_limited ? 1 : 0],
      indexes: [event.endpoint],
    });
  } catch { /* never fail the request for telemetry */ }
}
