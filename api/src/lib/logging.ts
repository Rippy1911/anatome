// Personal logging: meals, water, workouts, body weight, goals.
//
// Deliberately dumb. Anatome stores and aggregates; it never calls a model. When a user says
// "I had oatmeal with berries", the *assistant* turns that into {name, calories, protein, carbs,
// fats} and sends structured JSON. That keeps this tier free, fast and dependency-free, and it
// leaves AI parsing as a real difference rather than a marketing one.
//
// There is no food database, no barcode lookup, no recipes, no meal plans, no coaches and no
// programming. Those exist in the hosted platform. Adding them here would make this a worse
// version of that instead of a good version of this.
//
// Every function takes an explicit userId and every query filters on it. There is no code path
// that reads another user's rows, because there is no feature that would want one.

import { newId, nowIso, type UserRow } from "./db.ts";
import { localDate, parseDateOnly, recentLocalDates } from "./tz.ts";
import {
  strictArray, strictBody,
  MEAL_FIELDS, MEAL_ALIASES,
  WATER_FIELDS, WATER_ALIASES,
  WORKOUT_FIELDS, WORKOUT_ALIASES,
  SET_FIELDS, SET_ALIASES,
  BODY_METRIC_FIELDS, BODY_METRIC_ALIASES,
  GOAL_FIELDS, GOAL_ALIASES,
} from "./validate.ts";
import { resolveExercise } from "./exercises.ts";

export interface LogResult {
  ok: boolean;
  status: number;
  /** Payload returned to REST callers and embedded in MCP structuredContent. */
  data?: Record<string, unknown>;
  error?: string;
  message?: string;
  field?: string;
}

function bad(message: string, field?: string, error = "unknown_field"): LogResult {
  return { ok: false, status: 400, error, message, field };
}

function ok(data: Record<string, unknown>, status = 200): LogResult {
  return { ok: true, status, data };
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** A caller-supplied date if valid, else today in the user's own timezone. */
function resolveDate(raw: unknown, user: UserRow): string | null {
  if (raw === undefined || raw === null || raw === "") return localDate(user.timezone);
  return parseDateOnly(raw);
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);

export async function logMeal(db: D1Database, user: UserRow, raw: unknown): Promise<LogResult> {
  const parsed = strictBody<Record<string, unknown>>(raw, MEAL_FIELDS, MEAL_ALIASES, "meal");
  if (!parsed.ok) return bad(parsed.message!, parsed.field);
  const body = parsed.value!;

  const name = String(body.name ?? "").trim();
  if (!name) return bad("A meal needs a name — what did you eat?", "name", "missing_field");

  const date = resolveDate(body.date, user);
  if (!date) return bad(`Invalid date "${String(body.date)}". Use YYYY-MM-DD.`, "date", "invalid_value");

  const mealType = body.meal_type === undefined || body.meal_type === null
    ? null
    : String(body.meal_type).toLowerCase();
  if (mealType && !MEAL_TYPES.has(mealType)) {
    return bad(`Unknown meal_type "${mealType}". Accepted: ${[...MEAL_TYPES].join(", ")}.`, "meal_type", "invalid_value");
  }

  const row = {
    id: newId("meal"),
    date,
    meal_type: mealType,
    name: name.slice(0, 200),
    calories: num(body.calories),
    protein: num(body.protein),
    carbs: num(body.carbs),
    fats: num(body.fats),
    notes: String(body.notes ?? "").slice(0, 1000),
  };

  await db.prepare(
    `INSERT INTO meals (id, user_id, date, meal_type, name, calories, protein, carbs, fats, notes, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    row.id, user.id, row.date, row.meal_type, row.name,
    row.calories, row.protein, row.carbs, row.fats, row.notes, nowIso(),
  ).run();

  return ok({ meal: row, logged_for_date: date, timezone: user.timezone }, 201);
}

export async function listMeals(db: D1Database, user: UserRow, args: Record<string, unknown>): Promise<LogResult> {
  const date = resolveDate(args.date, user);
  if (!date) return bad(`Invalid date "${String(args.date)}". Use YYYY-MM-DD.`, "date", "invalid_value");
  const { results } = await db.prepare(
    "SELECT id, date, meal_type, name, calories, protein, carbs, fats, notes FROM meals WHERE user_id = ? AND date = ? ORDER BY logged_at",
  ).bind(user.id, date).all();
  return ok({ date, timezone: user.timezone, count: results.length, meals: results });
}

export async function deleteMeal(db: D1Database, user: UserRow, id: unknown): Promise<LogResult> {
  const mealId = String(id ?? "");
  if (!mealId) return bad("Provide the meal id to delete.", "id", "missing_field");
  const res = await db.prepare("DELETE FROM meals WHERE id = ? AND user_id = ?").bind(mealId, user.id).run();
  // The user_id filter means a wrong id and someone else's id are indistinguishable, which is
  // exactly right: this must never confirm that another user's row exists.
  if (!res.meta.changes) return { ok: false, status: 404, error: "not_found", message: `No meal ${mealId} in your log.` };
  return ok({ deleted: true, id: mealId });
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

export async function logWater(db: D1Database, user: UserRow, raw: unknown): Promise<LogResult> {
  const parsed = strictBody<Record<string, unknown>>(raw, WATER_FIELDS, WATER_ALIASES, "water");
  if (!parsed.ok) return bad(parsed.message!, parsed.field);
  const body = parsed.value!;

  const amount = num(body.amount_ml, NaN);
  if (!Number.isFinite(amount) || amount <= 0) {
    return bad("amount_ml must be a positive number of millilitres.", "amount_ml", "invalid_value");
  }
  const date = resolveDate(body.date, user);
  if (!date) return bad(`Invalid date "${String(body.date)}". Use YYYY-MM-DD.`, "date", "invalid_value");

  const id = newId("water");
  await db.prepare("INSERT INTO water_logs (id, user_id, date, amount_ml, logged_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, user.id, date, amount, nowIso()).run();

  const total = await db.prepare("SELECT COALESCE(SUM(amount_ml), 0) AS total FROM water_logs WHERE user_id = ? AND date = ?")
    .bind(user.id, date).first<{ total: number }>();
  return ok({ id, date, amount_ml: amount, total_ml_today: total?.total ?? amount }, 201);
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export async function logWorkout(db: D1Database, user: UserRow, raw: unknown): Promise<LogResult> {
  const parsed = strictBody<Record<string, unknown>>(raw, WORKOUT_FIELDS, WORKOUT_ALIASES, "workout");
  if (!parsed.ok) return bad(parsed.message!, parsed.field);
  const body = parsed.value!;

  const sets = strictArray<Record<string, unknown>>(body.sets, SET_FIELDS, SET_ALIASES, "sets");
  if (!sets.ok) return bad(sets.message!, sets.field);

  const date = resolveDate(body.date, user);
  if (!date) return bad(`Invalid date "${String(body.date)}". Use YYYY-MM-DD.`, "date", "invalid_value");

  const workoutId = newId("wk");
  const statements: D1PreparedStatement[] = [
    db.prepare(
      "INSERT INTO workouts (id, user_id, date, title, notes, duration_minutes, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      workoutId, user.id, date,
      String(body.title ?? "").slice(0, 200),
      String(body.notes ?? "").slice(0, 2000),
      body.duration_minutes === undefined ? null : Math.round(num(body.duration_minutes)),
      nowIso(),
    ),
  ];

  const stored: Record<string, unknown>[] = [];
  let volume = 0;
  sets.value!.forEach((s, i) => {
    const exerciseName = String(s.exercise_name ?? "").trim();
    if (!exerciseName) return;
    // Best-effort link to the bundled catalog, so a later reader can pull up the movement.
    // A miss is fine and stays null; it must never block the write.
    let extId: string | null = null;
    try {
      const resolved = resolveExercise(exerciseName, "") as { ext_id?: string } | null;
      extId = resolved?.ext_id ?? null;
    } catch { extId = null; }

    const reps = s.reps === undefined ? null : Math.round(num(s.reps));
    const weight = s.weight === undefined ? null : num(s.weight);
    if (reps && weight) volume += reps * weight;

    const row = {
      id: newId("set"),
      exercise_name: exerciseName.slice(0, 200),
      anatome_exercise_id: extId,
      set_number: s.set_number === undefined ? i + 1 : Math.round(num(s.set_number, i + 1)),
      reps,
      weight,
      rpe: s.rpe === undefined ? null : num(s.rpe),
      notes: String(s.notes ?? "").slice(0, 500),
    };
    stored.push(row);
    statements.push(db.prepare(
      `INSERT INTO workout_sets (id, workout_id, user_id, exercise_name, anatome_exercise_id, set_number, reps, weight, rpe, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      row.id, workoutId, user.id, row.exercise_name, row.anatome_exercise_id,
      row.set_number, row.reps, row.weight, row.rpe, row.notes,
    ));
  });

  await db.batch(statements);

  return ok({
    workout: {
      id: workoutId,
      date,
      title: String(body.title ?? ""),
      duration_minutes: body.duration_minutes === undefined ? null : Math.round(num(body.duration_minutes)),
      set_count: stored.length,
      total_volume: volume,
      sets: stored,
    },
    logged_for_date: date,
    timezone: user.timezone,
  }, 201);
}

export async function listWorkouts(db: D1Database, user: UserRow, args: Record<string, unknown>): Promise<LogResult> {
  const limit = Math.min(Math.max(1, Math.round(num(args.limit, 10))), 50);
  const { results } = await db.prepare(
    "SELECT id, date, title, notes, duration_minutes FROM workouts WHERE user_id = ? ORDER BY date DESC, logged_at DESC LIMIT ?",
  ).bind(user.id, limit).all<{ id: string }>();

  const workouts = [];
  for (const w of results) {
    const sets = await db.prepare(
      "SELECT exercise_name, set_number, reps, weight, rpe FROM workout_sets WHERE workout_id = ? AND user_id = ? ORDER BY set_number",
    ).bind(w.id, user.id).all<{ reps: number | null; weight: number | null }>();
    const volume = sets.results.reduce((t, s) => t + (s.reps || 0) * (s.weight || 0), 0);
    workouts.push({ ...w, total_volume: volume, sets: sets.results });
  }
  return ok({ count: workouts.length, timezone: user.timezone, workouts });
}

export async function deleteWorkout(db: D1Database, user: UserRow, id: unknown): Promise<LogResult> {
  const workoutId = String(id ?? "");
  if (!workoutId) return bad("Provide the workout id to delete.", "id", "missing_field");
  const res = await db.prepare("DELETE FROM workouts WHERE id = ? AND user_id = ?").bind(workoutId, user.id).run();
  if (!res.meta.changes) return { ok: false, status: 404, error: "not_found", message: `No workout ${workoutId} in your log.` };
  await db.prepare("DELETE FROM workout_sets WHERE workout_id = ? AND user_id = ?").bind(workoutId, user.id).run();
  return ok({ deleted: true, id: workoutId });
}

// ---------------------------------------------------------------------------
// Body metrics
// ---------------------------------------------------------------------------

export async function logBodyMetric(db: D1Database, user: UserRow, raw: unknown): Promise<LogResult> {
  const parsed = strictBody<Record<string, unknown>>(raw, BODY_METRIC_FIELDS, BODY_METRIC_ALIASES, "measurement");
  if (!parsed.ok) return bad(parsed.message!, parsed.field);
  const body = parsed.value!;

  const value = num(body.value, NaN);
  if (!Number.isFinite(value)) return bad("value must be a number.", "value", "invalid_value");
  const metricType = String(body.metric_type ?? "weight").toLowerCase();
  const unit = String(body.unit ?? (metricType === "weight" ? "kg" : "")).toLowerCase();
  if (metricType === "weight" && unit !== "kg" && unit !== "lb") {
    return bad('For metric_type "weight", unit must be "kg" or "lb".', "unit", "invalid_value");
  }
  const date = resolveDate(body.date, user);
  if (!date) return bad(`Invalid date "${String(body.date)}". Use YYYY-MM-DD.`, "date", "invalid_value");

  const id = newId("bm");
  await db.prepare(
    "INSERT INTO body_metrics (id, user_id, metric_type, value, unit, date, notes, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, user.id, metricType, value, unit, date, String(body.notes ?? "").slice(0, 500), nowIso()).run();

  return ok({ id, metric_type: metricType, value, unit, date }, 201);
}

export async function weightTrend(db: D1Database, user: UserRow, args: Record<string, unknown>): Promise<LogResult> {
  const days = Math.min(Math.max(1, Math.round(num(args.days, 30))), 365);
  const window = recentLocalDates(user.timezone, days);
  const from = window[0];
  const { results } = await db.prepare(
    "SELECT date, value, unit FROM body_metrics WHERE user_id = ? AND metric_type = 'weight' AND date >= ? ORDER BY date",
  ).bind(user.id, from).all<{ date: string; value: number; unit: string }>();

  if (!results.length) {
    return ok({ days, from, to: window[window.length - 1], count: 0, entries: [], change: null, note: "No weight entries in this window." });
  }
  const first = results[0];
  const last = results[results.length - 1];
  // Compare like with like, or say nothing. Silently mixing kg and lb into a "change" would be
  // an invented number, and an invented number is worse than a missing one.
  const comparable = first.unit === last.unit;
  return ok({
    days, from, to: window[window.length - 1],
    count: results.length,
    entries: results,
    latest: { date: last.date, value: last.value, unit: last.unit },
    change: comparable ? { value: Number((last.value - first.value).toFixed(2)), unit: last.unit, from_date: first.date, to_date: last.date } : null,
    note: comparable ? undefined : "First and last entries use different units, so no change is reported.",
  });
}

// ---------------------------------------------------------------------------
// Goals + the daily summary
// ---------------------------------------------------------------------------

export async function setGoals(db: D1Database, user: UserRow, raw: unknown): Promise<LogResult> {
  const parsed = strictBody<Record<string, unknown>>(raw, GOAL_FIELDS, GOAL_ALIASES, "goals");
  if (!parsed.ok) return bad(parsed.message!, parsed.field);
  const body = parsed.value!;
  if (!Object.keys(body).length) return bad(`Provide at least one of: ${GOAL_FIELDS.join(", ")}.`, undefined, "missing_field");

  const existing = await db.prepare("SELECT * FROM goals WHERE user_id = ?").bind(user.id).first<Record<string, number | null>>();
  const merged = {
    calories: body.calories !== undefined ? num(body.calories) : existing?.calories ?? null,
    protein: body.protein !== undefined ? num(body.protein) : existing?.protein ?? null,
    carbs: body.carbs !== undefined ? num(body.carbs) : existing?.carbs ?? null,
    fats: body.fats !== undefined ? num(body.fats) : existing?.fats ?? null,
    water_ml: body.water_ml !== undefined ? num(body.water_ml) : existing?.water_ml ?? null,
  };

  await db.prepare(
    `INSERT INTO goals (user_id, calories, protein, carbs, fats, water_ml, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       calories=excluded.calories, protein=excluded.protein, carbs=excluded.carbs,
       fats=excluded.fats, water_ml=excluded.water_ml, updated_at=excluded.updated_at`,
  ).bind(user.id, merged.calories, merged.protein, merged.carbs, merged.fats, merged.water_ml, nowIso()).run();

  return ok({ goals: merged });
}

export async function dailySummary(db: D1Database, user: UserRow, args: Record<string, unknown>): Promise<LogResult> {
  const date = resolveDate(args.date, user);
  if (!date) return bad(`Invalid date "${String(args.date)}". Use YYYY-MM-DD.`, "date", "invalid_value");

  const totals = await db.prepare(
    `SELECT COALESCE(SUM(calories),0) AS calories, COALESCE(SUM(protein),0) AS protein,
            COALESCE(SUM(carbs),0) AS carbs, COALESCE(SUM(fats),0) AS fats, COUNT(*) AS meal_count
     FROM meals WHERE user_id = ? AND date = ?`,
  ).bind(user.id, date).first<Record<string, number>>();

  const water = await db.prepare("SELECT COALESCE(SUM(amount_ml),0) AS total FROM water_logs WHERE user_id = ? AND date = ?")
    .bind(user.id, date).first<{ total: number }>();

  const workoutRows = await db.prepare("SELECT id, title, duration_minutes FROM workouts WHERE user_id = ? AND date = ?")
    .bind(user.id, date).all<{ id: string; title: string; duration_minutes: number | null }>();

  let sets = 0;
  let volume = 0;
  for (const w of workoutRows.results) {
    const s = await db.prepare("SELECT reps, weight FROM workout_sets WHERE workout_id = ? AND user_id = ?")
      .bind(w.id, user.id).all<{ reps: number | null; weight: number | null }>();
    sets += s.results.length;
    volume += s.results.reduce((t, r) => t + (r.reps || 0) * (r.weight || 0), 0);
  }

  const goals = await db.prepare("SELECT calories, protein, carbs, fats, water_ml FROM goals WHERE user_id = ?")
    .bind(user.id).first<Record<string, number | null>>();

  const remaining = goals
    ? {
      calories: goals.calories == null ? null : Number((goals.calories - (totals?.calories ?? 0)).toFixed(1)),
      protein: goals.protein == null ? null : Number((goals.protein - (totals?.protein ?? 0)).toFixed(1)),
      carbs: goals.carbs == null ? null : Number((goals.carbs - (totals?.carbs ?? 0)).toFixed(1)),
      fats: goals.fats == null ? null : Number((goals.fats - (totals?.fats ?? 0)).toFixed(1)),
      water_ml: goals.water_ml == null ? null : Number((goals.water_ml - (water?.total ?? 0)).toFixed(0)),
    }
    : null;

  return ok({
    date,
    timezone: user.timezone,
    nutrition: {
      calories: totals?.calories ?? 0,
      protein: totals?.protein ?? 0,
      carbs: totals?.carbs ?? 0,
      fats: totals?.fats ?? 0,
      meal_count: totals?.meal_count ?? 0,
    },
    water_ml: water?.total ?? 0,
    training: {
      workout_count: workoutRows.results.length,
      set_count: sets,
      total_volume: volume,
      workouts: workoutRows.results,
    },
    goals: goals ?? null,
    remaining,
  });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Everything the account owns, in one object. The same shape backs the CSV download. */
export async function exportEverything(db: D1Database, user: UserRow): Promise<Record<string, unknown>> {
  const [meals, water, workouts, sets, metrics, goals] = await Promise.all([
    db.prepare("SELECT * FROM meals WHERE user_id = ? ORDER BY date, logged_at").bind(user.id).all(),
    db.prepare("SELECT * FROM water_logs WHERE user_id = ? ORDER BY date, logged_at").bind(user.id).all(),
    db.prepare("SELECT * FROM workouts WHERE user_id = ? ORDER BY date, logged_at").bind(user.id).all(),
    db.prepare("SELECT * FROM workout_sets WHERE user_id = ? ORDER BY workout_id, set_number").bind(user.id).all(),
    db.prepare("SELECT * FROM body_metrics WHERE user_id = ? ORDER BY date").bind(user.id).all(),
    db.prepare("SELECT * FROM goals WHERE user_id = ?").bind(user.id).first(),
  ]);

  return {
    exported_at: nowIso(),
    account: { email: user.email, timezone: user.timezone, created_at: user.created_at },
    goals: goals ?? null,
    meals: meals.results,
    water_logs: water.results,
    workouts: workouts.results,
    workout_sets: sets.results,
    body_metrics: metrics.results,
  };
}

/** Minimal RFC 4180 CSV. Quotes everything, so a comma or newline in a note cannot shift columns. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.map(cell).join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\n");
}
