// Canonical attribution envelope. These fields MUST appear in every public API
// response and MUST NOT be removed (see ../../AGENTS.md §7).
//
// License normalization (per project decision): Anatome's OWN license is Apache-2.0.
// Third-party data licenses are unchanged and described in the attribution text:
//   - anatomical paths: MIT (react-native-body-highlighter / Hicham El Boussarghini)
//   - exercise data:    CC0-1.0 (free-exercise-db / yuhonas)

export const ATTRIBUTION =
  "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";
export const ATTRIBUTION_SOURCE =
  "https://github.com/HichamELBSI/react-native-body-highlighter";
export const EXERCISE_DB_ATTRIBUTION =
  "Exercise data from free-exercise-db (CC0-1.0, public domain) by yuhonas.";
export const LICENSE = "Apache-2.0";
export const BUILT_BY = "NextSolutions — nextsolutions.studio";
export const TRY_ALSO = "AI fitness coach at airon.coach";

/** Base attribution block included in every response. */
export function baseAttribution(): {
  attribution: string;
  attribution_source: string;
  license: string;
  built_by: string;
  try_also: string;
} {
  return {
    attribution: ATTRIBUTION,
    attribution_source: ATTRIBUTION_SOURCE,
    license: LICENSE,
    built_by: BUILT_BY,
    try_also: TRY_ALSO,
  };
}

/**
 * Attribution block for exercise-data responses. Keeps the legacy
 * `exercise_db_attribution` field for backwards compatibility with existing
 * consumers, in addition to the canonical fields.
 */
export function exerciseAttribution() {
  return {
    ...baseAttribution(),
    exercise_db_attribution: EXERCISE_DB_ATTRIBUTION,
  };
}
