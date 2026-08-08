// Anatome public API — Cloudflare Workers + Hono.
// Mirrors the Base44 functions (minus aiDemo, which stays internal-only).

import { Hono } from "hono";
import { cors } from "hono/cors";

import { renderMuscleSvg } from "./lib/muscleEngine.ts";
import { ANATOMICAL_NAMES, SIDE_PRESENCE, MUSCLES, BODY_REGION, ANTAGONISTS } from "./data/muscleCatalog.ts";
import { getBodyData } from "./lib/bodyData.ts";
import { payloadFromQuery, sha256 } from "./lib/query.ts";
import {
  searchExercisesLogic, formatExercise, lookupExerciseById, getByMuscle, getRandom, getByName,
  cleanExercise,
  resolveExercise as resolveEx,
  listEquipment, getMuscleInfo,
  sanitizeFreeExerciseDbPath, wrkoutRawUrl,
  type ExerciseRow,
} from "./lib/exercises.ts";
import { withEdgeCache } from "./lib/edgeCache.ts";
import { SEARCH_DEFAULT_FIELDS, parseFieldsParam } from "./lib/exerciseFields.ts";
import { workoutImageLogic, workoutImageSrc } from "./lib/workoutImage.ts";
import {
  clientIp, isPrivateIp, rateHeaders, rateLimitMessage, upgradeUrl,
  fairUseLimit, type Env, type RateResult,
} from "./lib/rateLimit.ts";
import { RateLimiterDO } from "./lib/rateLimiterDO.ts";
// Re-export the Durable Object class so wrangler can bind it as the DO entrypoint.
export { RateLimiterDO };
import { serviceAttribution, imageAttribution, exerciseDataAttribution, guideCatalogAttribution } from "./lib/attribution.ts";
import { listGuides as listGuidesLogic, getGuide as getGuideLogic, getGuideTree as getGuideTreeLogic, safeGuideSlug } from "./lib/guides.ts";
import { DEFAULT_GUIDE_SLUG } from "./data/guideCatalog.ts";
import { buildOpenApiSpec } from "./routes/openapi.ts";
import { handleMcp, computeMcpResult, TOOLS, MCP_PROTOCOL_VERSION, guideWipNotice, type McpBody } from "./routes/mcp.ts";
import { runSelfTest } from "./routes/selfTest.ts";
import { fetchCiStatus } from "./routes/ciStatus.ts";
import { rapidapiSearchBenchmark } from "./routes/rapidapiBenchmark.ts";
import { getAdminStats, postAdminRateLimitReset } from "./routes/admin.ts";
import { API_VERSION } from "./lib/version.ts";
import type { DbEnv } from "./lib/db.ts";
import { hasDb } from "./lib/db.ts";
import {
  authorizationServerMetadata, getAuthorize, postAuthorize, postRevoke, postToken,
  protectedResourceMetadata, registerClient, unauthorizedWithDiscovery,
} from "./routes/oauth.ts";
import {
  availableLoggingTools, callLoggingTool, isLoggingTool, registerPersonalRoutes,
} from "./routes/personal.ts";
import { identifyRequest } from "./lib/auth.ts";
import { accountPage, accountAction, accountExport, accountLogout } from "./routes/account.ts";
import { renderViewPage, handleViewAction } from "./routes/view.ts";
import { elapsedMs, renderTimingHeaders } from "./lib/timing.ts";
import { logRequest } from "./lib/observability.ts";
import { gateMetered, noteUsage, execCtx } from "./lib/meter.ts";

const CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, immutable";
/** GIFs are regenerated in-place; avoid immutable so timing fixes can roll out. */
const GIF_CACHE_CONTROL = "public, max-age=86400, s-maxage=86400";

// Bindings are DbEnv: everything in Env, plus an OPTIONAL `DB`. Optional is the point — with no
// database bound the Worker still serves the whole catalog API and simply has no accounts.
const app = new Hono<{ Bindings: DbEnv }>();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["*"],
}));

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
  ok: true, service: "anatome-api", version: API_VERSION,
  endpoints: [
    "/generateImage", "/workoutImage", "/searchExercises", "/getExercise", "/resolveExercise",
    "/exerciseGif", "/exerciseImage", "/listMuscles", "/muscleInfo", "/listEquipment", "/bodyPaths",
    "/listGuides", "/getGuide", "/getGuideTree",
    "/mcp", "/openapi", "/ciStatus", "/selfTest",
    "/admin/stats", "/admin/rate-limit/reset",
  ],
  auth: {
    scheme: "none",
    detail: "Keyless. The catalog needs no account; personal logging uses OAuth 2.1 with dynamic client registration, so there is still nothing to paste.",
    fair_use: `${fairUseLimit(c.env)} requests per day per caller, resetting at 00:00 UTC.`,
    oauth: hasDb(c.env) ? `${baseUrl(c)}/.well-known/oauth-authorization-server` : null,
    rapidapi: "X-RapidAPI-Proxy-Secret (marketplace listing only)",
  },
  what_it_does: hasDb(c.env)
    ? "Log and search meals, workouts, supplements and body weight by conversation; render muscle diagrams and session heatmaps; share a dashboard."
    : "Render muscle diagrams and session heatmaps; search an 873-exercise database. No database bound, so this deployment has no accounts or logging.",
  mcp: { endpoint: `${baseUrl(c)}/mcp`, transport: "streamable-http", protocol_version: MCP_PROTOCOL_VERSION },
  more: upgradeUrl(c.env),
  ...serviceAttribution(),
}));

// Agent discovery: a stable, machine-readable pointer at the MCP endpoint so a crawler or an
// assistant that lands on the domain can find the connector without reading marketing copy.
app.get("/.well-known/mcp.json", (c) => c.json({
  name: "anatome",
  title: "Anatome — nutrition & training log",
  description: "Free, keyless nutrition and workout logging for AI assistants: log meals, workouts, supplements and body weight by talking, search the history, and share a dashboard. Plus muscle-anatomy diagrams and an 873-exercise database.",
  version: API_VERSION,
  transport: { type: "streamable-http", url: `${baseUrl(c)}/mcp` },
  // Anonymous for the catalog, OAuth for personal data. Stating both is the honest shape and
  // stops a registry listing it as "requires auth" when most of it does not.
  authentication: {
    type: "none",
    optional_oauth2: {
      required_for: "personal logging tools",
      authorization_server: `${baseUrl(c)}/.well-known/oauth-authorization-server`,
      dynamic_registration: true,
    },
  },
  capabilities: ["nutrition-logging", "workout-logging", "supplement-logging", "body-metrics", "exercise-database", "muscle-diagrams", "shareable-reports"],
  fair_use: { requests_per_day: fairUseLimit(c.env), window: "UTC day", applies_to: "tools/call" },
  documentation: "https://anatome.dev",
  llms_txt: "https://anatome.dev/llms.txt",
  openapi: `${baseUrl(c)}/openapi`,
  license: "Apache-2.0",
  repository: "https://github.com/Rippy1911/anatome",
}));

// ---- generateImage (GET query + POST JSON) ----
async function generateImageInner(
  c: { req: { raw: Request }; env: Env },
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const req = c.req.raw;
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
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": CACHE_CONTROL, ...extraHeaders } });
  }
  const output = (payload as { output?: string }).output === "raw" ? "raw" : "json";
  const gender = (payload as { gender?: string }).gender === "female" ? "female" : "male";
  const view = ["front", "back", "dual"].includes((payload as { view?: string }).view as string) ? (payload as { view?: string }).view : "dual";

  if (output === "raw") {
    return new Response(svg, { status: 200, headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": CACHE_CONTROL, ETag: etag, ...extraHeaders, ...timing } });
  }
  return new Response(JSON.stringify({
    ok: true, svg, format: "svg", gender, view, muscles_rendered,
    available_muscles_count: MUSCLES.length,
    ...imageAttribution(), duration_ms,
  }), { headers: { "Content-Type": "application/json", "Cache-Control": CACHE_CONTROL, ETag: etag, ...extraHeaders, ...timing } });
}
app.get("/generateImage", async (c) => {
  const gate = await gateMetered(c, "/generateImage");
  if (!gate.ok) return gate.response;
  const res = await withEdgeCache(c.req.raw, execCtx(c), () => generateImageInner(c, gate.headers), gate.headers);
  noteUsage(c, gate.rl, res, "/generateImage");
  return res;
});
app.post("/generateImage", async (c) => {
  const gate = await gateMetered(c, "/generateImage");
  if (!gate.ok) return gate.response;
  const res = await generateImageInner(c, gate.headers);
  noteUsage(c, gate.rl, res, "/generateImage");
  return res;
});

// ---- listMuscles ----
app.get("/listMuscles", (c) => withEdgeCache(c.req.raw, execCtx(c), () => {
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
app.get("/muscleInfo", (c) => withEdgeCache(c.req.raw, execCtx(c), () => {
  const slug = c.req.query("slug");
  if (!slug) return c.json({ ok: false, error: "provide slug query param", ...imageAttribution() }, 400);
  const info = getMuscleInfo(slug, baseUrl(c));
  if (!info) return c.json({ ok: false, error: `unknown muscle slug: ${slug}`, ...imageAttribution() }, 404);
  return c.json({ ok: true, ...info, ...imageAttribution() });
}));

// ---- bodyPaths ----
// The raw anatomical SVG path data, so a browser (this repo's playground, or anyone's) can
// render and hit-test the body locally instead of round-tripping to /generateImage per frame.
// Static, edge-cached and unmetered for the same reason listMuscles is: it is one immutable
// asset, and charging fair use for it would make an interactive UI impossible.
app.get("/bodyPaths", (c) => withEdgeCache(c.req.raw, execCtx(c), () =>
  c.json({ ok: true, data: getBodyData(), ...imageAttribution() }, 200, { "Cache-Control": CACHE_CONTROL }),
));

// ---- listEquipment ----
app.get("/listEquipment", (c) => withEdgeCache(c.req.raw, execCtx(c), () => {
  const equipment = listEquipment();
  return c.json({ ok: true, count: equipment.length, equipment, ...exerciseDataAttribution() });
}));

// ---- skill guides (bundled CC-BY-4.0 catalog) ----
// Static catalog reads, so they get the same treatment as listMuscles /
// listEquipment: edge-cached and unmetered. The metered endpoints are the ones
// that search or render (searchExercises, getExercise, generateImage).
app.get("/listGuides", (c) => withEdgeCache(c.req.raw, execCtx(c), () =>
  c.json({ ok: true, ...listGuidesLogic(baseUrl(c)), ...guideWipNotice(), ...guideCatalogAttribution() }),
));

app.get("/getGuide", (c) => withEdgeCache(c.req.raw, execCtx(c), () => {
  const slug = c.req.query("slug");
  if (!slug) return c.json({ ok: false, error: "provide slug query param", ...guideCatalogAttribution() }, 400);
  if (!safeGuideSlug(slug)) return c.json({ ok: false, error: "invalid slug", ...guideCatalogAttribution() }, 400);
  const { found, guide } = getGuideLogic(slug, baseUrl(c));
  if (!found) return c.json({ ok: false, error: `unknown guide: ${slug}`, ...guideCatalogAttribution() }, 404);
  return c.json({ ok: true, ...guide, ...guideWipNotice(), ...guideCatalogAttribution() });
}));

app.get("/getGuideTree", (c) => withEdgeCache(c.req.raw, execCtx(c), () => {
  const guideSlug = c.req.query("guide") ?? DEFAULT_GUIDE_SLUG;
  const treeSlug = c.req.query("tree");
  if (!treeSlug) return c.json({ ok: false, error: "provide tree query param", ...guideCatalogAttribution() }, 400);
  if (!safeGuideSlug(guideSlug) || !safeGuideSlug(treeSlug)) {
    return c.json({ ok: false, error: "invalid slug", ...guideCatalogAttribution() }, 400);
  }
  const { found, tree } = getGuideTreeLogic(guideSlug, treeSlug, baseUrl(c));
  if (!found) return c.json({ ok: false, error: `unknown tree: ${guideSlug}/${treeSlug}`, ...guideCatalogAttribution() }, 404);
  return c.json({ ok: true, ...tree, ...guideWipNotice(), ...guideCatalogAttribution() });
}));

// ---- searchExercises ----
// Quota runs BEFORE withEdgeCache so a warm cache cannot be scraped for free.
// Edge cache still avoids the search work on HIT; only the counter always runs.
app.get("/searchExercises", async (c) => {
  const gate = await gateMetered(c, "/searchExercises");
  if (!gate.ok) return gate.response;
  const res = await withEdgeCache(c.req.raw, execCtx(c), async () => {
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
    }, 200, gate.headers);
  }, gate.headers);
  noteUsage(c, gate.rl, res, "/searchExercises");
  return res;
});

// ---- RapidAPI benchmark proxy (marketing site latency comparison; not in OpenAPI) ----
app.get("/benchmark/rapidapiSearch", async (c) => {
  const gate = await gateMetered(c, "/benchmark/rapidapiSearch");
  if (!gate.ok) return gate.response;
  const res = await rapidapiSearchBenchmark(c.req.query(), c.env);
  noteUsage(c, gate.rl, res, "/benchmark/rapidapiSearch");
  return res;
});

// ---- exercise GIF (static assets: api/public/gifs/<ext_id>.gif) ----
app.get("/exerciseGif", async (c) => withEdgeCache(c.req.raw, execCtx(c), async () => {
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

// ---- exercise reference photo (wrkout/exercises.json via wrkoutRawUrl) ----
// Proxies the source JPEGs through Anatome's host so consumers (incl. RapidAPI)
// don't hotlink raw.githubusercontent.com. `path` is the Anatome images[] path
// (e.g. "Barbell_Bench_Press_-_Medium_Grip/0.jpg") mapped to wrkout /images/.
app.get("/exerciseImage", async (c) => withEdgeCache(c.req.raw, execCtx(c), async () => {
  const path = c.req.query("path");
  if (!path) return c.json({ ok: false, error: "path required (exercise images[] entry)" }, 400);
  const safe = sanitizeFreeExerciseDbPath(path);
  if (!safe) return c.json({ ok: false, error: "invalid path" }, 400);
  const upstream = wrkoutRawUrl(safe);
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
app.get("/getExercise", async (c) => {
  const gate = await gateMetered(c, "/getExercise");
  if (!gate.ok) return gate.response;
  const res = await withEdgeCache(c.req.raw, execCtx(c), async () => {
    const extra = gate.headers;
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
  }, gate.headers);
  noteUsage(c, gate.rl, res, "/getExercise");
  return res;
});

// ---- resolveExercise (GET + POST) ----
// Quota before cache on GET — same metering contract as searchExercises.
async function resolveRouteInner(
  c: { req: { raw: Request; query: () => Record<string, string> }; env: Env },
  extraHeaders: Record<string, string>,
): Promise<Response> {
  const req = c.req.raw;
  let exercise = "";
  if (req.method === "POST") { try { const b = await req.json() as { exercise?: string }; exercise = b.exercise || ""; } catch { exercise = ""; } }
  else { exercise = c.req.query().exercise || ""; }
  const r = resolveEx(exercise, c.env.PUBLIC_BASE_URL || "https://api.anatome.dev");
  return new Response(JSON.stringify({
    ok: true, ...r,
    ...exerciseDataAttribution(),
  }), { headers: { "Content-Type": "application/json", ...extraHeaders } });
}
app.get("/resolveExercise", async (c) => {
  const gate = await gateMetered(c, "/resolveExercise");
  if (!gate.ok) return gate.response;
  const res = await withEdgeCache(
    c.req.raw,
    execCtx(c),
    () => resolveRouteInner(c, gate.headers),
    gate.headers,
  );
  noteUsage(c, gate.rl, res, "/resolveExercise");
  return res;
});
app.post("/resolveExercise", async (c) => {
  const gate = await gateMetered(c, "/resolveExercise");
  if (!gate.ok) return gate.response;
  const res = await resolveRouteInner(c, gate.headers);
  noteUsage(c, gate.rl, res, "/resolveExercise");
  return res;
});

// ---- workoutImage (POST JSON) ----
app.post("/workoutImage", async (c) => {
  const gate = await gateMetered(c, "/workoutImage");
  if (!gate.ok) return gate.response;
  let body: Record<string, unknown> = {};
  try { body = await c.req.json(); } catch { body = {}; }
  const exercises = Array.isArray(body.exercises) ? body.exercises.map(String) : [];
  if (!exercises.length) {
    const res = c.json({ ok: false, error: "provide exercises array with at least one name", ...imageAttribution() }, 400, gate.headers);
    noteUsage(c, gate.rl, res, "/workoutImage");
    return res;
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
    const res = new Response(result.svg, {
      status: 200,
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": CACHE_CONTROL, ...gate.headers },
    });
    noteUsage(c, gate.rl, res, "/workoutImage");
    return res;
  }
  const res = c.json({
    ok: true, ...result, anatome_imageSrc,
    ...imageAttribution(),
  }, 200, gate.headers);
  noteUsage(c, gate.rl, res, "/workoutImage");
  return res;
});

// ---- mcp (JSON-RPC over Streamable HTTP) ----

/**
 * A quota denial rendered as a *tool* error, not a protocol error.
 *
 * MCP hosts treat a JSON-RPC `error` on tools/call as the server malfunctioning: Claude and
 * ChatGPT surface it as "the connector failed" and the model never sees why. `isError: true`
 * inside a normal result is the spec's own channel for "the tool ran and could not do the job",
 * and it puts the explanation in front of the model, which is the whole point — the user should
 * be told they are out of requests for today, not that Anatome is down.
 */
function rateLimitToolResult(id: unknown, rl: RateResult, upgrade: string) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result: {
      isError: true,
      content: [{ type: "text", text: rateLimitMessage(rl, upgrade) }],
      structuredContent: {
        error: rl.scope === "network" ? "network_rate_limit_exceeded" : "daily_fair_use_limit_reached",
        scope: rl.scope,
        limit: rl.limit,
        used: rl.used,
        remaining: 0,
        reset_at: rl.reset_at,
        retry_after_seconds: rl.retry_after,
        retryable: false,
        more_info: upgrade,
      },
    },
  };
}

/** Warn before the wall: once the budget is nearly gone, say so inside the tool result. */
const QUOTA_NOTICE_THRESHOLD = 10;
function withQuotaNotice(result: unknown, rl: RateResult): unknown {
  const remaining = rl.remaining;
  if (rl.bypass || remaining == null || remaining > QUOTA_NOTICE_THRESHOLD) return result;
  if (!result || typeof result !== "object") return result;
  const r = result as { structuredContent?: Record<string, unknown> };
  return {
    ...r,
    structuredContent: {
      ...(r.structuredContent || {}),
      quota: {
        remaining_today: remaining,
        limit: rl.limit,
        reset_at: rl.reset_at,
        note: `${remaining} of ${rl.limit} free Anatome requests left today. Mention this to the user if you plan several more calls.`,
      },
    },
  };
}

/** Opaque per-connection id so anonymous fair use has something better than a shared egress IP. */
function newSessionId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

app.get("/mcp", (c) => c.json({
  ok: true,
  server: "anatome",
  version: API_VERSION,
  protocol: MCP_PROTOCOL_VERSION,
  transport: "streamable-http",
  endpoint: `${baseUrl(c)}/mcp`,
  auth: "none",
  fair_use: { requests_per_day: fairUseLimit(c.env), window: "UTC day", applies_to: "tools/call" },
  tools: TOOLS.map((t) => t.name),
}));

app.post("/mcp", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const parsed = body as McpBody;
  const base = baseUrl(c);
  const method = parsed.method;

  // Notifications carry no id and expect no body (Streamable HTTP: 202 Accepted). Answering
  // them with "Method not found" made every compliant client log an error on connect.
  const isNotification = !("id" in (parsed || {})) || method?.startsWith("notifications/");
  if (isNotification) return c.body(null, 202);

  // Reuse the client's session id, or mint one during the handshake. See rateLimit.ts for why
  // a remote connector cannot be fairly metered on its IP.
  const incomingSession = c.req.header("mcp-session-id") || "";
  const sessionId = incomingSession || (method === "initialize" ? newSessionId() : "");
  const sessionHeaders: Record<string, string> = {};
  if (!incomingSession && sessionId) sessionHeaders["Mcp-Session-Id"] = sessionId;

  // tools/list is env-dependent: the logging tools only exist when this deployment has a
  // database. Advertising a tool the Worker cannot honour teaches the model to try, fail, and
  // apologise to the user — so the list reflects what is actually available here.
  if (method === "tools/list") {
    return c.json({
      jsonrpc: "2.0",
      id: parsed.id ?? null,
      result: { tools: [...TOOLS, ...availableLoggingTools(c.env)] },
    }, 200, sessionHeaders);
  }

  // Only tools/call is metered. Metering the handshake means a user who is merely out of
  // requests for today cannot even connect, and every host renders that as a broken connector —
  // the single most misleading failure this API can produce.
  if (method !== "tools/call") {
    return c.json(handleMcp(parsed, base), 200, sessionHeaders);
  }

  // Identify the caller before metering, so a signed-in user is charged to their account rather
  // than to a session id or a shared egress address. This is what makes "50 requests per day per
  // user" literally true rather than a best approximation.
  const identity = await identifyRequest(c.req.raw, c.env);
  const gate = await gateMetered(c, "/mcp", {
    userId: identity?.userId,
    mcpSessionId: sessionId || undefined,
  });
  if (!gate.ok) {
    return c.json(rateLimitToolResult(parsed.id, gate.rl, upgradeUrl(c.env)), 200, {
      ...rateHeaders(gate.rl, c.env),
      "Retry-After": String(gate.rl.retry_after ?? 60),
      ...sessionHeaders,
    });
  }

  const headers = { ...gate.headers, ...sessionHeaders };

  // Personal data never touches the edge cache — it is per-user, mutable, and caching it once
  // would be enough to serve one person's food log to somebody else. Route it out before the
  // cache key is computed rather than trusting a later condition to exclude it.
  if (isLoggingTool(parsed.params?.name)) {
    // An unauthenticated call to a logging tool answers **401 with WWW-Authenticate**, not a
    // tool-level message. That header is what makes a client run the OAuth flow and retry —
    // prose in a tool result cannot, so a connector added anonymously would otherwise have no
    // way to sign in short of being deleted and re-added by hand.
    //
    // Note the deliberate asymmetry with the fair-use denial a few lines up, which must NOT be
    // a protocol-level error: "you are out of requests" is a state the model should explain,
    // while "you are not signed in" is a state the client can fix on its own. Different
    // audiences, different channel.
    if (hasDb(c.env) && !identity) {
      return unauthorizedWithDiscovery(
        c,
        `The "${parsed.params!.name}" tool needs an Anatome account. Sign in to enable it; the catalog, diagram and search tools keep working without one.`,
      );
    }

    const outcome = await callLoggingTool(
      c.env, c.req.raw, parsed.params!.name as string, parsed.params?.arguments || {}, base,
    );
    const result = withQuotaNotice({
      ...(outcome.ok ? {} : { isError: true }),
      content: [{ type: "text", text: outcome.text ?? JSON.stringify(outcome.payload) }],
      structuredContent: outcome.payload,
    }, gate.rl);
    const res = c.json(
      { jsonrpc: "2.0", id: parsed.id ?? null, result },
      200,
      { ...headers, "Cache-Control": "no-store" },
    );
    noteUsage(c, gate.rl, res, "/mcp");
    return res;
  }

  // Cache deterministic tools/call results in the edge cache, keyed by method+params (NOT the
  // JSON-RPC id, which varies per request). The cached inner result is re-wrapped with the live
  // id and the caller's own quota notice. Skip non-deterministic calls (get_exercise random=true).
  // Metering already ran above — MCP cache HITs still cost a unit.
  const isCacheableCall = !(parsed.params?.name === "get_exercise" && parsed.params?.arguments?.random);

  let inner: { ok: boolean; result?: unknown; error?: { code: number; message: string } };
  if (isCacheableCall) {
    const keyStr = `mcp:${parsed.method}:${JSON.stringify(parsed.params || {})}`;
    const cacheKey = new Request(`https://cache.anatome.dev/mcp/${await sha256(keyStr)}`);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) {
      inner = await hit.json();
    } else {
      inner = computeMcpResult(parsed.method, parsed.params || {}, base);
      if (inner.ok) {
        const stored = new Response(JSON.stringify(inner), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
        execCtx(c)?.waitUntil(cache.put(cacheKey, stored));
      }
    }
  } else {
    inner = computeMcpResult(parsed.method, parsed.params || {}, base);
  }

  const out = inner.ok
    ? { jsonrpc: "2.0", id: parsed.id ?? null, result: withQuotaNotice(inner.result, gate.rl) }
    : { jsonrpc: "2.0", id: parsed.id ?? null, error: inner.error };
  const res = c.json(out, 200, headers);
  noteUsage(c, gate.rl, res, "/mcp");
  return res;
});

// ---- openapi ----
app.get("/openapi", (c) => withEdgeCache(c.req.raw, execCtx(c), () =>
  c.json(buildOpenApiSpec(baseUrl(c))),
));

// ---- admin (operator only — Bearer ADMIN_TOKEN) ----
app.get("/admin/stats", (c) => getAdminStats(c));
app.post("/admin/rate-limit/reset", (c) => postAdminRateLimitReset(c));

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
  execCtx(c)?.waitUntil(cache.put(key, stored));
  return c.json(status, 200, { "Cache-Control": "public, max-age=30, s-maxage=60", "X-Cache": "MISS" });
});

// ---- accounts (OAuth 2.1, PKCE S256, dynamic client registration) ----
// Discovery first: these are what a 401 points an MCP client at, and they are how "paste a URL
// and sign in" works without anyone issuing a key.
app.get("/.well-known/oauth-protected-resource", (c) => protectedResourceMetadata(c));
app.get("/.well-known/oauth-authorization-server", (c) => authorizationServerMetadata(c));
app.post("/oauth/register", (c) => registerClient(c));
app.get("/oauth/authorize", (c) => getAuthorize(c));
app.post("/oauth/authorize", (c) => postAuthorize(c));
app.post("/oauth/token", (c) => postToken(c));
app.post("/oauth/revoke", (c) => postRevoke(c));

// ---- the signed-in user's own data ----
app.get("/account", (c) => (new URL(c.req.url).searchParams.get("logout") ? accountLogout(c) : accountPage(c)));
app.post("/account", (c) => accountAction(c));
app.get("/account/export.json", (c) => accountExport(c, "json"));
app.get("/account/export.csv", (c) => accountExport(c, "csv"));
registerPersonalRoutes(app);

// ---- shared view links ----
// A bearer URL: no session, no header. Everything it can reach is scoped to the one account
// that minted it, and the page itself is noindex + private, no-store.
app.get("/v/:token", (c) => renderViewPage(c));
app.post("/v/:token", (c) => handleViewAction(c));

export default app;
