import { PUBLIC_API } from "@/lib/apiBase";

/** @typedef {"direct"} SearchDemoSource */

/**
 * @typedef {object} SearchDemoResult
 * @property {boolean} ok
 * @property {object[]} results
 * @property {number | null} totalMatched
 * @property {number} latencyMs
 * @property {string} sourceId
 * @property {string} sourceLabel
 * @property {number | null} upstreamMs
 * @property {boolean} [rateLimited]
 * @property {string} [error]
 */

/** The landing demo calls the public API directly. There is no other channel to choose from. */
export const SEARCH_DEMO_SOURCES = [
  { id: "direct", label: "api.anatome.dev", description: "Direct Worker" },
];

/**
 * Run searchExercises on api.anatome.dev.
 * @returns {Promise<SearchDemoResult>}
 */
export async function fetchSearchDemo({ source: _source, baseUrl = PUBLIC_API, q, limit = 6, signal }) {
  const params = new URLSearchParams({ limit: String(limit) });
  const trimmed = String(q ?? "").trim();
  if (trimmed) params.set("q", trimmed);
  const sourceId = "direct";
  const meta = SEARCH_DEMO_SOURCES[0];
  const url = `${baseUrl}/searchExercises?${params}`;

  const t0 = performance.now();
  let res;
  try {
    res = await fetch(url, signal ? { signal } : undefined);
  } catch (e) {
    if (e?.name === "AbortError") {
      return {
        ok: false,
        results: [],
        totalMatched: null,
        latencyMs: Math.round(performance.now() - t0),
        sourceId,
        sourceLabel: meta.label,
        upstreamMs: null,
        error: "aborted",
      };
    }
    return {
      ok: false,
      results: [],
      totalMatched: null,
      latencyMs: Math.round(performance.now() - t0),
      sourceId,
      sourceLabel: meta.label,
      upstreamMs: null,
      error: e?.message || "network error",
    };
  }

  const latencyMs = Math.round(performance.now() - t0);
  let data;
  try {
    data = await res.json();
  } catch {
    return {
      ok: false,
      results: [],
      totalMatched: null,
      latencyMs,
      sourceId,
      sourceLabel: meta.label,
      upstreamMs: null,
      error: "invalid JSON",
    };
  }

  const rateLimited = res.status === 429 || data?.error === "rate_limited" || data?.error === "quota_exceeded";
  const failed = !res.ok || data?.ok === false;
  return {
    ok: !failed,
    results: data?.results || [],
    totalMatched: data?.total_matched ?? null,
    latencyMs,
    sourceId,
    sourceLabel: meta.label,
    upstreamMs: null,
    rateLimited,
    error: failed ? (data?.message || data?.error || `HTTP ${res.status}`) : undefined,
  };
}
