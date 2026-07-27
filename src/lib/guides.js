// Skill-progression catalog access for /guides.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS IS THE ONLY FILE THAT KNOWS WHERE THE CATALOG COMES FROM.
//
// api.anatome.dev serves the catalog and is the source of truth. A bundled
// CC-BY-4.0 snapshot in src/data/guides/calisthenics/ backs it up so the page
// still renders when the Worker is unreachable — but the snapshot is a copy and
// will drift, so a fallback is a degraded read, not an equivalent one.
// ─────────────────────────────────────────────────────────────────────────────

import { PUBLIC_API, apiUrl } from "@/lib/apiBase";

/**
 * Worker routes for the catalog: `/listGuides`, `/getGuide?slug=`,
 * `/getGuideTree?guide=&tree=`, following the flat camelCase convention of the rest
 * of that API. All three are live.
 *
 * The API nests trees under a guide, hence the constant: this page shows the
 * calisthenics guide. Point `GUIDE_SLUG` elsewhere, or make it a route param, when a
 * second catalog ships.
 */
const GUIDE_SLUG = "calisthenics";

const CATALOG_ENDPOINTS = {
  index: [`/getGuide?slug=${GUIDE_SLUG}`],
  tree: [(slug) => `/getGuideTree?guide=${GUIDE_SLUG}&tree=${encodeURIComponent(slug)}`],
};

/** Both routes answer `{ found, guide }` / `{ found, tree }`; the snapshot is bare. */
const unwrapIndex = (json) => (json?.guide ?? json);
const unwrapTree = (json) => (json?.tree ?? json);

/** Give up on a probe quickly — the page must not hang behind a dead endpoint. */
const PROBE_TIMEOUT_MS = 2500;

/** Which candidate answered, remembered for the session so later reads skip the race. */
const resolvedEndpoint = { index: null, tree: null };

/**
 * When a probe last found nothing. A miss suppresses the next few probes so a browsing
 * session does not pay the timeout on every navigation — but it expires, because the
 * routes are live: a miss now means a blip, not a verdict. Remembering it for the whole
 * session would pin the reader to the snapshot until reload, hiding catalog corrections
 * behind a copy that is only as fresh as the last deploy.
 */
const missedAt = { index: 0, tree: 0 };
const MISS_TTL_MS = 30_000;
const recentlyMissed = (kind) => Date.now() - missedAt[kind] < MISS_TTL_MS;

// Relative on purpose: Vite resolves `import.meta.glob` patterns from this file, not aliases.
// It is a compile-time macro, so the call must stay literal — wrapping `import.meta` in a
// type cast stops Vite rewriting it and it fails at runtime. Hence the ts-ignore instead:
// `tsc` runs without Vite's client types in this repo.
const snapshotIndex = () => import("../data/guides/calisthenics/_index.json");
// @ts-ignore -- import.meta.glob is provided by Vite
const snapshotTrees = import.meta.glob("../data/guides/calisthenics/*.json");

function snapshotTreeLoader(slug) {
  const match = Object.entries(snapshotTrees).find(([path]) =>
    path.endsWith(`/${slug}.json`),
  );
  return match?.[1] ?? null;
}

async function probe(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl(path), {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Catalog index: the tree list plus the shared timeline/pattern defaults and the
 * citation registry. Resolves to `{ data, source, error }` — never throws, so the
 * page shell always renders.
 */
export async function loadGuideIndex() {
  if (!recentlyMissed("index")) {
    const candidates = resolvedEndpoint.index
      ? [resolvedEndpoint.index]
      : CATALOG_ENDPOINTS.index;

    // Raced, not sequential: walking candidates in series would leave the page on
    // skeletons for several seconds whenever one of them is slow to fail.
    const hit = await Promise.all(
      candidates.map(async (path) => ({ path, json: unwrapIndex(await probe(path)) })),
    ).then((rs) => rs.find((r) => r.json?.trees?.length));

    if (hit) {
      resolvedEndpoint.index = hit.path;
      missedAt.index = 0;
      return { data: hit.json, source: "api", error: null };
    }
    missedAt.index = Date.now();
  }

  try {
    const mod = await snapshotIndex();
    return { data: mod.default ?? mod, source: "snapshot", error: null };
  } catch (err) {
    return { data: null, source: "none", error: err?.message || "Catalog unavailable" };
  }
}

/** One skill tree by slug. Same contract as `loadGuideIndex`. */
export async function loadGuideTree(slug) {
  if (!slug) return { data: null, source: "none", error: "No tree requested" };

  if (!recentlyMissed("tree")) {
    const builders = resolvedEndpoint.tree
      ? [resolvedEndpoint.tree]
      : CATALOG_ENDPOINTS.tree;

    const hit = await Promise.all(
      builders.map(async (build) => ({ build, json: unwrapTree(await probe(build(slug))) })),
    ).then((rs) => rs.find((r) => r.json?.steps?.length));

    if (hit) {
      resolvedEndpoint.tree = hit.build;
      missedAt.tree = 0;
      return { data: hit.json, source: "api", error: null };
    }
    missedAt.tree = Date.now();
  }

  const loader = snapshotTreeLoader(slug);
  if (!loader) return { data: null, source: "none", error: "notfound" };

  try {
    const mod = await loader();
    return { data: mod.default ?? mod, source: "snapshot", error: null };
  } catch (err) {
    return { data: null, source: "none", error: err?.message || "Tree unavailable" };
  }
}

// ── Media policy ────────────────────────────────────────────────────────────

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MEDIA SWITCHES LIVE HERE AND NOWHERE ELSE.
 *
 * `showUnverifiedProvenanceMedia` is the operator's call, not the code's. The
 * exercise GIFs served by api.anatome.dev come from free-exercise-db, whose
 * rights chain is defective: the upstream collection states the images were
 * taken from the internet without established rights, and the fork maintainer
 * confirms the origin is unknown. The public-domain dedication downstream was
 * applied by someone who never held the rights, so we do not rely on it.
 *
 * Default is the conservative behaviour — such media is not displayed at all.
 * Flip this to `true` to show it again; nothing else needs to change. Either
 * way the UI never presents this media as reusable.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const MEDIA_POLICY = {
  showUnverifiedProvenanceMedia: false,

  /**
   * Which curated roles may be embedded inline. Anything else is offered as a
   * labelled outbound reference instead, so a same-family or wrong-family clip
   * is never passed off as a demonstration of this step.
   */
  embeddableRoles: ["demo"],
};

/**
 * Locally generated AI demo GIFs. Rejected on review — the frames showed the
 * wrong movements — and stripped from the bundled snapshot. Filtered here too so
 * that an API still serving them cannot put them back on the page.
 */
const REJECTED_PROVIDERS = new Set(["cali-gif"]);

/**
 * Providers whose imagery has a known-defective rights chain. Distrusted whatever
 * licence string arrives with them — this is the regression guard against the
 * free-exercise-db public-domain claim reappearing from an upstream refresh.
 */
const UNVERIFIED_IMAGE_PROVIDERS = new Set(["anatome-gif"]);

/** `rejected` | `embed-only` | `unverified` | `free` */
export function mediaProvenance(m) {
  if (!m) return "rejected";
  if (REJECTED_PROVIDERS.has(m.provider) || /^assets\/gifs\//.test(m.url || "")) {
    return "rejected";
  }
  if (m.provider === "youtube") return "embed-only";
  // Either signal is enough: the catalog's own verdict, or our standing distrust of the
  // provider. Unknown media is unverified until it proves otherwise, never the reverse.
  if (m.provenance?.status === "defective") return "unverified";
  if (UNVERIFIED_IMAGE_PROVIDERS.has(m.provider)) return "unverified";
  if (m.redistributable === true && m.license && !/unverified/i.test(m.license)) return "free";
  return "unverified";
}

export const isAiGenerated = (m) => m?.ai_generated === true;

const isVideo = (m) => m?.provider === "youtube" || /youtu\.?be/.test(m?.url || "");
const isGif = (m) => m?.provider === "anatome-gif" || /\.gif(\?|$)/i.test(m?.url || "");

/** Media we are willing to put on the page at all, under the current policy. */
export function displayableMedia(media) {
  return (media || []).filter((m) => {
    const state = mediaProvenance(m);
    if (state === "rejected") return false;
    if (state === "unverified") return MEDIA_POLICY.showUnverifiedProvenanceMedia;
    return true;
  });
}

const isEmbeddable = (m) => MEDIA_POLICY.embeddableRoles.includes(m?.role ?? "demo");

export const stepHasGif = (step) => displayableMedia(step?.media).some(isGif);

/** True when at least one step in the tree can show a GIF — gates the Video|GIF toggle. */
export const treeHasGif = (tree) => (tree?.steps || []).some(stepHasGif);

/**
 * Resolve what to show for a step under the current preference and media policy.
 *
 * Returns `{ mode, media, alternate, note, reference }`.
 * - `mode: "video" | "gif"` — embed `media`; `note` explains any fallback.
 * - `mode: "none"` — nothing is safe to embed. `reference` carries a related clip
 *   to link out to, with its role, when one exists.
 *
 * With unverified media switched off this returns `"none"` for most steps, which
 * is the honest state today: no step has motion media we can redistribute.
 */
export function pickStepMedia(media, preference = "video") {
  const items = displayableMedia(media);
  const videos = items.filter(isVideo);
  const gifs = items.filter(isGif);

  const video = videos.find(isEmbeddable) || null;
  const gif = gifs.find(isEmbeddable) || null;

  const none = () => ({
    mode: "none",
    media: null,
    alternate: null,
    note: null,
    reference: videos.find((m) => !isEmbeddable(m)) || null,
  });

  if (preference === "gif") {
    if (gif) return { mode: "gif", media: gif, alternate: video, note: null, reference: null };
    if (video) {
      return {
        mode: "video",
        media: video,
        alternate: null,
        note: "No GIF for this step — showing the video demo.",
        reference: null,
      };
    }
    return none();
  }

  if (video) return { mode: "video", media: video, alternate: gif, note: null, reference: null };
  if (gif) {
    return {
      mode: "gif",
      media: gif,
      alternate: null,
      note: "No video for this step — showing the demo image.",
      reference: null,
    };
  }
  return none();
}

const YOUTUBE_ID = /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/;

/**
 * Privacy-preserving embed URL, clipped to the curated segment.
 * Embeds only — clips stream from the creator's channel and are never re-hosted.
 */
export function youTubeEmbedUrl(media) {
  const id = media?.url?.match(YOUTUBE_ID)?.[1];
  if (!id) return null;

  const params = new URLSearchParams({ rel: "0", modestbranding: "1" });
  const start = Number(media.start_seconds);
  const end = Number(media.end_seconds);
  if (Number.isFinite(start) && start > 0) params.set("start", String(Math.floor(start)));
  if (Number.isFinite(end) && end > start) params.set("end", String(Math.ceil(end)));

  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}

/** Human label for a curated clip, e.g. "0:45–1:10". */
export function clipLabel(media) {
  const start = Number(media?.start_seconds);
  const end = Number(media?.end_seconds);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return `${fmt(start)}–${fmt(end)}`;
}

// ── Muscle diagrams ─────────────────────────────────────────────────────────

/**
 * Anatome muscle diagram for a tree's hand-curated `anatome_layers_payload`.
 * Public, key-free, CORS `*` — safe to use directly as an `<img src>`.
 */
export function muscleDiagramUrl(layers, { view = "dual", width = 420, gender = "male" } = {}) {
  const encoded = (layers || [])
    .filter((l) => l?.color && l.muscles?.length)
    .map((l) => `${String(l.color).replace(/^#/, "")}:${l.muscles.join(",")}`)
    .join("|");
  if (!encoded) return null;

  const params = new URLSearchParams({
    gender,
    view,
    width: String(width),
    output: "raw",
  });
  return `${PUBLIC_API}/generateImage?${params}&layers=${encodeURIComponent(encoded)}`;
}

// ── Display helpers ─────────────────────────────────────────────────────────

export const DIFFICULTY_ORDER = ["beginner", "intermediate", "advanced", "elite"];

/**
 * "8–12 weeks" / "5–9 months" / "2–4 years". Weeks read badly past a few months, and
 * these are honest ranges rather than measurements — so years are rounded to the
 * nearest half rather than carrying a spurious decimal.
 */
export function formatWeekRange(range) {
  const min = Number(range?.min);
  const max = Number(range?.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (max < 12) return `${min}–${max} weeks`;
  if (max < 104) return `${Math.round(min / 4.345)}–${Math.round(max / 4.345)} months`;
  const toYears = (w) => {
    const halves = Math.round((w / 52) * 2) / 2;
    return Number.isInteger(halves) ? String(halves) : halves.toFixed(1);
  };
  return `${toYears(min)}–${toYears(max)} years`;
}

/** Resolve `source_ids` against the catalog citation registry. */
export function resolveSources(ids, registry) {
  if (!ids?.length || !registry?.length) return [];
  return ids.map((id) => registry.find((s) => s.id === id)).filter(Boolean);
}
