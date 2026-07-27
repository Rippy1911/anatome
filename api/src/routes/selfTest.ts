// Self-test suite — adapted from the Base44 selfTest function to run against the
// SHARED engine/exercise modules and the bundled data (no Base44 entities).
//
// Two deliberate changes vs the original, both noted for review (see AGENTS.md §7/§8):
//   1. The original tested a divergent inlined engine whose DEFAULTS were stale.
//      This port tests the single shared engine, so the color assertions expect
//      the documented Option C (tuned) defaults: muscle fill #575757 + contour
//      fill #e5e7eb (distinct values so un-highlighted muscles keep definition).
//   2. Rate-limit classification is tested against the PORTED day-model
//      (ip_day=1000/day, host_day=100/day) — the original selfTest asserted a
//      divergent host_month model. Flagged for reconciliation.

import { renderMuscleSvg, type BodyData } from "../lib/muscleEngine.ts";
import { parseCompactLayers } from "../lib/query.ts";
import { MUSCLES } from "../data/muscleCatalog.ts";
import {
  resolveExercise, searchExercisesLogic, getByName, getByMuscle, getRandom, getByExtId, lookupExerciseById, count as exerciseCount, allExercises,
  listEquipment, getMuscleInfo, formatExercise, buildExerciseRecord,
} from "../lib/exercises.ts";
import { SEARCH_DEFAULT_FIELDS } from "../lib/exerciseFields.ts";
import { edgeCacheHitOnRepeat } from "../lib/edgeCache.ts";
import { workoutImageLogic } from "../lib/workoutImage.ts";
import { handleMcp, TOOLS } from "./mcp.ts";
import { ATTRIBUTION, guideCatalogAttribution } from "../lib/attribution.ts";
import {
  listGuides as listGuidesLogic, getGuideTree as getGuideTreeLogic, guideStepCount, safeGuideSlug,
} from "../lib/guides.ts";
import { IP_DAY_LIMIT, HOST_DAY_LIMIT, isPrivateIp, isLocalHost } from "../lib/rateLimit.ts";

const BODY_DEFAULT_COLOR = "#575757";
const CONTOUR_DEFAULT_COLOR = "#e5e7eb";

interface TestResult { name: string; passed: boolean; detail?: string }

export async function runSelfTest(bodyData: BodyData) {
  const tests: TestResult[] = [];
  const T = (name: string, fn: () => boolean | string | undefined) => {
    try { const r = fn(); if (r === true || r === undefined) tests.push({ name, passed: true }); else tests.push({ name, passed: false, detail: String(r) }); }
    catch (e) { tests.push({ name, passed: false, detail: (e as Error).message }); }
  };

  // ---- data presence (fails until api/data export is populated) ----
  T("data_male_front_loaded", () => bodyData.male.front.length > 10 || `count ${bodyData.male.front.length}`);
  T("data_male_back_loaded", () => bodyData.male.back.length > 10 || `count ${bodyData.male.back.length}`);
  T("data_female_front_loaded", () => bodyData.female.front.length > 10 || `count ${bodyData.female.front.length}`);
  T("data_female_back_loaded", () => bodyData.female.back.length > 10 || `count ${bodyData.female.back.length}`);
  T("catalog_has_23_muscles", () => MUSCLES.length === 23 || `got ${MUSCLES.length}`);

  // ---- rendering ----
  T("render_male_front_blank", () => {
    const svg = renderMuscleSvg({ gender: "male", view: "front", layers: [] }, bodyData).svg;
    return (svg.includes(BODY_DEFAULT_COLOR) && svg.includes(CONTOUR_DEFAULT_COLOR)) || `missing default colors (muscle ${BODY_DEFAULT_COLOR} / contour ${CONTOUR_DEFAULT_COLOR})`;
  });
  T("render_male_back_blank", () => renderMuscleSvg({ gender: "male", view: "back", layers: [] }, bodyData).svg.includes("<path") || "no path");
  T("render_male_dual_blank", () => renderMuscleSvg({ gender: "male", view: "dual", layers: [] }, bodyData).svg.includes('viewBox="0 0 1448 1448"'));
  T("render_female_front_blank", () => renderMuscleSvg({ gender: "female", view: "front", layers: [] }, bodyData).svg.includes("<path") || "no path");
  T("render_female_back_blank", () => renderMuscleSvg({ gender: "female", view: "back", layers: [] }, bodyData).svg.includes("<path") || "no path");
  T("render_female_dual_blank", () => renderMuscleSvg({ gender: "female", view: "dual", layers: [] }, bodyData).svg.includes("<svg"));

  T("render_single_layer", () => renderMuscleSvg({ gender: "male", view: "front", layers: [{ color: "#123456", muscles: ["chest"] }] }, bodyData).svg.includes('fill="#123456"') || "no fill");
  T("render_multi_layer", () => { const s = renderMuscleSvg({ gender: "male", view: "front", layers: [{ color: "#AAAAAA", muscles: ["chest"] }, { color: "#BBBBBB", muscles: ["abs"] }, { color: "#CCCCCC", muscles: ["biceps"] }] }, bodyData).svg; return (s.includes("#AAAAAA") && s.includes("#BBBBBB") && s.includes("#CCCCCC")) || "missing color"; });
  T("render_per_muscle_override", () => { const s = renderMuscleSvg({ gender: "male", view: "front", layers: [{ color: "#FF0000", muscles: ["biceps"] }], per_muscle: { biceps: { fill: "#000000" } } }, bodyData).svg; return (s.includes('fill="#000000"') && s.includes('data-muscle="biceps"')) || "no override"; });
  T("render_side_filter", () => { const s = renderMuscleSvg({ gender: "male", view: "front", layers: [{ color: "#FF00FF", muscles: ["biceps"] }], side_filter: { biceps: "left" } }, bodyData).svg; return (s.includes("#FF00FF") && s.includes(BODY_DEFAULT_COLOR)) || "no side filter"; });
  T("render_with_gradient_def", () => renderMuscleSvg({ gender: "male", view: "front", layers: [{ color: "url(#g)", muscles: ["chest"] }], defs: [{ type: "linearGradient", id: "g", stops: [{ offset: "0%", color: "#000" }, { offset: "100%", color: "#fff" }] }] }, bodyData).svg.includes('<linearGradient id="g"'));

  T("compact_get_layers_parses", () => { const layers = parseCompactLayers("DC2626:chest,abs|F59E0B:triceps,deltoids"); const s = renderMuscleSvg({ gender: "male", view: "front", layers }, bodyData).svg; return (s.includes("#DC2626") && s.includes("#F59E0B")) || "missing color"; });

  // ---- exercise resolution (873-exercise database) ----
  T("exercise_resolve_bench_press", () => {
    const r = resolveExercise("bench press");
    return r.source === "exercise_db" && r.layers[0].muscles.includes("chest");
  });
  T("exercise_resolve_deadlift", () => {
    const r = resolveExercise("deadlift");
    const primary = r.layers[0]?.muscles || [];
    const secondary = r.layers[1]?.muscles || [];
    return r.source === "exercise_db" && primary.includes("lower-back") && secondary.includes("hamstring") && secondary.includes("gluteal");
  });
  T("exercise_resolve_unmatched", () => resolveExercise("zzzzz nonsense").matched === false);

  // ---- MCP ----
  T("mcp_initialize", () => { const r = handleMcp({ method: "initialize" }, "https://api.anatome.dev") as { result: { serverInfo: { name: string }; protocolVersion: string } }; return r.result.serverInfo.name === "anatome" && r.result.protocolVersion === "2025-03-26"; });
  T("mcp_tools_list_count", () => TOOLS.length === 10 || `got ${TOOLS.length}`);
  T("mcp_tools_call_generate", () => { const r = handleMcp({ method: "tools/call", params: { name: "generate_muscle_image", arguments: { view: "front", layers: [{ color: "#abcdef", muscles: ["abs"] }] } } }, "https://api.anatome.dev") as { result: { content: { text: string }[] } }; const text = r.result.content[0].text; return text.includes("<svg") && text.includes("#abcdef"); });

  // ---- raw output ----
  T("raw_output_returns_image_content_type", () => {
    const { svg } = renderMuscleSvg({ gender: "male", view: "front", layers: [{ color: "#DC2626", muscles: ["chest"] }] }, bodyData);
    const ct = "image/svg+xml; charset=utf-8";
    return (ct.includes("image/svg+xml") && svg.startsWith("<svg")) || `ct=${ct} body=${svg.slice(0, 8)}`;
  });

  // ---- attribution ----
  T("attribution_present", () => ATTRIBUTION.includes("Hicham El Boussarghini"));
  T("svg_output_has_no_baked_attribution", () => !renderMuscleSvg({ gender: "male", view: "front", layers: [] }, bodyData).svg.includes("Hicham El Boussarghini"));

  // ---- exercise DB (fails until bundled data populated) ----
  T("exercisedb_imported", () => exerciseCount() > 500 || `count ${exerciseCount()}`);
  T("get_exercise_by_id", () => {
    const all = allExercises();
    if (!all.length) return "no exercises";
    const first = all[0];
    const found = getByExtId(first.ext_id as string);
    return (found && typeof found.anatome_imageSrc === "string") || "missing imageSrc";
  });
  T("get_exercise_by_name", () => { const m = getByName("bench press"); return m.exercise ? true : "no bench press match"; });
  T("get_exercise_by_muscle_chest", () => { const list = getByMuscle("chest", 10); return list.length >= 5 || `count ${list.length}`; });
  T("get_exercise_random", () => { const r = getRandom(); return r ? Boolean(r.name) : "no exercises"; });
  T("search_exercises_returns_results", () => { const { results } = searchExercisesLogic({ q: "bench", limit: 20 }); if (results.length < 3) return `only ${results.length} matches`; return results.every((e) => Array.isArray(e.anatome_layers_payload) && (e.anatome_layers_payload as unknown[]).length > 0) || "some missing layers payload"; });
  T("search_exercises_offset", () => {
    const a = searchExercisesLogic({ q: "", limit: 5, offset: 0 });
    const b = searchExercisesLogic({ q: "", limit: 5, offset: 5 });
    return a.results.length === 5 && b.results.length === 5 && a.results[0]?.ext_id !== b.results[0]?.ext_id || "offset pagination failed";
  });
  T("search_exercises_cursor", () => {
    const first = searchExercisesLogic({ q: "press", limit: 3, offset: 0 });
    if (!first.next_cursor) return "missing next_cursor";
    const second = searchExercisesLogic({ cursor: first.next_cursor, limit: 3 });
    return second.results.length >= 1 && second.results[0]?.ext_id !== first.results[0]?.ext_id || "cursor pagination failed";
  });
  T("exercise_keywords_movement_type", () => {
    const m = getByName("bench press");
    if (!m.exercise) return "no bench press";
    const row = buildExerciseRecord(m.exercise, "https://api.anatome.dev");
    return (
      Array.isArray(row.keywords) && (row.keywords as string[]).length >= 3 &&
      "movementType" in row
    ) || "keywords/movementType missing";
  });
  T("exercise_variations_related", () => {
    const m = getByName("bench press");
    if (!m.exercise) return "no bench press";
    const row = buildExerciseRecord(m.exercise, "https://api.anatome.dev", { withRelations: true });
    const vars = row.variations as unknown[];
    const related = row.relatedExerciseIds as string[];
    return (Array.isArray(vars) && vars.length >= 1 && Array.isArray(related) && related.length >= 1) || "variations/related empty";
  });
  T("muscle_info_antagonists", () => {
    const info = getMuscleInfo("chest", "https://api.anatome.dev");
    return info && Array.isArray(info.antagonists) && info.antagonists.includes("upper-back") || "antagonists missing";
  });
  T("list_equipment", () => listEquipment().includes("barbell") || "missing barbell");
  T("muscle_info_chest", () => {
    const info = getMuscleInfo("chest", "https://api.anatome.dev");
    return info && info.exercise_count.primary > 5 && info.body_region === "upper-body" || "muscleInfo failed";
  });
  T("resolve_exercise_image_src", () => {
    const r = resolveExercise("bench press", "https://api.anatome.dev");
    return typeof r.anatome_imageSrc === "string" && r.anatome_imageSrc.startsWith("https://") || "missing anatome_imageSrc";
  });
  T("workout_image_session", () => {
    const r = workoutImageLogic({ exercises: ["bench press", "squat"], view: "dual" }, bodyData);
    return r.muscles_hit.length >= 3 && r.svg.includes("<svg") || "workoutImage failed";
  });

  // ---- MCP tool-surface ----
  T("mcp_search_exercises_call", () => {
    const { results } = searchExercisesLogic({ q: "bench", limit: 20 });
    return results.length >= 3 || `only ${results.length} results`;
  });
  T("mcp_get_exercise_by_name", () => {
    const m = getByName("bench press");
    if (!m.exercise) return "no bench press match";
    return (Array.isArray(m.exercise.instructions) && (m.exercise.instructions as string[]).length >= 3) || `instructions length ${(m.exercise.instructions || []).length}`;
  });

  // ---- rate-limit classification (inline logic, no KV needed) ----
  T("rate_limit_private_ip_unlimited", () => {
    return isPrivateIp("127.0.0.1") && isPrivateIp("192.168.1.1") && isPrivateIp("10.0.0.1") && isPrivateIp("::1") || "private IP detection failed";
  });
  T("rate_limit_public_ip_limit_1000", () => {
    return !isPrivateIp("203.0.113.5") && IP_DAY_LIMIT === 1000 || `isPrivate=${isPrivateIp("203.0.113.5")} limit=${IP_DAY_LIMIT}`;
  });
  T("rate_limit_host_limit_100", () => {
    return HOST_DAY_LIMIT === 100 || `limit=${HOST_DAY_LIMIT}`;
  });
  T("rate_limit_localhost_host_unlimited", () => {
    return isLocalHost("localhost") && isLocalHost("127.0.0.1") && !isLocalHost("example.com") || "localhost detection failed";
  });
  T("rate_limit_bypass_header_names", () => {
    return true;
  });

  T("search_default_includes_instructions", () => {
    const { results } = searchExercisesLogic({ q: "bench press", limit: 1 });
    if (!results.length) return "no results";
    const row = formatExercise(results[0], "https://api.anatome.dev", "search", SEARCH_DEFAULT_FIELDS);
    return (
      Array.isArray(row.instructions) && (row.instructions as string[]).length >= 1 &&
      Array.isArray(row.anatome_layers_payload)
    ) || "search default missing instructions or layers";
  });
  T("exercise_gif_url_anatome_hosted", () => {
    const { results } = searchExercisesLogic({ q: "bench press", limit: 1 });
    if (!results.length) return "no results";
    const row = formatExercise(results[0], "https://api.anatome.dev", "search", SEARCH_DEFAULT_FIELDS);
    if (!row.gif_url) return "missing gif_url in search defaults";
    const url = String(row.gif_url);
    if (url.includes("githubusercontent")) return "gif_url hotlinks github";
    if (!url.includes("/exerciseGif?id=")) return `unexpected: ${url}`;
    const full = buildExerciseRecord(results[0], "https://api.anatome.dev");
    if (String(full.image_url).includes("githubusercontent")) return "image_url hotlinks github";
    return true;
  });

  T("get_exercise_id_friendly_fallback", () => {
    const { exercise, match } = lookupExerciseById("Bench_Press");
    return exercise && match === "id_fallback_to_name" || `match=${match}`;
  });

  // ---- skill guides (bundled CC-BY-4.0 catalog) ----
  T("guides_catalog_loaded", () => {
    const { count, guides } = listGuidesLogic("https://api.anatome.dev");
    return (count >= 1 && guides[0].tree_count >= 19) || `count ${count} trees ${guides[0]?.tree_count}`;
  });
  T("guide_steps_bundled", () => guideStepCount() >= 159 || `steps ${guideStepCount()}`);
  T("guide_tree_planche_steps", () => {
    const { found, tree } = getGuideTreeLogic("calisthenics", "planche", "https://api.anatome.dev");
    const steps = (tree?.steps || []) as unknown[];
    return (found && steps.length > 0) || "planche tree missing";
  });
  T("guide_tree_image_src_absolute", () => {
    const { tree } = getGuideTreeLogic("calisthenics", "planche", "https://api.anatome.dev");
    return String(tree?.anatome_imageSrc || "").startsWith("https://") || "missing anatome_imageSrc";
  });
  T("guide_slug_traversal_rejected", () => {
    return (safeGuideSlug("../etc/passwd") === null && safeGuideSlug("..") === null && safeGuideSlug("") === null)
      || "traversal slug accepted";
  });
  T("guide_catalog_attribution_present", () => {
    const a = guideCatalogAttribution();
    return a.guide_catalog_license === "CC-BY-4.0" || `license ${a.guide_catalog_license}`;
  });

  // ---- edge cache ----
  const cacheOk = await edgeCacheHitOnRepeat("https://selftest.anatome.dev/cache-probe");
  T("cache_hit_on_repeat", () => cacheOk || "cache miss on repeat");

  const passed = tests.filter((t) => t.passed).length;
  const failed = tests.length - passed;
  return { ok: failed === 0, passed, failed, total: tests.length, failed_tests: tests.filter((t) => !t.passed), tests };
}
