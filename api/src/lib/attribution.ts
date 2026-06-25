// Canonical attribution constants. Include in API responses only where the payload
// carries third-party data (MIT body paths or CC0 exercise records). Full legal
// metadata lives on GET / and in the OpenAPI info block.

export const ATTRIBUTION =
  "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";
export const ATTRIBUTION_SOURCE =
  "https://github.com/HichamELBSI/react-native-body-highlighter";
export const EXERCISE_DB_ATTRIBUTION =
  "Exercise data from free-exercise-db (CC0-1.0, public domain) by yuhonas.";
export const LICENSE = "Apache-2.0";

/** Service index — consolidated legal metadata for discovery (GET / only). */
export function serviceAttribution(): {
  attribution: string;
  attribution_source: string;
  exercise_db_attribution: string;
  license: string;
} {
  return {
    attribution: ATTRIBUTION,
    attribution_source: ATTRIBUTION_SOURCE,
    exercise_db_attribution: EXERCISE_DB_ATTRIBUTION,
    license: LICENSE,
  };
}

/** MIT body-path attribution — JSON responses that include rendered SVG.
 *  Keeps `license` for legal compliance (AGENTS.md §7); `built_by`/`try_also`
 *  are dropped as redundant. */
export function imageAttribution(): {
  attribution: string;
  attribution_source: string;
  license: string;
} {
  return {
    attribution: ATTRIBUTION,
    attribution_source: ATTRIBUTION_SOURCE,
    license: LICENSE,
  };
}

/** CC0 exercise-db attribution — responses that include exercise records.
 *  Keeps `license` for legal compliance (AGENTS.md §7); `built_by`/`try_also`
 *  are dropped as redundant. */
export function exerciseDataAttribution(): {
  exercise_db_attribution: string;
  license: string;
} {
  return {
    exercise_db_attribution: EXERCISE_DB_ATTRIBUTION,
    license: LICENSE,
  };
}
