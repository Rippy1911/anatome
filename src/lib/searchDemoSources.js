import { PUBLIC_API, RAPIDAPI_HOST } from "@/lib/apiBase";

/** @typedef {"direct" | "rapidapi"} SearchDemoSource */

/**
 * @typedef {object} SearchDemoResult
 * @property {boolean} ok
 * @property {object[]} results
 * @property {number | null} totalMatched
 * @property {number} latencyMs
 * @property {string} sourceId
 * @property {string} sourceLabel
 * @property {number | null} upstreamMs
 * @property {number | null} [rapidapiStatus]
 * @property {string} [error]
 */

export const SEARCH_DEMO_SOURCES = [
  { id: "direct", label: "api.anatome.dev", description: "Direct Worker" },
  { id: "rapidapi", label: "RapidAPI", description: RAPIDAPI_HOST },
];

/**
 * Run searchExercises via direct API or RapidAPI benchmark proxy.
 * @returns {Promise<SearchDemoResult>}
 */
export async function fetchSearchDemo({ source, baseUrl = PUBLIC_API, q, limit = 6 }) {
  const params = new URLSearchParams({ limit: String(limit) });
  const trimmed = String(q ?? "").trim();
  if (trimmed) params.set("q", trimmed);
  const sourceId = source === "rapidapi" ? "rapidapi" : "direct";
  const meta = SEARCH_DEMO_SOURCES.find((s) => s.id === sourceId) || SEARCH_DEMO_SOURCES[0];

  const url =
    sourceId === "rapidapi"
      ? `${baseUrl}/benchmark/rapidapiSearch?${params}`
      : `${baseUrl}/searchExercises?${params}`;

  const t0 = performance.now();
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
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

  const upstreamMs = data?._benchmark?.upstream_ms ?? null;

  const failed = !res.ok || data?.ok === false;
  return {
    ok: !failed,
    results: data?.results || [],
    totalMatched: data?.total_matched ?? null,
    latencyMs,
    sourceId,
    sourceLabel: meta.label,
    upstreamMs,
    rapidapiStatus: data?._benchmark?.rapidapi_status ?? null,
    error: failed ? (data?.message || data?.error || `HTTP ${res.status}`) : undefined,
  };
}
