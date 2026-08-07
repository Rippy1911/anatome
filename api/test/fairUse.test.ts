// Fair use, and the shape of running out of it.
//
// The failure mode this file guards against is not "the limit does not work" — it is
// "the limit works and the assistant reports it as a broken connector". A rate-limited MCP
// server that answers `initialize` with a 429, or answers `tools/call` with a JSON-RPC
// protocol error, produces exactly that: Claude and ChatGPT show "connector failed", the model
// never sees a reason, and the user is told the wrong thing.

import { describe, it, expect } from "vitest";
import app from "../src/index.ts";
import {
  checkRateLimit,
  rateLimitBody,
  rateLimitMessage,
  rateHeaders,
  humanDuration,
  fairUseLimit,
  DEFAULT_FAIR_USE_DAILY_LIMIT,
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

function env(overrides: Partial<Env> = {}): Env {
  return { RATE_LIMIT_KV: makeKvStub(), ...overrides };
}

const CALLER = { "cf-connecting-ip": "203.0.113.77" };

function rpc(body: unknown, headers: Record<string, string> = {}) {
  return app.request("https://api.anatome.dev/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...CALLER, ...headers },
    body: JSON.stringify(body),
  }, env());
}

describe("fair use: the budget itself", () => {
  it("defaults to 50 per day and is configurable by one var", () => {
    expect(DEFAULT_FAIR_USE_DAILY_LIMIT).toBe(50);
    expect(fairUseLimit(env())).toBe(50);
    expect(fairUseLimit(env({ FAIR_USE_DAILY_LIMIT: "500" }))).toBe(500);
  });

  it("ignores a nonsense limit rather than locking everyone out", () => {
    expect(fairUseLimit(env({ FAIR_USE_DAILY_LIMIT: "0" }))).toBe(50);
    expect(fairUseLimit(env({ FAIR_USE_DAILY_LIMIT: "-1" }))).toBe(50);
    expect(fairUseLimit(env({ FAIR_USE_DAILY_LIMIT: "banana" }))).toBe(50);
  });

  it("allows exactly `limit` requests and denies the next one", async () => {
    const e = env({ FAIR_USE_DAILY_LIMIT: "3" });
    const req = () => new Request("https://api.anatome.dev/searchExercises?q=bench", { headers: CALLER });

    for (let i = 1; i <= 3; i++) {
      const rl = await checkRateLimit(req(), e);
      expect(rl.allowed).toBe(true);
      expect(rl.used).toBe(i);
      expect(rl.remaining).toBe(3 - i);
    }
    const over = await checkRateLimit(req(), e);
    expect(over.allowed).toBe(false);
    expect(over.remaining).toBe(0);
    expect(over.scope).toBe("ip");
  });

  it("gives each MCP session its own budget, because a remote connector shares one egress IP", async () => {
    const e = env({ FAIR_USE_DAILY_LIMIT: "1" });
    const req = () => new Request("https://api.anatome.dev/mcp", { method: "POST", headers: CALLER });

    const a1 = await checkRateLimit(req(), e, { mcpSessionId: "session-a" });
    const a2 = await checkRateLimit(req(), e, { mcpSessionId: "session-a" });
    const b1 = await checkRateLimit(req(), e, { mcpSessionId: "session-b" });

    expect(a1.allowed).toBe(true);
    expect(a2.allowed).toBe(false); // session A is spent
    expect(b1.allowed).toBe(true); // session B is untouched — not one global bucket
    expect(b1.scope).toBe("mcp_session");
  });

  it("still stops a caller re-minting sessions forever (network ceiling)", async () => {
    const e = env({ FAIR_USE_DAILY_LIMIT: "10", ANON_NETWORK_DAILY_LIMIT: "2" });
    const req = () => new Request("https://api.anatome.dev/mcp", { method: "POST", headers: CALLER });

    expect((await checkRateLimit(req(), e, { mcpSessionId: "s1" })).allowed).toBe(true);
    expect((await checkRateLimit(req(), e, { mcpSessionId: "s2" })).allowed).toBe(true);
    const blocked = await checkRateLimit(req(), e, { mcpSessionId: "s3" });
    expect(blocked.allowed).toBe(false);
    expect(blocked.scope).toBe("network");
  });

  it("refunds the session unit when the network ceiling is what rejected the call", async () => {
    // The caller never got service; charging their own budget for our guard would be theft.
    const kv = makeKvStub();
    const e = env({ RATE_LIMIT_KV: kv, FAIR_USE_DAILY_LIMIT: "10", ANON_NETWORK_DAILY_LIMIT: "1" });
    const req = () => new Request("https://api.anatome.dev/mcp", { method: "POST", headers: CALLER });

    await checkRateLimit(req(), e, { mcpSessionId: "s1" }); // consumes the single network unit
    const blocked = await checkRateLimit(req(), e, { mcpSessionId: "s2" });
    expect(blocked.allowed).toBe(false);

    const s2Bucket = [...kv.store.entries()].find(([k]) => k.startsWith("mcp_session:") && kv.store.get(k) === "0");
    expect(s2Bucket).toBeTruthy();
  });
});

describe("fair use: what the caller is told", () => {
  const spent = {
    allowed: false as const,
    scope: "ip" as const,
    limit: 50,
    used: 50,
    remaining: 0,
    reset: 1_786_147_200,
    reset_at: "2026-08-08T00:00:00.000Z",
    retry_after: 62_678,
  };

  it("names the limit, the reset, and that nothing is broken", () => {
    const msg = rateLimitMessage(spent);
    expect(msg).toContain("50");
    expect(msg).toContain("2026-08-08T00:00:00.000Z");
    expect(msg).toContain("17h 24m");
    expect(msg).toMatch(/nothing is broken/i);
    expect(msg).toMatch(/retrying\s+now will not help/i);
    expect(msg).toMatch(/tell the user/i);
  });

  it("never phrases a fair-use stop as the integration breaking", () => {
    // The exact wordings a host or a model would parrot back to the user as "it's broken".
    const msg = rateLimitMessage(spent).toLowerCase();
    for (const phrase of ["connector failed", "service unavailable", "something went wrong", "try again later"]) {
      expect(msg).not.toContain(phrase);
    }
  });

  it("distinguishes the shared-network guard from a personal limit", () => {
    const msg = rateLimitMessage({ ...spent, scope: "network", limit: 10000 });
    expect(msg).toMatch(/shared-network/i);
    expect(msg).toMatch(/not a problem with your account/i);
  });

  it("body is machine-actionable: retryable false, reset, and where to go for more", () => {
    const body = rateLimitBody(spent, env());
    expect(body.error).toBe("daily_fair_use_limit_reached");
    expect(body.retryable).toBe(false);
    expect(body.reset_at).toBe("2026-08-08T00:00:00.000Z");
    expect(body.retry_after_seconds).toBe(62_678);
    expect(body.more_info).toBe("https://platform.anatome.dev");
  });

  it("emits both RFC 9331 and X- rate-limit headers", () => {
    const h = rateHeaders({ allowed: true, scope: "ip", limit: 50, remaining: 12, reset: 1_786_147_200 });
    expect(h["RateLimit-Limit"]).toBe("50");
    expect(h["RateLimit-Remaining"]).toBe("12");
    expect(h["X-RateLimit-Limit"]).toBe("50");
    expect(h["X-RateLimit-Remaining"]).toBe("12");
  });

  it("humanDuration reads like a person wrote it", () => {
    expect(humanDuration(62_678)).toBe("17h 24m");
    expect(humanDuration(3600)).toBe("1h");
    expect(humanDuration(90)).toBe("1m");
    expect(humanDuration(9)).toBe("9s");
    expect(humanDuration(-5)).toBe("0s");
  });
});

describe("MCP: the handshake is never metered", () => {
  it("initialize succeeds and reports the negotiated protocol version", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    expect(res.status).toBe(200);
    const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(body.result.serverInfo.name).toBe("anatome");
    expect(body.result.protocolVersion).toBe("2025-06-18");
  });

  it("initialize issues an Mcp-Session-Id so fair use has something to count", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(res.headers.get("Mcp-Session-Id")).toMatch(/^[a-f0-9]{32}$/);
  });

  it("initialize and tools/list still work when the budget is exhausted", async () => {
    // A limit of zero is "out of requests" for every caller, which is the state that used to
    // make a working connector fail to connect at all.
    const e = env({ FAIR_USE_DAILY_LIMIT: "1" });
    const kv = e.RATE_LIMIT_KV as unknown as { store: Map<string, string> };
    for (const method of ["initialize", "tools/list"]) {
      const res = await app.request("https://api.anatome.dev/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", ...CALLER },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {} }),
      }, e);
      expect(res.status).toBe(200);
      const body = await res.json() as { result?: unknown; error?: unknown };
      expect(body.error).toBeUndefined();
      expect(body.result).toBeTruthy();
    }
    // ...and none of it cost the caller a unit.
    expect(kv.store.size).toBe(0);
  });

  it("answers notifications with 202 and no body", async () => {
    const res = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("answers ping", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 7, method: "ping" });
    const body = await res.json() as { id: number; result: unknown; error?: unknown };
    expect(body.error).toBeUndefined();
    expect(body.result).toEqual({});
  });
});

describe("MCP: running out mid-conversation", () => {
  async function exhaustedCall() {
    const e = env({ FAIR_USE_DAILY_LIMIT: "1" });
    const call = () => app.request("https://api.anatome.dev/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", "mcp-session-id": "sess-1", ...CALLER },
      body: JSON.stringify({ jsonrpc: "2.0", id: 42, method: "tools/call", params: { name: "list_muscles", arguments: {} } }),
    }, e);
    await call(); // spends the single unit
    return call();
  }

  it("returns HTTP 200 with a tool-level error, not a JSON-RPC protocol error", async () => {
    const res = await exhaustedCall();
    // 200 + isError is MCP's channel for "the tool ran and could not do the job". A protocol
    // error here is what hosts render as "the connector failed".
    expect(res.status).toBe(200);
    const body = await res.json() as { id: number; error?: unknown; result: { isError: boolean } };
    expect(body.error).toBeUndefined();
    expect(body.id).toBe(42);
    expect(body.result.isError).toBe(true);
  });

  it("puts the explanation where the model will read it", async () => {
    const res = await exhaustedCall();
    const body = await res.json() as { result: { content: { type: string; text: string }[] } };
    const text = body.result.content[0].text;
    expect(text).toMatch(/fair-use limit/i);
    expect(text).toMatch(/connector is working correctly/i);
    expect(text).toMatch(/tell the user/i);
    expect(text).toContain("https://platform.anatome.dev");
  });

  it("carries structured facts alongside the prose", async () => {
    const res = await exhaustedCall();
    const body = await res.json() as { result: { structuredContent: Record<string, unknown> } };
    const sc = body.result.structuredContent;
    expect(sc.error).toBe("daily_fair_use_limit_reached");
    expect(sc.retryable).toBe(false);
    expect(sc.remaining).toBe(0);
    expect(sc.reset_at).toBeTruthy();
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("MCP: warning before the wall", () => {
  it("attaches a quota notice to successful calls once the budget is nearly spent", async () => {
    const e = env({ FAIR_USE_DAILY_LIMIT: "3" });
    const call = () => app.request("https://api.anatome.dev/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", "mcp-session-id": "sess-warn", ...CALLER },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_muscles", arguments: {} } }),
    }, e);

    const res = await call();
    const body = await res.json() as { result: { structuredContent: { quota?: { remaining_today: number; note: string } } } };
    expect(body.result.structuredContent.quota?.remaining_today).toBe(2);
    expect(body.result.structuredContent.quota?.note).toMatch(/left today/i);
  });

  it("stays quiet when the caller has plenty left", async () => {
    const e = env({ FAIR_USE_DAILY_LIMIT: "500" });
    const res = await app.request("https://api.anatome.dev/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", "mcp-session-id": "sess-quiet", ...CALLER },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_muscles", arguments: {} } }),
    }, e);
    const body = await res.json() as { result: { structuredContent: { quota?: unknown } } };
    expect(body.result.structuredContent.quota).toBeUndefined();
  });
});

describe("keyless: the paid surface is gone", () => {
  it("no longer advertises API keys on the discovery document", async () => {
    const res = await app.request("https://api.anatome.dev/", { headers: CALLER }, env());
    const body = await res.json() as { auth: { scheme: string }; endpoints: string[] };
    expect(body.auth.scheme).toBe("none");
    expect(body.endpoints.join(" ")).not.toContain("/admin/keys");
  });

  it("a Bearer token is simply ignored rather than rejected", async () => {
    // Old behaviour hard-denied any `Bearer ana_*`. Keyless means a stale token from an old
    // integration must not be worse than sending nothing at all.
    const res = await app.request("https://api.anatome.dev/listMuscles", {
      headers: { ...CALLER, authorization: "Bearer ana_live_deadbeef" },
    }, env());
    expect(res.status).toBe(200);
  });

  it("key administration endpoints are gone", async () => {
    for (const path of ["/admin/keys/key_abc", "/admin/usage?key_id=key_abc"]) {
      const res = await app.request(`https://api.anatome.dev${path}`, {
        method: path.includes("usage") ? "GET" : "PUT",
        headers: { ...CALLER, authorization: "Bearer test-admin" },
      }, env({ ADMIN_TOKEN: "test-admin" }));
      expect(res.status).toBe(404);
    }
  });

  it("publishes an agent-discoverable MCP pointer", async () => {
    const res = await app.request("https://api.anatome.dev/.well-known/mcp.json", { headers: CALLER }, env());
    expect(res.status).toBe(200);
    const body = await res.json() as { authentication: { type: string }; fair_use: { requests_per_day: number } };
    expect(body.authentication.type).toBe("none");
    expect(body.fair_use.requests_per_day).toBe(50);
  });
});
