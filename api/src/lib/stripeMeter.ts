// Fire-and-forget Stripe Billing Meter events for overage. Idempotent via
// identifier = `${key_id}:${YYYY-MM-DDTHH}:${seq}` so retries in the same hour
// do not double-bill. No-ops when STRIPE_SECRET_KEY is unset (local / free-only).

import type { Env } from "./rateLimit.ts";

const METER_EVENT_NAME = "anatome_api_request";

export async function reportOverageMeterEvent(
  env: Env,
  opts: {
    stripe_customer_id: string;
    key_id: string;
    overage_count: number; // typically 1 per request past included
  },
): Promise<void> {
  if (!env.STRIPE_SECRET_KEY) return;
  if (!opts.stripe_customer_id || opts.overage_count <= 0) return;

  const hour = new Date().toISOString().slice(0, 13);
  const identifier = `${opts.key_id}:${hour}:${opts.overage_count}`;
  const body = new URLSearchParams();
  body.set("event_name", METER_EVENT_NAME);
  body.set("payload[stripe_customer_id]", opts.stripe_customer_id);
  body.set("payload[value]", String(opts.overage_count));
  body.set("identifier", identifier);

  try {
    const res = await fetch("https://api.stripe.com/v1/billing/meter_events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.log(JSON.stringify({
        kind: "stripe_meter_error",
        status: res.status,
        key_id: opts.key_id,
        body: text.slice(0, 200),
      }));
    }
  } catch (err) {
    console.log(JSON.stringify({
      kind: "stripe_meter_error",
      key_id: opts.key_id,
      error: err instanceof Error ? err.message : String(err),
    }));
  }
}
