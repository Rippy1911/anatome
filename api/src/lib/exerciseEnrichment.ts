// Computed exercise fields (keywords, variations, related) — no bundle changes.

import { allExercises, absoluteImageSrc, type ExerciseRow } from "./exercises.ts";

export interface ExerciseVariation {
  ext_id: string;
  name: string;
  anatome_imageSrc: string | null;
}

function slugSet(e: ExerciseRow): Set<string> {
  const s = new Set<string>();
  for (const x of e.anatome_primary_slugs || []) s.add(x);
  for (const x of e.anatome_secondary_slugs || []) s.add(x);
  return s;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function nameTokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(/\s+/).filter((w) => w.length > 2));
  const tb = new Set(b.split(/\s+/).filter((w) => w.length > 2));
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter;
}

/** SEO / search keywords derived from bundled fields. */
export function deriveKeywords(e: ExerciseRow): string[] {
  const parts = [
    e.name,
    ...(e.primaryMuscles || []),
    ...(e.secondaryMuscles || []),
    e.equipment,
    e.level,
    e.category,
    e.mechanic,
    e.force,
    ...(e.anatome_primary_slugs || []),
    ...(e.anatome_secondary_slugs || []),
  ]
    .filter(Boolean)
    .map((s) => String(s).trim().toLowerCase());
  return [...new Set(parts)];
}

/** Same primary slugs + category; ranked by name token overlap. */
export function computeVariations(
  e: ExerciseRow,
  base: string,
  limit = 5,
): ExerciseVariation[] {
  const extId = e.ext_id;
  if (!extId) return [];
  const primary = new Set(e.anatome_primary_slugs || []);
  if (!primary.size) return [];
  const cat = String(e.category || "").toLowerCase();
  const nameKey = (e.name_lower || e.name || "").toLowerCase();
  const candidates = allExercises().filter(
    (other) =>
      other.ext_id !== extId &&
      String(other.category || "").toLowerCase() === cat &&
      (other.anatome_primary_slugs || []).some((s) => primary.has(s)),
  );
  return candidates
    .map((other) => ({
      other,
      score: nameTokenOverlap(nameKey, (other.name_lower || other.name || "").toLowerCase()),
    }))
    .sort((a, b) => b.score - a.score || String(a.other.name).localeCompare(String(b.other.name)))
    .slice(0, limit)
    .map(({ other }) => ({
      ext_id: other.ext_id as string,
      name: other.name as string,
      anatome_imageSrc: absoluteImageSrc(other.anatome_imageSrc, base),
    }));
}

/** Top related exercises by Jaccard similarity on Anatome slug sets. */
export function computeRelatedExerciseIds(e: ExerciseRow, limit = 5): string[] {
  const extId = e.ext_id;
  if (!extId) return [];
  const self = slugSet(e);
  if (!self.size) return [];
  return allExercises()
    .filter((other) => other.ext_id && other.ext_id !== extId)
    .map((other) => ({ ext_id: other.ext_id as string, score: jaccard(self, slugSet(other)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.ext_id.localeCompare(b.ext_id))
    .slice(0, limit)
    .map((x) => x.ext_id);
}

export function needsComputedRelations(
  fields: ReadonlySet<string> | null | undefined,
): boolean {
  if (fields === null || fields === undefined) return true;
  return fields.has("variations") || fields.has("relatedExerciseIds");
}
