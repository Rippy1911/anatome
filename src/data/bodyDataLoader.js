import { base44 } from "@/api/base44Client";

// Loads body path data via the getBodyData backend function (service-role read,
// works for anonymous public playground users). Cached in memory after first load.
// On error returns empty arrays so the playground renders an empty silhouette
// rather than crashing.
const EMPTY = { male: { front: [], back: [] }, female: { front: [], back: [] } };

let _cache = null;
let _promise = null;

export async function loadBodyData() {
  if (_cache) return _cache;
  if (_promise) return _promise;
  _promise = (async () => {
    try {
      const res = await base44.functions.invoke("getBodyData", {});
      _cache = res?.data?.data || EMPTY;
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