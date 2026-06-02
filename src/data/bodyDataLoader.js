import { base44 } from "@/api/base44Client";

// Loads body path data from the BodyData entity (single runtime source of truth).
// Cached in memory after first load.
let _cache = null;
let _promise = null;

export async function loadBodyData() {
  if (_cache) return _cache;
  if (_promise) return _promise;
  _promise = (async () => {
    const records = await base44.entities.BodyData.list();
    const map = {};
    for (const r of records) {
      map[r.key] = r.parts || [];
    }
    _cache = {
      male: { front: map.bodyFrontMale || [], back: map.bodyBackMale || [] },
      female: { front: map.bodyFrontFemale || [], back: map.bodyBackFemale || [] },
    };
    return _cache;
  })();
  return _promise;
}

export function getCachedBodyData() {
  return _cache;
}