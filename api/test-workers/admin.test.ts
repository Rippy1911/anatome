// The operator unlock.
//
// This endpoint exists for one situation: someone says "it tells me I am out of requests and I
// have barely used it." Every such person is signed in, so their budget is the **account**
// bucket — which this endpoint could not touch until now. It took `ip` and `session` only, the
// two scopes a complaining user almost never lands in.
//
// The tests run with a fair-use limit of 3 rather than 50. Nothing about the reset depends on the
// number, and asserting it at 50 would mean fifty round trips per case to prove one thing.

import { env } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";
import app from "../src/index.ts";
import { applySchema, signUp, type Session } from "./helpers.ts";

const ADMIN_TOKEN = "test-admin-token";

// Mutated, never spread. `{ ...env }` produces a plain object that no longer carries the pool's
// isolated-storage machinery, and the whole file dies with "Isolated storage failed" — which
// reads like a bug in the code under test rather than in the test.
const testEnv = env as typeof env & {
  ADMIN_TOKEN: string;
  FAIR_USE_DAILY_LIMIT: string;
  RATE_LIMIT_DO?: DurableObjectNamespace;
};
testEnv.ADMIN_TOKEN = ADMIN_TOKEN;
testEnv.FAIR_USE_DAILY_LIMIT = "3";

// Counted in KV, not the Durable Object — and that is a real deployment shape, not a mock: with
// no RATE_LIMIT_DO binding `consume` falls through to `consumeKv`, which is how a self-hoster who
// never created the object runs. What is under test here is which *identity* the reset resolves
// and clears, and that is the same code on both paths.
//
// The alternative was worse. Exhausting and clearing a bucket churns the DO's SQLite enough to
// leave a `-shm` WAL sidecar, and the pool's teardown asserts every file in that directory ends
// in `.sqlite` — so the file failed on an upstream bug (still present 52 patches later, through
// 0.8.71) no matter what this code did. The DO reset path is verified against production instead;
// see the PR.
delete testEnv.RATE_LIMIT_DO;

/** One metered call as a signed-in user. Returns true when it was served. */
async function spend(session: Session): Promise<boolean> {
  const res = await app.request("https://api.anatome.dev/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "198.51.100.30",
      "mcp-session-id": `admin-${crypto.randomUUID()}`,
      authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_profile", arguments: {} } }),
  }, testEnv);
  const body = await res.json() as { result: { isError?: boolean; structuredContent?: { error?: string } } };
  return body.result.structuredContent?.error !== "daily_fair_use_limit_reached";
}

async function reset(payload: Record<string, string>, token = ADMIN_TOKEN) {
  const res = await app.request("https://api.anatome.dev/admin/rate-limit/reset", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }, testEnv);
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

beforeAll(async () => {
  await applySchema();
});

describe("resetting the bucket a signed-in user is actually in", () => {
  it("gives an exhausted account its day back, addressed by email", async () => {
    const user = await signUp(app, "stuck@example.com");

    expect(await spend(user)).toBe(true);
    expect(await spend(user)).toBe(true);
    expect(await spend(user)).toBe(true);
    expect(await spend(user)).toBe(false);   // out

    const out = await reset({ email: "stuck@example.com" });
    expect(out.status).toBe(200);
    // The scope is the assertion that matters: an `ip` here would mean the endpoint cleared a
    // bucket nobody was in and reported success anyway.
    expect(out.body.scope).toBe("user");

    expect(await spend(user)).toBe(true);
  });

  it("accepts the internal id too, for when that is what the operator has", async () => {
    const user = await signUp(app, "by-id@example.com");
    const row = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind("by-id@example.com").first<{ id: string }>();

    expect(await spend(user)).toBe(true);
    expect(await spend(user)).toBe(true);
    expect(await spend(user)).toBe(true);
    expect(await spend(user)).toBe(false);

    const out = await reset({ user: row!.id });
    expect(out.body.scope).toBe("user");
    expect(await spend(user)).toBe(true);
  });

  it("matches the email case-insensitively, the way sign-in does", async () => {
    await signUp(app, "mixed@example.com");
    const out = await reset({ email: "MiXeD@Example.com" });
    expect(out.status).toBe(200);
    expect(out.body.scope).toBe("user");
  });
});

describe("saying no clearly", () => {
  it("reports a typo instead of silently resetting nothing", async () => {
    const out = await reset({ email: "nobody@example.com" });
    expect(out.status).toBe(404);
    expect(out.body.error).toMatch(/no account/i);
  });

  it("refuses an ambiguous request rather than picking one", async () => {
    expect((await reset({ email: "stuck@example.com", user: "usr_whatever" })).status).toBe(400);
    expect((await reset({ user: "usr_a", ip: "203.0.113.7" })).status).toBe(400);
    expect((await reset({})).status).toBe(400);
  });

  it("names all three scopes when given none", async () => {
    const out = await reset({});
    expect(String(out.body.error)).toMatch(/user.*session.*ip/);
  });

  it("still handles the two scopes it always had", async () => {
    expect((await reset({ ip: "203.0.113.7" })).body.scope).toBe("ip");
    expect((await reset({ session: "sess-abc" })).body.scope).toBe("mcp_session");
  });

  it("is invisible without the admin token", async () => {
    const out = await reset({ email: "stuck@example.com" }, "wrong-token");
    // 404, not 401 — the admin surface should not confirm it exists to someone guessing.
    expect(out.status).toBe(404);
  });
});
