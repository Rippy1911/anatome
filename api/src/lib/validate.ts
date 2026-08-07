// Strict request-body validation for every route that persists a number.
//
// WHY THIS EXISTS. The sibling platform shipped a live defect found by probing production:
// `POST /v1/workouts` with a set field named `weight_kg` instead of `weight` returned
// `201 {"ok":true}` and stored `weight = NULL`. The workout looked logged. The 1RM endpoint then
// returned 0 with no error anywhere.
//
// Root cause was `await req.json() as SomeInterface` — TypeScript types are erased at runtime, so
// the cast asserts nothing, unknown keys vanish and known keys keep their defaults.
//
// That is the worst possible failure for an agent-first API. `weight_kg` is the *natural* guess:
// body metrics really do take `unit: "kg"`. So a model writes plausible JSON, gets a success, and
// silently corrupts the user's training history — with no signal on either side.
//
// Policy:
//   1. Known alias  → rewrite and continue. Never break a caller we can understand.
//   2. Unknown key  → 400 naming the offending field, the closest accepted name, and the full
//                     accepted list. An error an agent can act on beats one it can only log.
//   3. Known key    → untouched. This is a spelling gate, deliberately narrow: no coercion, no
//                     type checking, so it cannot change behaviour that already worked.
//
// Aliases are pure renames only. A unit change is never an alias: `distance_km` → `distance_m`
// would turn 5 km into 5 m, which corrupts worse than the null it was meant to prevent.

export type AliasMap = Record<string, string>;

export interface StrictResult<T> {
  ok: boolean;
  value?: T;
  /** Human message for a 400. */
  message?: string;
  /** The first offending key, for tests and structured logging. */
  field?: string;
}

/** Levenshtein distance, capped — only used to suggest a near-miss field name. */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 4) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Closest accepted field to `key`, or null when nothing is close enough to be worth suggesting. */
export function suggest(key: string, accepted: readonly string[]): string | null {
  let best: string | null = null;
  let bestD = 3;
  const lower = key.toLowerCase();
  for (const f of accepted) {
    // A key that merely adds or drops a unit suffix is a near-miss regardless of edit distance.
    if (lower.replace(/_(kg|lb|lbs|g|cm|m|ml|s|sec|seconds|min|mins|minutes)$/, "") === f.toLowerCase()) return f;
    const d = editDistance(lower, f.toLowerCase());
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

/**
 * Rewrite aliases, then reject unknown keys.
 *
 * `label` names the object in the error ("workout", "sets[0]", "meal") so a caller with a nested
 * payload learns *where* the bad field is, not merely that one exists.
 */
export function strictBody<T>(
  raw: unknown,
  accepted: readonly string[],
  aliases: AliasMap = {},
  label = "body",
): StrictResult<T> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: `${label} must be a JSON object.` };
  }
  const out: Record<string, unknown> = {};
  const acceptedSet = new Set(accepted);
  const source = raw as Record<string, unknown>;

  for (const [k, v] of Object.entries(source)) {
    // Own properties only. A plain `aliases[k]` walks the prototype chain, so a body containing
    // "toString" or "constructor" resolves an inherited function, takes the alias branch as
    // truthy, and gets silently dropped — the exact bug this file exists to stop, reachable from
    // any caller.
    const target = Object.hasOwn(aliases, k) ? aliases[k] : undefined;

    // The alias target must ALSO be accepted here. Update endpoints reuse a create alias map but
    // carry a narrower field list; without this check an alias smuggles a key past the gate and
    // the handler then ignores it — silent drop, reintroduced by the very list meant to stop it.
    if (target !== undefined && acceptedSet.has(target)) {
      // An explicit canonical key beats its alias, so a caller sending both is never silently
      // overridden by the one they cared about less.
      if (!Object.hasOwn(source, target)) out[target] = v;
      continue;
    }

    if (!acceptedSet.has(k)) {
      const hint = suggest(k, accepted);
      return {
        ok: false,
        field: k,
        message: `Unknown field "${k}" in ${label}.${hint ? ` Did you mean "${hint}"?` : ""} Accepted fields: ${accepted.join(", ")}.`,
      };
    }
    out[k] = v;
  }
  return { ok: true, value: out as T };
}

/** Apply strictBody to each element of an array payload (e.g. a workout's `sets`). */
export function strictArray<T>(
  raw: unknown,
  accepted: readonly string[],
  aliases: AliasMap = {},
  label = "item",
): StrictResult<T[]> {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, message: `${label}s must be an array.` };
  const out: T[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = strictBody<T>(raw[i], accepted, aliases, `${label}[${i}]`);
    if (!r.ok) return { ok: false, message: r.message, field: r.field };
    out.push(r.value as T);
  }
  return { ok: true, value: out };
}

// ---------------------------------------------------------------------------
// Field lists. These ARE the write contract — the MCP tool schemas below them
// must stay a subset, and a test asserts exactly that in both directions.
// ---------------------------------------------------------------------------

export const MEAL_FIELDS = [
  "date", "meal_type", "name", "calories", "protein", "carbs", "fats", "notes",
] as const;

export const MEAL_ALIASES: AliasMap = {
  kcal: "calories",
  energy: "calories",
  protein_g: "protein",
  carbs_g: "carbs",
  carbohydrates: "carbs",
  fat: "fats",
  fats_g: "fats",
  fat_g: "fats",
  meal: "meal_type",
  title: "name",
};

export const WATER_FIELDS = ["date", "amount_ml"] as const;
export const WATER_ALIASES: AliasMap = { ml: "amount_ml", amount: "amount_ml" };

export const WORKOUT_FIELDS = [
  "date", "title", "notes", "duration_minutes", "sets",
] as const;
export const WORKOUT_ALIASES: AliasMap = { name: "title", duration: "duration_minutes" };

export const SET_FIELDS = [
  "exercise_name", "set_number", "reps", "weight", "rpe", "notes",
] as const;
export const SET_ALIASES: AliasMap = {
  // Pure renames. `weight_lb` is deliberately absent: converting pounds would change the number,
  // and a wrong number that looks right is worse than a rejected request.
  weight_kg: "weight",
  kg: "weight",
  load: "weight",
  exercise: "exercise_name",
  name: "exercise_name",
  repetitions: "reps",
  set: "set_number",
};

export const BODY_METRIC_FIELDS = ["metric_type", "value", "unit", "date", "notes"] as const;
export const BODY_METRIC_ALIASES: AliasMap = { type: "metric_type", weight: "value" };

export const GOAL_FIELDS = ["calories", "protein", "carbs", "fats", "water_ml"] as const;
export const GOAL_ALIASES: AliasMap = {
  kcal: "calories",
  protein_g: "protein",
  carbs_g: "carbs",
  fat: "fats",
  fats_g: "fats",
  water: "water_ml",
};
