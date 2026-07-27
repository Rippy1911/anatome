// Skill-progression guides — read-only views over the bundled CC-BY-4.0 catalog.
// Pure logic (no Request/Response) so it can be shared by the HTTP routes, the
// MCP tools and selfTest, mirroring lib/exercises.ts.

import {
  GUIDES, GUIDE_SLUGS, DEFAULT_GUIDE_SLUG,
  type Guide, type GuideTreeDoc, type GuideTreeSummary,
} from "../data/guideCatalog.ts";

/** Tracking issue for the defective free-exercise-db imagery licence chain. */
export const MEDIA_PROVENANCE_ISSUE =
  "https://github.com/NextSolutionsStudio/anatome/issues/21";

const DEFECTIVE_LICENCE_CLAIM = /^(cc0|public[-\s]?domain|unlicense)/i;

/**
 * Imagery derived from free-exercise-db carries a broken licence chain: the
 * upstream compiler scraped the photos and says so ("I do not own the copyright
 * for these images"), and the fork maintainer confirms he does not know their
 * origin. The public-domain dedication was applied downstream by someone who
 * never held the rights, so it is not ours to pass on. The exercise *metadata*
 * is genuinely offered under the Unlicense and is unaffected.
 *
 * The catalog now records these entries as unverified itself, so this is a no-op
 * for them and stays only as a guard: any entry that reaches us still asserting a
 * dedication the project cannot grant is downgraded to an unverified,
 * non-redistributable state on the way out. Every other field — and every other
 * media entry — passes through untouched, so honest provenance from the catalog
 * reaches consumers verbatim. See MEDIA_PROVENANCE_ISSUE.
 */
function fromFreeExerciseDb(m: Record<string, unknown>): boolean {
  const provider = String(m.provider || "");
  const source = String(m.source_url || "");
  const url = String(m.url || "");
  return provider === "anatome-gif"
    || source.includes("free-exercise-db")
    || /\/(exerciseGif|exerciseImage)\b/.test(url);
}

export function sanitizeMediaEntry(entry: unknown): unknown {
  if (!entry || typeof entry !== "object") return entry;
  const m = entry as Record<string, unknown>;
  if (!fromFreeExerciseDb(m)) return m;
  if (!DEFECTIVE_LICENCE_CLAIM.test(String(m.license || ""))) return m;
  return {
    ...m,
    license: "unverified",
    license_url: null,
    redistributable: false,
    tier: "unverified-provenance",
    attribution:
      `Source imagery of unknown origin, redistributed via free-exercise-db. The upstream `
      + `compiler states he does not hold the copyright to these images, so the licence `
      + `applied downstream cannot be relied on. Treat as not redistributable.`,
    license_note:
      `Licence claim withheld: the free-exercise-db dedication is not supported by its own `
      + `upstream, which disclaims ownership of the imagery. Tracking: ${MEDIA_PROVENANCE_ISSUE}`,
  };
}

function sanitizeSteps(steps: unknown): unknown {
  if (!Array.isArray(steps)) return steps;
  return steps.map((step) => {
    if (!step || typeof step !== "object") return step;
    const s = step as Record<string, unknown>;
    if (!Array.isArray(s.media)) return s;
    return { ...s, media: s.media.map(sanitizeMediaEntry) };
  });
}

/**
 * Accept only the slug shape the catalog actually uses: lowercase alnum words
 * joined by single hyphens. Rejects traversal (`..`, `%2e%2e` once decoded),
 * absolute paths, separators and empties without needing a path-normalisation
 * pass, because no caller ever concatenates a slug into a path.
 */
export function safeGuideSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (!s || s.length > 64) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) return null;
  return s;
}

/** Absolute muscle-diagram URL for a tree, built from its anatome_layers_payload. */
export function guideImageSrc(tree: GuideTreeDoc, base: string): string | null {
  const layers = tree.anatome_layers_payload;
  if (!base || !Array.isArray(layers) || !layers.length) return null;
  const compact = layers
    .filter((l) => l && l.color && Array.isArray(l.muscles) && l.muscles.length)
    .map((l) => `${l.color.replace(/^#/, "")}:${l.muscles.join(",")}`)
    .join("|");
  if (!compact) return null;
  return `${base}/generateImage?view=dual&layers=${encodeURIComponent(compact)}`;
}

function treeSummary(tree: GuideTreeDoc, guideSlug: string, base: string) {
  return {
    slug: tree.slug,
    name: tree.name,
    family: tree.family,
    difficulty: tree.difficulty,
    summary: tree.summary,
    prerequisites: tree.prerequisites || [],
    step_count: Array.isArray(tree.steps) ? tree.steps.length : 0,
    primary_muscles: tree.primary_muscles || [],
    anatome_imageSrc: guideImageSrc(tree, base),
    tree_url: base ? `${base}/getGuideTree?guide=${guideSlug}&tree=${tree.slug}` : null,
  };
}

function guideStats(guide: Guide) {
  const trees = Object.values(guide.trees);
  return {
    tree_count: trees.length,
    step_count: trees.reduce((n, t) => n + (Array.isArray(t.steps) ? t.steps.length : 0), 0),
  };
}

/** All bundled guides with headline counts. */
export function listGuides(base: string) {
  const guides = GUIDE_SLUGS.map((slug) => {
    const guide = GUIDES[slug];
    return {
      slug,
      name: guide.index.name,
      summary: guide.index.summary,
      ...guideStats(guide),
      difficulty_order: guide.index.difficulty_order,
      guide_url: base ? `${base}/getGuide?slug=${slug}` : null,
    };
  });
  return { count: guides.length, guides };
}

/** One guide: catalog metadata plus a summary row per skill tree. */
export function getGuide(slugRaw: unknown, base: string): {
  found: boolean;
  guide?: Record<string, unknown>;
} {
  const slug = safeGuideSlug(slugRaw);
  if (!slug) return { found: false };
  const guide = GUIDES[slug];
  if (!guide) return { found: false };

  // Preserve the catalog's own tree ordering (difficulty-curated), falling back
  // to whatever is bundled if the index and the files ever drift.
  const ordered: GuideTreeDoc[] = [];
  const seen = new Set<string>();
  for (const row of guide.index.trees as GuideTreeSummary[]) {
    const tree = guide.trees[row.slug];
    if (tree) { ordered.push(tree); seen.add(row.slug); }
  }
  for (const [treeSlug, tree] of Object.entries(guide.trees)) {
    if (!seen.has(treeSlug)) ordered.push(tree);
  }

  return {
    found: true,
    guide: {
      slug,
      name: guide.index.name,
      summary: guide.index.summary,
      schema_version: guide.index.schema_version,
      difficulty_order: guide.index.difficulty_order,
      sources_legend: guide.index.sources_legend || {},
      ...guideStats(guide),
      trees: ordered.map((t) => treeSummary(t, slug, base)),
    },
  };
}

/** One full skill tree, including every step. */
export function getGuideTree(guideRaw: unknown, treeRaw: unknown, base: string): {
  found: boolean;
  tree?: Record<string, unknown>;
} {
  const guideSlug = safeGuideSlug(guideRaw ?? DEFAULT_GUIDE_SLUG);
  const treeSlug = safeGuideSlug(treeRaw);
  if (!guideSlug || !treeSlug) return { found: false };
  const guide = GUIDES[guideSlug];
  if (!guide) return { found: false };
  const tree = guide.trees[treeSlug];
  if (!tree) return { found: false };

  // The source document carries its own `attribution` / `license` pair. Both
  // would collide with the response envelope: `attribution` means the MIT
  // body-path notice everywhere else in this API, and `license` means the
  // Apache-2.0 code licence. Re-key the long-form notice and let the envelope's
  // guide_catalog_* fields carry the CC-BY-4.0 terms.
  const { attribution: sourceNotice, license: _docLicense, ...doc } = tree;
  return {
    found: true,
    tree: {
      guide_slug: guideSlug,
      ...doc,
      steps: sanitizeSteps(doc.steps),
      anatome_imageSrc: guideImageSrc(tree, base),
      ...(sourceNotice ? { guide_catalog_attribution_detail: sourceNotice } : {}),
    },
  };
}

/** Total steps across every bundled guide (selfTest / diagnostics). */
export function guideStepCount(): number {
  return GUIDE_SLUGS.reduce((n, slug) => n + guideStats(GUIDES[slug]).step_count, 0);
}
