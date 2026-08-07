import { apiUrl } from "@/lib/apiBase";

// Anatomical path data for the client-side body renderer (playground hit-testing and hover).
// Served by the public API's /bodyPaths, which is static, edge-cached and unmetered — so this
// costs the visitor nothing against fair use, and a self-hosted deployment gets it from its own
// Worker with no extra wiring.
//
// Fetched lazily and cached in memory. On failure we return empty arrays so the playground
// draws an empty silhouette rather than crashing.
const EMPTY = { male: { front: [], back: [] }, female: { front: [], back: [] } };

let _cache = null;
let _promise = null;

export async function loadBodyData() {
  if (_cache) return _cache;
  if (_promise) return _promise;
  _promise = (async () => {
    try {
      const res = await fetch(apiUrl("/bodyPaths"));
      if (!res.ok) throw new Error(`bodyPaths ${res.status}`);
      const json = await res.json();
      _cache = json?.data || EMPTY;
    } catch (e) {
      console.error("loadBodyData failed:", e);
      _cache = EMPTY;
    }
    return _cache;
  })();
  return _promise;
}

export function getCachedBodyData() {
  return _cache;
}
