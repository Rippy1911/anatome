// Anatome public API — Cloudflare Workers + Hono.
// Mirrors the Base44 functions (minus aiDemo, which stays internal-only).

import { Hono } from "hono";
import { cors } from "hono/cors";

import { renderMuscleSvg } from "./lib/muscleEngine.ts";
import { ANATOMICAL_NAMES, SIDE_PRESENCE, MUSCLES, BODY_REGION, ANTAGONISTS } from "./data/muscleCatalog.ts";
import { getBodyData } from "./lib/bodyData.ts";
import { payloadFromQuery, sha256 } from "./lib/query.ts";import {
  searchExercisesLogic, formatExercise, lookupExerciseById, getByMuscle, getRandom, getByName,
  cleanExercise,
  resolveExercise as resolveEx,
  listEquipment, getMuscleInfo,
  sanitizeFreeExerciseDbPath, freeExerciseDbRawUrl,
  type ExerciseRow,
} from "./lib/exercises.ts";
import { withEdgeCache } from "./lib/edgeCache.ts";
import { SEARCH_DEFAULT_FIELDS, parseFieldsParam } from "./lib/exerciseFields.ts";
import { workoutImageLogic, workoutImageSrc } from "./lib/workoutImage.ts";
import { checkRateLimit, bypassCheck, rateHeaders, rateLimitBody, nextUtcMidnightUnix, IP_DAY_LIMIT, clientIp, isPrivateIp, type Env } from "./lib/rateLimit.ts";
import { RateLimiterDO } from "./lib/rateLimiterDO.ts";
// Re-export the Durable Object class so wrangler can bind it as the DO entrypoint.
export { RateLimiterDO };
import { serviceAttribution, imageAttribution, exerciseDataAttribution } from "./lib/attribution.ts";
import { buildOpenApiSpec } from "./routes/openapi.ts";
import { handleMcp, computeMcpResult, TOOLS, type McpBody } from "./routes/mcp.ts";
import { runSelfTest } from "./routes/selfTest.ts";
import { fetchCiStatus } from "./routes/ciStatus.ts";
import { rapidapiSearchBenchmark } from "./routes/rapidapiBenchmark.ts";
import { elapsedMs, renderTimingHeaders } from "./lib/timing.ts";
import { logRequest } from "./lib/observability.ts";

const CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, immutable";
/** GIFs are regenerated in-place; avoid immutable so timing fixes can roll out. */
const GIF_CACHE_CONTROL = "public, max-age=86400, s-maxage=86400";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["*"] }));

// Security headers (launch-readiness §2: missing X-Frame-Options / Permissions-Policy
// were a flagged finding on the Base44 side; bake the same hardening into the Worker).
// Applied to every response, including errors, via `await next()`.
app.use("*", async (c, next) => {
  await next();
  c.header("X-Frame-Options", "DENY");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

// Structured request logging (Workers Observability). One JSON line per request:
// method, path, status, duration, and edge-cache HIT/MISS. Skips OPTIONS.
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  const start = performance.now();
  await next();
  const cacheHeader = c.res.headers.get("X-Cache");
  logRequest({
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    duration_ms: elapsedMs(start),
    cache: cacheHeader === "HIT" ? "HIT" : cacheHeader === "MISS" ? "MISS" : undefined,
  });
});

function baseUrl(c: { env: Env }): string {
  return c.env.PUBLIC_BASE_URL || "https://api.anatome.dev";
}

app.get("/", (c) => c.json({
  ok: true, service: "anatome-api", version: "2.0.0",
  endpoints: [
    "/generateImage", "/workoutImage", "/searchExercises", "/getExercise", "/resolveExercise",
    "/exerciseGif", "/exerciseImage", "/listMuscles", "/muscleInfo", "/listEquipment", "/mcp", "/openapi", "/ciStatus", "/selfTest",
  ],
  ...serviceAttribution(),
}));

// ---- generateImage (GET query + POST JSON) ----
async function generateImage(c: { req: { raw: Request }; env: Env }): Promise<Response> {
  const req = c.req.raw;
  const rl = await checkRateLimit(req, c.env);
  if (!rl.allowed) {
    return new Response(JSON.stringify(rateLimitBody(rl)), { status: 429, headers: { "Content-Type": "application/json", ...rateHeaders(rl), "Retry-After": String(rl.retry_after) } });
  }
  const url = new URL(req.url);
  let payload: Record<string, unknown> = {};
  if (req.method === "POST") { try { payload = await req.json(); } catch { payload = {}; } }
  else { payload = payloadFromQuery(url) as Record<string, unknown>; }

  const t0 = performance.now();
  const { svg, muscles_rendered } = renderMuscleSvg(payload, getBodyData());
  const duration_ms = elapsedMs(t0);
  const timing = renderTimingHeaders(duration_ms);

  const etag = `"a-${await sha256(svg)}"`;
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": CACHE_CONTROL, ...rateHeaders(rl) } });
  }
  const output = (payload as { output?: string }).output === "raw" ? "raw" : "json";
  const gender = (payload as { gender?: string }).gender === "female" ? "female" : "male";
  const view = ["front", "back", "dual"].includes((payload as { view?: string }).view as string) ? (payload as { view?: string }).view : "dual";

  if (output === "raw") {
    return new Response(svg, { status: 200, headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": CACHE_CONTROL, ETag: etag, ...rateHeaders(rl), ...timing } });
  }
  return new Response(JSON.stringify({
    ok: true, svg, format: "svg", gender, view, muscles_rendered,
    available_muscles_count: MUSCLES.length,
    rate_limit: { source: rl.source, limit_type: rl.key_type, remaining: rl.remaining != null ? rl.remaining : null, limit: rl.limit, reset_at: rl.reset_at },
    ...imageAttribution(), duration_ms,
  }), { headers: { "Content-Type": "application/json", "Cache-Control": CACHE_CONTROL, ETag: etag, ...rateHeaders(rl), ...timing } });
}
app.get("/generateImage", (c) => withEdgeCache(c.req.raw, c.executionCtx, () => generateImage(c)));
app.post("/generateImage", (c) => generateImage(c));

// ---- listMuscles ----
app.get("/listMuscles", (c) => withEdgeCache(c.req.raw, c.executionCtx, () => {
  const muscles = MUSCLES.map((slug) => ({
    slug,
    name: ANATOMICAL_NAMES[slug],
    views: SIDE_PRESENCE[slug],
    body_region: BODY_REGION[slug] || null,
    antagonists: ANTAGONISTS[slug] || [],
  }));
  return c.json({ ok: true, count: MUSCLES.length, muscles });
}));

// ---- muscleInfo ----
app.get("/muscleInfo", (c) => withEdgeCache(c.req.raw, c.executionCtx, () => {
  const slug = c.req.query("slug");
  if (!slug) return c.json({ ok: false, error: "provide slug query param", ...imageAttribution() }, 400);
  const info = getMuscleInfo(slug, baseUrl(c));
  if (!info) return c.json({ ok: false, error: `unknown muscle slug: ${slug}`, ...imageAttribution() }, 404);
  return c.json({ ok: true, ...info, ...imageAttribution() });
}));

// ---- listEquipment ----
app.get("/listEquipment", (c) => withEdgeCache(c.req.raw, c.executionCtx, () => {
  const equipment = listEquipment();
  return c.json({ ok: true, count: equipment.length, equipment, ...exerciseDataAttribution() });
}));

// ---- searchExercises ----
// Cache-first: a cache HIT serves the cached body and skips the KV rate-limit
// counter entirely (enforcement already ran when the cache entry was created).
// Bypass callers (RapidAPI / MCP trusted / localhost) still get correct
// "unlimited" headers on HITs via bypassCheck, which touches no KV. The real
// per-day counter runs only on MISS, inside the handler.
app.get("/searchExercises", (c) => {
  const hitHeaders = rateHeaders(bypassCheck(c.req.raw, c.env) ?? { allowed: true, limit: IP_DAY_LIMIT, remaining: 0, reset: nextUtcMidnightUnix() });
  return withEdgeCache(c.req.raw, c.executionCtx, async () => {
    const rl = await checkRateLimit(c.req.raw, c.env);
    if (!rl.allowed) return c.json(rateLimitBody(rl), 429, { ...rateHeaders(rl), "Retry-After": String(rl.retry_after) });
    const extra = rateHeaders(rl);
    const q = c.req.query();
    const base = baseUrl(c);
    const fields = parseFieldsParam(q.fields, SEARCH_DEFAULT_FIELDS);
    const { total, offset, limit, next_cursor, results } = searchExercisesLogic({
      q: q.q,
      muscle: q.muscle,
      equipment: q.equipment,
      level: q.level,
      limit: q.limit,
      offset: q.offset,
      cursor: q.cursor,
    });
    return c.json({
      ok: true,
      total_matched: total,
      offset,
      limit,
      next_cursor,
      results: results.map((e) => formatExercise(e, base, "search", fields)),
      ...exerciseDataAttribution(),
    }, 200, extra);
  }, hitHeaders);
});

// ---- RapidAPI benchmark proxy (marketing site latency comparison; not in OpenAPI) ----
app.get("/benchmark/rapidapiSearch", async (c) => {
  const rl = await checkRateLimit(c.req.raw, c.env);
  if (!rl.allowed) {
    return c.json(rateLimitBody(rl), 429, { ...rateHeaders(rl), "Retry-After": String(rl.retry_after) });
  }
  return rapidapiSearchBenchmark(c.req.query(), c.env);
});

// ---- exercise GIF (static assets: api/public/gifs/<ext_id>.gif) ----
app.get("/exerciseGif", async (c) => withEdgeCache(c.req.raw, c.executionCtx, async () => {
  const id = c.req.query("id");
  if (!id) return c.json({ ok: false, error: "id required (exercise ext_id)" }, 400);
  // ext_id is derived from exercise names (alnum + _ -). Reject anything else to
  // make the asset path explicit and block `/gifs/../`-style probing.
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return c.json({ ok: false, error: "invalid id" }, 400);
  const assets = c.env.ASSETS;
  if (!assets) return c.json({ ok: false, error: "assets not configured" }, 503);
  const assetUrl = new URL(c.req.url);
  assetUrl.pathname = `/gifs/${id}.gif`;
  const res = await assets.fetch(new Request(assetUrl.toString(), { headers: { Accept: "image/gif" } }));
  if (res.status === 200) {
    return new Response(res.body, {
      status: 200,
      headers: { "Content-Type": "image/gif", "Cache-Control": GIF_CACHE_CONTROL },
    });
  }
  return c.json({
    ok: false,
    error: "gif not found",
    hint: "python3 scripts/generate-exercise-gifs.py",
    ext_id: id,
  }, 404);
}));

// ---- exercise reference photo (free-exercise-db, CC0) ----
// Proxies the source JPEGs through Anatome's host so consumers (incl. RapidAPI)
// don't hotlink raw.githubusercontent.com. `path` is the relative image path
// stored on each exercise (e.g. "Barbell_Bench_Press_-_Medium_Grip/0.jpg").
app.get("/exerciseImage", async (c) => withEdgeCache(c.req.raw, c.executionCtx, async () => {
  const path = c.req.query("path");
  if (!path) return c.json({ ok: false, error: "path required (exercise images[] entry)" }, 400);
  const safe = sanitizeFreeExerciseDbPath(path);
  if (!safe) return c.json({ ok: false, error: "invalid path" }, 400);
  const upstream = freeExerciseDbRawUrl(safe);
  if (!upstream) return c.json({ ok: false, error: "invalid path" }, 400);
  const res = await fetch(upstream, { headers: { Accept: "image/jpeg" } });
  if (!res.ok || !res.body) {
    return c.json({ ok: false, error: "image not found", status: res.status, path: safe }, 404);
  }
  const headers: Record<string, string> = {
    "Content-Type": res.headers.get("Content-Type") || "image/jpeg",
    "Cache-Control": CACHE_CONTROL,
  };
  return new Response(res.body, { status: 200, headers });
}));

// ---- getExercise (4 modes) ----
function fullExercise(
  e: ExerciseRow | null,
  base: string,
  fields: ReturnType<typeof parseFieldsParam>,
) {
  if (!e) return null;
  const cleaned = cleanExercise(e) as ExerciseRow;
  const row = { ...cleaned };
  delete (row as { name_lower?: string }).name_lower;
  return formatExercise(row, base, "full", fields);
}
app.get("/getExercise", (c) => {
  const hitHeaders = rateHeaders(bypassCheck(c.req.raw, c.env) ?? { allowed: true, limit: IP_DAY_LIMIT, remaining: 0, reset: nextUtcMidnightUnix() });
  return withEdgeCache(c.req.raw, c.executionCtx, async () => {
    const rl = await checkRateLimit(c.req.raw, c.env);
    if (!rl.allowed) return c.json(rateLimitBody(rl), 429, { ...rateHeaders(rl), "Retry-After": String(rl.retry_after) });
    const extra = rateHeaders(rl);
    const q = c.req.query();
    const base = baseUrl(c);
    const meta = exerciseDataAttribution();
    const limit = Math.min(Number(q.limit || 10), 50);
    const fields = parseFieldsParam(q.fields, null);

    if (q.id) {
      const { exercise, match } = lookupExerciseById(q.id);
      return c.json({ ok: !!exercise, match, exercise: fullExercise(exercise, base, fields), ...meta }, exercise ? 200 : 404, extra);
    }
    if (q.muscle) { const list = getByMuscle(q.muscle, limit); return c.json({ ok: true, muscle: q.muscle.toLowerCase(), count: list.length, exercises: list.map((e) => fullExercise(e, base, fields)), ...meta }, 200, extra); }
    if (q.random) { const rec = getRandom(); return c.json({ ok: !!rec, match: rec ? "random" : "none", exercise: fullExercise(rec, base, fields), ...meta }, rec ? 200 : 404, extra); }
    if (q.name) { const m = getByName(q.name); return c.json({ ok: !!m.exercise, match: m.match, exercise: fullExercise(m.exercise, base, fields), ...meta }, m.exercise ? 200 : 404, extra); }
    return c.json({ ok: false, error: "provide one of: id, name, random=1, muscle", ...meta }, 400, extra);
  }, hitHeaders);
});

// ---- resolveExercise (GET + POST) ----
// GET is cache-first (deterministic exercise -> muscle mapping): a cache HIT
// serves the cached body and skips the KV rate-limit counter, mirroring
// searchExercises/getExercise. POST is never cached (body not in URL).
async function resolveRouteInner(c: { req: { raw: Request; query: () => Record<string, string> }; env: Env }): Promise<Response> {
  const req = c.req.raw;
  const rl = await checkRateLimit(req, c.env);
  if (!rl.allowed) return new Response(JSON.stringify(rateLimitBody(rl)), { status: 429, headers: { "Content-Type": "application/json", ...rateHeaders(rl), "Retry-After": String(rl.retry_after) } });
  let exercise = "";
  if (req.method === "POST") { try { const b = await req.json() as { exercise?: string }; exercise = b.exercise || ""; } catch { exercise = ""; } }
  else { exercise = c.req.query().exercise || ""; }
  const r = resolveEx(exercise, baseUrl(c));
  return new Response(JSON.stringify({
    ok: true, ...r,
    ...exerciseDataAttribution(),
  }), { headers: { "Content-Type": "application/json", ...rateHeaders(rl) } });
}
app.get("/resolveExercise", (c) => {
  const hitHeaders = rateHeaders(bypassCheck(c.req.raw, c.env) ?? { allowed: true, limit: IP_DAY_LIMIT, remaining: 0, reset: nextUtcMidnightUnix() });
  return withEdgeCache(c.req.raw, c.executionCtx, () => resolveRouteInner(c), hitHeaders);
});
app.post("/resolveExercise", (c) => resolveRouteInner(c));

// ---- workoutImage (POST JSON) ----
app.post("/workoutImage", async (c) => {
  const rl = await checkRateLimit(c.req.raw, c.env);
  if (!rl.allowed) {
    return c.json(rateLimitBody(rl), 429, { ...rateHeaders(rl), "Retry-After": String(rl.retry_after) });
  }
  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { body = {}; }
  const exercises = Array.isArray(body.exercises) ? body.exercises.map(String) : [];
  if (!exercises.length) {
    return c.json({ ok: false, error: "provide exercises array with at least one name", ...imageAttribution() }, 400, rateHeaders(rl));
  }
  const base = baseUrl(c);
  const result = workoutImageLogic({
    exercises,
    gender: body.gender as string | undefined,
    view: body.view as string | undefined,
    width: body.width != null ? Number(body.width) : undefined,
    height: body.height != null ? Number(body.height) : undefined,
  }, getBodyData());
  const counts = result.per_muscle_count;
  const slugs = Object.keys(counts);
  const per_muscle = Object.fromEntries(
    slugs.map((slug) => [slug, { fill: "#DC2626", opacity: counts[slug] >= 3 ? 1 : counts[slug] === 2 ? 0.65 : 0.4 }]),
  );
  const anatome_imageSrc = workoutImageSrc({
    gender: result.gender,
    view: result.view,
    layers: slugs.length ? [{ color: "#DC2626", muscles: slugs }] : [],
    per_muscle,
  }, base);
  const output = body.output === "raw" ? "raw" : "json";
  if (output === "raw") {
    return new Response(result.svg, {
      status: 200,
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": CACHE_CONTROL, ...rateHeaders(rl) },
    });
  }
  return c.json({
    ok: true, ...result, anatome_imageSrc,
    ...imageAttribution(),
  }, 200, rateHeaders(rl));
});

// ---- mcp (JSON-RPC) ----
app.get("/mcp", (c) => c.json({ ok: true, server: "anatome", version: "2.0.0", protocol: "mcp/2024-11-05", tools: TOOLS.map((t) => t.name) }));
app.post("/mcp", async (c) => {
  const rl = await checkRateLimit(c.req.raw, c.env);
  if (!rl.allowed) {
    const msg = rl.key_type === "host_day"
      ? `Rate limit exceeded (${rl.limit}/day per host). Basic on RapidAPI: 300/month included, $0.001/request overage.`
      : `Rate limit exceeded (${rl.limit}/day per IP). Basic on RapidAPI: 300/month included, $0.001/request overage.`;
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: msg } }, 429, { "Retry-After": String(rl.retry_after) });
  }
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  const parsed = body as McpBody;
  const base = baseUrl(c);

  // Cache deterministic tools/call results in the edge cache, keyed by
  // method+params (NOT the JSON-RPC id, which varies per request). The cached
  // inner result is re-wrapped with the live id. Skip non-deterministic calls
  // (get_exercise with random=true) and non-tools/call methods.
  const isCacheableCall =
    parsed.method === "tools/call" &&
    !(parsed.params?.name === "get_exercise" && parsed.params?.arguments?.random);

  if (isCacheableCall) {
    const keyStr = `mcp:${parsed.method}:${JSON.stringify(parsed.params || {})}`;
    const cacheKey = new Request(`https://cache.anatome.dev/mcp/${await sha256(keyStr)}`);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) {
      const inner = (await hit.json()) as { ok: boolean; result?: unknown; error?: { code: number; message: string } };
      const out = inner.ok
        ? { jsonrpc: "2.0", id: parsed.id ?? null, result: inner.result }
        : { jsonrpc: "2.0", id: parsed.id ?? null, error: inner.error };
      return c.json(out);
    }
    const inner = computeMcpResult(parsed.method, parsed.params || {}, base);
    if (inner.ok) {
      const stored = new Response(JSON.stringify(inner), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
      c.executionCtx.waitUntil(cache.put(cacheKey, stored));
    }
    const out = inner.ok
      ? { jsonrpc: "2.0", id: parsed.id ?? null, result: inner.result }
      : { jsonrpc: "2.0", id: parsed.id ?? null, error: inner.error };
    return c.json(out);
  }

  return c.json(handleMcp(parsed, base));
});

// ---- openapi ----
app.get("/openapi", (c) => withEdgeCache(c.req.raw, c.executionCtx, () =>
  c.json(buildOpenApiSpec(baseUrl(c))),
));

// ---- selfTest ----
// Diagnostic endpoint: gate to private IPs (dev/testing) or a valid
// ADMIN_TOKEN bearer (launch-readiness §2: "gated selfTest"). Returns 404 to
// avoid advertising the endpoint to unauthorized callers. Set ADMIN_TOKEN via
// `wrangler secret put ADMIN_TOKEN`.
app.get("/selfTest", async (c) => {
  const ip = clientIp(c.req.raw);
  const privateCaller = isPrivateIp(ip);
  const auth = c.req.header("authorization") || "";
  const tokenMatch = auth.match(/^Bearer\s+(.+)$/i);
  const tokenOk = !!(tokenMatch && c.env.ADMIN_TOKEN && tokenMatch[1] === c.env.ADMIN_TOKEN);
  if (!privateCaller && !tokenOk) return c.json({ ok: false, error: "not found" }, 404);
  const result = await runSelfTest(getBodyData());
  return c.json(result, result.ok ? 200 : 500);
});

// ---- ciStatus ----
// Public CI health for the private anatome GitHub repo (server-side token
// keeps the browser off GitHub's API; see routes/ciStatus.ts). Edge-cached for
// 60s so it's cheap and well under GitHub rate limits. Degrades to a static
// "CI on GitHub" pointer when GITHUB_TOKEN is unset — never errors out.
app.get("/ciStatus", async (c) => {
  const cache = caches.default;
  const key = new Request("https://cache.anatome.dev/ciStatus");
  const hit = await cache.match(key);
  if (hit) {
    const body = await hit.json() as { ok: boolean; state: string; label: string; url: string; run_number: number | null; updated_at: string | null };
    return c.json({ ...body, cached: true }, 200, { "Cache-Control": "public, max-age=30, s-maxage=60", "X-Cache": "HIT" });
  }
  const status = await fetchCiStatus(c.env);
  const stored = new Response(JSON.stringify(status), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=30, s-maxage=60", "X-Cache": "MISS" } });
  c.executionCtx.waitUntil(cache.put(key, stored));
  return c.json(status, 200, { "Cache-Control": "public, max-age=30, s-maxage=60", "X-Cache": "MISS" });
});

export default app;
