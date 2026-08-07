import { describe, it, expect } from "vitest";
import {
  checkRateLimit,
  refundRateLimitUnit,
  rateLimitBucketKey,
  type Env,
} from "../src/lib/rateLimit.ts";

function makeKvStub(store = new Map<string, string>()) {
  return {
    async get(k: string) { return store.get(k) ?? null; },
    async put(k: string, v: string, _opts?: { expirationTtl?: number }) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    store,
  } as unknown as KVNamespace & { store: Map<string, string> };
}

describe("refundRateLimitUnit — 5xx should not burn quota", () => {
  it("decrements a consumed fair-use unit", async () => {
    const kv = makeKvStub();
    const env: Env = { RATE_LIMIT_KV: kv };
    const req = new Request("https://api.anatome.dev/searchExercises?q=bench", {
      headers: {
        "cf-connecting-ip": "203.0.113.9",
        referer: "https://anatome.dev/",
      },
    });
    const rl = await checkRateLimit(req, env);
    expect(rl.allowed).toBe(true);
    expect(rl.bucket_key).toBeTruthy();
    expect(rl.used).toBe(1);

    await refundRateLimitUnit(env, rl);
    const key = await rateLimitBucketKey("ip", "203.0.113.9");
    expect(await kv.get(key)).toBe("0");
  });

  it("is a no-op for bypass results", async () => {
    const kv = makeKvStub();
    const env: Env = { RATE_LIMIT_KV: kv };
    await refundRateLimitUnit(env, { allowed: true, bypass: true, source: "localhost" });
    expect(kv.store.size).toBe(0);
  });
});
