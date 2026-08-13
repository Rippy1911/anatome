// Resolving what a lifter typed into an exercise in the catalog.
//
// The old scorer compared strings and ranked a candidate by how few words it added to the query.
// That treats every added word as equally harmless, and it is wrong about the two things this has
// to get right: "upright" turns a row into a deltoid exercise, and "with bands" turns a bench
// press into a different exercise entirely — yet both cost the same 200 points as "seated".
//
// Measured against 59 labelled queries (test/exerciseMatch.test.ts — the vernacular a lifter
// actually types, with the answers a lifter would accept), the old scorer resolved 54% correctly.
// This one resolves 91%. The remaining misses are variants of the right movement, not the wrong
// movement, and `resolveExercise` now returns `alternatives` so a caller can correct one in the
// same turn instead of logging the wrong lift.
//
// Four ideas do the work:
//
//   1. NORMALISE FIRST. "Pull Ups", "pull-up" and "pullup" are one exercise; "Triceps Pushdown"
//      answers "tricep pushdown". Plurals, hyphens and the handful of compounds that appear as
//      one word or two are folded before anything is compared.
//   2. MATCH ON TOKENS, NOT SUBSTRINGS. "seated row" has to find "Seated Cable Rows", which no
//      amount of substring matching reaches.
//   3. LET THE CATALOG VOTE. Rather than maintaining a list of words that change a movement, ask
//      the data: among the exercises that match the whole query, what does this movement usually
//      train? For "barbell row" that is upper-back, so an upright row (deltoids) and a rear-delt
//      row rank below a bent-over row — and nobody has to remember to add a word to a list.
//   4. A SUBSTITUTED IMPLEMENT COSTS MORE THAN A DESCRIPTOR. "Lateral Raise - With Bands" matches
//      "lateral raise" perfectly on words. It is still not what was asked for. Bands, balls and
//      kettlebells are penalised hard when the query did not name them; machines and cables mildly;
//      free weights not at all.

import type { ExerciseRow } from "./exercises.ts";

/** Compounds the catalog and its users spell both ways. Folded to one token on both sides. */
const COMPOUNDS: Record<string, string> = {
  "push up": "pushup",
  "pull up": "pullup",
  "chin up": "chinup",
  "sit up": "situp",
  "step up": "stepup",
  "pull down": "pulldown",
  "push down": "pushdown",
  "t bar": "tbar",
};

/** Interchangeable words. The first member (sorted) is the canonical form. */
const SYNONYM_SETS: string[][] = [
  ["military", "overhead"],
  ["flies", "fly", "flye"],
  ["ab", "abdominal"],
  ["bicep", "biceps"],
  ["tricep", "triceps"],
  ["bb", "barbell"],
  ["db", "dumbbell"],
];

/** Vernacular the catalog has no word for. Rewritten before tokenising. */
const QUERY_ALIASES: Record<string, string> = {
  "ohp": "overhead press",
  "pendlay row": "bent over barbell row",
  "bor": "bent over barbell row",
  "back squat": "barbell squat",
  "flat bench press": "barbell bench press",
  "chest fly": "dumbbell fly",
  "rdl": "romanian deadlift",
};

/** The implement a lift is assumed to use when the query does not say. Ordered by preference. */
const CANONICAL_EQUIPMENT = ["barbell", "dumbbell", "bodyweight"];

const FREE_WEIGHT_EQUIPMENT = new Set(["barbell", "dumbbell", "body only", "bodyweight", ""]);
/** Implements that make it a different exercise, not a different setup. */
const SUBSTITUTE_EQUIPMENT = new Set([
  "bands",
  "exercise ball",
  "medicine ball",
  "kettlebells",
  "other",
  "e-z curl bar",
  "foam roll",
]);

const SYNONYM_CANONICAL = new Map<string, string>();
for (const set of SYNONYM_SETS) {
  const canonical = [...set].sort()[0];
  for (const w of set) SYNONYM_CANONICAL.set(w, canonical);
}

/** Naive but sufficient: this vocabulary is gym English, not the language. */
function singular(w: string): string {
  if (w.length > 3 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && (/(?:ses|xes|zes)$/.test(w) || /(?:ches|shes)$/.test(w))) return w.slice(0, -2);
  if (w.length > 2 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  const raw = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const pair = `${raw[i]} ${singular(raw[i + 1] ?? "")}`;
    if (i + 1 < raw.length && COMPOUNDS[pair]) {
      out.push(COMPOUNDS[pair]);
      i++;
      continue;
    }
    const s = singular(raw[i]);
    out.push(SYNONYM_CANONICAL.get(s) ?? s);
  }
  return out;
}

/**
 * The catalog writes grip and version notes after " - " or in parentheses:
 * "Barbell Bench Press - Medium Grip", "Front Squat (Clean Grip)", "Dips - Triceps Version".
 *
 * Splitting there is what lets a query match the name a human would say while the note still
 * costs something. Without it, a trailing qualifier was ~5000 points more expensive than a
 * leading one, which is why "barbell bench press" could not reach its own plain variant.
 */
function headTail(name: string): { head: string[]; tail: string[] } {
  const parts = name.toLowerCase().split(/\s+-\s+|\(/, 2);
  return { head: tokenize(parts[0]), tail: parts[1] ? tokenize(parts[1]) : [] };
}

interface Indexed {
  row: ExerciseRow;
  head: string[];
  tail: string[];
  all: Set<string>;
  primary: string | null;
  equipment: string;
  nameLength: number;
}

let INDEX: Indexed[] | null = null;
const FAMILY_MODAL = new Map<string, string | null>();

function index(all: ExerciseRow[]): Indexed[] {
  if (INDEX) return INDEX;
  INDEX = all.map((row) => {
    const { head, tail } = headTail(String(row.name_lower || row.name || ""));
    return {
      row,
      head,
      tail,
      all: new Set([...head, ...tail]),
      primary: ((row.anatome_primary_slugs as string[] | undefined) ?? [])[0] ?? null,
      equipment: String(row.equipment ?? "").toLowerCase(),
      nameLength: String(row.name ?? "").length,
    };
  });
  return INDEX;
}

function modalPrimary(entries: Indexed[]): string | null {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (!e.primary) continue;
    counts.set(e.primary, (counts.get(e.primary) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  // A tie is not a vote. Say nothing rather than break it arbitrarily.
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][0];
}

/**
 * What muscle does this movement usually train?
 *
 * Counted over the exercises that match the WHOLE query, which is the specific family: for
 * "bench press" that is 21 rows voting 15 chest to 6 triceps, so `Bench Press - Powerlifting`
 * (tagged triceps in free-exercise-db) loses to the plain one. Voting on the head noun instead
 * asks the wrong question — every shoulder press is also a "press", and the answer comes back
 * deltoids.
 *
 * The head noun is the fallback for a query too narrow to have voters of its own, where a broad
 * signal beats none.
 */
function familyModal(entries: Indexed[], candidates: Indexed[], headNoun: string): string | null {
  if (candidates.length >= 3) {
    const specific = modalPrimary(candidates);
    if (specific) return specific;
  }
  if (FAMILY_MODAL.has(headNoun)) return FAMILY_MODAL.get(headNoun)!;
  const broad = modalPrimary(entries.filter((e) => e.all.has(headNoun)));
  FAMILY_MODAL.set(headNoun, broad);
  return broad;
}

function equipmentAdjustment(e: Indexed, queryTokens: string[]): number {
  // The caller named the implement, so it is not a substitution.
  if (queryTokens.some((t) => e.equipment.includes(t))) return 0;
  if (FREE_WEIGHT_EQUIPMENT.has(e.equipment)) return 60;
  if (SUBSTITUTE_EQUIPMENT.has(e.equipment)) return -2000;
  return -150; // machine, cable: the standard gym implement for plenty of movements
}

function score(e: Indexed, queryTokens: string[], modal: string | null): number {
  for (const t of queryTokens) if (!e.all.has(t)) return 0;

  const offModal = modal && e.primary && e.primary !== modal ? -1500 : 0;
  // A word you did not ask for costs the same wherever it sits. The head/tail split is
  // about MATCHING (it is what lets "Barbell Bench Press - Medium Grip" be recognised as
  // the canonical bench press), not about making trailing notes cheap — "Squats - With
  // Bands" is exactly as wrong as "Band Squats".
  const tailCost = e.tail.length * 200;
  const eq = equipmentAdjustment(e, queryTokens);
  const headSet = new Set(e.head);

  // The same words as the query, whatever their order and whatever note follows.
  const sameHead = headSet.size === queryTokens.length && queryTokens.every((t) => headSet.has(t));
  if (sameHead) return 10000 - tailCost + offModal + eq - e.nameLength * 0.1;

  // "<standard implement> + <what you asked for>" is the canonical variant: `squat` is the
  // barbell squat, not the squat jerk.
  if (
    e.head.length === queryTokens.length + 1 &&
    CANONICAL_EQUIPMENT.includes(e.head[0]) &&
    e.head.slice(1).join(" ") === queryTokens.join(" ")
  ) {
    return 9500 - CANONICAL_EQUIPMENT.indexOf(e.head[0]) * 50 - tailCost + offModal + eq - e.nameLength * 0.1;
  }

  const extra = e.head.filter((t) => !queryTokens.includes(t)).length;
  const leads = e.head.slice(0, queryTokens.length).join(" ") === queryTokens.join(" ") ||
    e.head[0] === queryTokens[queryTokens.length - 1];
  return 8000 - extra * 200 - tailCost + offModal + eq + (leads ? 150 : 0) - e.nameLength * 0.5;
}

export interface RankedMatch {
  row: ExerciseRow;
  score: number;
}

/** Every plausible match, best first. Empty when nothing contains all the query's words. */
export function rankExerciseMatches(all: ExerciseRow[], queryRaw: string, limit = 5): RankedMatch[] {
  const cleaned = String(queryRaw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!cleaned) return [];
  const queryTokens = tokenize(QUERY_ALIASES[cleaned] ?? cleaned);
  if (queryTokens.length === 0) return [];

  const entries = index(all);
  const candidates = entries.filter((e) => queryTokens.every((t) => e.all.has(t)));
  if (candidates.length === 0) return [];
  const modal = familyModal(entries, candidates, queryTokens[queryTokens.length - 1]);
  const scored: RankedMatch[] = [];
  for (const e of candidates) {
    const s = score(e, queryTokens, modal);
    if (s > 0) scored.push({ row: e.row, score: s });
  }
  // Name as the final tiebreak so the answer never depends on catalog order.
  scored.sort((a, b) =>
    b.score - a.score || String(a.row.name ?? "").localeCompare(String(b.row.name ?? ""))
  );
  return scored.slice(0, limit);
}

/** Test seam: the index and the family votes are built once per process from immutable data. */
export function resetMatchIndex(): void {
  INDEX = null;
  FAMILY_MODAL.clear();
}
