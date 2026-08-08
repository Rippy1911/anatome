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
  addDays, containsPattern, estimate1rm, isWindowError, normaliseKey, parsePage, parseWindow,
  setsForWorkouts, volumeOf,
} from "./query.helpers.ts";
import {
  strictArray, strictBody,
  MEAL_FIELDS, MEAL_ALIASES,
  WATER_FIELDS, WATER_ALIASES,
  WORKOUT_FIELDS, WORKOUT_ALIASES,
  SET_FIELDS, SET_ALIASES,
  BODY_METRIC_FIELDS, BODY_METRIC_ALIASES,
  GOAL_FIELDS, GOAL_ALIASES,
  SUPPLEMENT_FIELDS, SUPPLEMENT_ALIASES,
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

/**
 * Meals over a window, optionally filtered by name or meal type.
 *
 * Defaults to today, because "what have I eaten" is the question; a window and a search term are
 * there for "how often do I actually eat oats" and "what did I do differently in March".
 */
export async function listMeals(db: D1Database, user: UserRow, args: Record<string, unknown>): Promise<LogResult> {
  const window = parseWindow(args, user, 1);
  if (isWindowError(window)) return bad(window.error, window.field, "invalid_value");
  const page = parsePage(args);

  const where = ["user_id = ?", "date BETWEEN ? AND ?"];
  const params: unknown[] = [user.id, window.from, window.to];

  if (args.q !== undefined && String(args.q).trim()) {
    where.push("(name LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')");
    const pattern = containsPattern(args.q);
    params.push(pattern, pattern);
  }
  if (args.meal_type !== undefined && String(args.meal_type).trim()) {
    where.push("meal_type = ?");
    params.push(String(args.meal_type).toLowerCase());
  }

  const clause = where.join(" AND ");
  // Count and page in one round trip each. The total is what lets a caller say "showing 25 of
  // 340" instead of guessing whether there is more.
  const totals = await db.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(calories),0) AS calories, COALESCE(SUM(protein),0) AS protein,
            COALESCE(SUM(carbs),0) AS carbs, COALESCE(SUM(fats),0) AS fats
       FROM meals WHERE ${clause}`,
  ).bind(...params).first<{ n: number; calories: number; protein: number; carbs: number; fats: number }>();

  const { results } = await db.prepare(
    `SELECT id, date, meal_type, name, calories, protein, carbs, fats, notes, logged_at
       FROM meals WHERE ${clause}
      ORDER BY date DESC, logged_at DESC LIMIT ? OFFSET ?`,
  ).bind(...params, page.limit, page.offset).all();

  return ok({
    from: window.from,
    to: window.to,
    timezone: user.timezone,
    total_matched: totals?.n ?? 0,
    returned: results.length,
    limit: page.limit,
    offset: page.offset,
    has_more: page.offset + results.length < (totals?.n ?? 0),
    totals: {
      calories: totals?.calories ?? 0,
      protein: totals?.protein ?? 0,
      carbs: totals?.carbs ?? 0,
      fats: totals?.fats ?? 0,
    },
    meals: results,
  });
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

  // A session dated in the future is a plan unless the caller says otherwise. Inferring it is
  // right far more often than not — nobody logs Thursday's bench on Tuesday as done — and the
  // response says which way it went so the assistant can tell the user rather than surprise them.
  const today = localDate(user.timezone);
  const requested = body.status === undefined ? null : String(body.status).toLowerCase();
  if (requested && requested !== "planned" && requested !== "completed") {
    return bad(`Unknown status "${requested}". Use "planned" or "completed".`, "status", "invalid_value");
  }
  const status = requested ?? (date > today ? "planned" : "completed");

  const workoutId = newId("wk");
  const statements: D1PreparedStatement[] = [
    db.prepare(
      "INSERT INTO workouts (id, user_id, date, title, notes, duration_minutes, status, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      workoutId, user.id, date,
      String(body.title ?? "").slice(0, 200),
      String(body.notes ?? "").slice(0, 2000),
      body.duration_minutes === undefined ? null : Math.round(num(body.duration_minutes)),
      status,
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
      // Lower-cased twin of the name, and the workout's date copied down. Both exist so
      // "every bench press since March" is one indexed range scan rather than a join plus a
      // case-insensitive comparison the index cannot help with. See migration 0002.
      exercise_key: exerciseName.slice(0, 200).toLowerCase(),
      date,
      anatome_exercise_id: extId,
      set_number: s.set_number === undefined ? i + 1 : Math.round(num(s.set_number, i + 1)),
      reps,
      weight,
      rpe: s.rpe === undefined ? null : num(s.rpe),
      notes: String(s.notes ?? "").slice(0, 500),
    };
    stored.push(row);
    statements.push(db.prepare(
      `INSERT INTO workout_sets (id, workout_id, user_id, exercise_name, exercise_key, date, status, anatome_exercise_id, set_number, reps, weight, rpe, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      row.id, workoutId, user.id, row.exercise_name, row.exercise_key, row.date, status,
      row.anatome_exercise_id, row.set_number, row.reps, row.weight, row.rpe, row.notes,
    ));
  });

  await db.batch(statements);

  return ok({
    workout: {
      id: workoutId,
      date,
      status,
      title: String(body.title ?? ""),
      duration_minutes: body.duration_minutes === undefined ? null : Math.round(num(body.duration_minutes)),
      set_count: stored.length,
      // A plan has no volume yet — reporting one would be counting work nobody has done.
      total_volume: status === "completed" ? volume : 0,
      planned_volume: status === "planned" ? volume : undefined,
      sets: stored,
    },
    logged_for_date: date,
    timezone: user.timezone,
    note: status === "planned"
      ? `Saved as a PLAN for ${date}. It does not count toward training volume until you mark it done with mark_workout_done.`
      : undefined,
  }, 201);
}

/**
 * Workouts over a window, optionally only those containing a given exercise.
 *
 * Fixed cost regardless of how many workouts come back: one count, one page of workouts, one
 * query for all their sets. The previous version issued a query per workout, so asking for 25
 * workouts meant 26 round trips and the cost grew with the answer.
 */
export async function listWorkouts(db: D1Database, user: UserRow, args: Record<string, unknown>): Promise<LogResult> {
  // `upcoming` is a shorthand for the window nobody wants to compute by hand: today forward.
  // Without it a model has to know today's date in the user's timezone to ask "what's planned",
  // which is exactly the kind of arithmetic it gets wrong.
  const upcoming = args.upcoming === true;
  const today = localDate(user.timezone);
  const window = upcoming && args.from === undefined && args.to === undefined && args.date === undefined
    ? { from: today, to: addDays(today, 30), explicit: true }
    : parseWindow(args, user, 90);
  if (isWindowError(window)) return bad(window.error, window.field, "invalid_value");
  const page = parsePage(args, 10);

  const where = ["w.user_id = ?", "w.date BETWEEN ? AND ?"];
  const params: unknown[] = [user.id, window.from, window.to];

  const status = upcoming ? "planned" : String(args.status ?? "").toLowerCase();
  if (status && status !== "any") {
    if (status !== "planned" && status !== "completed") {
      return bad(`Unknown status "${status}". Use "planned", "completed" or "any".`, "status", "invalid_value");
    }
    where.push("w.status = ?");
    params.push(status);
  }

  const exercise = normaliseKey(args.exercise);
  if (exercise) {
    // Sub-select rather than a join: a workout with five matching sets must appear once, and
    // EXISTS says that directly instead of leaving DISTINCT to clean up after a join.
    where.push("EXISTS (SELECT 1 FROM workout_sets s WHERE s.workout_id = w.id AND s.exercise_key LIKE ? ESCAPE '\\')");
    params.push(containsPattern(exercise));
  }
  if (args.q !== undefined && String(args.q).trim()) {
    where.push("(w.title LIKE ? ESCAPE '\\' OR w.notes LIKE ? ESCAPE '\\')");
    const pattern = containsPattern(args.q);
    params.push(pattern, pattern);
  }

  const clause = where.join(" AND ");
  const total = await db.prepare(`SELECT COUNT(*) AS n FROM workouts w WHERE ${clause}`)
    .bind(...params).first<{ n: number }>();

  // Plans read forward (soonest first); history reads backward (most recent first). Sorting a
  // plan list newest-first would put next month above tomorrow.
  const order = upcoming || status === "planned" ? "ASC" : "DESC";
  const { results } = await db.prepare(
    `SELECT w.id, w.date, w.title, w.notes, w.duration_minutes, w.status, w.logged_at
       FROM workouts w WHERE ${clause}
      ORDER BY w.date ${order}, w.logged_at ${order} LIMIT ? OFFSET ?`,
  ).bind(...params, page.limit, page.offset).all<{ id: string; status: string }>();

  const sets = await setsForWorkouts(db, user.id, results.map((w) => w.id));
  const workouts = results.map((w) => {
    const rows = sets.get(w.id) ?? [];
    const volume = volumeOf(rows);
    return {
      ...w,
      set_count: rows.length,
      // A plan's volume is prospective. Naming it differently stops it being summed with real work.
      total_volume: w.status === "completed" ? volume : 0,
      planned_volume: w.status === "planned" ? volume : undefined,
      sets: rows,
    };
  });

  return ok({
    from: window.from,
    to: window.to,
    timezone: user.timezone,
    total_matched: total?.n ?? 0,
    returned: workouts.length,
    limit: page.limit,
    offset: page.offset,
    has_more: page.offset + workouts.length < (total?.n ?? 0),
    filtered_by_exercise: exercise || null,
    workouts,
  });
}

/**
 * One exercise across time: every set, grouped by session, with best set and estimated 1RM.
 *
 * This is the question the v1 API could not answer and the one a returning user or a coach
 * actually asks — "is my bench going anywhere?". It reads only workout_sets, on the
 * (user_id, exercise_key, date) index added in migration 0002.
 */
export async function exerciseHistory(db: D1Database, user: UserRow, args: Record<string, unknown>): Promise<LogResult> {
  const exercise = normaliseKey(args.exercise);
  if (!exercise) {
    return bad("Which exercise? Pass exercise, e.g. \"bench press\".", "exercise", "missing_field");
  }
  const window = parseWindow(args, user, 365);
  if (isWindowError(window)) return bad(window.error, window.field, "invalid_value");
  const page = parsePage(args, 50);

  // Prefix-and-contains match, so "bench" finds "Barbell Bench Press" — people do not remember
  // the exact string they typed three months ago.
  const { results } = await db.prepare(
    `SELECT id, workout_id, date, exercise_name, set_number, reps, weight, rpe, notes
       FROM workout_sets
      WHERE user_id = ? AND status = 'completed' AND exercise_key LIKE ? ESCAPE '\\' AND date BETWEEN ? AND ?
      ORDER BY date DESC, set_number ASC
      LIMIT ? OFFSET ?`,
  ).bind(user.id, containsPattern(exercise), window.from, window.to, page.limit, page.offset)
    .all<{ date: string; exercise_name: string; reps: number | null; weight: number | null; set_number: number; rpe: number | null }>();

  const total = await db.prepare(
    `SELECT COUNT(*) AS n, COUNT(DISTINCT date) AS sessions
       FROM workout_sets
      WHERE user_id = ? AND status = 'completed' AND exercise_key LIKE ? ESCAPE '\\' AND date BETWEEN ? AND ?`,
  ).bind(user.id, containsPattern(exercise), window.from, window.to)
    .first<{ n: number; sessions: number }>();

  // Group into sessions so a reader sees "3 Aug: 3×5 @100" rather than a flat list of sets.
  const byDate = new Map<string, typeof results>();
  for (const row of results) {
    const list = byDate.get(row.date);
    if (list) list.push(row); else byDate.set(row.date, [row]);
  }
  const sessions = [...byDate.entries()].map(([date, rows]) => {
    const best = rows.reduce<typeof rows[number] | null>((b, r) => {
      if (r.weight == null) return b;
      if (!b || b.weight == null || r.weight > b.weight) return r;
      return b;
    }, null);
    return {
      date,
      set_count: rows.length,
      total_volume: volumeOf(rows),
      best_set: best ? { reps: best.reps, weight: best.weight, estimated_1rm: estimate1rm(best.reps, best.weight) } : null,
      sets: rows.map((r) => ({ set_number: r.set_number, reps: r.reps, weight: r.weight, rpe: r.rpe })),
    };
  });

  const allTimeBest = sessions.reduce<{ date: string; weight: number; reps: number | null; estimated_1rm: number | null } | null>(
    (best, s) => {
      if (!s.best_set || s.best_set.weight == null) return best;
      if (!best || s.best_set.weight > best.weight) {
        return { date: s.date, weight: s.best_set.weight, reps: s.best_set.reps, estimated_1rm: s.best_set.estimated_1rm };
      }
      return best;
    }, null);

  return ok({
    exercise: String(args.exercise),
    matched_names: [...new Set(results.map((r) => r.exercise_name))],
    from: window.from,
    to: window.to,
    timezone: user.timezone,
    total_sets: total?.n ?? 0,
    total_sessions: total?.sessions ?? 0,
    returned_sets: results.length,
    limit: page.limit,
    offset: page.offset,
    has_more: page.offset + results.length < (total?.n ?? 0),
    // Heaviest set in the window, not an all-time PR — the window is the caller's, and calling
    // it "best" without saying over what would be the kind of number people screenshot.
    best_in_window: allTimeBest,
    sessions,
  });
}

/**
 * Turn a plan into a session that happened.
 *
 * Updates the status on BOTH tables in one batch. workout_sets carries its own copy so every
 * aggregate can filter without a join (see migration 0005) — which only stays true if this,
 * the single writer of status, keeps them in step.
 */
export async function markWorkoutDone(db: D1Database, user: UserRow, args: Record<string, unknown>): Promise<LogResult> {
  const id = String(args.id ?? "").trim();
  if (!id) return bad("Provide the workout id to mark done. Get it from list_workouts.", "id", "missing_field");

  const row = await db.prepare("SELECT id, status, date, title FROM workouts WHERE id = ? AND user_id = ?")
    .bind(id, user.id).first<{ id: string; status: string; date: string; title: string }>();
  if (!row) return { ok: false, status: 404, error: "not_found", message: `No workout ${id} in your log.` };
  if (row.status === "completed") {
    return ok({ id, status: "completed", already_done: true, note: "This session was already marked done; nothing changed." });
  }

  await db.batch([
    db.prepare("UPDATE workouts SET status = 'completed' WHERE id = ? AND user_id = ?").bind(id, user.id),
    db.prepare("UPDATE workout_sets SET status = 'completed' WHERE workout_id = ? AND user_id = ?").bind(id, user.id),
  ]);

  const totals = await db.prepare(
    "SELECT COUNT(*) AS n, COALESCE(SUM(COALESCE(reps,0)*COALESCE(weight,0)),0) AS volume FROM workout_sets WHERE workout_id = ? AND user_id = ?",
  ).bind(id, user.id).first<{ n: number; volume: number }>();

  return ok({
    id, status: "completed", date: row.date, title: row.title,
    set_count: totals?.n ?? 0,
    total_volume: totals?.volume ?? 0,
    note: "It now counts toward training volume and exercise history.",
  });
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
// Supplements
// ---------------------------------------------------------------------------

export async function logSupplement(db: D1Database, user: UserRow, raw: unknown): Promise<LogResult> {
  const parsed = strictBody<Record<string, unknown>>(raw, SUPPLEMENT_FIELDS, SUPPLEMENT_ALIASES, "supplement");
  if (!parsed.ok) return bad(parsed.message!, parsed.field);
  const body = parsed.value!;

  const name = String(body.name ?? "").trim();
  if (!name) return bad("A supplement needs a name, e.g. \"creatine\".", "name", "missing_field");
  const date = resolveDate(body.date, user);
  if (!date) return bad(`Invalid date "${String(body.date)}". Use YYYY-MM-DD.`, "date", "invalid_value");

  // Dose is optional on purpose: "took my magnesium" is a complete thought, and demanding a
  // number would make people either skip logging or invent one.
  //
  // `dose: "5 g"` is accepted and split into 5 + "g". A supplement dose is meaningless without its
  // unit — 4000 of vitamin D is not a quantity — so the natural way to say it puts both in one
  // string, and rejecting that taught the caller to retry with the dose dropped rather than with
  // the unit moved. Splitting is not the unit *conversion* this codebase refuses elsewhere:
  // nothing is rescaled and nothing is guessed, so no information changes on the way in.
  let doseInput = body.dose;
  let unitInput = body.unit;
  if (typeof doseInput === "string") {
    const combined = doseInput.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*([^\s0-9].*)?$/);
    if (combined) {
      doseInput = combined[1];
      if (combined[2] && (unitInput === undefined || unitInput === null || unitInput === "")) {
        unitInput = combined[2].trim();
      }
    }
  }

  const dose = doseInput === undefined || doseInput === null || doseInput === "" ? null : num(doseInput, NaN);
  if (dose !== null && !Number.isFinite(dose)) {
    return bad(
      `dose must be a number, with the unit in "unit" — e.g. {"dose": 5, "unit": "g"}. "${String(body.dose)}" is neither. Omit dose entirely if you do not know it.`,
      "dose",
      "invalid_value",
    );
  }

  const row = {
    id: newId("supp"),
    date,
    name: name.slice(0, 120),
    name_key: name.slice(0, 120).toLowerCase(),
    dose,
    unit: String(unitInput ?? "").toLowerCase().slice(0, 16),
    notes: String(body.notes ?? "").slice(0, 500),
  };

  await db.prepare(
    `INSERT INTO supplements (id, user_id, date, name, name_key, dose, unit, notes, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(row.id, user.id, row.date, row.name, row.name_key, row.dose, row.unit, row.notes, nowIso()).run();

  return ok({ supplement: row, logged_for_date: date, timezone: user.timezone }, 201);
}

export async function listSupplements(db: D1Database, user: UserRow, args: Record<string, unknown>): Promise<LogResult> {
  const window = parseWindow(args, user, 30);
  if (isWindowError(window)) return bad(window.error, window.field, "invalid_value");
  const page = parsePage(args);

  const where = ["user_id = ?", "date BETWEEN ? AND ?"];
  const params: unknown[] = [user.id, window.from, window.to];
  const name = normaliseKey(args.name);
  if (name) {
    where.push("name_key LIKE ? ESCAPE '\\'");
    params.push(containsPattern(name));
  }
  const clause = where.join(" AND ");

  const total = await db.prepare(`SELECT COUNT(*) AS n FROM supplements WHERE ${clause}`)
    .bind(...params).first<{ n: number }>();

  const { results } = await db.prepare(
    `SELECT id, date, name, dose, unit, notes, logged_at FROM supplements WHERE ${clause}
      ORDER BY date DESC, logged_at DESC LIMIT ? OFFSET ?`,
  ).bind(...params, page.limit, page.offset).all();

  // Adherence is the reason anyone reads this back — "did I actually take it" beats a list.
  const { results: byName } = await db.prepare(
    `SELECT name, COUNT(*) AS times, COUNT(DISTINCT date) AS days
       FROM supplements WHERE ${clause} GROUP BY name_key ORDER BY times DESC`,
  ).bind(...params).all();

  return ok({
    from: window.from,
    to: window.to,
    timezone: user.timezone,
    total_matched: total?.n ?? 0,
    returned: results.length,
    limit: page.limit,
    offset: page.offset,
    has_more: page.offset + results.length < (total?.n ?? 0),
    by_supplement: byName,
    supplements: results,
  });
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

  const workoutRows = await db.prepare("SELECT id, title, duration_minutes, status FROM workouts WHERE user_id = ? AND date = ? AND status = 'completed'")
    .bind(user.id, date).all<{ id: string; title: string; duration_minutes: number | null }>();
  const plannedRows = await db.prepare("SELECT id, title, duration_minutes FROM workouts WHERE user_id = ? AND date = ? AND status = 'planned'")
    .bind(user.id, date).all<{ id: string; title: string }>();

  // One aggregate over the day's sets, reading workout_sets.date directly (migration 0002).
  // This used to be a query per workout inside a loop.
  const setTotals = await db.prepare(
    `SELECT COUNT(*) AS set_count, COALESCE(SUM(COALESCE(reps,0) * COALESCE(weight,0)),0) AS volume
       FROM workout_sets WHERE user_id = ? AND date = ? AND status = 'completed'`,
  ).bind(user.id, date).first<{ set_count: number; volume: number }>();
  const sets = setTotals?.set_count ?? 0;
  const volume = setTotals?.volume ?? 0;

  const supplements = await db.prepare(
    "SELECT id, name, dose, unit FROM supplements WHERE user_id = ? AND date = ? ORDER BY logged_at",
  ).bind(user.id, date).all();

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
    planned: plannedRows.results.length ? { workout_count: plannedRows.results.length, workouts: plannedRows.results } : null,
    supplements: supplements.results,
    goals: goals ?? null,
    remaining,
  });
}

/**
 * One day, in full: the summary plus the actual entries.
 *
 * `get_daily_summary` answers "how am I doing" with totals; this answers "what did I do" with
 * the rows. Separating them would be the tidy choice and the wrong one — an assistant asked
 * "what did I eat and train yesterday" would otherwise make three calls and spend three of the
 * user's fifty daily requests to reassemble one day.
 */
export async function getDay(db: D1Database, user: UserRow, args: Record<string, unknown>): Promise<LogResult> {
  const date = resolveDate(args.date, user);
  if (!date) return bad(`Invalid date "${String(args.date)}". Use YYYY-MM-DD.`, "date", "invalid_value");

  const include = new Set(
    Array.isArray(args.include) && args.include.length
      ? (args.include as unknown[]).map((v) => String(v).toLowerCase())
      : ["nutrition", "training", "supplements", "body"],
  );

  const wants = (k: string) => include.has(k);

  const [meals, water, workouts, supplements, metrics, goals] = await Promise.all([
    wants("nutrition")
      ? db.prepare("SELECT id, meal_type, name, calories, protein, carbs, fats, notes FROM meals WHERE user_id = ? AND date = ? ORDER BY logged_at").bind(user.id, date).all()
      : Promise.resolve({ results: [] }),
    wants("nutrition")
      ? db.prepare("SELECT COALESCE(SUM(amount_ml),0) AS total FROM water_logs WHERE user_id = ? AND date = ?").bind(user.id, date).first<{ total: number }>()
      : Promise.resolve(null),
    wants("training")
      ? db.prepare("SELECT id, title, notes, duration_minutes, status FROM workouts WHERE user_id = ? AND date = ? ORDER BY logged_at").bind(user.id, date).all<{ id: string; status: string }>()
      : Promise.resolve({ results: [] as { id: string; status: string }[] }),
    wants("supplements")
      ? db.prepare("SELECT id, name, dose, unit, notes FROM supplements WHERE user_id = ? AND date = ? ORDER BY logged_at").bind(user.id, date).all()
      : Promise.resolve({ results: [] }),
    wants("body")
      ? db.prepare("SELECT id, metric_type, value, unit, notes FROM body_metrics WHERE user_id = ? AND date = ? ORDER BY logged_at").bind(user.id, date).all()
      : Promise.resolve({ results: [] }),
    db.prepare("SELECT calories, protein, carbs, fats, water_ml FROM goals WHERE user_id = ?").bind(user.id).first<Record<string, number | null>>(),
  ]);

  const workoutRows = (workouts as { results: { id: string; status: string }[] }).results;
  const setsByWorkout = wants("training")
    ? await setsForWorkouts(db, user.id, workoutRows.map((w) => w.id))
    : new Map();

  const mealRows = (meals as { results: Record<string, number>[] }).results;
  const nutrition = mealRows.reduce(
    (acc, m) => ({
      calories: acc.calories + (Number(m.calories) || 0),
      protein: acc.protein + (Number(m.protein) || 0),
      carbs: acc.carbs + (Number(m.carbs) || 0),
      fats: acc.fats + (Number(m.fats) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 },
  );

  const allWorkouts = workoutRows.map((w) => {
    const rows = setsByWorkout.get(w.id) ?? [];
    return { ...w, set_count: rows.length, total_volume: volumeOf(rows), sets: rows };
  });
  const training = allWorkouts.filter((w) => w.status !== "planned");
  const plannedToday = allWorkouts.filter((w) => w.status === "planned");

  return ok({
    date,
    timezone: user.timezone,
    included: [...include],
    nutrition: wants("nutrition")
      ? { ...nutrition, meal_count: mealRows.length, water_ml: (water as { total: number } | null)?.total ?? 0, meals: mealRows }
      : null,
    training: wants("training")
      ? {
        workout_count: training.length,
        set_count: training.reduce((t, w) => t + w.set_count, 0),
        total_volume: training.reduce((t, w) => t + w.total_volume, 0),
        workouts: training,
      }
      : null,
    planned: wants("training") && plannedToday.length ? plannedToday : null,
    supplements: wants("supplements") ? (supplements as { results: unknown[] }).results : null,
    body_metrics: wants("body") ? (metrics as { results: unknown[] }).results : null,
    goals: goals ?? null,
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
  const supplements = await db.prepare("SELECT * FROM supplements WHERE user_id = ? ORDER BY date, logged_at").bind(user.id).all();

  return {
    exported_at: nowIso(),
    account: { email: user.email, timezone: user.timezone, created_at: user.created_at },
    goals: goals ?? null,
    meals: meals.results,
    water_logs: water.results,
    workouts: workouts.results,
    workout_sets: sets.results,
    body_metrics: metrics.results,
    supplements: supplements.results,
  };
}

/** Minimal RFC 4180 CSV. Quotes everything, so a comma or newline in a note cannot shift columns. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.map(cell).join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\n");
}
