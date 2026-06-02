// Anatome public API — Cloudflare Workers + Hono.
// Mirrors the Base44 functions (minus aiDemo, which stays internal-only).

import { Hono } from "hono";
import { cors } from "hono/cors";

import { renderMuscleSvg } from "./lib/muscleEngine.ts";
import { listMuscles as listMusclesCatalog } from "./lib/muscleEngine.ts";
import { ANATOMICAL_NAMES, SIDE_PRESENCE, MUSCLES } from "./data/muscleCatalog.ts";
import { getBodyData } from "./lib/bodyData.ts";
import { payloadFromQuery, sha256 } from "./lib/query.ts";
import {
  searchExercisesLogic, searchResult, getByExtId, getByMuscle, getRandom, getByName,
  cleanExercise, absoluteImageSrc, exerciseDbImageUrl, resolveExercise as resolveEx,
  type ExerciseRow,
} from "./lib/exercises.ts";
import { checkRateLimit, rateHeaders, rateLimitBody, type Env } from "./lib/rateLimit.ts";
import { baseAttribution, exerciseAttribution, ATTRIBUTION, LICENSE, BUILT_BY, TRY_ALSO } from "./lib/attribution.ts";
import { buildOpenApiSpec } from "./routes/openapi.ts";
import { handleMcp, TOOLS } from "./routes/mcp.ts";
import { runSelfTest } from "./routes/selfTest.ts";

const CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, immutable";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["*"] }));

function baseUrl(c: { env: Env }): string {
  return c.env.PUBLIC_BASE_URL || "https://api.anatome.dev";
}

app.get("/", (c) => c.json({ ok: true, service: "anatome-api", version: "2.0.0", endpoints: ["/generateImage", "/searchExercises", "/getExercise", "/resolveExercise", "/listMuscles", "/mcp", "/openapi", "/selfTest"], ...baseAttribution() }));

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

  const t0 = Date.now();
  const { svg, muscles_rendered } = renderMuscleSvg(payload, getBodyData());
  const duration_ms = Date.now() - t0;

  const etag = `"a-${await sha256(svg)}"`;
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": CACHE_CONTROL, ...rateHeaders(rl) } });
  }
  const output = (payload as { output?: string }).output === "raw" ? "raw" : "json";
  const gender = (payload as { gender?: string }).gender === "female" ? "female" : "male";
  const view = ["front", "back", "dual"].includes((payload as { view?: string }).view as string) ? (payload as { view?: string }).view : "dual";

  if (output === "raw") {
    return new Response(svg, { status: 200, headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": CACHE_CONTROL, ETag: etag, ...rateHeaders(rl) } });
  }
  return new Response(JSON.stringify({
    ok: true, svg, format: "svg", gender, view, muscles_rendered,
    available_muscles_count: MUSCLES.length,
    rate_limit: { source: rl.source, limit_type: rl.key_type, remaining: rl.remaining != null ? rl.remaining : null, limit: rl.limit, reset_at: rl.reset_at },
    ...baseAttribution(), duration_ms,
  }), { headers: { "Content-Type": "application/json", "Cache-Control": CACHE_CONTROL, ETag: etag, ...rateHeaders(rl) } });
}
app.get("/generateImage", (c) => generateImage(c));
app.post("/generateImage", (c) => generateImage(c));

// ---- listMuscles ----
app.get("/listMuscles", (c) => {
  const muscles = MUSCLES.map((slug) => ({ slug, name: ANATOMICAL_NAMES[slug], views: SIDE_PRESENCE[slug] }));
  return c.json({ ok: true, count: MUSCLES.length, muscles, attribution: ATTRIBUTION, license: LICENSE, built_by: BUILT_BY, try_also: TRY_ALSO });
});

// ---- searchExercises ----
app.get("/searchExercises", async (c) => {
  const rl = await checkRateLimit(c.req.raw, c.env);
  if (!rl.allowed) return c.json(rateLimitBody(rl), 429, { ...rateHeaders(rl), "Retry-After": String(rl.retry_after) });
  const q = c.req.query();
  const { total, results } = searchExercisesLogic({ q: q.q, muscle: q.muscle, equipment: q.equipment, level: q.level, limit: q.limit });
  const base = baseUrl(c);
  return c.json({ ok: true, total_matched: total, results: results.map((e) => searchResult(e, base)), ...exerciseAttribution() }, 200, rateHeaders(rl));
});

// ---- getExercise (4 modes) ----
function fullExercise(e: ExerciseRow | null, base: string) {
  if (!e) return null;
  const cleaned = cleanExercise(e) as ExerciseRow;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { name_lower, ...rest } = cleaned;
  return { ...rest, image_url: exerciseDbImageUrl(e.images), anatome_imageSrc: absoluteImageSrc(e.anatome_imageSrc, base) };
}
app.get("/getExercise", async (c) => {
  const rl = await checkRateLimit(c.req.raw, c.env);
  if (!rl.allowed) return c.json(rateLimitBody(rl), 429, { ...rateHeaders(rl), "Retry-After": String(rl.retry_after) });
  const q = c.req.query();
  const base = baseUrl(c);
  const meta = exerciseAttribution();
  const limit = Math.min(Number(q.limit || 10), 50);

  if (q.id) { const rec = getByExtId(q.id); return c.json({ ok: !!rec, exercise: fullExercise(rec, base), ...meta }, rec ? 200 : 404, rateHeaders(rl)); }
  if (q.muscle) { const list = getByMuscle(q.muscle, limit); return c.json({ ok: true, muscle: q.muscle.toLowerCase(), count: list.length, exercises: list.map((e) => fullExercise(e, base)), ...meta }, 200, rateHeaders(rl)); }
  if (q.random) { const rec = getRandom(); return c.json({ ok: !!rec, exercise: fullExercise(rec, base), ...meta }, rec ? 200 : 404, rateHeaders(rl)); }
  if (q.name) { const m = getByName(q.name); return c.json({ ok: !!m.exercise, match: m.match, exercise: fullExercise(m.exercise, base), ...meta }, m.exercise ? 200 : 404, rateHeaders(rl)); }
  return c.json({ ok: false, error: "provide one of: id, name, random=1, muscle", ...meta }, 400, rateHeaders(rl));
});

// ---- resolveExercise (GET + POST) ----
async function resolveRoute(c: { req: { raw: Request; query: () => Record<string, string> }; env: Env }): Promise<Response> {
  const req = c.req.raw;
  const rl = await checkRateLimit(req, c.env);
  if (!rl.allowed) return new Response(JSON.stringify(rateLimitBody(rl)), { status: 429, headers: { "Content-Type": "application/json", ...rateHeaders(rl), "Retry-After": String(rl.retry_after) } });
  let exercise = "";
  if (req.method === "POST") { try { const b = await req.json() as { exercise?: string }; exercise = b.exercise || ""; } catch { exercise = ""; } }
  else { exercise = c.req.query().exercise || ""; }
  const r = resolveEx(exercise);
  return new Response(JSON.stringify({ ok: true, ...r, attribution: ATTRIBUTION, license: LICENSE, built_by: BUILT_BY, try_also: TRY_ALSO }), { headers: { "Content-Type": "application/json", ...rateHeaders(rl) } });
}
app.get("/resolveExercise", (c) => resolveRoute(c));
app.post("/resolveExercise", (c) => resolveRoute(c));

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
app.get("/openapi", (c) => c.json(buildOpenApiSpec(baseUrl(c))));

// ---- selfTest ----
app.get("/selfTest", (c) => {
  const result = runSelfTest(getBodyData());
  return c.json(result, result.ok ? 200 : 500);
});

export default app;
