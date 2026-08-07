import { describe, it, expect } from "vitest";
import { renderMuscleSvg, type RenderPayload } from "../src/lib/muscleEngine.ts";
import { getBodyData } from "../src/lib/bodyData.ts";
import {
  bypassCheck, checkRateLimit, DEFAULT_FAIR_USE_DAILY_LIMIT, rateLimitBucketKey, type Env,
} from "../src/lib/rateLimit.ts";

const EMPTY_BODY = { male: { front: [], back: [] }, female: { front: [], back: [] } };
const BODY = getBodyData();

// Build a payload from a plain (untyped) object — mirrors the POST path, which
// passes `await req.json()` straight into renderMuscleSvg with no validation.
function malicious(o: Record<string, unknown>): RenderPayload {
  return o as unknown as RenderPayload;
}

// Minimal KV stub: count is stored in a Map, never persisted. Enough to assert
// that a spoofed-Origin public request is *not* bypassed and instead hits the
// per-day counter.
function makeKvStub(store = new Map<string, string>()) {
  return {
    async get(k: string) { return store.get(k) ?? null; },
    async put(k: string, v: string, _opts?: { expirationTtl?: number }) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    store,
  } as unknown as KVNamespace & { store: Map<string, string> };
}

const NO_SECRETS: Env = { RATE_LIMIT_KV: makeKvStub() };

function publicReq(headers: Record<string, string> = {}): Request {
  return new Request("https://api.anatome.dev/generateImage", {
    headers: { "cf-connecting-ip": "203.0.113.5", ...headers },
  });
}

describe("An-M1: SVG numeric-attribute sanitization", () => {
  it("coerces a malicious width to a safe integer (no attribute breakout)", () => {
    const { svg } = renderMuscleSvg(
      malicious({ muscles: ["chest"], width: '100" onload="alert(1)"', height: "100" }),
      EMPTY_BODY,
    );
    expect(svg).not.toContain("onload");
    expect(svg).not.toContain("alert(1)");
    // width fell back to the default (768) because the string was non-numeric.
    expect(svg).toContain('width="768"');
  });

  it("clamps an out-of-range width into 1..4096", () => {
    const { svg } = renderMuscleSvg(malicious({ width: 999999, height: 1 }), EMPTY_BODY);
    expect(svg).toContain('width="4096"');
    expect(svg).toContain('height="1"');
  });

  it("falls back to the default when width is NaN", () => {
    const { svg } = renderMuscleSvg(malicious({ width: "not-a-number", height: undefined }), EMPTY_BODY);
    expect(svg).toContain('width="768"');
    expect(svg).toContain('height="1024"');
  });

  it("sanitizes layer.strokeWidth (same attribute-breakout class)", () => {
    const body = {
      male: { front: [{ slug: "chest", path: { common: ["M0 0"] } }], back: [] },
      female: { front: [], back: [] },
    };
    const { svg } = renderMuscleSvg(
      malicious({
        view: "front",
        layers: [{ color: "#123456", muscles: ["chest"], strokeWidth: '1" onload="alert(1)"' }],
      }),
      body,
    );
    expect(svg).not.toContain("onload");
    expect(svg).not.toContain("alert(1)");
  });

  it("sanitizes layer.opacity (same attribute-breakout class)", () => {
    const body = {
      male: { front: [{ slug: "chest", path: { common: ["M0 0"] } }], back: [] },
      female: { front: [], back: [] },
    };
    const { svg } = renderMuscleSvg(
      malicious({ view: "front", layers: [{ color: "#123456", muscles: ["chest"], opacity: '0.5" onload="x"' }] }),
      body,
    );
    expect(svg).not.toContain("onload");
  });

  it("still renders a normal numeric width/height unchanged", () => {
    const { svg } = renderMuscleSvg({ width: 512, height: 512 }, BODY);
    expect(svg).toContain('width="512"');
    expect(svg).toContain('height="512"');
  });
});

describe("An-M2: rate-limit bypass no longer trusts Origin/Referer", () => {
  it("bypassCheck returns null for a public IP spoofing Origin: http://localhost", () => {
    const req = publicReq({ origin: "http://localhost" });
    expect(bypassCheck(req, NO_SECRETS)).toBeNull();
  });

  it("bypassCheck returns null for a public IP spoofing Referer: http://localhost", () => {
    const req = publicReq({ referer: "http://localhost/search" });
    expect(bypassCheck(req, NO_SECRETS)).toBeNull();
  });

  it("checkRateLimit does NOT bypass for a public IP + spoofed localhost Origin (counts against KV)", async () => {
    const req = publicReq({ origin: "http://localhost" });
    const env: Env = { RATE_LIMIT_KV: makeKvStub() };
    const rl = await checkRateLimit(req, env);
    // The spoofed Origin must NOT grant a bypass — it should be rate-limited.
    expect(rl.bypass).not.toBe(true);
    expect(rl.source).not.toBe("localhost");
    expect(rl.allowed).toBe(true); // first request still allowed, but counted
    // Origin/Referer is not consulted at all any more: identity is the edge IP, so a spoofed
    // header cannot move the caller into any other bucket, generous or strict.
    expect(rl.scope).toBe("ip");
    expect(rl.limit).toBe(DEFAULT_FAIR_USE_DAILY_LIMIT);
  });

  it("bypassCheck still bypasses for a private (loopback) edge IP", () => {
    const req = new Request("https://api.anatome.dev/generateImage", {
      headers: { "cf-connecting-ip": "127.0.0.1" },
    });
    const rl = bypassCheck(req, NO_SECRETS);
    expect(rl?.bypass).toBe(true);
    expect(rl?.source).toBe("localhost");
  });

  it("bypassCheck still honors PROXY_SECRET when set", () => {
    const req = publicReq({ "x-rapidapi-proxy-secret": "s3cret" });
    const env: Env = { RATE_LIMIT_KV: makeKvStub(), PROXY_SECRET: "s3cret" };
    const rl = bypassCheck(req, env);
    expect(rl?.bypass).toBe(true);
    expect(rl?.source).toBe("rapidapi");
  });

  it("bypassCheck still honors MCP_TRUSTED_KEY when set", () => {
    const req = publicReq({ "x-mcp-trusted-key": "mcp-key" });
    const env: Env = { RATE_LIMIT_KV: makeKvStub(), MCP_TRUSTED_KEY: "mcp-key" };
    const rl = bypassCheck(req, env);
    expect(rl?.bypass).toBe(true);
    expect(rl?.source).toBe("mcp_trusted");
  });

  it("a public IP is metered on the fair-use bucket", async () => {
    const env: Env = { RATE_LIMIT_KV: makeKvStub() };
    const rl = await checkRateLimit(publicReq(), env);
    expect(rl.bypass).not.toBe(true);
    expect(rl.scope).toBe("ip");
    expect(rl.limit).toBe(DEFAULT_FAIR_USE_DAILY_LIMIT);
  });

  it("a spoofed-localhost Origin from a public IP is eventually blocked (no unlimited bypass)", async () => {
    const kv = makeKvStub();
    const env: Env = { RATE_LIMIT_KV: kv };
    // Pre-fill today's bucket for the caller's IP at the ceiling. The spoofed Origin is
    // irrelevant — it can neither unlock a bypass nor dodge into a fresh bucket.
    const key = await rateLimitBucketKey("ip", "203.0.113.5");
    await kv.put(key, String(DEFAULT_FAIR_USE_DAILY_LIMIT));
    const rl = await checkRateLimit(publicReq({ origin: "http://localhost" }), env);
    expect(rl.bypass).not.toBe(true);
    expect(rl.source).not.toBe("localhost");
    expect(rl.scope).toBe("ip");
    expect(rl.allowed).toBe(false);
  });
});
