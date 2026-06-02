// Public API (Cloudflare Workers) and marketing site (Base44).
// Site: https://anatome.dev · API: https://api.anatome.dev

export const SITE_BASE = "https://anatome.dev";
export const PUBLIC_API = "https://api.anatome.dev";

/** OpenAPI 3.1 spec for Swagger UI / RapidAPI upload. */
export const OPENAPI_SPEC_URL = `${PUBLIC_API}/openapi`;

/** Legacy alias — prefer PUBLIC_API for Worker routes. */
export const API_BASE = PUBLIC_API;

/** Base44 serverless paths on the marketing site (aiDemo, entity-backed invokes). */
export const BASE44_FUNCTIONS = `${SITE_BASE}/functions`;

/** Build a Worker API URL (paths are root-mounted, not under /functions). */
export function apiUrl(pathAndQuery) {
  const s = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  return `${PUBLIC_API}${s}`;
}

/** Hosted 2-frame exercise GIF (`GET /exerciseGif?id=<ext_id>`). */
export function exerciseGifUrl(extId) {
  if (!extId) return null;
  return apiUrl(`/exerciseGif?id=${encodeURIComponent(extId)}`);
}

/** Best URL for exercise media from search/getExercise rows. */
export function exerciseMediaUrl(ex) {
  if (!ex) return null;
  if (ex.gif_url) return ex.gif_url;
  return exerciseGifUrl(ex.ext_id || ex.id);
}

/** Prefix relative Worker paths (e.g. /generateImage?...) with the public API host. */
export function absApiUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${PUBLIC_API}${url.startsWith("/") ? url : `/${url}`}`;
}
