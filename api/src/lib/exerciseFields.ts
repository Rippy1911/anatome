// Sparse field selection for exercise list/detail responses (bulk-friendly).

/** Fields available on exercise API payloads (see buildExerciseRecord). */
export const EXERCISE_FIELD_KEYS = [
  "id",
  "ext_id",
  "name",
  "force",
  "level",
  "mechanic",
  "equipment",
  "category",
  "primaryMuscles",
  "secondaryMuscles",
  "source_primaryMuscles",
  "source_secondaryMuscles",
  "anatome_primary_slugs",
  "anatome_secondary_slugs",
  "instructions",
  "images",
  "source_images",
  "image_url",
  "gif_url",
  "anatome_imageSrc",
  "anatome_layers_payload",
  "unmapped_source_muscle",
  "movementType",
  "keywords",
  "variations",
  "relatedExerciseIds",
] as const;

export type ExerciseFieldKey = (typeof EXERCISE_FIELD_KEYS)[number];

/**
 * Default projection for searchExercises — full free-exercise-db row + Anatome enrichments.
 * Omits only heavy computed relations (variations, relatedExerciseIds) and unmapped_source_muscle.
 * Use fields=variations,relatedExerciseIds or fields=all to add those.
 */
export const SEARCH_DEFAULT_FIELDS: ReadonlySet<ExerciseFieldKey> = new Set([
  "id",
  "ext_id",
  "name",
  "force",
  "level",
  "mechanic",
  "movementType",
  "equipment",
  "category",
  "primaryMuscles",
  "secondaryMuscles",
  "source_primaryMuscles",
  "source_secondaryMuscles",
  "anatome_primary_slugs",
  "anatome_secondary_slugs",
  "instructions",
  "images",
  "source_images",
  "image_url",
  "gif_url",
  "anatome_imageSrc",
  "anatome_layers_payload",
  "keywords",
]);

const KEY_SET = new Set<string>(EXERCISE_FIELD_KEYS);

/**
 * Parse `fields` query/body param.
 * - omitted → use `defaultFields`
 * - `all` or `*` → null (return every built field)
 * - comma list → only those keys (unknown keys ignored)
 */
export function parseFieldsParam(
  raw: string | null | undefined,
  defaultWhenOmitted: ReadonlySet<ExerciseFieldKey> | null,
): ReadonlySet<ExerciseFieldKey> | null {
  const s = String(raw ?? "").trim();
  if (!s) return defaultWhenOmitted;
  if (s === "all" || s === "*") return null;
  const picked = new Set<ExerciseFieldKey>();
  for (const part of s.split(",")) {
    const k = part.trim();
    if (KEY_SET.has(k)) picked.add(k as ExerciseFieldKey);
  }
  return picked.size ? picked : defaultWhenOmitted;
}

export function projectRecord(
  record: Record<string, unknown>,
  fields: ReadonlySet<ExerciseFieldKey> | null,
): Record<string, unknown> {
  if (fields === null) return record;
  const out: Record<string, unknown> = {};
  for (const k of fields) {
    if (k in record) out[k] = record[k];
  }
  // ext_id and name are always included — they are the primary identifier and
  // display name. Without ext_id a caller cannot make follow-up getExercise
  // calls, turning field-narrowed search results into dead ends.
  if ("ext_id" in record && !("ext_id" in out)) out["ext_id"] = record["ext_id"];
  if ("name" in record && !("name" in out)) out["name"] = record["name"];
  return out;
}
