import { beforeAll, describe, expect, it } from "vitest";
import {
  KEY_PREFIX_LIVE,
  putKey,
  sha256Hex,
  type KeyRecord,
} from "../src/lib/apiKeys.ts";
import { bypassCheck, checkRateLimit, type Env } from "../src/lib/rateLimit.ts";
import { readUsageSeries, recordUsage } from "../src/lib/usage.ts";
import app from "../src/index.ts";

beforeAll(() => {
  const store = new Map<string, Response>();
  const cacheStub = {
    match: async (req: Request) => store.get(new URL(req.url).toString()) ?? undefined,
    put: async (req: Request, res: Response) => { store.set(new URL(req.url).toString(), res.clone()); },
    delete: async (req: Request) => store.delete(new URL(req.url).toString()),
  };
  (globalThis as { caches?: unknown }).caches = { default: cacheStub };
});

function makeKvStub(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
  } as unknown as KVNamespace;
}

function publicReq(headers: Record<string, string> = {}): Request {
  return new Request("https://api.anatome.dev/searchExercises?q=squat", {
    headers: { "cf-connecting-ip": "203.0.113.10", ...headers },
  });
}

function token(): string {
  return `${KEY_PREFIX_LIVE}${"a".repeat(32)}`;
}

async function seedKey(env: Env, overrides: Partial<KeyRecord> = {}): Promise<{ tok: string; record: KeyRecord }> {
  const tok = token();
  const record: KeyRecord = {
    key_id: "key_test123456",
    key_hash: await sha256Hex(tok),
    plan: "free",
    status: "active",
    included_requests: 3,
    allow_overage: false,
    owner_email: "dev@example.com",
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  await putKey(env, record);
  return { tok, record };
}

describe("first-party API keys", () => {
  it("active key is metered on key_month and exhausts exactly", async () => {
    const env: Env = { RATE_LIMIT_KV: makeKvStub() };
    const { tok } = await seedKey(env, { included_requests: 2 });
    const headers = {
      "cf-connecting-ip": "203.0.113.10",
      authorization: `Bearer ${tok}`,
    };
    const r1 = await checkRateLimit(publicReq(headers), env);
    expect(r1.allowed).toBe(true);
    expect(r1.source).toBe("api_key");
    expect(r1.key_type).toBe("key_month");
    expect(r1.used).toBe(1);

    const r2 = await checkRateLimit(publicReq(headers), env);
    expect(r2.allowed).toBe(true);
    expect(r2.used).toBe(2);

    const r3 = await checkRateLimit(publicReq(headers), env);
    expect(r3.allowed).toBe(false);
    expect(r3.key_type).toBe("key_month");
  });

  it("revoked / suspended keys are denied immediately", async () => {
    const env: Env = { RATE_LIMIT_KV: makeKvStub() };
    const { tok } = await seedKey(env, { status: "revoked", included_requests: 100 });
    const rl = await checkRateLimit(publicReq({
      "cf-connecting-ip": "203.0.113.10",
      authorization: `Bearer ${tok}`,
    }), env);
    expect(rl.allowed).toBe(false);
    expect(rl.key_record?.status).toBe("revoked");
  });

  it("unknown ana_* Bearer is denied (does not fall through to anonymous fair-use)", async () => {
    const env: Env = { RATE_LIMIT_KV: makeKvStub() };
    const fake = `${KEY_PREFIX_LIVE}${"b".repeat(32)}`;
    const rl = await checkRateLimit(publicReq({
      "cf-connecting-ip": "203.0.113.10",
      authorization: `Bearer ${fake}`,
    }), env);
    expect(rl.allowed).toBe(false);
    expect(rl.source).toBe("api_key");
  });

  it("API key takes precedence over RapidAPI bypass", async () => {
    const env: Env = {
      RATE_LIMIT_KV: makeKvStub(),
      PROXY_SECRET: "s3cret",
    };
    const { tok } = await seedKey(env, { included_requests: 1 });
    // Would be unlimited via RapidAPI alone — but a Bearer key must win.
    await checkRateLimit(publicReq({
      "cf-connecting-ip": "203.0.113.10",
      authorization: `Bearer ${tok}`,
      "x-rapidapi-proxy-secret": "s3cret",
    }), env);
    const denied = await checkRateLimit(publicReq({
      "cf-connecting-ip": "203.0.113.10",
      authorization: `Bearer ${tok}`,
      "x-rapidapi-proxy-secret": "s3cret",
    }), env);
    expect(denied.allowed).toBe(false);
    expect(denied.source).toBe("api_key");
    // Without the Bearer, RapidAPI still bypasses.
    expect(bypassCheck(publicReq({
      "cf-connecting-ip": "203.0.113.10",
      "x-rapidapi-proxy-secret": "s3cret",
    }), env)?.bypass).toBe(true);
  });

  it("allow_overage past included marks overage=true and still allows", async () => {
    const env: Env = { RATE_LIMIT_KV: makeKvStub() };
    const { tok } = await seedKey(env, {
      included_requests: 1,
      allow_overage: true,
      stripe_customer_id: "cus_test",
    });
    const headers = {
      "cf-connecting-ip": "203.0.113.10",
      authorization: `Bearer ${tok}`,
    };
    await checkRateLimit(publicReq(headers), env);
    const over = await checkRateLimit(publicReq(headers), env);
    expect(over.allowed).toBe(true);
    expect(over.overage).toBe(true);
  });
});

describe("admin key lifecycle", () => {
  it("PUT/DELETE /admin/keys require ADMIN_TOKEN (404 otherwise)", async () => {
    const env: Env = { RATE_LIMIT_KV: makeKvStub() };
    const res = await app.request("https://api.anatome.dev/admin/keys/key_abc", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key_hash: "a".repeat(64),
        status: "active",
        plan: "free",
        included_requests: 100,
        allow_overage: false,
      }),
    }, env);
    expect(res.status).toBe(404);
  });

  it("PUT then DELETE round-trip with ADMIN_TOKEN", async () => {
    const env: Env = { RATE_LIMIT_KV: makeKvStub(), ADMIN_TOKEN: "admin-secret" };
    const tok = token();
    const hash = await sha256Hex(tok);
    const put = await app.request("https://api.anatome.dev/admin/keys/key_roundtrip", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer admin-secret",
      },
      body: JSON.stringify({
        key_hash: hash,
        status: "active",
        plan: "pro",
        included_requests: 5,
        allow_overage: true,
        owner_email: "a@b.co",
      }),
    }, env);
    expect(put.status).toBe(200);
    const body = await put.json() as { ok: boolean; key_id: string };
    expect(body.ok).toBe(true);

    const rl = await checkRateLimit(publicReq({
      "cf-connecting-ip": "203.0.113.10",
      authorization: `Bearer ${tok}`,
    }), env);
    expect(rl.allowed).toBe(true);
    expect(rl.key_id).toBe("key_roundtrip");

    const del = await app.request("https://api.anatome.dev/admin/keys/key_roundtrip", {
      method: "DELETE",
      headers: { authorization: "Bearer admin-secret" },
    }, env);
    expect(del.status).toBe(200);

    const after = await checkRateLimit(publicReq({
      "cf-connecting-ip": "203.0.113.10",
      authorization: `Bearer ${tok}`,
    }), env);
    expect(after.allowed).toBe(false);
  });

  it("GET /admin/usage returns series for a key", async () => {
    const env: Env = { RATE_LIMIT_KV: makeKvStub(), ADMIN_TOKEN: "admin-secret" };
    await recordUsage(env, {
      key_id: "key_usage",
      endpoint: "/searchExercises",
      status: 200,
    });
    await recordUsage(env, {
      key_id: "key_usage",
      endpoint: "/searchExercises",
      status: 429,
      rate_limited: true,
    });
    const res = await app.request(
      "https://api.anatome.dev/admin/usage?key_id=key_usage&granularity=hour",
      { headers: { authorization: "Bearer admin-secret" } },
      env,
    );
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; data: { totals: { requests: number; rate_limited: number } } };
    expect(json.ok).toBe(true);
    expect(json.data.totals.requests).toBe(2);
    expect(json.data.totals.rate_limited).toBe(1);

    const series = await readUsageSeries(
      env,
      "key_usage",
      new Date(Date.now() - 3600_000),
      new Date(),
      "hour",
    );
    expect(series.length).toBeGreaterThanOrEqual(1);
  });
});
