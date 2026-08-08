// Planned workouts.
//
// The whole feature is one property: **a plan must never count as work done.** If it did,
// planning next week would silently inflate this week's volume and 1RM history, and nobody
// would notice until a graph looked wrong. Every aggregate gets its own test here.

import { env } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";
import app from "../src/index.ts";
import { applySchema, callTool, signUp, type Session } from "./helpers.ts";
import { addDays } from "../src/lib/query.helpers.ts";

let user: Session;
const today = new Date().toISOString().slice(0, 10);
const tomorrow = addDays(today, 1);
const nextWeek = addDays(today, 7);

beforeAll(async () => {
  await applySchema();
  user = await signUp(app, "planner@example.com");

  // One real session today...
  await callTool(app, user, "log_workout", {
    title: "Push day", date: today,
    sets: [{ exercise_name: "Bench Press", reps: 5, weight: 100 }],
  });
  // ...and two plans ahead.
  await callTool(app, user, "log_workout", {
    title: "Leg day", date: tomorrow,
    sets: [{ exercise_name: "Back Squat", reps: 5, weight: 200 }],
  });
  await callTool(app, user, "log_workout", {
    title: "Pull day", date: nextWeek,
    sets: [{ exercise_name: "Deadlift", reps: 3, weight: 250 }],
  });
});

describe("a future date is inferred to be a plan", () => {
  it("marks it planned and says so", async () => {
    const out = await callTool(app, user, "log_workout", {
      title: "Future session", date: addDays(today, 3),
      sets: [{ exercise_name: "Overhead Press", reps: 5, weight: 60 }],
    });
    const w = (out.data as { workout: { status: string; total_volume: number; planned_volume: number } }).workout;
    expect(w.status).toBe("planned");
    // Reporting volume for work nobody has done is the bug this guards.
    expect(w.total_volume).toBe(0);
    expect(w.planned_volume).toBe(300);
    expect(out.data.note).toMatch(/PLAN/);
  });

  it("treats today and earlier as completed", async () => {
    const out = await callTool(app, user, "log_workout", {
      title: "Yesterday", date: addDays(today, -1),
      sets: [{ exercise_name: "Rows", reps: 10, weight: 60 }],
    });
    expect((out.data as { workout: { status: string } }).workout.status).toBe("completed");
  });

  it("lets the caller override the inference", async () => {
    const out = await callTool(app, user, "log_workout", {
      title: "Logged late", date: addDays(today, 2), status: "completed",
      sets: [{ exercise_name: "Curls", reps: 10, weight: 20 }],
    });
    expect((out.data as { workout: { status: string } }).workout.status).toBe("completed");
  });

  it("rejects a status it does not understand", async () => {
    const out = await callTool(app, user, "log_workout", { status: "maybe", sets: [] });
    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/planned.*completed|completed.*planned/i);
  });
});

describe("a plan does not count as work done", () => {
  it("is excluded from exercise history", async () => {
    // Back Squat exists only as tomorrow's plan.
    const out = await callTool(app, user, "get_exercise_history", { exercise: "squat", days: 365 });
    expect((out.data as { total_sets: number }).total_sets).toBe(0);
  });

  it("is excluded from the daily summary's volume", async () => {
    const out = await callTool(app, user, "get_daily_summary", { date: tomorrow });
    const d = out.data as { training: { total_volume: number; workout_count: number }; planned: { workout_count: number } | null };
    expect(d.training.total_volume).toBe(0);
    expect(d.training.workout_count).toBe(0);
    // ...but it is surfaced, so "what's on for tomorrow" still has an answer.
    expect(d.planned?.workout_count).toBe(1);
  });

  it("is excluded from get_day's training block but listed separately", async () => {
    const out = await callTool(app, user, "get_day", { date: tomorrow });
    const d = out.data as { training: { workout_count: number; total_volume: number }; planned: { title: string }[] | null };
    expect(d.training.workout_count).toBe(0);
    expect(d.training.total_volume).toBe(0);
    expect(d.planned?.[0].title).toBe("Leg day");
  });

  it("reports zero volume in list_workouts, under a separate key", async () => {
    const out = await callTool(app, user, "list_workouts", { date: tomorrow, status: "planned" });
    const w = (out.data as { workouts: { status: string; total_volume: number; planned_volume: number }[] }).workouts[0];
    expect(w.status).toBe("planned");
    expect(w.total_volume).toBe(0);
    expect(w.planned_volume).toBe(1000);
  });

  it("counts today's real session normally", async () => {
    const out = await callTool(app, user, "get_daily_summary", { date: today });
    expect((out.data as { training: { total_volume: number } }).training.total_volume).toBe(500);
  });
});

describe("reading what is coming", () => {
  it("upcoming:true returns plans from today forward, soonest first", async () => {
    const out = await callTool(app, user, "list_workouts", { upcoming: true });
    const w = (out.data as { workouts: { date: string; title: string; status: string }[] }).workouts;
    expect(w.length).toBeGreaterThanOrEqual(2);
    expect(w.every((x) => x.status === "planned")).toBe(true);
    // Soonest first: a plan list sorted newest-first would put next month above tomorrow.
    const dates = w.map((x) => x.date);
    expect([...dates].sort()).toEqual(dates);
    expect(dates[0]).toBe(tomorrow);
  });

  it("does not need the caller to compute today's date", async () => {
    // The point of the shorthand: a model asking "what am I training this week" would otherwise
    // have to know today in the user's timezone, which is exactly what it gets wrong.
    const out = await callTool(app, user, "list_workouts", { upcoming: true });
    expect(out.isError).toBe(false);
  });

  it("history stays newest-first and excludes plans by default status filter", async () => {
    const out = await callTool(app, user, "list_workouts", { status: "completed", days: 30 });
    const w = (out.data as { workouts: { date: string; status: string }[] }).workouts;
    expect(w.every((x) => x.status === "completed")).toBe(true);
    const dates = w.map((x) => x.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

describe("marking a plan done", () => {
  it("moves it into the aggregates", async () => {
    const doer = await signUp(app, "doer@example.com");
    const planned = await callTool(app, doer, "log_workout", {
      title: "Tomorrow's squats", date: addDays(today, 1),
      sets: [{ exercise_name: "Back Squat", reps: 5, weight: 140 }],
    });
    const id = (planned.data as { workout: { id: string } }).workout.id;

    // The window has to span the plan's own date. History windows look backward from today by
    // default, and marking a future-dated plan done does not move its date — deliberately: the
    // user said "I did that session", not "pretend it was today".
    const window = { from: addDays(today, -30), to: addDays(today, 30) };

    // Before: invisible to history even inside that window, because it is still a plan.
    const before = await callTool(app, doer, "get_exercise_history", { exercise: "squat", ...window });
    expect((before.data as { total_sets: number }).total_sets).toBe(0);

    const done = await callTool(app, doer, "mark_workout_done", { id });
    expect(done.isError).toBe(false);
    expect((done.data as { status: string; total_volume: number }).status).toBe("completed");
    expect((done.data as { total_volume: number }).total_volume).toBe(700);

    // After: counted. This is the assertion that proves both status copies moved together —
    // history reads workout_sets.status, the update wrote workouts.status too.
    const after = await callTool(app, doer, "get_exercise_history", { exercise: "squat", ...window });
    expect((after.data as { total_sets: number }).total_sets).toBe(1);
    expect((after.data as { best_in_window: { weight: number } }).best_in_window.weight).toBe(140);
  });

  it("is idempotent and says so rather than pretending it did something", async () => {
    const u = await signUp(app, "idem@example.com");
    const made = await callTool(app, u, "log_workout", { date: addDays(today, 1), sets: [{ exercise_name: "Bench", reps: 5, weight: 80 }] });
    const id = (made.data as { workout: { id: string } }).workout.id;
    await callTool(app, u, "mark_workout_done", { id });
    const again = await callTool(app, u, "mark_workout_done", { id });
    expect(again.isError).toBe(false);
    expect((again.data as { already_done: boolean }).already_done).toBe(true);
  });

  it("cannot mark someone else's workout done", async () => {
    const attacker = await signUp(app, "attacker@example.com");
    const victim = await signUp(app, "victim@example.com");
    const made = await callTool(app, victim, "log_workout", { date: addDays(today, 1), sets: [{ exercise_name: "Bench", reps: 5, weight: 80 }] });
    const id = (made.data as { workout: { id: string } }).workout.id;

    const out = await callTool(app, attacker, "mark_workout_done", { id });
    expect(out.isError).toBe(true);

    const still = await callTool(app, victim, "list_workouts", { upcoming: true });
    expect((still.data as { workouts: { status: string }[] }).workouts[0].status).toBe("planned");
  });

  it("asks for an id rather than guessing which session was meant", async () => {
    const out = await callTool(app, user, "mark_workout_done", {});
    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/id/i);
  });
});
