// Bundled exercise dataset (replaces the Base44 Exercise entity).
// The JSON is exported once from the live Base44 instance — see ../../data/README.md.
// Logic ported from searchExercises / getExercise / resolveExercise functions.

import exercisesJson from "../../data/exercises.json" assert { type: "json" };
import {
  MUSCLES, PALETTE, ANATOMICAL_NAMES, SIDE_PRESENCE, BODY_REGION, ANTAGONISTS, normalizeSlug,
} from "../data/muscleCatalog.ts";
import {
  type ExerciseFieldKey,
  projectRecord,
  SEARCH_DEFAULT_FIELDS,
} from "./exerciseFields.ts";
import {
  deriveKeywords, computeVariations, computeRelatedExerciseIds, needsComputedRelations,
} from "./exerciseEnrichment.ts";
import { resolveSearchParams, buildNextSearchCursor } from "./searchCursor.ts";

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

const ALL: ExerciseRow[] = exercisesJson as unknown as ExerciseRow[];

export function allExercises(): ExerciseRow[] {
  return ALL;
}
export function count(): number {
  return ALL.length;
}

/** Strip Base44 legacy `/functions/` prefix (RapidAPI still returns these on some rows). */
export function normalizeLegacyFunctionPath(src: string): string {
  if (src.startsWith("/functions/")) return src.replace(/^\/functions/, "");
  try {
    const u = new URL(src);
    if (u.pathname.startsWith("/functions/")) {
      u.pathname = u.pathname.replace(/^\/functions/, "");
      return u.toString();
    }
  } catch {
    /* relative or invalid — return as-is */
  }
  return src;
}

/** Make a relative anatome_imageSrc absolute against the public base. */
export function absoluteImageSrc(src: string | undefined | null, base: string): string | null {
  if (!src) return null;
  const normalized = normalizeLegacyFunctionPath(src);
  const b = base.replace(/\/$/, "");
  if (normalized.startsWith("http")) return normalized;
  if (normalized.startsWith("/")) return `${b}${normalized}`;
  return normalized;
}

/** Bump when GIF frame timing changes — busts CDN/browser cache on gif_url. */
export const GIF_PLAYBACK_VERSION = "4";

/** Anatome-hosted exercise demo GIF (2-frame, CC0 source). */
export function exerciseGifUrl(extId: string | undefined | null, base: string): string | null {
  if (!extId) return null;
  const b = base.replace(/\/$/, "");
  return `${b}/exerciseGif?id=${encodeURIComponent(extId)}&v=${GIF_PLAYBACK_VERSION}`;
}

/** Back-compat alias — same Anatome-hosted GIF as gif_url (no external hotlinks). */
export function exerciseImageUrl(extId: string | undefined | null, base: string): string | null {
  return exerciseGifUrl(extId, base);
}

export type ExerciseRecordVariant = "search" | "full";

/** Full exercise object before sparse `fields` projection. */
export function buildExerciseRecord(
  e: ExerciseRow,
  base: string,
  opts?: { withRelations?: boolean },
): Record<string, unknown> {
  const slugsPrimary = e.anatome_primary_slugs || [];
  const slugsSecondary = e.anatome_secondary_slugs || [];
  const record: Record<string, unknown> = {
    id: e.id,
    ext_id: e.ext_id,
    name: e.name,
    force: e.force || null,
    level: e.level || null,
    mechanic: e.mechanic || null,
    movementType: e.mechanic || null,
    equipment: e.equipment || null,
    category: e.category || null,
    primaryMuscles: e.primaryMuscles || [],
    secondaryMuscles: e.secondaryMuscles || [],
    source_primaryMuscles: e.primaryMuscles || [],
    source_secondaryMuscles: e.secondaryMuscles || [],
    anatome_primary_slugs: slugsPrimary,
    anatome_secondary_slugs: slugsSecondary,
    keywords: deriveKeywords(e),
    instructions: e.instructions || [],
    images: e.images || [],
    image_url: exerciseImageUrl(e.ext_id, base),
    gif_url: exerciseGifUrl(e.ext_id, base),
    anatome_imageSrc: absoluteImageSrc(e.anatome_imageSrc, base),
    anatome_layers_payload: e.anatome_layers_payload || [],
    unmapped_source_muscle: e.unmapped_source_muscle || [],
  };
  if (opts?.withRelations) {
    record.variations = computeVariations(e, base);
    record.relatedExerciseIds = computeRelatedExerciseIds(e);
  }
  return record;
}

export function formatExercise(
  e: ExerciseRow,
  base: string,
  variant: ExerciseRecordVariant,
  fields: ReadonlySet<ExerciseFieldKey> | null | undefined,
): Record<string, unknown> {
  const withRelations = needsComputedRelations(fields === undefined ? null : fields);
  const record = buildExerciseRecord(e, base, { withRelations });
  if (variant === "search") {
    record.primaryMuscles = e.anatome_primary_slugs || [];
    record.secondaryMuscles = e.anatome_secondary_slugs || [];
  }
  const defaults = variant === "search" ? SEARCH_DEFAULT_FIELDS : null;
  const pick = fields === undefined ? defaults : fields;
  return projectRecord(record, pick);
}

// ---- search (ported from searchExercisesLogic) ----
export interface SearchParams {
  q?: string | null;
  muscle?: string | null;
  equipment?: string | null;
  level?: string | null;
  limit?: number | string | null;
  offset?: number | string | null;
  cursor?: string | null;
}

export function searchExercisesLogic(params: SearchParams): {
  total: number;
  offset: number;
  limit: number;
  next_cursor: string | null;
  results: ExerciseRow[];
} {
  const resolved = resolveSearchParams(params);
  const key = String(resolved.q || "").trim().toLowerCase();
  const lim = Math.min(Math.max(Number(resolved.limit || 20), 1), 50);
  const off = Math.max(Number(resolved.offset || 0), 0);
  let matches = ALL;
  if (key) matches = matches.filter((e) => (e.name_lower || e.name || "").toLowerCase().includes(key));
  if (resolved.muscle && resolved.muscle !== "any") {
    const m = String(resolved.muscle).toLowerCase();
    matches = matches.filter((e) =>
      (e.anatome_primary_slugs || []).includes(m) || (e.anatome_secondary_slugs || []).includes(m));
  }
  if (resolved.equipment && resolved.equipment !== "any") {
    const eq = String(resolved.equipment).toLowerCase();
    matches = matches.filter((e) => String(e.equipment || "").toLowerCase() === eq);
  }
  if (resolved.level && resolved.level !== "any") {
    const lv = String(resolved.level).toLowerCase();
    matches = matches.filter((e) => String(e.level || "").toLowerCase() === lv);
  }
  const total = matches.length;
  return {
    total,
    offset: off,
    limit: lim,
    next_cursor: buildNextSearchCursor(resolved, off, lim, total),
    results: matches.slice(off, off + lim),
  };
}

export function listEquipment(): string[] {
  return [...new Set(ALL.map((e) => e.equipment).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
}

export interface MuscleInfo {
  slug: string;
  anatomical_name: string;
  views: string[];
  body_region: string | null;
  antagonists: string[];
  exercise_count: { primary: number; secondary: number };
  top_exercises: { name: string; anatome_imageSrc: string | null }[];
}

export function getMuscleInfo(slug: string, base: string, topLimit = 5): MuscleInfo | null {
  const normalized = normalizeSlug(slug);
  if (!MUSCLES.includes(normalized)) return null;
  const primary = ALL.filter((e) => (e.anatome_primary_slugs || []).includes(normalized));
  const secondary = ALL.filter((e) =>
    (e.anatome_secondary_slugs || []).includes(normalized) &&
    !(e.anatome_primary_slugs || []).includes(normalized));
  return {
    slug: normalized,
    anatomical_name: ANATOMICAL_NAMES[normalized] || normalized,
    views: SIDE_PRESENCE[normalized] || [],
    body_region: BODY_REGION[normalized] || null,
    antagonists: ANTAGONISTS[normalized] || [],
    exercise_count: { primary: primary.length, secondary: secondary.length },
    top_exercises: primary.slice(0, topLimit).map((e) => ({
      name: e.name as string,
      anatome_imageSrc: absoluteImageSrc(e.anatome_imageSrc, base),
    })),
  };
}

/** @deprecated Use formatExercise(e, base, "search", fields) */
export function searchResult(
  e: ExerciseRow,
  base: string,
  fields: ReadonlySet<ExerciseFieldKey> | null = SEARCH_DEFAULT_FIELDS,
) {
  return formatExercise(e, base, "search", fields);
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

/** Exact ext_id lookup, then fuzzy name match (underscores → spaces). */
export function lookupExerciseById(id: string): {
  exercise: ExerciseRow | null;
  match: "exact" | "id_fallback_to_name" | "none";
} {
  const trimmed = String(id || "").trim();
  if (!trimmed) return { exercise: null, match: "none" };
  const exact = getByExtId(trimmed);
  if (exact) return { exercise: exact, match: "exact" };
  const asName = trimmed.replace(/_/g, " ");
  const bySpaced = getByName(asName);
  if (bySpaced.exercise) return { exercise: bySpaced.exercise, match: "id_fallback_to_name" };
  const byRaw = getByName(trimmed);
  if (byRaw.exercise) return { exercise: byRaw.exercise, match: "id_fallback_to_name" };
  return { exercise: null, match: "none" };
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
const PREFERRED_EQUIPMENT = ["barbell", "dumbbell", "bodyweight", "body only"] as const;

function equipmentPrefixBonus(nameLower: string): number {
  for (let i = 0; i < PREFERRED_EQUIPMENT.length; i++) {
    if (nameLower.startsWith(`${PREFERRED_EQUIPMENT[i]} `)) {
      return (PREFERRED_EQUIPMENT.length - i) * 15;
    }
  }
  return 0;
}

/** Rank how well an exercise name matches a user query (higher = better). */
export function scoreExerciseNameMatch(nameLower: string, key: string): number {
  if (!nameLower || !key) return 0;
  if (nameLower === key) return 10000;

  const keyWords = key.split(/\s+/);

  for (const equip of PREFERRED_EQUIPMENT) {
    const ideal = `${equip} ${key}`;
    if (nameLower === ideal || nameLower.startsWith(`${ideal} `) || nameLower.startsWith(`${ideal} -`)) {
      return 9500 - nameLower.length + equipmentPrefixBonus(nameLower);
    }
  }

  const words = nameLower.split(/\s+/);
  if (words.length >= keyWords.length && words.slice(-keyWords.length).join(" ") === key) {
    const prefixLen = words.length - keyWords.length;
    return 8000 - prefixLen * 200 + equipmentPrefixBonus(nameLower);
  }

  const idx = nameLower.indexOf(key);
  if (idx >= 0) {
    const suffixLen = nameLower.slice(idx + key.length).length;
    return 3000 - nameLower.length - suffixLen * 5 + equipmentPrefixBonus(nameLower);
  }

  if (key.includes(nameLower)) return 500 + nameLower.length;
  return 0;
}

/** Best fuzzy match against the bundled exercise list, or null. */
export function findBestExerciseMatch(keyRaw: string): ExerciseRow | null {
  const key = String(keyRaw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  let best: ExerciseRow | null = null;
  let bestScore = 0;
  for (const e of ALL) {
    const score = scoreExerciseNameMatch(e.name_lower || "", key);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return bestScore > 0 ? best : null;
}

export function getByName(name: string): { match: "exact" | "fuzzy" | "none"; exercise: ExerciseRow | null } {
  const key = name.trim().toLowerCase();
  const exact = ALL.find((e) => (e.name_lower || "") === key);
  if (exact) return { match: "exact", exercise: exact };
  const fuzzy = findBestExerciseMatch(key);
  return { match: fuzzy ? "fuzzy" : "none", exercise: fuzzy };
}

// ---- resolveExercise (exercise_db -> keyword fallback) ----
export interface ResolvedLayer { color: string; muscles: string[]; opacity?: number }
export interface Resolved {
  exercise: string;
  matched: boolean;
  source: string;
  layers: ResolvedLayer[];
  explanation: string;
  image_src?: string;
  anatome_imageSrc?: string;
  gif_url?: string;
  ext_id?: string;
  equipment?: string;
  level?: string;
  category?: string;
}

function resolveFromDb(exerciseRaw: string): Resolved | null {
  const rec = findBestExerciseMatch(exerciseRaw);
  if (!rec) return null;
  const layers: ResolvedLayer[] = [];
  if ((rec.anatome_primary_slugs || []).length) layers.push({ color: PALETTE.primary, muscles: rec.anatome_primary_slugs as string[] });
  if ((rec.anatome_secondary_slugs || []).length) layers.push({ color: PALETTE.secondary, muscles: rec.anatome_secondary_slugs as string[] });
  return {
    exercise: rec.name as string, matched: layers.length > 0, source: "exercise_db", layers,
    image_src: rec.anatome_imageSrc,
    ext_id: rec.ext_id, equipment: rec.equipment, level: rec.level, category: rec.category,
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

export function resolveExercise(exerciseRaw: string, base = ""): Resolved {
  const r = resolveFromDb(exerciseRaw) || keywordFallback(exerciseRaw);
  if (!base) return r;
  const enriched: Resolved = { ...r };
  if (r.ext_id) enriched.gif_url = exerciseGifUrl(r.ext_id, base) ?? undefined;
  const src = resolveExerciseImageSrc(r, base);
  if (src) enriched.anatome_imageSrc = src;
  return enriched;
}

/** Absolute ready-to-embed image URL for a resolveExercise result. */
export function resolveExerciseImageSrc(
  resolved: Resolved,
  base: string,
  gender = "male",
  view = "dual",
): string | null {
  if (!resolved.matched || !resolved.layers.length) return null;
  if (resolved.source === "exercise_db" && resolved.image_src) {
    return absoluteImageSrc(resolved.image_src, base);
  }
  const compact = resolved.layers.map((l) => {
    const hex = String(l.color || PALETTE.primary).replace("#", "");
    const op = l.opacity != null && l.opacity !== 1 ? `@${l.opacity}` : "";
    return `${hex}${op}:${l.muscles.join(",")}`;
  }).join("|");
  if (!compact) return null;
  const path = `/generateImage?gender=${gender}&view=${view}&layers=${encodeURIComponent(compact)}&output=raw`;
  return `${base}${path}`;
}
