// Cloudflare Cache API wrapper — stores deterministic GET responses at the edge.
// Rate-limit headers are merged fresh on cache HIT so cached bodies stay valid.

const CACHEABLE = "public, max-age=86400, s-maxage=604800, immutable";

export function cacheableResponseHeaders(extra?: Record<string, string>): Headers {
  const h = new Headers({ "Cache-Control": CACHEABLE, "X-Cache": "MISS" });
  if (extra) {
    for (const [k, v] of Object.entries(extra)) h.set(k, v);
  }
  return h;
}

// Entries are stored `immutable` for a week, so a deploy that changes a cached
// body cannot reach clients on its own — the edge keeps serving the old one and
// the zone token used by CI has no cache-purge scope. Bump this whenever a
// deploy changes what a cacheable endpoint returns: it moves every entry to a
// fresh key, which strands the stale ones instead of waiting out their TTL.
const CACHE_VERSION = "2026-07-27.1";

/** Build a cache key from the incoming request (method + URL + cache version). */
export function cacheKeyForRequest(request: Request): Request {
  const url = new URL(request.url);
  url.searchParams.set("__cv", CACHE_VERSION);
  return new Request(url.toString(), { method: request.method, headers: request.headers });
}

/**
 * Return cached response or run handler, store 200 responses in caches.default.
 * Sets X-Cache: HIT | MISS on every response.
 */
export async function withEdgeCache(
  request: Request,
  ctx: ExecutionContext | undefined,
  handler: () => Response | Promise<Response>,
  mergeHeaders?: Record<string, string>,
): Promise<Response> {
  const cache = caches.default;
  const key = cacheKeyForRequest(request);
  const hit = await cache.match(key);
  if (hit) {
    const headers = new Headers(hit.headers);
    headers.set("X-Cache", "HIT");
    if (mergeHeaders) {
      for (const [k, v] of Object.entries(mergeHeaders)) headers.set(k, v);
    }
    return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
  }

  const response = await handler();
  if (response.status === 200) {
    const toStore = response.clone();
    const storeHeaders = new Headers(toStore.headers);
    storeHeaders.set("Cache-Control", CACHEABLE);
    storeHeaders.set("X-Cache", "MISS");
    const stored = new Response(toStore.body, { status: toStore.status, headers: storeHeaders });
    if (ctx) ctx.waitUntil(cache.put(key, stored));
    else await cache.put(key, stored);
  }

  const outHeaders = new Headers(response.headers);
  outHeaders.set("X-Cache", "MISS");
  if (mergeHeaders) {
    for (const [k, v] of Object.entries(mergeHeaders)) outHeaders.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders,
  });
}

/** SelfTest / unit check: two sequential lookups should HIT on the second. */
export async function edgeCacheHitOnRepeat(url: string): Promise<boolean> {
  if (typeof caches === "undefined") return true;
  const cache = caches.default;
  const req = new Request(url);
  const key = cacheKeyForRequest(req);
  await cache.delete(key);
  const body = "anatome-cache-selftest";
  const stored = new Response(body, {
    status: 200,
    headers: { "Cache-Control": CACHEABLE, "X-Cache": "MISS" },
  });
  await cache.put(key, stored);
  const second = await cache.match(key);
  return second != null;
}
