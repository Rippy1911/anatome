// Canonical attribution constants. Include in API responses only where the payload
// carries third-party data (MIT body paths or free-exercise-db records). Full legal
// metadata lives on GET / and in the OpenAPI info block.
//
// The free-exercise-db split matters and is easy to get wrong: the *metadata* is a
// compilation its author genuinely offers under the Unlicense, but the *photography*
// was scraped and the upstream compiler says so ("I do not own the copy right for
// these images"). A dedication cannot be granted by someone who never held the
// right, so we describe the imagery as unverified rather than repeating the claim.
// See https://github.com/Rippy1911/anatome/issues/48.

export const ATTRIBUTION =
  "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";
export const ATTRIBUTION_SOURCE =
  "https://github.com/HichamELBSI/react-native-body-highlighter";
export const EXERCISE_DB_ATTRIBUTION =
  "Exercise metadata from free-exercise-db by yuhonas, offered under the Unlicense. "
  + "The bundled photography is NOT covered: its origin is unverified and it is not "
  + "cleared for redistribution.";
export const LICENSE = "Apache-2.0";
export const GUIDE_CATALOG_ATTRIBUTION =
  "Skill progressions from the Anatome calisthenics catalog by NextSolutions (CC-BY-4.0).";
export const GUIDE_CATALOG_SOURCE =
  "https://github.com/Rippy1911/anatome/tree/main/api/data/guides";
/** The catalog content is CC-BY-4.0 even though the API code is Apache-2.0. */
export const GUIDE_CATALOG_LICENSE = "CC-BY-4.0";

/** Service index — consolidated legal metadata for discovery (GET / only). */
export function serviceAttribution(): {
  attribution: string;
  attribution_source: string;
  exercise_db_attribution: string;
  guide_catalog_attribution: string;
  guide_catalog_license: string;
  license: string;
} {
  return {
    attribution: ATTRIBUTION,
    attribution_source: ATTRIBUTION_SOURCE,
    exercise_db_attribution: EXERCISE_DB_ATTRIBUTION,
    guide_catalog_attribution: GUIDE_CATALOG_ATTRIBUTION,
    guide_catalog_license: GUIDE_CATALOG_LICENSE,
    license: LICENSE,
  };
}

/** CC-BY-4.0 skill-catalog attribution — responses that include guide content.
 *  `license` stays Apache-2.0 (the API code); `guide_catalog_license` carries
 *  the content licence, which CC-BY requires us to name explicitly. */
export function guideCatalogAttribution(): {
  guide_catalog_attribution: string;
  guide_catalog_attribution_source: string;
  guide_catalog_license: string;
  license: string;
} {
  return {
    guide_catalog_attribution: GUIDE_CATALOG_ATTRIBUTION,
    guide_catalog_attribution_source: GUIDE_CATALOG_SOURCE,
    guide_catalog_license: GUIDE_CATALOG_LICENSE,
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

/** free-exercise-db attribution — responses that include exercise records.
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
