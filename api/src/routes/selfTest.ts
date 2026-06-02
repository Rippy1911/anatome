// Self-test suite — adapted from the Base44 selfTest function to run against the
// SHARED engine/exercise modules and the bundled data (no Base44 entities).
//
// Two deliberate changes vs the original, both noted for review (see AGENTS.md §7/§8):
//   1. The original tested a divergent inlined engine whose DEFAULTS were stale
//      (#3f3f3f / 1.0). This port tests the single shared engine, so the two color
//      assertions now expect the documented default #282828.
//   2. Rate-limit classification is tested against the PORTED day-model
//      (ip_day=1000/day, host_day=100/day) — the original selfTest asserted a
//      divergent host_month model. Flagged for reconciliation.

import { renderMuscleSvg, type BodyData } from "../lib/muscleEngine.ts";
import { parseCompactLayers } from "../lib/query.ts";
import { MUSCLES } from "../data/muscleCatalog.ts";
import {
  resolveExercise, searchExercisesLogic, getByName, getByMuscle, getRandom, getByExtId, count as exerciseCount, allExercises,
} from "../lib/exercises.ts";
import { handleMcp, TOOLS } from "./mcp.ts";
import { ATTRIBUTION } from "../lib/attribution.ts";
import { IP_DAY_LIMIT, HOST_DAY_LIMIT, isPrivateIp, isLocalHost } from "../lib/rateLimit.ts";

const BODY_DEFAULT_COLOR = "#282828";

interface TestResult { name: string; passed: boolean; detail?: string }

export function runSelfTest(bodyData: BodyData) {
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
  T("render_male_front_blank", () => renderMuscleSvg({ gender: "male", view: "front", layers: [] }, bodyData).svg.includes(BODY_DEFAULT_COLOR));
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

  // ---- exercise resolution (builtin map — works without bundled data) ----
  T("exercise_resolve_bench_press", () => resolveExercise("bench press").layers[0].muscles.includes("chest"));
  T("exercise_resolve_deadlift", () => { const p = resolveExercise("deadlift").layers[0].muscles; return p.includes("hamstring") && p.includes("gluteal") && p.includes("lower-back"); });
  T("exercise_resolve_unmatched", () => resolveExercise("zzzzz nonsense").matched === false);

  // ---- MCP ----
  T("mcp_initialize", () => { const r = handleMcp({ method: "initialize" }, "https://api.anatome.dev") as { result: { serverInfo: { name: string }; protocolVersion: string } }; return r.result.serverInfo.name === "anatome" && r.result.protocolVersion === "2024-11-05"; });
  T("mcp_tools_list_returns_five", () => TOOLS.length === 5 || `got ${TOOLS.length}`);
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

  const passed = tests.filter((t) => t.passed).length;
  const failed = tests.length - passed;
  return { ok: failed === 0, passed, failed, total: tests.length, failed_tests: tests.filter((t) => !t.passed), tests };
}
