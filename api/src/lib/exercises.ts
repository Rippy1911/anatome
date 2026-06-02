// Bundled exercise dataset (replaces the Base44 Exercise entity).
// The JSON is exported once from the live Base44 instance — see ../../data/README.md.
// Logic ported from searchExercises / getExercise / resolveExercise functions.

import exercisesJson from "../../data/exercises.json" assert { type: "json" };
import { MUSCLES, PALETTE, EXERCISE_MAP } from "../data/muscleCatalog.ts";

export interface ExerciseRow {
  id?: string;
  ext_id?: string;
  name?: string;
  name_lower?: string;
  force?: string;
  level?: string;
  mechanic?: string;
  equipment?: string;
  category?: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  images?: string[];
  anatome_primary_slugs?: string[];
  anatome_secondary_slugs?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  anatome_layers_payload?: any[];
  anatome_imageSrc?: string;
  unmapped_source_muscle?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

const EXDB_IMG_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

const ALL: ExerciseRow[] = exercisesJson as unknown as ExerciseRow[];

export function allExercises(): ExerciseRow[] {
  return ALL;
}
export function count(): number {
  return ALL.length;
}

/** Make a relative anatome_imageSrc absolute against the public base. */
export function absoluteImageSrc(src: string | undefined | null, base: string): string | null {
  if (!src) return null;
  if (typeof src === "string" && src.startsWith("/")) return `${base}${src}`;
  return src;
}

export function exerciseDbImageUrl(images?: string[]): string | null {
  const first = images && images[0];
  if (!first) return null;
  return /^https?:\/\//.test(first) ? first : `${EXDB_IMG_BASE}${first}`;
}

// ---- search (ported from searchExercisesLogic) ----
export interface SearchParams {
  q?: string | null;
  muscle?: string | null;
  equipment?: string | null;
  level?: string | null;
  limit?: number | string | null;
}

export function searchExercisesLogic(params: SearchParams): { total: number; results: ExerciseRow[] } {
  const key = String(params.q || "").trim().toLowerCase();
  const lim = Math.min(Number(params.limit || 20), 50);
  let matches = ALL;
  if (key) matches = matches.filter((e) => (e.name_lower || e.name || "").toLowerCase().includes(key));
  if (params.muscle && params.muscle !== "any") {
    const m = String(params.muscle).toLowerCase();
    matches = matches.filter((e) =>
      (e.anatome_primary_slugs || []).includes(m) || (e.anatome_secondary_slugs || []).includes(m));
  }
  if (params.equipment && params.equipment !== "any") {
    const eq = String(params.equipment).toLowerCase();
    matches = matches.filter((e) => String(e.equipment || "").toLowerCase() === eq);
  }
  if (params.level && params.level !== "any") {
    const lv = String(params.level).toLowerCase();
    matches = matches.filter((e) => String(e.level || "").toLowerCase() === lv);
  }
  return { total: matches.length, results: matches.slice(0, lim) };
}

export function searchResult(e: ExerciseRow, base: string) {
  return {
    id: e.id,
    name: e.name,
    primaryMuscles: e.anatome_primary_slugs || [],
    secondaryMuscles: e.anatome_secondary_slugs || [],
    equipment: e.equipment || null,
    level: e.level || null,
    image_url: exerciseDbImageUrl(e.images),
    anatome_imageSrc: absoluteImageSrc(e.anatome_imageSrc, base),
    anatome_layers_payload: e.anatome_layers_payload || [],
  };
}

// ---- getExercise modes (ported) ----
export function cleanExercise(rec: ExerciseRow | null | undefined): ExerciseRow | null {
  if (!rec) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { created_date, updated_date, created_by_id, ...rest } = rec;
  return { ...rest };
}

export function getByExtId(id: string): ExerciseRow | null {
  return ALL.find((e) => e.ext_id === id) || null;
}
export function getByMuscle(slug: string, limit: number): ExerciseRow[] {
  const m = slug.trim().toLowerCase();
  const primary = ALL.filter((e) => (e.anatome_primary_slugs || []).includes(m));
  let list = primary.slice(0, limit);
  if (list.length < limit) {
    const seen = new Set(list.map((e) => e.id));
    const secondary = ALL.filter((e) => (e.anatome_secondary_slugs || []).includes(m) && !seen.has(e.id));
    list = list.concat(secondary).slice(0, limit);
  }
  return list;
}
export function getRandom(): ExerciseRow | null {
  if (!ALL.length) return null;
  return ALL[Math.floor(Math.random() * ALL.length)];
}
export function getByName(name: string): { match: "exact" | "fuzzy" | "none"; exercise: ExerciseRow | null } {
  const key = name.trim().toLowerCase();
  const exact = ALL.find((e) => (e.name_lower || "") === key);
  if (exact) return { match: "exact", exercise: exact };
  const fuzzy = ALL.find((e) => (e.name_lower || "").includes(key)) ||
    ALL.find((e) => key.includes(e.name_lower || "___"));
  return { match: fuzzy ? "fuzzy" : "none", exercise: fuzzy || null };
}

// ---- resolveExercise (ported: builtin -> db -> keyword) ----
export interface ResolvedLayer { color: string; muscles: string[]; opacity?: number }
export interface Resolved {
  exercise: string;
  matched: boolean;
  source: string;
  layers: ResolvedLayer[];
  explanation: string;
  image_src?: string;
  ext_id?: string;
  equipment?: string;
  level?: string;
  category?: string;
}

function intensityLayers(plan: { layers: { intensity: string; muscles: string[] }[] }): ResolvedLayer[] {
  return plan.layers.filter((l) => l.muscles.length > 0).map((l) => {
    if (l.intensity === "primary") return { color: PALETTE.primary, muscles: l.muscles };
    if (l.intensity === "secondary") return { color: PALETTE.secondary, muscles: l.muscles };
    return { color: PALETTE.accessory, muscles: l.muscles, opacity: PALETTE.accessoryOpacity };
  });
}

function resolveBuiltin(exerciseRaw: string): Resolved | null {
  const exercise = String(exerciseRaw || "").trim();
  const key = exercise.toLowerCase().replace(/\s+/g, " ").trim();
  if (EXERCISE_MAP[key]) {
    const plan = EXERCISE_MAP[key];
    return { exercise: key, matched: true, source: "exact", layers: intensityLayers(plan),
      explanation: `"${key}" — primary: ${plan.layers[0].muscles.join(", ") || "none"}; secondary: ${plan.layers[1].muscles.join(", ") || "none"}; accessory: ${plan.layers[2].muscles.join(", ") || "none"}.` };
  }
  const prefix = Object.keys(EXERCISE_MAP).find((k) => k.startsWith(key) || key.startsWith(k));
  if (prefix) {
    const plan = EXERCISE_MAP[prefix];
    return { exercise: prefix, matched: true, source: "prefix", layers: intensityLayers(plan),
      explanation: `Closest match for "${key}" is "${prefix}".` };
  }
  return null;
}

function resolveFromDb(exerciseRaw: string): Resolved | null {
  const key = String(exerciseRaw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  let rec = ALL.find((e) => (e.name_lower || "") === key) || null;
  if (!rec) {
    rec = ALL.find((e) => (e.name_lower || "").includes(key)) ||
      ALL.find((e) => key.includes(e.name_lower || "___")) || null;
  }
  if (!rec) return null;
  const layers: ResolvedLayer[] = [];
  if ((rec.anatome_primary_slugs || []).length) layers.push({ color: PALETTE.primary, muscles: rec.anatome_primary_slugs as string[] });
  if ((rec.anatome_secondary_slugs || []).length) layers.push({ color: PALETTE.secondary, muscles: rec.anatome_secondary_slugs as string[] });
  return {
    exercise: rec.name as string, matched: layers.length > 0, source: "exercise_db", layers,
    image_src: rec.anatome_imageSrc, ext_id: rec.ext_id, equipment: rec.equipment, level: rec.level, category: rec.category,
    explanation: `From ExerciseDB: "${rec.name}" — primary: ${(rec.anatome_primary_slugs || []).join(", ") || "none"}; secondary: ${(rec.anatome_secondary_slugs || []).join(", ") || "none"}.`,
  };
}

function keywordFallback(exerciseRaw: string): Resolved {
  const key = String(exerciseRaw || "").trim().toLowerCase();
  const hits = MUSCLES.filter((m) => key.includes(m) || key.includes(m.replace("-", " ")));
  if (hits.length > 0) {
    return { exercise: key, matched: true, source: "keyword_fallback", layers: [{ color: PALETTE.primary, muscles: hits }],
      explanation: `Matched muscle keywords: ${hits.join(", ")}.` };
  }
  return { exercise: key, matched: false, source: "unmatched", layers: [],
    explanation: `Could not resolve "${key}". Try a common exercise name like "bench press".` };
}

export function resolveExercise(exerciseRaw: string): Resolved {
  return resolveBuiltin(exerciseRaw) || resolveFromDb(exerciseRaw) || keywordFallback(exerciseRaw);
}
