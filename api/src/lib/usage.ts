// Per-key usage buckets for the dashboard. Exact billing counters live in
// RateLimiterDO (`key_month:…`); these hourly KV aggregates are for charts only
// and may race under concurrency — never use them as the sole billing source.

import type { Env } from "./rateLimit.ts";
import type { AnalyticsEngineDataset } from "@cloudflare/workers-types";

export interface UsageBucket {
  ts: string; // ISO hour start
  requests: number;
  errors: number;
  cached: number;
  rate_limited: number;
}

export interface UsageEvent {
  key_id?: string;
  endpoint: string;
  status: number;
  cached?: boolean;
  rate_limited?: boolean;
  referrer?: string | null;
  country?: string | null;
}

function hourBucket(d = new Date()): string {
  return d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

function usageKvKey(keyId: string, hour: string): string {
  return `usage:${keyId}:${hour}`;
}

const USAGE_TTL_SECONDS = 45 * 24 * 60 * 60; // ~45 days

export async function recordUsage(env: Env, event: UsageEvent): Promise<void> {
  if (event.key_id) {
    const hour = hourBucket();
    const k = usageKvKey(event.key_id, hour);
    const raw = await env.RATE_LIMIT_KV.get(k);
    let bucket: UsageBucket = {
      ts: `${hour}:00:00.000Z`,
      requests: 0,
      errors: 0,
      cached: 0,
      rate_limited: 0,
    };
    if (raw) {
      try { bucket = { ...bucket, ...JSON.parse(raw) }; } catch { /* reset */ }
    }
    bucket.requests += 1;
    if (event.status >= 400) bucket.errors += 1;
    if (event.cached) bucket.cached += 1;
    if (event.rate_limited) bucket.rate_limited += 1;
    await env.RATE_LIMIT_KV.put(k, JSON.stringify(bucket), { expirationTtl: USAGE_TTL_SECONDS });
  }

  const ae = (env as Env & { ANALYTICS?: AnalyticsEngineDataset }).ANALYTICS;
  if (ae) {
    try {
      ae.writeDataPoint({
        blobs: [
          event.endpoint,
          event.key_id || "anon",
          event.referrer || "",
          event.country || "",
        ],
        doubles: [event.status, event.cached ? 1 : 0, event.rate_limited ? 1 : 0],
        indexes: [event.key_id || "anon"],
      });
    } catch { /* never fail the request for telemetry */ }
  }
}

export async function readUsageSeries(
  env: Env,
  keyId: string,
  from: Date,
  to: Date,
  granularity: "hour" | "day",
): Promise<UsageBucket[]> {
  const hours: string[] = [];
  const cursor = new Date(from);
  cursor.setUTCMinutes(0, 0, 0);
  while (cursor <= to) {
    hours.push(hourBucket(cursor));
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }

  const buckets: UsageBucket[] = [];
  for (const hour of hours) {
    const raw = await env.RATE_LIMIT_KV.get(usageKvKey(keyId, hour));
    if (!raw) continue;
    try { buckets.push(JSON.parse(raw) as UsageBucket); } catch { /* skip */ }
  }

  if (granularity === "hour") return buckets;

  const byDay = new Map<string, UsageBucket>();
  for (const b of buckets) {
    const day = b.ts.slice(0, 10);
    const cur = byDay.get(day) || {
      ts: `${day}T00:00:00.000Z`,
      requests: 0,
      errors: 0,
      cached: 0,
      rate_limited: 0,
    };
    cur.requests += b.requests;
    cur.errors += b.errors;
    cur.cached += b.cached;
    cur.rate_limited += b.rate_limited;
    byDay.set(day, cur);
  }
  return [...byDay.values()].sort((a, b) => a.ts.localeCompare(b.ts));
}
