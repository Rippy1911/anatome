// Shared shapes for reading the log back: date windows, paging, and set grouping.
//
// These exist because every "show me my …" tool wants the same three things — a date range, a
// page, and sets attached to their workouts — and writing that three times is how the three
// copies drift.

import { localDate, parseDateOnly, recentLocalDates } from "./tz.ts";
import type { UserRow } from "./db.ts";

export const MAX_PAGE = 200;
export const DEFAULT_PAGE = 25;

export interface Page {
  limit: number;
  offset: number;
}

export function parsePage(args: Record<string, unknown>, fallback = DEFAULT_PAGE): Page {
  const rawLimit = Number(args.limit);
  const rawOffset = Number(args.offset);
  return {
    limit: Number.isFinite(rawLimit) ? Math.min(Math.max(1, Math.round(rawLimit)), MAX_PAGE) : fallback,
    offset: Number.isFinite(rawOffset) ? Math.max(0, Math.round(rawOffset)) : 0,
  };
}

export interface DateWindow {
  from: string;
  to: string;
  /** True when the caller named a window rather than getting the default. */
  explicit: boolean;
}

export interface WindowError {
  error: string;
  field: string;
}

/**
 * Resolve `date` / `from` / `to` / `days` into an inclusive [from, to] window.
 *
 * `date` is a shorthand for a one-day window, because "what did I eat today" is the common case
 * and making callers pass the same value twice is a bad tool. Everything is resolved in the
 * user's timezone; see tz.ts for why that matters.
 */
export function parseWindow(
  args: Record<string, unknown>,
  user: UserRow,
  defaultDays = 30,
): DateWindow | WindowError {
  const single = args.date;
  if (single !== undefined && single !== null && single !== "") {
    const d = parseDateOnly(single);
    if (!d) return { error: `Invalid date "${String(single)}". Use YYYY-MM-DD.`, field: "date" };
    return { from: d, to: d, explicit: true };
  }

  const rawFrom = args.from;
  const rawTo = args.to;
  const explicit = (rawFrom ?? rawTo ?? args.days) !== undefined;

  let to = localDate(user.timezone);
  if (rawTo !== undefined && rawTo !== null && rawTo !== "") {
    const parsed = parseDateOnly(rawTo);
    if (!parsed) return { error: `Invalid to date "${String(rawTo)}". Use YYYY-MM-DD.`, field: "to" };
    to = parsed;
  }

  let from: string;
  if (rawFrom !== undefined && rawFrom !== null && rawFrom !== "") {
    const parsed = parseDateOnly(rawFrom);
    if (!parsed) return { error: `Invalid from date "${String(rawFrom)}". Use YYYY-MM-DD.`, field: "from" };
    from = parsed;
  } else {
    const days = Number.isFinite(Number(args.days))
      ? Math.min(Math.max(1, Math.round(Number(args.days))), 730)
      : defaultDays;
    const window = recentLocalDates(user.timezone, days);
    from = window[0];
  }

  // Swap rather than reject: a caller who says "from March to January" meant that range, and
  // failing them over argument order teaches nothing.
  if (from > to) [from, to] = [to, from];
  return { from, to, explicit };
}

export function isWindowError(w: DateWindow | WindowError): w is WindowError {
  return (w as WindowError).error !== undefined;
}

/** Lower-cased, trimmed. The stored `*_key` columns hold exactly this. */
export function normaliseKey(name: unknown): string {
  return String(name ?? "").trim().toLowerCase();
}

/** A LIKE pattern that matches anywhere, with the wildcards the user typed neutralised. */
export function containsPattern(term: unknown): string {
  const t = String(term ?? "").trim().replace(/[%_\\]/g, (c) => `\\${c}`);
  return `%${t}%`;
}

export interface SetRow {
  id: string;
  workout_id: string;
  exercise_name: string;
  anatome_exercise_id: string | null;
  set_number: number;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  notes: string;
}

/** Volume in kg·reps. Sets missing either number contribute nothing rather than guessing. */
export function volumeOf(sets: { reps: number | null; weight: number | null }[]): number {
  return sets.reduce((total, s) => total + (s.reps || 0) * (s.weight || 0), 0);
}

/**
 * Epley one-rep-max estimate. Returns null above 12 reps, where the formula stops being
 * meaningful and starts being a number people quote at each other.
 */
export function estimate1rm(reps: number | null, weight: number | null): number | null {
  if (!reps || !weight || reps < 1 || reps > 12) return null;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/**
 * Fetch the sets for many workouts in ONE query and group them.
 *
 * The previous version issued a query per workout, so listing 25 workouts was 26 round trips to
 * D1. That is the single biggest cost in reading the log back, and it grew with the answer size.
 */
export async function setsForWorkouts(
  db: D1Database,
  userId: string,
  workoutIds: string[],
): Promise<Map<string, SetRow[]>> {
  const grouped = new Map<string, SetRow[]>();
  if (!workoutIds.length) return grouped;

  const placeholders = workoutIds.map(() => "?").join(",");
  const { results } = await db.prepare(
    `SELECT id, workout_id, exercise_name, anatome_exercise_id, set_number, reps, weight, rpe, notes
       FROM workout_sets
      WHERE user_id = ? AND workout_id IN (${placeholders})
      ORDER BY workout_id, set_number`,
  ).bind(userId, ...workoutIds).all<SetRow>();

  for (const row of results) {
    const list = grouped.get(row.workout_id);
    if (list) list.push(row); else grouped.set(row.workout_id, [row]);
  }
  return grouped;
}
