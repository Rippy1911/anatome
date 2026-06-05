// Public API (Cloudflare Workers) and marketing site (Base44).
// Site: https://anatome.dev · API: https://api.anatome.dev

export const SITE_BASE = "https://anatome.dev";
/** Override in `.env.local` with `VITE_PUBLIC_API=http://localhost:8787` for local Worker + GIFs. */
export const PUBLIC_API = import.meta.env.VITE_PUBLIC_API || "https://api.anatome.dev";

/** Bump when regenerating GIF frame timing — busts `Cache-Control: immutable` in browsers. */
const GIF_PLAYBACK_VERSION = "4";

/** OpenAPI 3.1 spec for Swagger UI / RapidAPI upload. */
export const OPENAPI_SPEC_URL = `${PUBLIC_API}/openapi`;

/** RapidAPI marketplace host for the Anatome API. */
export const RAPIDAPI_HOST = "anatome.p.rapidapi.com";

/** RapidAPI gateway base URL for the Anatome API. */
export const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}`;

/** Public RapidAPI marketplace listing for the Anatome API. */
export const RAPIDAPI_LISTING_URL = "https://rapidapi.com/slaczka.sebastian/api/anatome";

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
  const id = encodeURIComponent(extId);
  return apiUrl(`/exerciseGif?id=${id}&v=${GIF_PLAYBACK_VERSION}`);
}

/** Best URL for exercise media from search/getExercise rows. */
export function exerciseMediaUrl(ex) {
  if (!ex) return null;
  const raw = ex.gif_url || exerciseGifUrl(ex.ext_id || ex.id);
  if (!raw) return null;
  if (!String(raw).includes("/exerciseGif")) return raw;
  try {
    const base = raw.startsWith("http") ? undefined : PUBLIC_API;
    const u = new URL(raw, base);
    u.searchParams.set("v", GIF_PLAYBACK_VERSION);
    return u.toString();
  } catch {
    return raw;
  }
}

/** Prefix relative Worker paths (e.g. /generateImage?...) with the public API host. */
export function absApiUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${PUBLIC_API}${url.startsWith("/") ? url : `/${url}`}`;
}