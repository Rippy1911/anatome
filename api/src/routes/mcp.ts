// MCP JSON-RPC 2.0 handler — ported from the Base44 mcp function. 5 tools, all
// backed by the shared engine/exercise modules. aiDemo is NOT exposed here.
//
// Note: the original mcp function carried a stale local DEFAULTS (#3f3f3f / 1.0).
// This port uses the shared muscleEngine defaults (#282828 / 1.5), aligning MCP
// `generate_muscle_image` with generateImage and the documented defaults.

import { renderMuscleSvg } from "../lib/muscleEngine.ts";
import { getBodyData } from "../lib/bodyData.ts";
import { MUSCLES, ANATOMICAL_NAMES, SIDE_PRESENCE, BODY_REGION, ANTAGONISTS } from "../data/muscleCatalog.ts";
import {
  searchExercisesLogic, formatExercise, getByExtId, getRandom, getByName, lookupExerciseById,
  cleanExercise, resolveExercise as resolveEx,
  type ExerciseRow,
} from "../lib/exercises.ts";
import { parseFieldsParam, SEARCH_DEFAULT_FIELDS } from "../lib/exerciseFields.ts";
import { ATTRIBUTION, ATTRIBUTION_SOURCE, LICENSE, EXERCISE_DB_ATTRIBUTION, guideCatalogAttribution } from "../lib/attribution.ts";
import { workoutImageLogic } from "../lib/workoutImage.ts";
import { listGuides as listGuidesLogic, getGuide as getGuideLogic, getGuideTree as getGuideTreeLogic } from "../lib/guides.ts";
import { DEFAULT_GUIDE_SLUG } from "../data/guideCatalog.ts";

/** The version we speak. `GET /mcp` and `initialize` used to disagree (2024-11-05 vs 2025-03-26). */
export const MCP_PROTOCOL_VERSION = "2025-06-18";
/** Older revisions we still answer to, newest first. An unknown request falls back to ours. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const MCP_SERVER_VERSION = "3.0.0";

/**
 * The skill-progression guides are not finished: step media coverage is incomplete and the
 * cues have not been reviewed by a coach. They stay exposed so existing callers do not break,
 * but every surface says so up front — an agent that reads this should hedge, not assert.
 */
const WIP = "[WORK IN PROGRESS — unverified content, incomplete media, subject to change] ";
export const GUIDE_STATUS = "work_in_progress";

export const TOOLS = [
  { name: "generate_muscle_image", description: "Render an SVG diagram of the human body with arbitrary muscles highlighted in arbitrary colors. Returns an SVG string.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {
      gender: { type: "string", enum: ["male", "female"], default: "male" },
      view: { type: "string", enum: ["front", "back", "dual"], default: "dual" },
      layers: { type: "array", items: { type: "object", properties: { color: { type: "string" }, muscles: { type: "array", items: { type: "string" } }, opacity: { type: "number" } }, required: ["color", "muscles"] } },
      body_color: { type: "string", default: "#282828" }, border_color: { type: "string", default: "#dfdfdf" }, border_width: { type: "number", default: 1.5 },
      background: { type: "string", default: "transparent" }, width: { type: "number", default: 768 }, height: { type: "number", default: 1024 },
      per_muscle: { type: "object" }, side_filter: { type: "object" }, defs: { type: "array" } },
      required: ["layers"] } },
  { name: "list_muscles", description: "List all 23 supported muscle slugs with anatomical names and which views they appear on.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} } },
  { name: "resolve_exercise", description: "Resolve an exercise name against the 873-exercise database into primary/secondary muscle layers. Use generate_muscle_image with custom layers for additional tiers (e.g. accessory stabilizers).",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: { exercise: { type: "string" } }, required: ["exercise"] } },
  { name: "search_exercises", description: "Search the 873-exercise database (free-exercise-db) by name with optional muscle/equipment/level filters. Returns enriched results with ready-to-embed anatome_imageSrc URLs.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {
      q: { type: "string", description: "Name search query, e.g. 'bench'" },
      muscle: { type: "string", description: "Filter by Anatome muscle slug, e.g. 'chest'" },
      equipment: { type: "string", description: "Filter by equipment, e.g. 'barbell'" },
      level: { type: "string", enum: ["beginner", "intermediate", "expert"], description: "Filter by difficulty" },
      limit: { type: "number", default: 20, description: "Max results (1-50)" },
      offset: { type: "number", default: 0, description: "Pagination offset (ignored when cursor is set)" },
      cursor: { type: "string", description: "Opaque cursor from a prior search (next page)" },
      fields: { type: "string", description: "Comma-separated fields, or all/* (default: lean search set)" } },
      required: ["q"] } },
  { name: "get_exercise", description: "Fetch exercise(s). Full record by default; use fields to trim (e.g. name,instructions,gif_url). One of: name, id, random.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {
      name: { type: "string", description: "Exercise name (fuzzy match), e.g. 'bench press'" },
      id: { type: "string", description: "Exercise ext_id" },
      random: { type: "boolean", description: "Return a random exercise" },
      fields: { type: "string", description: "Comma-separated fields, or all/*" } } } },
  { name: "get_exercise_gif", description: "Return the Anatome-hosted demo GIF URL for an exercise by name or ext_id. Embed in markdown: ![bench press](<url>).",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {
      name: { type: "string", description: "Exercise name (fuzzy match), e.g. 'bench press'" },
      id: { type: "string", description: "Exercise ext_id" } } } },
  { name: "workout_image", description: "Stack muscle activation across a list of exercises into a single session-heatmap SVG. Muscles hit once appear at 40% opacity; twice 65%; three or more times 100%.",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {
      exercises: { type: "array", items: { type: "string" }, description: "Exercise names (fuzzy matched), e.g. ['bench press', 'squat', 'overhead press']" },
      gender: { type: "string", enum: ["male", "female"], default: "male" },
      view: { type: "string", enum: ["front", "back", "dual"], default: "dual" },
      width: { type: "number", default: 768 },
      height: { type: "number", default: 1024 } },
      required: ["exercises"] } },
  { name: "list_guides", description: `${WIP}List the bundled skill-progression guides (curated calisthenics catalog, CC-BY-4.0) with tree and step counts.`,
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {} } },
  { name: "get_guide", description: `${WIP}Get one guide: its metadata plus a summary of every skill tree it contains (difficulty, prerequisites, step count, muscle map URL).`,
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {
      slug: { type: "string", description: "Guide slug, e.g. 'calisthenics'" } },
      required: ["slug"] } },
  { name: "get_guide_tree", description: `${WIP}Get one full skill tree — every progression step with cues, common faults, drills, unlock criteria and demo media. Use for 'how do I train the planche/front lever/handstand', but tell the user this catalog is unfinished and unverified.`,
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {
      tree: { type: "string", description: "Skill tree slug, e.g. 'planche', 'front-lever', 'handstand'" },
      guide: { type: "string", default: "calisthenics", description: "Guide slug (defaults to calisthenics)" } },
      required: ["tree"] } },
];

/** Machine-readable WIP marker attached to every guide payload. */
export const guideWipNotice = () => ({
  status: GUIDE_STATUS,
  notice: "The skill-progression guides are a work in progress: media coverage is incomplete and the coaching cues are unreviewed. Present them as provisional, not as verified training advice.",
});

function fullExercise(e: ExerciseRow | null, base: string, fieldsRaw?: string) {
  if (!e) return null;
  const cleaned = cleanExercise(e) as ExerciseRow;
  const row = { ...cleaned };
  delete (row as { name_lower?: string }).name_lower;
  const fields = parseFieldsParam(fieldsRaw, null);
  return formatExercise(row, base, "full", fields);
}

export interface McpBody {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id?: any;
  method?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: { name?: string; arguments?: any };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rpcResult(id: any, result: unknown) { return { jsonrpc: "2.0", id, result }; }
// eslint-disable-next-line @typescript-eslint-eslint/no-explicit-any
function rpcError(id: any, code: number, message: string) { return { jsonrpc: "2.0", id, error: { code, message } }; }

/** Cacheable inner result (no JSON-RPC envelope / id, so the same result can be
 *  re-wrapped for different request ids). `ok` distinguishes result vs error. */
export interface McpInnerResult {
  ok: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
  error?: { code: number; message: string };
}

/** Pure result computation for a parsed method+params — no JSON-RPC envelope, so
 *  it is cacheable by method+params and re-wrapped with the live request id. */
export function computeMcpResult(
  method: string | undefined,
  params: { name?: string; arguments?: Record<string, unknown> },
  base: string,
): McpInnerResult {
  const args = (params && params.arguments) || {};
  if (method === "initialize") {
    // Echo the client's version when we speak it, so an older client is not forced to
    // downgrade-negotiate; otherwise answer with ours and let the client decide.
    const asked = (params as Record<string, unknown> | undefined)?.protocolVersion as string | undefined;
    const protocolVersion = asked && SUPPORTED_PROTOCOL_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSION;
    return {
      ok: true,
      result: {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "anatome", version: MCP_SERVER_VERSION },
        instructions: "Anatome is free and keyless. Catalog and diagram tools work with no account. There is a daily fair-use budget; when it runs out the tool returns isError with a plain explanation — relay it to the user rather than retrying.",
      },
    };
  }
  if (method === "tools/list") {
    return { ok: true, result: { tools: TOOLS } };
  }
  if (method === "ping") {
    return { ok: true, result: {} };
  }
  if (method === "tools/call") {
    const name = params && params.name;
    if (name === "generate_muscle_image") {
      const { svg, muscles_rendered } = renderMuscleSvg(args, getBodyData());
      return { ok: true, result: { content: [{ type: "text", text: svg }], structuredContent: { muscles_rendered, attribution: ATTRIBUTION, attribution_source: ATTRIBUTION_SOURCE, license: LICENSE } } };
    }
    if (name === "list_muscles") {
      const muscles = MUSCLES.map((slug) => ({
        slug,
        name: ANATOMICAL_NAMES[slug],
        views: SIDE_PRESENCE[slug],
        body_region: BODY_REGION[slug] || null,
        antagonists: ANTAGONISTS[slug] || [],
      }));
      return { ok: true, result: { content: [{ type: "text", text: JSON.stringify(muscles) }], structuredContent: { count: MUSCLES.length, muscles } } };
    }
    if (name === "resolve_exercise") {
      const r = resolveEx(args.exercise as string, base);
      return { ok: true, result: { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: { ...r, exercise_db_attribution: EXERCISE_DB_ATTRIBUTION, license: LICENSE } } };
    }
    if (name === "search_exercises") {
      const fields = parseFieldsParam(args.fields as string | undefined, SEARCH_DEFAULT_FIELDS);
      const { total, offset, limit, next_cursor, results } = searchExercisesLogic(args);
      const payload = {
        total_matched: total, offset, limit, next_cursor,
        results: results.map((e) => formatExercise(e, base, "search", fields)),
        exercise_db_attribution: EXERCISE_DB_ATTRIBUTION,
        license: LICENSE,
      };
      return { ok: true, result: { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload } };
    }
    if (name === "get_exercise") {
      let r: { match: string; exercise: unknown };
      if (args.id) {
        const { exercise, match } = lookupExerciseById(args.id as string);
        r = exercise ? { match, exercise: fullExercise(exercise, base, args.fields as string | undefined) } : { match: "none", exercise: null };
      }
      else if (args.random) { const rec = getRandom(); r = rec ? { match: "random", exercise: fullExercise(rec, base, args.fields as string | undefined) } : { match: "none", exercise: null }; }
      else if (args.name) { const m = getByName(args.name as string); r = { match: m.match, exercise: fullExercise(m.exercise, base, args.fields as string | undefined) }; }
      else { r = { match: "none", exercise: null }; }
      const payload = { ...r, exercise_db_attribution: EXERCISE_DB_ATTRIBUTION, license: LICENSE };
      return { ok: true, result: { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload } };
    }
    if (name === "get_exercise_gif") {
      let ex: ExerciseRow | null = null;
      if (args.id) { const { exercise } = lookupExerciseById(args.id as string); ex = exercise; }
      else if (args.name) { const m = getByName(args.name as string); ex = m.exercise; }
      if (!ex) return { ok: false, error: { code: -32602, message: "Exercise not found. Provide name or id." } };
      const gifUrl = `${base}/exerciseGif?id=${encodeURIComponent(ex.ext_id as string)}`;
      return { ok: true, result: { content: [{ type: "text", text: gifUrl }], structuredContent: { ext_id: ex.ext_id, name: ex.name, gif_url: gifUrl, exercise_db_attribution: EXERCISE_DB_ATTRIBUTION } } };
    }
    if (name === "workout_image") {
      const exercises = args.exercises as string[] | undefined;
      if (!exercises || !exercises.length) return { ok: false, error: { code: -32602, message: "exercises array required" } };
      const result = workoutImageLogic({ exercises, gender: args.gender as string | undefined, view: args.view as string | undefined, width: args.width as number | undefined, height: args.height as number | undefined }, getBodyData());
      // Return structured JSON in content[0].text so AI clients can parse muscles_hit
      // without having to parse raw SVG. The SVG is included for direct embedding.
      const payload = {
        muscles_hit: result.muscles_hit,
        per_muscle_count: result.per_muscle_count,
        exercises_resolved: result.exercises_resolved,
        svg: result.svg,
        gender: result.gender,
        view: result.view,
        attribution: ATTRIBUTION,
        attribution_source: ATTRIBUTION_SOURCE,
        license: LICENSE,
      };
      return { ok: true, result: { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload } };
    }
    if (name === "list_guides") {
      const payload = { ...listGuidesLogic(base), ...guideWipNotice(), ...guideCatalogAttribution() };
      return { ok: true, result: { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload } };
    }
    if (name === "get_guide") {
      const { found, guide } = getGuideLogic(args.slug, base);
      if (!found) return { ok: false, error: { code: -32602, message: `Unknown guide: ${args.slug}` } };
      const payload = { ...guide, ...guideWipNotice(), ...guideCatalogAttribution() };
      return { ok: true, result: { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload } };
    }
    if (name === "get_guide_tree") {
      const { found, tree } = getGuideTreeLogic(args.guide ?? DEFAULT_GUIDE_SLUG, args.tree, base);
      if (!found) return { ok: false, error: { code: -32602, message: `Unknown skill tree: ${args.tree}` } };
      const payload = { ...tree, ...guideWipNotice(), ...guideCatalogAttribution() };
      return { ok: true, result: { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload } };
    }
    return { ok: false, error: { code: -32602, message: `Unknown tool: ${name}` } };
  }
  return { ok: false, error: { code: -32601, message: `Method not found: ${method}` } };
}

/** Handle a parsed JSON-RPC body. `base` is the public base URL for image links. */
export function handleMcp(body: McpBody, base: string): object {
  const { id = null, method, params = {} } = body || {};
  const inner = computeMcpResult(method, params, base);
  return inner.ok ? rpcResult(id, inner.result) : rpcError(id, inner.error!.code, inner.error!.message);
}
