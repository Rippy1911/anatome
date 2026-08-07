// Minimal Cloudflare Cache API shim for the plain-node vitest run.
//
// `caches.default` is a Workers global. Without it, every route wrapped in withEdgeCache — which
// is most of them — threw ReferenceError and returned 500 under test. That did not fail the
// suite, because the tests that touched those routes only asserted headers, so a whole class of
// route behaviour was effectively untested while looking covered.
//
// This is a store, not a cache: no TTL, no eviction, no `Cache-Control` parsing. It is enough
// to exercise HIT/MISS paths deterministically. Anything that depends on real edge semantics
// belongs in a workerd-backed test, not here.

const store = new Map<string, { body: string; status: number; statusText: string; headers: [string, string][] }>();

function keyOf(request: RequestInfo | URL): string {
  if (typeof request === "string") return request;
  if (request instanceof URL) return request.toString();
  return (request as Request).url;
}

const cache = {
  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    const entry = store.get(keyOf(request));
    if (!entry) return undefined;
    return new Response(entry.body, {
      status: entry.status,
      statusText: entry.statusText,
      headers: new Headers(entry.headers),
    });
  },
  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    const body = await response.clone().text();
    store.set(keyOf(request), {
      body,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
    });
  },
  async delete(request: RequestInfo | URL): Promise<boolean> {
    return store.delete(keyOf(request));
  },
};

(globalThis as unknown as { caches: unknown }).caches = {
  default: cache,
  open: async () => cache,
};

/** Tests that assert MISS-then-HIT need a clean slate. */
export function clearEdgeCache(): void {
  store.clear();
}
