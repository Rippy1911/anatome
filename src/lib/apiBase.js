// Public API (Cloudflare Workers) and the site itself (Cloudflare static assets).
// Site: https://anatome.dev · API: https://api.anatome.dev

export const SITE_BASE = "https://anatome.dev";

/** The hosted, fully featured product. Where "I need more than fair use" goes. */
export const PLATFORM_URL = "https://platform.anatome.dev";

/** Keep in step with FAIR_USE_DAILY_LIMIT in api/wrangler.toml. Displayed, never enforced here. */
export const FAIR_USE_PER_DAY = 50;

/** The one string a user has to copy to connect an assistant. */
export const MCP_ENDPOINT = `${import.meta.env.VITE_PUBLIC_API || "https://api.anatome.dev"}/mcp`;
/** Override in `.env.local` with `VITE_PUBLIC_API=http://localhost:8787` for local Worker + GIFs. */
export const PUBLIC_API = import.meta.env.VITE_PUBLIC_API || "https://api.anatome.dev";

/** Bump when regenerating GIF frame timing — busts `Cache-Control: immutable` in browsers. */
const GIF_PLAYBACK_VERSION = "5";

/** OpenAPI 3.1 spec, for Swagger UI or any generator. */
export const OPENAPI_SPEC_URL = `${PUBLIC_API}/openapi`;

/** Legacy alias — prefer PUBLIC_API for Worker routes. */
export const API_BASE = PUBLIC_API;

/** Build a Worker API URL. */
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

/** Strip Base44 legacy `/functions/` prefix before embedding Worker URLs. */
function normalizeLegacyFunctionPath(url) {
  if (!url) return url;
  if (url.startsWith("/functions/")) return url.replace(/^\/functions/, "");
  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/functions/")) {
      u.pathname = u.pathname.replace(/^\/functions/, "");
      return u.toString();
    }
  } catch {
    /* relative */
  }
  return url;
}

/** Prefix relative Worker paths (e.g. /generateImage?...) with the public API host. */
export function absApiUrl(url) {
  if (!url) return null;
  const normalized = normalizeLegacyFunctionPath(url);
  if (normalized.startsWith("http")) return normalized;
  return `${PUBLIC_API}${normalized.startsWith("/") ? normalized : `/${normalized}`}`;
}
