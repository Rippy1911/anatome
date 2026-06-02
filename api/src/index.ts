// Anatome public API — Cloudflare Workers + Hono.
// Mirrors the Base44 functions (minus aiDemo, which stays internal-only).

import { Hono } from "hono";
import { cors } from "hono/cors";

import { renderMuscleSvg } from "./lib/muscleEngine.ts";
import { ANATOMICAL_NAMES, SIDE_PRESENCE, MUSCLES, BODY_REGION } from "./data/muscleCatalog.ts";
import { getBodyData } from "./lib/bodyData.ts";
import { payloadFromQuery, sha256 } from "./lib/query.ts";
import {
  searchExercisesLogic, formatExercise, lookupExerciseById, getByMuscle, getRandom, getByName,
  cleanExercise,
  resolveExercise as resolveEx,
  listEquipment, getMuscleInfo,
  type ExerciseRow,
} from "./lib/exercises.ts";
import { withEdgeCache } from "./lib/edgeCache.ts";
import { SEARCH_DEFAULT_FIELDS, parseFieldsParam } from "./lib/exerciseFields.ts";
import { workoutImageLogic, workoutImageSrc } from "./lib/workoutImage.ts";
import { checkRateLimit, rateHeaders, rateLimitBody, type Env } from "./lib/rateLimit.ts";
import { baseAttribution, exerciseAttribution, ATTRIBUTION, LICENSE, BUILT_BY, TRY_ALSO } from "./lib/attribution.ts";
import { buildOpenApiSpec } from "./routes/openapi.ts";
import { handleMcp, TOOLS } from "./routes/mcp.ts";
import { runSelfTest } from "./routes/selfTest.ts";
import { elapsedMs, renderTimingHeaders } from "./lib/timing.ts";

const CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, immutable";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["*"] }));

function baseUrl(c: { env: Env }): string {
  return c.env.PUBLIC_BASE_URL || "https://api.anatome.dev";
}

app.get("/", (c) => c.json({
  ok: true, service: "anatome-api", version: "2.0.0",
  endpoints: [
    "/generateImage", "/workoutImage", "/searchExercises", "/getExercise", "/resolveExercise",
    "/exerciseGif", "/listMuscles", "/muscleInfo", "/listEquipment", "/mcp", "/openapi", "/selfTest",
  ],
  ...baseAttribution(),
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
    ...baseAttribution(), duration_ms,
  }), { headers: { "Content-Type": "application/json", "Cache-Control": CACHE_CONTROL, ETag: etag, ...rateHeaders(rl), ...timing } });
}
app.get("/generateImage", (c) => withEdgeCache(c.req.raw, c.executionCtx, () => generateImage(c)));
app.post("/generateImage", (c) => generateImage(c));

// ---- listMuscles ----
app.get("/listMuscles", (c) => withEdgeCache(c.req.raw, c.executionCtx, () => {
  const muscles = MUSCLES.map((slug) => ({
    slug, name: ANATOMICAL_NAMES[slug], views: SIDE_PRESENCE[slug], body_region: BODY_REGION[slug] || null,
  }));
  return c.json({ ok: true, count: MUSCLES.length, muscles, attribution: ATTRIBUTION, license: LICENSE, built_by: BUILT_BY, try_also: TRY_ALSO });
}));

// ---- muscleInfo ----
app.get("/muscleInfo", (c) => withEdgeCache(c.req.raw, c.executionCtx, () => {
  const slug = c.req.query("slug");
  if (!slug) return c.json({ ok: false, error: "provide slug query param", ...baseAttribution() }, 400);
  const info = getMuscleInfo(slug, baseUrl(c));
  if (!info) return c.json({ ok: false, error: `unknown muscle slug: ${slug}`, ...baseAttribution() }, 404);
  return c.json({ ok: true, ...info, ...baseAttribution() });
}));

// ---- listEquipment ----
app.get("/listEquipment", (c) => withEdgeCache(c.req.raw, c.executionCtx, () => {
  const equipment = listEquipment();
  return c.json({ ok: true, count: equipment.length, equipment, ...exerciseAttribution() });
}));

// ---- searchExercises ----
app.get("/searchExercises", async (c) => {
  const rl = await checkRateLimit(c.req.raw, c.env);
  if (!rl.allowed) return c.json(rateLimitBody(rl), 429, { ...rateHeaders(rl), "Retry-After": String(rl.retry_after) });
  const extra = rateHeaders(rl);
  return withEdgeCache(c.req.raw, c.executionCtx, () => {
    const q = c.req.query();
    const base = baseUrl(c);
    const fields = parseFieldsParam(q.fields, SEARCH_DEFAULT_FIELDS);
    const { total, offset, limit, results } = searchExercisesLogic({
      q: q.q, muscle: q.muscle, equipment: q.equipment, level: q.level, limit: q.limit, offset: q.offset,
    });
    return c.json({
      ok: true, total_matched: total, offset, limit,
      results: results.map((e) => formatExercise(e, base, "search", fields)),
      ...exerciseAttribution(),
    }, 200, extra);
  }, extra);
});

// ---- exercise GIF (static assets: api/public/gifs/<ext_id>.gif) ----
app.get("/exerciseGif", async (c) => withEdgeCache(c.req.raw, c.executionCtx, async () => {
  const id = c.req.query("id");
  if (!id) return c.json({ ok: false, error: "id required (exercise ext_id)" }, 400);
  const assets = c.env.ASSETS;
  if (!assets) return c.json({ ok: false, error: "assets not configured" }, 503);
  const assetUrl = new URL(c.req.url);
  assetUrl.pathname = `/gifs/${id}.gif`;
  const res = await assets.fetch(new Request(assetUrl.toString(), { headers: { Accept: "image/gif" } }));
  if (res.status === 200) {
    return new Response(res.body, {
      status: 200,
      headers: { "Content-Type": "image/gif", "Cache-Control": CACHE_CONTROL },
    });
  }
  return c.json({
    ok: false,
    error: "gif not found",
    hint: "python3 scripts/generate-exercise-gifs.py",
    ext_id: id,
  }, 404);
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
app.get("/getExercise", async (c) => {
  const rl = await checkRateLimit(c.req.raw, c.env);
  if (!rl.allowed) return c.json(rateLimitBody(rl), 429, { ...rateHeaders(rl), "Retry-After": String(rl.retry_after) });
  const extra = rateHeaders(rl);
  return withEdgeCache(c.req.raw, c.executionCtx, async () => {
    const q = c.req.query();
    const base = baseUrl(c);
    const meta = exerciseAttribution();
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
  }, extra);
});

// ---- resolveExercise (GET + POST) ----
async function resolveRoute(c: { req: { raw: Request; query: () => Record<string, string> }; env: Env }): Promise<Response> {
  const req = c.req.raw;
  const rl = await checkRateLimit(req, c.env);
  if (!rl.allowed) return new Response(JSON.stringify(rateLimitBody(rl)), { status: 429, headers: { "Content-Type": "application/json", ...rateHeaders(rl), "Retry-After": String(rl.retry_after) } });
  let exercise = "";
  if (req.method === "POST") { try { const b = await req.json() as { exercise?: string }; exercise = b.exercise || ""; } catch { exercise = ""; } }
  else { exercise = c.req.query().exercise || ""; }
  const r = resolveEx(exercise, baseUrl(c));
  return new Response(JSON.stringify({
    ok: true, ...r,
    attribution: ATTRIBUTION, license: LICENSE, built_by: BUILT_BY, try_also: TRY_ALSO,
  }), { headers: { "Content-Type": "application/json", ...rateHeaders(rl) } });
}
app.get("/resolveExercise", (c) => resolveRoute(c));
app.post("/resolveExercise", (c) => resolveRoute(c));

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
    return c.json({ ok: false, error: "provide exercises array with at least one name", ...baseAttribution() }, 400, rateHeaders(rl));
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
    ...baseAttribution(),
  }, 200, rateHeaders(rl));
});

// ---- mcp (JSON-RPC) ----
app.get("/mcp", (c) => c.json({ ok: true, server: "anatome", version: "2.0.0", protocol: "mcp/2024-11-05", tools: TOOLS.map((t) => t.name) }));
app.post("/mcp", async (c) => {
  const rl = await checkRateLimit(c.req.raw, c.env);
  if (!rl.allowed) {
    const msg = rl.key_type === "host_day" ? `Rate limit exceeded: free tier ${rl.limit} req/day per public host. Upgrade via RapidAPI.` : `Rate limit exceeded: free tier ${rl.limit} req/day per IP. Upgrade via RapidAPI.`;
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: msg } }, 429, { "Retry-After": String(rl.retry_after) });
  }
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  return c.json(handleMcp(body as Parameters<typeof handleMcp>[0], baseUrl(c)));
});

// ---- openapi ----
app.get("/openapi", (c) => withEdgeCache(c.req.raw, c.executionCtx, () =>
  c.json(buildOpenApiSpec(baseUrl(c))),
));

// ---- selfTest ----
app.get("/selfTest", async (c) => {
  const result = await runSelfTest(getBodyData());
  return c.json(result, result.ok ? 200 : 500);
});

export default app;
