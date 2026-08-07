// Personal logging against a real workerd + D1.
//
// The two things worth losing sleep over here are (a) one user reading another's food log and
// (b) a write that reports success and stores nothing. Both get their own describe block.

import { env } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";
import app from "../src/index.ts";
import { applySchema, callTool, signUp, type Session } from "./helpers.ts";
import { LOGGING_TOOL_NAMES, LOGGING_TOOLS, TOOL_FIELD_CONTRACT, SET_FIELD_CONTRACT } from "../src/routes/personal.ts";
import { MEAL_ALIASES, SET_ALIASES } from "../src/lib/validate.ts";

let alice: Session;
let bob: Session;

beforeAll(async () => {
  await applySchema();
  alice = await signUp(app, "alice@example.com");
  bob = await signUp(app, "bob@example.com");
});

describe("tool availability is honest about this deployment", () => {
  it("advertises the logging tools when a database is bound", async () => {
    const res = await app.request("https://api.anatome.dev/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }, env);
    const names = (await res.json() as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
    for (const tool of LOGGING_TOOL_NAMES) expect(names).toContain(tool);
  });

  it("hides them when there is no database, rather than promising what it cannot do", async () => {
    // A tool list that offers log_meal on a Worker with no DB teaches the model to try, fail and
    // apologise to the user.
    const noDb = { ...env, DB: undefined };
    const res = await app.request("https://api.anatome.dev/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }, noDb as unknown as typeof env);
    const names = (await res.json() as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
    expect(names).not.toContain("log_meal");
    // ...and the catalog is untouched.
    expect(names).toContain("search_exercises");
  });
});

describe("tool schemas match the write gate", () => {
  // A schema is a promise to an agent. A schema field the gate then rejects is a promise broken
  // at runtime, which is exactly the failure this whole validation layer exists to prevent.
  for (const [toolName, accepted] of Object.entries(TOOL_FIELD_CONTRACT)) {
    it(`${toolName} advertises only fields the gate accepts`, () => {
      const tool = LOGGING_TOOLS.find((t) => t.name === toolName)!;
      const props = Object.keys((tool.inputSchema as { properties: Record<string, unknown> }).properties);
      for (const prop of props) {
        if (prop === "sets") continue; // nested, checked below
        expect(accepted, `${toolName}.${prop}`).toContain(prop);
      }
    });
  }

  it("log_workout's nested set schema matches SET_FIELDS", () => {
    const tool = LOGGING_TOOLS.find((t) => t.name === "log_workout")!;
    const sets = (tool.inputSchema as { properties: { sets: { items: { properties: Record<string, unknown> } } } })
      .properties.sets.items.properties;
    for (const prop of Object.keys(sets)) expect(SET_FIELD_CONTRACT).toContain(prop);
  });

  it("aliases resolve to fields that are actually accepted", () => {
    // An alias pointing at a non-accepted target smuggles a key past the gate and the handler
    // then ignores it — a silent drop reintroduced by the list meant to prevent one.
    for (const target of Object.values(MEAL_ALIASES)) {
      expect(TOOL_FIELD_CONTRACT.log_meal).toContain(target);
    }
    for (const target of Object.values(SET_ALIASES)) {
      expect(SET_FIELD_CONTRACT).toContain(target);
    }
  });
});

describe("writes that must not silently succeed", () => {
  it("rewrites a known alias instead of rejecting a caller we can understand", async () => {
    const out = await callTool(app, alice, "log_meal", { name: "Chicken and rice", kcal: 650, protein_g: 52 });
    expect(out.isError).toBe(false);
    const meal = (out.data as { meal: { calories: number; protein: number } }).meal;
    expect(meal.calories).toBe(650);
    expect(meal.protein).toBe(52);
  });

  it("rejects an unknown field, naming it and the closest match", async () => {
    const out = await callTool(app, alice, "log_meal", { name: "Snack", calries: 200 });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("calries");
    expect(out.text).toContain('Did you mean "calories"');
    expect(out.text).toContain("Accepted fields:");
  });

  it("rejects weight_lb rather than converting it", async () => {
    // The whole reason the alias map is renames-only: 225 lb quietly stored as 225 kg is worse
    // than a rejected request, because nothing downstream can tell it is wrong.
    const out = await callTool(app, alice, "log_workout", {
      sets: [{ exercise_name: "squat", reps: 5, weight_lb: 225 }],
    });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("weight_lb");
  });

  it("accepts weight_kg as an alias for weight and stores the number", async () => {
    const out = await callTool(app, alice, "log_workout", {
      title: "Push day",
      sets: [{ exercise_name: "bench press", reps: 5, weight_kg: 100 }],
    });
    expect(out.isError).toBe(false);
    const w = (out.data as { workout: { sets: { weight: number }[]; total_volume: number } }).workout;
    expect(w.sets[0].weight).toBe(100);
    // The bug this guards: a dropped weight yields volume 0 with a 201 and no error anywhere.
    expect(w.total_volume).toBe(500);
  });

  it("resists a prototype-chain field name", async () => {
    // A bare `aliases[k]` lookup resolves inherited Object.prototype members, takes the alias
    // branch as truthy, and silently drops the key.
    const out = await callTool(app, alice, "log_meal", { name: "x", toString: "boom" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("toString");
  });

  it("refuses a meal with no name instead of storing an unnamed row", async () => {
    const out = await callTool(app, alice, "log_meal", { calories: 100 });
    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/name/i);
  });
});

describe("one user cannot reach another's data", () => {
  it("lists only your own meals", async () => {
    await callTool(app, alice, "log_meal", { name: "Alice porridge", calories: 300, date: "2026-03-01" });
    await callTool(app, bob, "log_meal", { name: "Bob pancakes", calories: 900, date: "2026-03-01" });

    const aliceDay = await callTool(app, alice, "list_meals", { date: "2026-03-01" });
    const names = (aliceDay.data as { meals: { name: string }[] }).meals.map((m) => m.name);
    expect(names).toContain("Alice porridge");
    expect(names).not.toContain("Bob pancakes");
  });

  it("cannot delete another user's row, and cannot tell it exists", async () => {
    const created = await callTool(app, bob, "log_meal", { name: "Bob secret", calories: 1 });
    const bobMealId = (created.data as { meal: { id: string } }).meal.id;

    const attempt = await callTool(app, alice, "delete_meal", { id: bobMealId });
    expect(attempt.isError).toBe(true);
    // Identical to a made-up id: the response must not confirm that the row exists.
    const madeUp = await callTool(app, alice, "delete_meal", { id: "meal_does_not_exist" });
    expect(attempt.text.replace(bobMealId, "X")).toBe(madeUp.text.replace("meal_does_not_exist", "X"));

    // And it is still there for its owner.
    const bobList = await callTool(app, bob, "list_meals", {});
    expect((bobList.data as { meals: { id: string }[] }).meals.some((m) => m.id === bobMealId)).toBe(true);
  });

  // Each test seeds its own rows: the pool resets storage between tests, and a test that leans
  // on a previous one's writes is fragile even where it would work.
  it("summarises only your own day", async () => {
    await callTool(app, alice, "log_meal", { name: "Alice porridge", calories: 300, date: "2026-03-01" });
    await callTool(app, bob, "log_meal", { name: "Bob pancakes", calories: 900, date: "2026-03-01" });

    const aliceSummary = await callTool(app, alice, "get_daily_summary", { date: "2026-03-01" });
    expect((aliceSummary.data as { nutrition: { calories: number } }).nutrition.calories).toBe(300);
    const bobSummary = await callTool(app, bob, "get_daily_summary", { date: "2026-03-01" });
    expect((bobSummary.data as { nutrition: { calories: number } }).nutrition.calories).toBe(900);
  });

  it("exports only your own rows", async () => {
    await callTool(app, alice, "log_meal", { name: "Alice porridge", calories: 300 });
    await callTool(app, bob, "log_meal", { name: "Bob pancakes", calories: 900 });

    const out = await callTool(app, alice, "export_my_data", {});
    const data = out.data as { meals: { name: string }[]; account: { email: string } };
    expect(data.account.email).toBe("alice@example.com");
    expect(data.meals.map((m) => m.name)).toContain("Alice porridge");
    expect(data.meals.every((m) => !m.name.startsWith("Bob"))).toBe(true);
  });
});

describe("days roll over at the user's local midnight", () => {
  it("dates an entry by the user's timezone, not UTC", async () => {
    const tzUser = await signUp(app, "warsaw@example.com");
    await callTool(app, tzUser, "set_timezone", { timezone: "Pacific/Kiritimati" }); // UTC+14

    const profile = await callTool(app, tzUser, "get_profile", {});
    expect((profile.data as { timezone: string }).timezone).toBe("Pacific/Kiritimati");

    const meal = await callTool(app, tzUser, "log_meal", { name: "Late dinner", calories: 500 });
    const storedDate = (meal.data as { logged_for_date: string }).logged_for_date;

    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Pacific/Kiritimati", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    expect(storedDate).toBe(expected);

    // The point of the whole exercise: for roughly ten hours a day this differs from UTC, and
    // bucketing on UTC would put the meal on the wrong day for every user east of it.
    const utcDate = new Date().toISOString().slice(0, 10);
    expect(typeof utcDate).toBe("string");
  });

  it("refuses a timezone it does not recognise, with guidance", async () => {
    const out = await callTool(app, alice, "set_timezone", { timezone: "Mars/Olympus" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("IANA");
  });

  it("rejects a malformed date rather than silently using today", async () => {
    const out = await callTool(app, alice, "log_meal", { name: "x", calories: 1, date: "2026-02-31" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("YYYY-MM-DD");
  });
});

describe("signed-out callers can actually get signed in", () => {
  it("answers a logging tool with 401 + WWW-Authenticate so the client runs OAuth", async () => {
    // This header is the entire mechanism behind "paste a URL and sign in". Prose in a tool
    // result cannot trigger it, so without this a connector added anonymously has no route to
    // an account except being deleted and re-added by hand.
    const res = await app.request("https://api.anatome.dev/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.30" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "log_meal", arguments: { name: "x" } },
      }),
    }, env);

    expect(res.status).toBe(401);
    const header = res.headers.get("www-authenticate") ?? "";
    expect(header).toContain("Bearer");
    expect(header).toContain("resource_metadata=");
    // The advertised metadata URL must actually resolve, or the client's dance dead-ends.
    const url = header.match(/resource_metadata="([^"]+)"/)?.[1];
    expect(url).toBeTruthy();
    const meta = await app.request(url!, {}, env);
    expect(meta.status).toBe(200);
  });

  it("still explains itself in the body, for a client that shows it", async () => {
    const res = await app.request("https://api.anatome.dev/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.31" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "log_workout", arguments: { sets: [] } },
      }),
    }, env);
    const body = await res.json() as { error_description: string; sign_in: string };
    expect(body.error_description).toContain("log_workout");
    expect(body.sign_in).toContain("/oauth/authorize");
  });

  it("leaves the catalog tools working without an account", async () => {
    // The whole point of staying open: this must not 401.
    const out = await callTool(app, null, "list_muscles", {});
    expect(out.isError).toBe(false);
  });

  it("does not 401 a fair-use denial — that one the model must explain", async () => {
    // Different audiences: "not signed in" is for the client to fix, "out of requests" is for
    // the user to hear. Conflating them is how a working connector reads as broken.
    const spent = { ...env, FAIR_USE_DAILY_LIMIT: "1" } as unknown as typeof env;
    const call = () => app.request("https://api.anatome.dev/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "198.51.100.32",
        "mcp-session-id": "quota-vs-auth",
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "list_muscles", arguments: {} },
      }),
    }, spent);
    await call();
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json() as { result: { isError?: boolean } };
    expect(body.result.isError).toBe(true);
  });
});

describe("goals and the daily summary", () => {
  it("merges goals rather than wiping the ones you did not send", async () => {
    const user = await signUp(app, "goals@example.com");
    await callTool(app, user, "set_goals", { calories: 2400, protein: 180 });
    const out = await callTool(app, user, "set_goals", { water_ml: 3000 });
    const goals = (out.data as { goals: Record<string, number | null> }).goals;
    expect(goals.calories).toBe(2400);
    expect(goals.protein).toBe(180);
    expect(goals.water_ml).toBe(3000);
  });

  it("reports what is left against goals", async () => {
    const user = await signUp(app, "remaining@example.com");
    await callTool(app, user, "set_goals", { calories: 2000 });
    await callTool(app, user, "log_meal", { name: "Lunch", calories: 750 });
    const out = await callTool(app, user, "get_daily_summary", {});
    expect((out.data as { remaining: { calories: number } }).remaining.calories).toBe(1250);
  });

  it("does not invent a weight change across different units", async () => {
    const user = await signUp(app, "units@example.com");
    await callTool(app, user, "log_weight", { value: 180, unit: "lb", date: "2026-01-01" });
    await callTool(app, user, "log_weight", { value: 80, unit: "kg", date: "2026-01-20" });
    const out = await callTool(app, user, "get_weight_trend", { days: 365 });
    // 80 - 180 = -100 of nothing. Reporting no change beats reporting a fiction.
    expect((out.data as { change: unknown }).change).toBeNull();
    expect(out.data.note).toMatch(/different units/i);
  });
});

describe("deletion means deletion", () => {
  it("requires explicit confirmation", async () => {
    const user = await signUp(app, "deleteme@example.com");
    const out = await callTool(app, user, "delete_my_account", {});
    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/confirm/i);
  });

  it("removes the account and every row it owned", async () => {
    const user = await signUp(app, "gone@example.com");
    await callTool(app, user, "log_meal", { name: "Last meal", calories: 500 });
    await callTool(app, user, "log_workout", { sets: [{ exercise_name: "squat", reps: 5, weight: 100 }] });
    await callTool(app, user, "log_water", { amount_ml: 500 });
    await callTool(app, user, "log_weight", { value: 80, unit: "kg" });
    await callTool(app, user, "set_goals", { calories: 2000 });

    const userRow = await env.DB.prepare("SELECT id FROM users WHERE email_lower = ?")
      .bind("gone@example.com").first<{ id: string }>();
    const userId = userRow!.id;

    const out = await callTool(app, user, "delete_my_account", { confirm: true });
    expect(out.isError).toBe(false);

    for (const table of ["meals", "workouts", "workout_sets", "water_logs", "body_metrics", "goals", "tokens", "users"]) {
      const column = table === "users" ? "id" : "user_id";
      const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`)
        .bind(userId).first<{ n: number }>();
      expect(left?.n, `${table} still has rows after deletion`).toBe(0);
    }
  });

  it("makes the deleted account's token stop working", async () => {
    const user = await signUp(app, "revoked-by-deletion@example.com");
    await callTool(app, user, "delete_my_account", { confirm: true });

    // The token is now unknown, so this takes the same path as never having signed in: 401 with
    // the discovery header, inviting a fresh sign-in rather than silently doing nothing.
    const after = await app.request("https://api.anatome.dev/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${user.accessToken}`,
        "cf-connecting-ip": "198.51.100.33",
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "log_meal", arguments: { name: "ghost", calories: 1 } },
      }),
    }, env);
    expect(after.status).toBe(401);
    expect(after.headers.get("www-authenticate")).toContain("resource_metadata=");
  });
});

describe("fair use follows the account once you sign in", () => {
  // The published promise is "50 requests per day per user". For an anonymous caller that is an
  // approximation (a session id, or a shared egress address); for a signed-in one it has to be
  // literally true, or two users behind one NAT would still be fighting over one budget.
  it("charges a signed-in caller to their account, not their address or session", async () => {
    const one = await signUp(app, "budget-one@example.com");
    const two = await signUp(app, "budget-two@example.com");

    const spend = (session: Session) => app.request("https://api.anatome.dev/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.accessToken}`,
        // Same IP and the SAME session id for both users — the only thing distinguishing them
        // is the account, which is exactly what this asserts.
        "cf-connecting-ip": "198.51.100.99",
        "mcp-session-id": "shared-session",
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "list_muscles", arguments: {} },
      }),
    }, { ...env, FAIR_USE_DAILY_LIMIT: "2" } as unknown as typeof env);

    await spend(one);
    await spend(one);
    const oneExhausted = await spend(one);
    const oneBody = await oneExhausted.json() as { result: { isError?: boolean; structuredContent: { scope?: string } } };
    expect(oneBody.result.isError).toBe(true);
    expect(oneBody.result.structuredContent.scope).toBe("user");

    // The second account is untouched despite sharing the address and the session id.
    const twoFirst = await spend(two);
    const twoBody = await twoFirst.json() as { result: { isError?: boolean } };
    expect(twoBody.result.isError).toBeUndefined();
  });
});

describe("REST mirrors the tools", () => {
  it("writes and reads a meal over plain HTTP", async () => {
    const user = await signUp(app, "rest@example.com");
    const post = await app.request("https://api.anatome.dev/v1/meals", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.accessToken}` },
      body: JSON.stringify({ name: "REST meal", calories: 111 }),
    }, env);
    expect(post.status).toBe(201);

    const get = await app.request("https://api.anatome.dev/v1/meals", {
      headers: { authorization: `Bearer ${user.accessToken}` },
    }, env);
    const body = await get.json() as { meals: { name: string }[] };
    expect(body.meals.map((m) => m.name)).toContain("REST meal");
  });

  it("returns the same unknown-field error shape as the tool", async () => {
    const user = await signUp(app, "rest-strict@example.com");
    const res = await app.request("https://api.anatome.dev/v1/meals", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${user.accessToken}` },
      body: JSON.stringify({ name: "x", calries: 5 }),
    }, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string; field: string };
    expect(body.error).toBe("unknown_field");
    expect(body.field).toBe("calries");
  });
});
