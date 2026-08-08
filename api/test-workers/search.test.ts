// Reading the log back: windows, filters, paging, exercise history, supplements.
//
// The v1 API could answer "what did I do today" and nothing else. These tests pin the queries a
// returning user or a coach actually asks, and the isolation properties that must hold on every
// one of those new paths — a search endpoint is exactly where a forgotten `user_id` leaks.

import { env } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";
import app from "../src/index.ts";
import { applySchema, callTool, signUp, type Session } from "./helpers.ts";
import { estimate1rm, parseWindow, containsPattern } from "../src/lib/query.helpers.ts";
import type { UserRow } from "../src/lib/db.ts";

let user: Session;
let other: Session;

const USER_TZ = { timezone: "UTC" } as UserRow;

beforeAll(async () => {
  await applySchema();
  user = await signUp(app, "search@example.com");
  other = await signUp(app, "nosy@example.com");

  // A small history with deliberate variety: two exercises, three dates, mixed casing.
  await callTool(app, user, "log_workout", {
    title: "Push day", date: "2026-03-02",
    sets: [
      { exercise_name: "Bench Press", reps: 5, weight: 100 },
      { exercise_name: "Bench Press", reps: 5, weight: 100 },
      { exercise_name: "Overhead Press", reps: 8, weight: 50 },
    ],
  });
  await callTool(app, user, "log_workout", {
    title: "Push day", date: "2026-03-09",
    sets: [
      { exercise_name: "bench press", reps: 5, weight: 105 },
      { exercise_name: "bench press", reps: 3, weight: 110 },
    ],
  });
  await callTool(app, user, "log_workout", {
    title: "Leg day", date: "2026-03-05",
    sets: [{ exercise_name: "Back Squat", reps: 5, weight: 140 }],
  });

  await callTool(app, user, "log_meal", { name: "Oatmeal with berries", calories: 420, protein: 14, date: "2026-03-02", meal_type: "breakfast" });
  await callTool(app, user, "log_meal", { name: "Chicken and rice", calories: 650, protein: 52, date: "2026-03-02", meal_type: "lunch" });
  await callTool(app, user, "log_meal", { name: "Oats and whey", calories: 380, protein: 30, date: "2026-03-09", meal_type: "breakfast" });

  await callTool(app, user, "log_supplement", { name: "Creatine", dose: 5, unit: "g", date: "2026-03-02" });
  await callTool(app, user, "log_supplement", { name: "creatine", dose: 5, unit: "g", date: "2026-03-09" });
  await callTool(app, user, "log_supplement", { name: "Vitamin D3", dose: 4000, unit: "iu", date: "2026-03-02" });

  await callTool(app, user, "log_water", { amount_ml: 750, date: "2026-03-02" });
});

describe("date windows", () => {
  it("treats `date` as a one-day window", () => {
    const w = parseWindow({ date: "2026-03-02" }, USER_TZ);
    expect(w).toMatchObject({ from: "2026-03-02", to: "2026-03-02" });
  });

  it("swaps a reversed range rather than rejecting it", () => {
    // The caller meant that range. Failing them over argument order teaches nothing.
    const w = parseWindow({ from: "2026-03-31", to: "2026-03-01" }, USER_TZ);
    expect(w).toMatchObject({ from: "2026-03-01", to: "2026-03-31" });
  });

  it("rejects a date that does not exist", () => {
    expect(parseWindow({ date: "2026-02-31" }, USER_TZ)).toHaveProperty("error");
    expect(parseWindow({ from: "not-a-date" }, USER_TZ)).toHaveProperty("error");
  });

  it("neutralises LIKE wildcards the user typed", () => {
    // Without escaping, searching for "100%" matches everything.
    expect(containsPattern("100%")).toBe("%100\\%%");
    expect(containsPattern("a_b")).toBe("%a\\_b%");
  });
});

describe("meal search", () => {
  it("finds meals by name across a range", async () => {
    const out = await callTool(app, user, "list_meals", { from: "2026-03-01", to: "2026-03-31", q: "oat" });
    const names = (out.data as { meals: { name: string }[] }).meals.map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(["Oatmeal with berries", "Oats and whey"]));
    expect(names).not.toContain("Chicken and rice");
  });

  it("totals whatever matched, which is the point of searching a range", async () => {
    const out = await callTool(app, user, "list_meals", { from: "2026-03-01", to: "2026-03-31" });
    const d = out.data as { totals: { calories: number; protein: number }; total_matched: number };
    expect(d.total_matched).toBe(3);
    expect(d.totals.calories).toBe(1450);
    expect(d.totals.protein).toBe(96);
  });

  it("filters by meal type", async () => {
    const out = await callTool(app, user, "list_meals", { from: "2026-03-01", to: "2026-03-31", meal_type: "breakfast" });
    expect((out.data as { total_matched: number }).total_matched).toBe(2);
  });

  it("pages, and says whether there is more", async () => {
    const first = await callTool(app, user, "list_meals", { from: "2026-03-01", to: "2026-03-31", limit: 2 });
    const d1 = first.data as { returned: number; has_more: boolean; total_matched: number };
    expect(d1.returned).toBe(2);
    expect(d1.total_matched).toBe(3);
    expect(d1.has_more).toBe(true);

    const second = await callTool(app, user, "list_meals", { from: "2026-03-01", to: "2026-03-31", limit: 2, offset: 2 });
    const d2 = second.data as { returned: number; has_more: boolean };
    expect(d2.returned).toBe(1);
    expect(d2.has_more).toBe(false);
  });

  it("never returns another user's meals", async () => {
    await callTool(app, other, "log_meal", { name: "Oat impostor", calories: 1, date: "2026-03-02" });
    const out = await callTool(app, user, "list_meals", { from: "2026-03-01", to: "2026-03-31", q: "oat" });
    const names = (out.data as { meals: { name: string }[] }).meals.map((m) => m.name);
    expect(names).not.toContain("Oat impostor");
  });
});

describe("workout search", () => {
  it("filters to sessions containing an exercise, case-insensitively", async () => {
    const out = await callTool(app, user, "list_workouts", { from: "2026-03-01", to: "2026-03-31", exercise: "bench" });
    const d = out.data as { total_matched: number; workouts: { date: string }[] };
    // Logged once as "Bench Press" and once as "bench press" — one exercise to a human.
    expect(d.total_matched).toBe(2);
    expect(d.workouts.map((w) => w.date).sort()).toEqual(["2026-03-02", "2026-03-09"]);
  });

  it("returns a workout once even when several of its sets match", async () => {
    const out = await callTool(app, user, "list_workouts", { date: "2026-03-02", exercise: "bench" });
    // That session has two bench sets; a join would have produced it twice.
    expect((out.data as { total_matched: number }).total_matched).toBe(1);
  });

  it("searches title and notes", async () => {
    const out = await callTool(app, user, "list_workouts", { from: "2026-03-01", to: "2026-03-31", q: "leg" });
    const d = out.data as { total_matched: number; workouts: { title: string }[] };
    expect(d.total_matched).toBe(1);
    expect(d.workouts[0].title).toBe("Leg day");
  });

  it("attaches sets and volume without a query per workout", async () => {
    const out = await callTool(app, user, "list_workouts", { from: "2026-03-01", to: "2026-03-31" });
    const d = out.data as { workouts: { date: string; set_count: number; total_volume: number }[] };
    const push = d.workouts.find((w) => w.date === "2026-03-02")!;
    expect(push.set_count).toBe(3);
    expect(push.total_volume).toBe(5 * 100 + 5 * 100 + 8 * 50); // 1400
  });
});

describe("exercise history", () => {
  it("groups an exercise into sessions with volume and best set", async () => {
    const out = await callTool(app, user, "get_exercise_history", { exercise: "bench press", from: "2026-03-01", to: "2026-03-31" });
    const d = out.data as {
      total_sessions: number; total_sets: number;
      sessions: { date: string; total_volume: number; best_set: { weight: number; estimated_1rm: number } }[];
      best_in_window: { weight: number; date: string };
    };
    expect(d.total_sessions).toBe(2);
    expect(d.total_sets).toBe(4);

    const latest = d.sessions.find((s) => s.date === "2026-03-09")!;
    expect(latest.total_volume).toBe(5 * 105 + 3 * 110); // 855
    expect(latest.best_set.weight).toBe(110);
    expect(d.best_in_window.weight).toBe(110);
    expect(d.best_in_window.date).toBe("2026-03-09");
  });

  it("matches loosely, because nobody remembers what they typed in March", async () => {
    const out = await callTool(app, user, "get_exercise_history", { exercise: "bench", from: "2026-03-01", to: "2026-03-31" });
    expect((out.data as { total_sets: number }).total_sets).toBe(4);
    expect((out.data as { matched_names: string[] }).matched_names.sort()).toEqual(["Bench Press", "bench press"]);
  });

  it("asks which exercise rather than guessing", async () => {
    const out = await callTool(app, user, "get_exercise_history", {});
    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/which exercise/i);
  });

  it("never reaches another user's sets", async () => {
    await callTool(app, other, "log_workout", { date: "2026-03-02", sets: [{ exercise_name: "Bench Press", reps: 1, weight: 999 }] });
    const out = await callTool(app, user, "get_exercise_history", { exercise: "bench", from: "2026-03-01", to: "2026-03-31" });
    const d = out.data as { best_in_window: { weight: number }; total_sets: number };
    expect(d.total_sets).toBe(4);
    expect(d.best_in_window.weight).toBe(110); // not 999
  });

  it("declines to estimate a 1RM above 12 reps", () => {
    // Epley stops being meaningful there and starts being a number people quote at each other.
    expect(estimate1rm(5, 100)).toBe(116.7);
    expect(estimate1rm(13, 100)).toBeNull();
    expect(estimate1rm(null, 100)).toBeNull();
    expect(estimate1rm(5, null)).toBeNull();
  });
});

describe("supplements", () => {
  it("logs with an optional dose", async () => {
    const out = await callTool(app, user, "log_supplement", { name: "Magnesium", date: "2026-03-02" });
    expect(out.isError).toBe(false);
    expect((out.data as { supplement: { dose: number | null } }).supplement.dose).toBeNull();
  });

  it("counts days taken, which is what 'am I consistent' means", async () => {
    const out = await callTool(app, user, "list_supplements", { from: "2026-03-01", to: "2026-03-31" });
    const byName = (out.data as { by_supplement: { name: string; days: number }[] }).by_supplement;
    const creatine = byName.find((s) => s.name.toLowerCase() === "creatine")!;
    // Logged as "Creatine" and "creatine" on two different dates — one supplement, two days.
    expect(creatine.days).toBe(2);
  });

  it("rejects an unknown field like every other write", async () => {
    const out = await callTool(app, user, "log_supplement", { name: "Zinc", dosis: 10 });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("dosis");
  });

  // A supplement dose without its unit is not a quantity — 4000 of vitamin D means nothing — so
  // the natural way to say it puts both in one string. Rejecting that taught callers to retry with
  // the dose dropped rather than with the unit moved, which loses the number entirely.
  it("accepts a dose and unit written as one string", async () => {
    const out = await callTool(app, user, "log_supplement", { name: "Creatine mono", dose: "5 g", date: "2026-03-14" });
    expect(out.isError).toBe(false);
    const s = (out.data as { supplement: { dose: number | null; unit: string } }).supplement;
    expect(s.dose).toBe(5);
    expect(s.unit).toBe("g");
  });

  it("handles the units people actually write", async () => {
    for (const [dose, amount, unit] of [["4000 IU", 4000, "iu"], ["2 capsules", 2, "capsules"], ["0.5 scoop", 0.5, "scoop"], ["500mg", 500, "mg"]] as const) {
      const out = await callTool(app, user, "log_supplement", { name: `Test ${dose}`, dose, date: "2026-03-15" });
      const s = (out.data as { supplement: { dose: number | null; unit: string } }).supplement;
      expect([dose, s.dose, s.unit]).toEqual([dose, amount, unit]);
    }
  });

  it("does not let the string form overwrite an explicit unit", async () => {
    const out = await callTool(app, user, "log_supplement", { name: "Zinc picolinate", dose: "50 mg", unit: "mcg", date: "2026-03-16" });
    // The caller said mcg twice as far as we know; splitting the string must not silently
    // relabel their unit, because that is the one thing nothing downstream could detect.
    expect((out.data as { supplement: { unit: string } }).supplement.unit).toBe("mcg");
  });

  it("still refuses a dose that is not a number, and says how to fix it", async () => {
    const out = await callTool(app, user, "log_supplement", { name: "Mystery", dose: "a big scoop" });
    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/unit/);
    // The message has to name the shape that works, or the model's cheapest recovery is to drop
    // the field and log nothing.
    expect(out.text).toMatch(/"dose": 5/);
  });
});

describe("get_day", () => {
  it("returns nutrition, training and supplements in one call", async () => {
    const out = await callTool(app, user, "get_day", { date: "2026-03-02" });
    const d = out.data as {
      nutrition: { calories: number; meal_count: number; water_ml: number; meals: unknown[] };
      training: { workout_count: number; set_count: number; total_volume: number };
      supplements: unknown[];
    };
    expect(d.nutrition.calories).toBe(1070);
    expect(d.nutrition.meal_count).toBe(2);
    expect(d.nutrition.water_ml).toBe(750);
    expect(d.training.workout_count).toBe(1);
    expect(d.training.set_count).toBe(3);
    expect(d.training.total_volume).toBe(1400);
    expect(d.supplements.length).toBeGreaterThanOrEqual(2);
  });

  it("narrows to the sections asked for", async () => {
    const out = await callTool(app, user, "get_day", { date: "2026-03-02", include: ["training"] });
    const d = out.data as { nutrition: unknown; training: unknown; supplements: unknown };
    expect(d.training).toBeTruthy();
    expect(d.nutrition).toBeNull();
    expect(d.supplements).toBeNull();
  });

  it("is one request where three used to be", async () => {
    // Not a performance assertion — a budget one. Fair use is 50 calls a day, and a user asking
    // "what did I do yesterday" should not spend three of them.
    const out = await callTool(app, user, "get_day", { date: "2026-03-09" });
    const d = out.data as { nutrition: { meal_count: number }; training: { workout_count: number } };
    expect(d.nutrition.meal_count).toBe(1);
    expect(d.training.workout_count).toBe(1);
  });
});

describe("REST mirrors the new reads", () => {
  it("serves exercise history over plain HTTP", async () => {
    const res = await app.request(
      "https://api.anatome.dev/v1/exercise-history?exercise=bench&from=2026-03-01&to=2026-03-31",
      { headers: { authorization: `Bearer ${user.accessToken}` } }, env,
    );
    expect(res.status).toBe(200);
    expect((await res.json() as { total_sessions: number }).total_sessions).toBe(2);
  });

  it("serves a whole day over plain HTTP", async () => {
    const res = await app.request(
      "https://api.anatome.dev/v1/day?date=2026-03-02",
      { headers: { authorization: `Bearer ${user.accessToken}` } }, env,
    );
    expect(res.status).toBe(200);
    expect((await res.json() as { nutrition: { calories: number } }).nutrition.calories).toBe(1070);
  });
});
