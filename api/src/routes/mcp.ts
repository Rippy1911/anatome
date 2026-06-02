// MCP JSON-RPC 2.0 handler — ported from the Base44 mcp function. 5 tools, all
// backed by the shared engine/exercise modules. aiDemo is NOT exposed here.
//
// Note: the original mcp function carried a stale local DEFAULTS (#3f3f3f / 1.0).
// This port uses the shared muscleEngine defaults (#282828 / 1.5), aligning MCP
// `generate_muscle_image` with generateImage and the documented defaults.

import { renderMuscleSvg } from "../lib/muscleEngine.ts";
import { getBodyData } from "../lib/bodyData.ts";
import { MUSCLES, ANATOMICAL_NAMES, SIDE_PRESENCE } from "../data/muscleCatalog.ts";
import {
  searchExercisesLogic, formatExercise, getByExtId, getRandom, getByName, lookupExerciseById,
  cleanExercise, resolveExercise as resolveEx,
  type ExerciseRow,
} from "../lib/exercises.ts";
import { parseFieldsParam, SEARCH_DEFAULT_FIELDS } from "../lib/exerciseFields.ts";
import { ATTRIBUTION, ATTRIBUTION_SOURCE, BUILT_BY, TRY_ALSO, EXERCISE_DB_ATTRIBUTION } from "../lib/attribution.ts";

export const TOOLS = [
  { name: "generate_muscle_image", description: "Render an SVG diagram of the human body with arbitrary muscles highlighted in arbitrary colors. Returns an SVG string.",
    inputSchema: { type: "object", properties: {
      gender: { type: "string", enum: ["male", "female"], default: "male" },
      view: { type: "string", enum: ["front", "back", "dual"], default: "dual" },
      layers: { type: "array", items: { type: "object", properties: { color: { type: "string" }, muscles: { type: "array", items: { type: "string" } }, opacity: { type: "number" } }, required: ["color", "muscles"] } },
      body_color: { type: "string", default: "#282828" }, border_color: { type: "string", default: "#dfdfdf" }, border_width: { type: "number", default: 1.5 },
      background: { type: "string", default: "transparent" }, width: { type: "number", default: 768 }, height: { type: "number", default: 1024 },
      per_muscle: { type: "object" }, side_filter: { type: "object" }, defs: { type: "array" } },
      required: ["layers"] } },
  { name: "list_muscles", description: "List all 23 supported muscle slugs with anatomical names and which views they appear on.",
    inputSchema: { type: "object", properties: {} } },
  { name: "resolve_exercise", description: "Resolve an exercise name against the 873-exercise database into primary/secondary muscle layers. Use generate_muscle_image with custom layers for additional tiers (e.g. accessory stabilizers).",
    inputSchema: { type: "object", properties: { exercise: { type: "string" } }, required: ["exercise"] } },
  { name: "search_exercises", description: "Search the 873-exercise database (free-exercise-db) by name with optional muscle/equipment/level filters. Returns enriched results with ready-to-embed anatome_imageSrc URLs.",
    inputSchema: { type: "object", properties: {
      q: { type: "string", description: "Name search query, e.g. 'bench'" },
      muscle: { type: "string", description: "Filter by Anatome muscle slug, e.g. 'chest'" },
      equipment: { type: "string", description: "Filter by equipment, e.g. 'barbell'" },
      level: { type: "string", enum: ["beginner", "intermediate", "expert"], description: "Filter by difficulty" },
      limit: { type: "number", default: 20, description: "Max results (1-50)" },
      offset: { type: "number", default: 0, description: "Pagination offset" },
      fields: { type: "string", description: "Comma-separated fields, or all/* (default: lean search set)" } },
      required: ["q"] } },
  { name: "get_exercise", description: "Fetch exercise(s). Full record by default; use fields to trim (e.g. name,instructions,gif_url). One of: name, id, random.",
    inputSchema: { type: "object", properties: {
      name: { type: "string", description: "Exercise name (fuzzy match), e.g. 'bench press'" },
      id: { type: "string", description: "Exercise ext_id" },
      random: { type: "boolean", description: "Return a random exercise" },
      fields: { type: "string", description: "Comma-separated fields, or all/*" } } } },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rpcResult(id: any, result: unknown) { return { jsonrpc: "2.0", id, result }; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rpcError(id: any, code: number, message: string) { return { jsonrpc: "2.0", id, error: { code, message } }; }

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

/** Handle a parsed JSON-RPC body. `base` is the public base URL for image links. */
export function handleMcp(body: McpBody, base: string): object {
  const { id = null, method, params = {} } = body || {};
  if (method === "initialize") {
    return rpcResult(id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "anatome", version: "2.0.0" } });
  }
  if (method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }
  if (method === "tools/call") {
    const name = params.name;
    const args = params.arguments || {};
    if (name === "generate_muscle_image") {
      const { svg, muscles_rendered } = renderMuscleSvg(args, getBodyData());
      return rpcResult(id, { content: [{ type: "text", text: svg }], structuredContent: { muscles_rendered, attribution: ATTRIBUTION, attribution_source: ATTRIBUTION_SOURCE, built_by: BUILT_BY, try_also: TRY_ALSO } });
    }
    if (name === "list_muscles") {
      const muscles = MUSCLES.map((slug) => ({ slug, name: ANATOMICAL_NAMES[slug], views: SIDE_PRESENCE[slug] }));
      return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(muscles) }], structuredContent: { count: MUSCLES.length, muscles, built_by: BUILT_BY, try_also: TRY_ALSO } });
    }
    if (name === "resolve_exercise") {
      const r = resolveEx(args.exercise, base);
      return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: { ...r, built_by: BUILT_BY, try_also: TRY_ALSO } });
    }
    if (name === "search_exercises") {
      const fields = parseFieldsParam(args.fields, SEARCH_DEFAULT_FIELDS);
      const { total, offset, limit, results } = searchExercisesLogic(args);
      const payload = {
        total_matched: total, offset, limit,
        results: results.map((e) => formatExercise(e, base, "search", fields)),
        built_by: BUILT_BY, try_also: TRY_ALSO,
      };
      return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload });
    }
    if (name === "get_exercise") {
      let r: { match: string; exercise: unknown };
      if (args.id) {
        const { exercise, match } = lookupExerciseById(args.id);
        r = exercise ? { match, exercise: fullExercise(exercise, base, args.fields) } : { match: "none", exercise: null };
      }
      else if (args.random) { const rec = getRandom(); r = rec ? { match: "random", exercise: fullExercise(rec, base, args.fields) } : { match: "none", exercise: null }; }
      else if (args.name) { const m = getByName(args.name); r = { match: m.match, exercise: fullExercise(m.exercise, base, args.fields) }; }
      else { r = { match: "none", exercise: null }; }
      const payload = { ...r, attribution: ATTRIBUTION, exercise_db_attribution: EXERCISE_DB_ATTRIBUTION, built_by: BUILT_BY, try_also: TRY_ALSO };
      return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload });
    }
    return rpcError(id, -32602, `Unknown tool: ${name}`);
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}
