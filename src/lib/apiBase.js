// Canonical public API base (Cloudflare Workers — production).
export const PUBLIC_API = "https://api.anatome.dev";

/** OpenAPI 3.1 spec for Swagger UI / RapidAPI upload. */
export const OPENAPI_SPEC_URL = `${PUBLIC_API}/openapi`;

// Legacy Base44 function host — still used for some playground invokes until fully migrated.
// window.location.origin is unreliable inside the preview/sandbox iframe (the
// /functions/* raw-image routes are not served from the sandbox host), so for
// anything embedded directly via <img src> we always point at the live app domain.
export const API_BASE = "https://anatome-form-flow.base44.app";