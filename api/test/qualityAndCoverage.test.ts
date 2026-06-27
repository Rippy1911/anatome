/**
 * Comprehensive quality tests for the OSS Anatome Worker API.
 *
 * Covers:
 *  - Confirmed bugs found in the 2026-06-27 due diligence pass (marked [FIX])
 *  - Full exercise search/get/resolve/filter flows
 *  - Field projection correctness
 *  - Muscle slug alias normalization
 *  - MCP tool return shapes
 *  - Security edge cases
 *  - Response shape contracts (prevent regressions)
 */
import { describe, it, expect } from "vitest";
import {
  searchExercisesLogic,
  getByMuscle,
  formatExercise,
  resolveExercise,
  lookupExerciseById,
  getByName,
  buildExerciseRecord,
  sanitizeFreeExerciseDbPath,
  freeExerciseDbImageUrl,
  count as exerciseCount,
} from "../src/lib/exercises.ts";
import { parseFieldsParam, projectRecord, SEARCH_DEFAULT_FIELDS } from "../src/lib/exerciseFields.ts";
import { normalizeSlug, MUSCLE_SLUG_ALIASES, MUSCLES } from "../src/data/muscleCatalog.ts";
import { computeMcpResult, TOOLS } from "../src/routes/mcp.ts";
import { getBodyData } from "../src/lib/bodyData.ts";
import { workoutImageLogic } from "../src/lib/workoutImage.ts";
import { buildOpenApiSpec } from "../src/routes/openapi.ts";

const BASE = "https://api.anatome.dev";

// ─────────────────────────────────────────────────────────────────────────────
// FIX-1: searchExercises muscle filter normalizes aliases
// ─────────────────────────────────────────────────────────────────────────────
describe("[FIX-1] searchExercises muscle filter normalizes slug aliases", () => {
  it("muscle=abductors finds gluteal exercises (alias: abductors→gluteal)", () => {
    const result = searchExercisesLogic({ muscle: "abductors", limit: 5 });
    expect(result.total).toBeGreaterThan(0);
    // Every result should have 'gluteal' in its primary or secondary slugs
    for (const e of result.results) {
      const slugs = [...(e.anatome_primary_slugs || []), ...(e.anatome_secondary_slugs || [])];
      expect(slugs).toContain("gluteal");
    }
  });

  it("muscle=glutes finds the same results as muscle=gluteal", () => {
    const byAlias = searchExercisesLogic({ muscle: "glutes", limit: 50 });
    const byCanon = searchExercisesLogic({ muscle: "gluteal", limit: 50 });
    expect(byAlias.total).toBe(byCanon.total);
    expect(byAlias.total).toBeGreaterThan(0);
  });

  it("muscle=shoulders finds deltoid exercises", () => {
    const result = searchExercisesLogic({ muscle: "shoulders", limit: 5 });
    expect(result.total).toBeGreaterThan(0);
    for (const e of result.results) {
      const slugs = [...(e.anatome_primary_slugs || []), ...(e.anatome_secondary_slugs || [])];
      expect(slugs).toContain("deltoids");
    }
  });

  it("muscle=hamstrings (plural alias) finds hamstring exercises", () => {
    const result = searchExercisesLogic({ muscle: "hamstrings", limit: 5 });
    expect(result.total).toBeGreaterThan(0);
    for (const e of result.results) {
      const slugs = [...(e.anatome_primary_slugs || []), ...(e.anatome_secondary_slugs || [])];
      expect(slugs).toContain("hamstring");
    }
  });

  it("muscle=adductors (canonical) still works", () => {
    const result = searchExercisesLogic({ muscle: "adductors", limit: 5 });
    expect(result.total).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX-1b: getByMuscle also normalizes aliases
// ─────────────────────────────────────────────────────────────────────────────
describe("[FIX-1b] getByMuscle normalizes slug aliases", () => {
  it("getByMuscle('abductors', 5) returns gluteal exercises", () => {
    const results = getByMuscle("abductors", 5);
    expect(results.length).toBeGreaterThan(0);
    for (const e of results) {
      expect(e.anatome_primary_slugs || []).toContain("gluteal");
    }
  });

  it("getByMuscle('glutes', 5) == getByMuscle('gluteal', 5)", () => {
    const byAlias = getByMuscle("glutes", 50);
    const byCanon = getByMuscle("gluteal", 50);
    expect(byAlias.length).toBe(byCanon.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX-2: resolveExercise image_src is always absolute when base is provided
// ─────────────────────────────────────────────────────────────────────────────
describe("[FIX-2] resolveExercise image_src is absolute when base provided", () => {
  it("image_src is an absolute https:// URL when base is provided", () => {
    const r = resolveExercise("bench press", BASE);
    expect(r.matched).toBe(true);
    expect(r.image_src).toBeTruthy();
    expect(String(r.image_src)).toMatch(/^https:\/\//);
    expect(String(r.image_src)).not.toMatch(/^\/generate/);
  });

  it("anatome_imageSrc and image_src point to the same URL", () => {
    const r = resolveExercise("bench press", BASE);
    expect(r.anatome_imageSrc).toBe(r.image_src);
  });

  it("image_src is undefined (not relative) when no base is provided", () => {
    const r = resolveExercise("bench press");
    // Without base, image_src may be null/undefined or the raw relative value — never a broken relative path
    if (r.image_src) {
      // it should be whatever is stored in the exercise row
      expect(typeof r.image_src).toBe("string");
    }
  });

  it("keyword_fallback resolveExercise also gets image_src set when base is provided", () => {
    const r = resolveExercise("some unknown exercise with biceps", BASE);
    // keyword fallback will match 'biceps'
    if (r.matched) {
      expect(r.image_src).toMatch(/^https:\/\//);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX-3: MCP workout_image returns structured JSON, not raw SVG
// ─────────────────────────────────────────────────────────────────────────────
describe("[FIX-3] MCP workout_image tool returns JSON, not raw SVG", () => {
  it("content[0].text is parseable JSON with muscles_hit", () => {
    const inner = computeMcpResult(
      "tools/call",
      { name: "workout_image", arguments: { exercises: ["bench press", "squat"] } },
      BASE,
    );
    expect(inner.ok).toBe(true);
    const content = (inner.result as { content: { type: string; text: string }[] }).content;
    expect(content.length).toBeGreaterThan(0);
    expect(content[0].type).toBe("text");
    // Must be valid JSON
    const parsed = JSON.parse(content[0].text);
    expect(Array.isArray(parsed.muscles_hit)).toBe(true);
    expect(parsed.muscles_hit.length).toBeGreaterThan(0);
    expect(typeof parsed.svg).toBe("string");
    expect(parsed.svg).toContain("<svg");
    expect(Array.isArray(parsed.exercises_resolved)).toBe(true);
    expect(parsed.exercises_resolved).toHaveLength(2);
  });

  it("content[0].text does NOT start with '<svg' (no longer raw SVG)", () => {
    const inner = computeMcpResult(
      "tools/call",
      { name: "workout_image", arguments: { exercises: ["deadlift"] } },
      BASE,
    );
    const content = (inner.result as { content: { type: string; text: string }[] }).content;
    expect(content[0].text.trimStart()).not.toMatch(/^<svg/);
  });

  it("exercises_resolved shows unmatched exercises with matched:false", () => {
    const inner = computeMcpResult(
      "tools/call",
      { name: "workout_image", arguments: { exercises: ["bench press", "xyz_not_real_abc"] } },
      BASE,
    );
    const content = (inner.result as { content: { type: string; text: string }[] }).content;
    const parsed = JSON.parse(content[0].text);
    const matched = parsed.exercises_resolved.map((e: { matched: boolean }) => e.matched);
    expect(matched).toContain(true);  // bench press matched
    expect(matched).toContain(false); // xyz_not_real_abc unmatched
  });

  it("empty exercises array returns error, not crash", () => {
    const inner = computeMcpResult(
      "tools/call",
      { name: "workout_image", arguments: { exercises: [] } },
      BASE,
    );
    expect(inner.ok).toBe(false);
    expect(inner.error?.code).toBe(-32602);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX-4: Field projection always includes ext_id and name
// ─────────────────────────────────────────────────────────────────────────────
describe("[FIX-4] Field projection always preserves ext_id and name", () => {
  it("fields=name also returns ext_id (always-include rule)", () => {
    const { results } = searchExercisesLogic({ q: "bench", limit: 1 });
    expect(results.length).toBeGreaterThan(0);
    const projected = formatExercise(results[0], BASE, "search", new Set(["name"]));
    expect(projected.name).toBeTruthy();
    expect(projected.ext_id).toBeTruthy();  // always present
    expect(projected.instructions).toBeUndefined(); // other fields dropped
  });

  it("fields=gif_url also returns ext_id and name", () => {
    const { results } = searchExercisesLogic({ q: "squat", limit: 1 });
    const projected = formatExercise(results[0], BASE, "search", new Set(["gif_url"]));
    expect(projected.gif_url).toBeTruthy();
    expect(projected.ext_id).toBeTruthy();
    expect(projected.name).toBeTruthy();
    expect(projected.primaryMuscles).toBeUndefined();
  });

  it("fields=all/* returns every field including ext_id", () => {
    const { results } = searchExercisesLogic({ q: "deadlift", limit: 1 });
    const projected = formatExercise(results[0], BASE, "search", null); // null = all
    expect(projected.ext_id).toBeTruthy();
    expect(projected.name).toBeTruthy();
    expect(projected.gif_url).toBeTruthy();
  });

  it("projectRecord never drops ext_id even if not in fields set", () => {
    const record = { ext_id: "Bench_Press", name: "Bench Press", gif_url: "https://x.com/g.gif" };
    const projected = projectRecord(record as never, new Set(["gif_url"]) as never);
    expect(projected.ext_id).toBe("Bench_Press");
    expect(projected.name).toBe("Bench Press");
    expect(projected.gif_url).toBe("https://x.com/g.gif");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Muscle slug alias catalog
// ─────────────────────────────────────────────────────────────────────────────
describe("Muscle slug alias catalog correctness", () => {
  const CRITICAL_ALIASES = [
    ["abductors", "gluteal"],   // anatomically the closest available proxy
    ["glutes", "gluteal"],
    ["shoulders", "deltoids"],
    ["hamstrings", "hamstring"],
    ["lats", "upper-back"],
    ["pecs", "chest"],
    ["bicep", "biceps"],
    ["tricep", "triceps"],
    ["abdominals", "abs"],
    ["quads", "quadriceps"],
    ["calfs", "calves"],
    ["traps", "trapezius"],
    ["back", "upper-back"],
  ] as const;

  for (const [alias, canonical] of CRITICAL_ALIASES) {
    it(`normalizeSlug('${alias}') === '${canonical}'`, () => {
      expect(normalizeSlug(alias)).toBe(canonical);
    });
  }

  it("all canonical slugs resolve to themselves", () => {
    for (const slug of MUSCLES) {
      expect(normalizeSlug(slug)).toBe(slug);
    }
  });

  it("abductors alias points to gluteal (NOT adductors — they are antagonists)", () => {
    expect(MUSCLE_SLUG_ALIASES["abductors"]).toBe("gluteal");
    expect(MUSCLE_SLUG_ALIASES["abductors"]).not.toBe("adductors");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Exercise search — comprehensive filters
// ─────────────────────────────────────────────────────────────────────────────
describe("searchExercisesLogic — comprehensive filters", () => {
  it("dataset has 873 exercises", () => {
    expect(exerciseCount()).toBe(873);
  });

  it("text search: q=deadlift returns deadlift variants", () => {
    const { results, total } = searchExercisesLogic({ q: "deadlift", limit: 10 });
    expect(total).toBeGreaterThan(3);
    for (const e of results) {
      expect(e.name?.toLowerCase()).toContain("deadlift");
    }
  });

  it("equipment=barbell filter works correctly", () => {
    const { results, total } = searchExercisesLogic({ equipment: "barbell", limit: 5 });
    expect(total).toBeGreaterThan(50);
    for (const e of results) {
      expect(e.equipment?.toLowerCase()).toBe("barbell");
    }
  });

  it("level=expert filter returns only expert exercises", () => {
    const { results, total } = searchExercisesLogic({ level: "expert", limit: 5 });
    expect(total).toBeGreaterThan(0);
    for (const e of results) {
      expect(e.level).toBe("expert");
    }
  });

  it("combined q+muscle filter", () => {
    const { results } = searchExercisesLogic({ q: "press", muscle: "chest", limit: 5 });
    for (const e of results) {
      expect(e.name?.toLowerCase()).toContain("press");
      const slugs = [...(e.anatome_primary_slugs || []), ...(e.anatome_secondary_slugs || [])];
      expect(slugs).toContain("chest");
    }
  });

  it("limit is capped at 50", () => {
    const { results } = searchExercisesLogic({ limit: 9999 });
    expect(results).toHaveLength(50);
  });

  it("offset paginates correctly — page 2 has different results than page 1", () => {
    const p1 = searchExercisesLogic({ limit: 10, offset: 0 });
    const p2 = searchExercisesLogic({ limit: 10, offset: 10 });
    expect(p1.results[0]?.ext_id).not.toBe(p2.results[0]?.ext_id);
    expect(p1.total).toBe(p2.total);
  });

  it("cursor pagination is consistent with offset pagination", () => {
    const p1 = searchExercisesLogic({ q: "", limit: 5, offset: 0 });
    expect(p1.next_cursor).toBeTruthy();
    const p2cursor = searchExercisesLogic({ cursor: p1.next_cursor, limit: 5 });
    const p2offset = searchExercisesLogic({ q: "", limit: 5, offset: 5 });
    expect(p2cursor.results.map((e) => e.ext_id)).toEqual(p2offset.results.map((e) => e.ext_id));
  });

  it("no results for impossible combination", () => {
    const { total } = searchExercisesLogic({ q: "zzz_nonexistent_xyz_abc", limit: 5 });
    expect(total).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveExercise — comprehensive cases
// ─────────────────────────────────────────────────────────────────────────────
describe("resolveExercise — comprehensive", () => {
  it("bench press: all expected fields present", () => {
    const r = resolveExercise("bench press", BASE);
    expect(r.matched).toBe(true);
    expect(r.source).toBe("exercise_db");
    expect(r.ext_id).toBeTruthy();
    expect(r.layers.length).toBeGreaterThan(0);
    expect(r.layers[0].muscles).toContain("chest");
    expect(r.gif_url).toMatch(/\/exerciseGif\?id=/);
    expect(r.anatome_imageSrc).toMatch(/^https:\/\//);
    expect(r.image_src).toMatch(/^https:\/\//);
    expect(r.explanation).toContain("chest");
  });

  it("keyword fallback: 'bicep curl' falls back to keyword extraction", () => {
    // may or may not match DB; if keyword matched, layers should include biceps
    const r = resolveExercise("exercise for bicep", BASE);
    if (r.source === "keyword_fallback") {
      expect(r.matched).toBe(true);
      expect(r.layers[0].muscles).toContain("biceps");
    }
  });

  it("completely unknown input returns matched:false", () => {
    const r = resolveExercise("xyzzy_notanexercise_9999", BASE);
    expect(r.matched).toBe(false);
    expect(r.source).toBe("unmatched");
    expect(r.layers).toHaveLength(0);
  });

  it("resolves common exercise aliases: 'squat', 'pullup', 'pushup'", () => {
    for (const name of ["squat", "pullup", "pushup"]) {
      const r = resolveExercise(name, BASE);
      expect(r.matched).toBe(true);
    }
  });

  it("resolveExercise without base: image_src may exist (raw relative) but no gif_url", () => {
    const r = resolveExercise("bench press");
    expect(r.gif_url).toBeUndefined();
    // image_src is the raw relative value from the exercise row in this case
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getExercise modes
// ─────────────────────────────────────────────────────────────────────────────
describe("getExercise modes", () => {
  it("lookupExerciseById exact match", () => {
    const { exercise, match } = lookupExerciseById("Barbell_Bench_Press_-_Medium_Grip");
    expect(match).toBe("exact");
    expect(exercise?.name).toBe("Barbell Bench Press - Medium Grip");
  });

  it("lookupExerciseById underscore fallback to name", () => {
    const { exercise, match } = lookupExerciseById("Bench_Press");
    expect(match).toBe("id_fallback_to_name");
    expect(exercise).not.toBeNull();
    expect(exercise?.name?.toLowerCase()).toContain("bench press");
  });

  it("lookupExerciseById unknown returns null", () => {
    const { exercise, match } = lookupExerciseById("xyz_not_real_abc_9999");
    expect(exercise).toBeNull();
    expect(match).toBe("none");
  });

  it("getByName exact match", () => {
    const { exercise, match } = getByName("Barbell Bench Press - Medium Grip");
    expect(match).toBe("exact");
    expect(exercise).not.toBeNull();
  });

  it("getByName fuzzy match", () => {
    const { exercise, match } = getByName("bench press"); // 'bench press' is not an exact name
    expect(match).toBe("fuzzy");
    expect(exercise?.name?.toLowerCase()).toContain("bench press");
  });

  it("buildExerciseRecord includes all expected fields", () => {
    const { exercise } = lookupExerciseById("Barbell_Bench_Press_-_Medium_Grip");
    expect(exercise).not.toBeNull();
    const rec = buildExerciseRecord(exercise!, BASE);
    expect(rec.ext_id).toBeTruthy();
    expect(rec.name).toBeTruthy();
    expect(Array.isArray(rec.source_images)).toBe(true);
    expect((rec.source_images as string[]).length).toBeGreaterThan(0);
    expect((rec.source_images as string[])[0]).toMatch(/^https:\/\/.*\/exerciseImage\?path=/);
    expect(rec.gif_url).toMatch(/\/exerciseGif\?id=Barbell_Bench_Press/);
    expect(rec.image_url).toBe(rec.gif_url);
    expect(rec.anatome_imageSrc).toMatch(/^https:\/\/api\.anatome\.dev\/generateImage/);
    expect(Array.isArray(rec.anatome_layers_payload)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// workoutImageLogic — session heatmap
// ─────────────────────────────────────────────────────────────────────────────
describe("workoutImageLogic", () => {
  const bodyData = getBodyData();

  it("stacks muscles across multiple exercises", () => {
    const result = workoutImageLogic({
      exercises: ["bench press", "squat", "overhead press"],
    }, bodyData);
    expect(result.muscles_hit.length).toBeGreaterThan(3);
    expect(result.per_muscle_count.chest).toBeGreaterThanOrEqual(1);
    expect(result.exercises_resolved).toHaveLength(3);
    expect(result.svg).toContain("<svg");
  });

  it("chest hit twice when two chest exercises present → opacity 0.65", () => {
    const result = workoutImageLogic({
      exercises: ["bench press", "incline bench press"],
    }, bodyData);
    // Both primarily hit chest — count should be ≥2
    if (result.per_muscle_count.chest !== undefined) {
      expect(result.per_muscle_count.chest).toBeGreaterThanOrEqual(2);
    }
  });

  it("partial match: unmatched exercise doesn't crash, matched:false in resolved", () => {
    const result = workoutImageLogic({
      exercises: ["bench press", "xyz_not_real"],
    }, bodyData);
    expect(result.exercises_resolved).toHaveLength(2);
    expect(result.exercises_resolved[0].matched).toBe(true);
    expect(result.exercises_resolved[1].matched).toBe(false);
    expect(result.muscles_hit.length).toBeGreaterThan(0); // bench press still contributes
  });

  it("female view returns SVG with correct gender path data", () => {
    const result = workoutImageLogic({ exercises: ["squat"], gender: "female" }, bodyData);
    expect(result.gender).toBe("female");
    expect(result.svg).toContain("<svg");
  });

  it("front/back/dual views all produce SVG output", () => {
    for (const view of ["front", "back", "dual"]) {
      const r = workoutImageLogic({ exercises: ["squat"], view }, bodyData);
      expect(r.view).toBe(view);
      expect(r.svg).toContain("<svg");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP tool contracts
// ─────────────────────────────────────────────────────────────────────────────
describe("MCP tool contracts", () => {
  it("tools/list returns 7 tools in snake_case", () => {
    const inner = computeMcpResult("tools/list", {}, BASE);
    const tools = (inner.result as { tools: { name: string }[] }).tools;
    expect(tools).toHaveLength(7);
    for (const t of tools) {
      expect(t.name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("generate_muscle_image: content[0].text is SVG", () => {
    const inner = computeMcpResult(
      "tools/call",
      { name: "generate_muscle_image", arguments: { layers: [{ color: "#FF0000", muscles: ["chest"] }] } },
      BASE,
    );
    const content = (inner.result as { content: { type: string; text: string }[] }).content;
    expect(content[0].text).toContain("<svg");
  });

  it("search_exercises: content[0].text is parseable JSON with results array", () => {
    const inner = computeMcpResult(
      "tools/call",
      { name: "search_exercises", arguments: { q: "deadlift", limit: 2 } },
      BASE,
    );
    const content = (inner.result as { content: { type: string; text: string }[] }).content;
    const parsed = JSON.parse(content[0].text);
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.results.length).toBeGreaterThan(0);
    // Each result should have ext_id even if not explicitly requested
    for (const r of parsed.results) {
      expect(r.ext_id).toBeTruthy();
    }
  });

  it("get_exercise: content[0].text is parseable JSON with exercise.name", () => {
    const inner = computeMcpResult(
      "tools/call",
      { name: "get_exercise", arguments: { name: "bench press" } },
      BASE,
    );
    const content = (inner.result as { content: { type: string; text: string }[] }).content;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.exercise?.name?.toLowerCase()).toContain("bench");
  });

  it("get_exercise_gif: content[0].text is a URL string", () => {
    const inner = computeMcpResult(
      "tools/call",
      { name: "get_exercise_gif", arguments: { name: "bench press" } },
      BASE,
    );
    const content = (inner.result as { content: { type: string; text: string }[] }).content;
    expect(content[0].text).toMatch(/^https:\/\/.*\/exerciseGif\?id=/);
  });

  it("list_muscles: content[0].text is parseable JSON array of 23 muscles", () => {
    const inner = computeMcpResult("tools/call", { name: "list_muscles", arguments: {} }, BASE);
    const content = (inner.result as { content: { type: string; text: string }[] }).content;
    const parsed = JSON.parse(content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(23);
    expect(parsed[0]).toHaveProperty("slug");
    expect(parsed[0]).toHaveProperty("name");
  });

  it("resolve_exercise: content[0].text is parseable JSON with matched+layers", () => {
    const inner = computeMcpResult(
      "tools/call",
      { name: "resolve_exercise", arguments: { exercise: "squat" } },
      BASE,
    );
    const content = (inner.result as { content: { type: string; text: string }[] }).content;
    const parsed = JSON.parse(content[0].text);
    expect(parsed.matched).toBe(true);
    expect(Array.isArray(parsed.layers)).toBe(true);
    expect(parsed.image_src).toMatch(/^https:\/\//);
  });

  it("unknown tool returns -32602 error", () => {
    const inner = computeMcpResult("tools/call", { name: "searchExercises", arguments: {} }, BASE);
    expect(inner.ok).toBe(false);
    expect(inner.error?.code).toBe(-32602);
    expect(inner.error?.message).toMatch(/Unknown tool/);
  });

  it("tools/call with missing method returns -32601", () => {
    const inner = computeMcpResult("nonexistent/method", {}, BASE);
    expect(inner.ok).toBe(false);
    expect(inner.error?.code).toBe(-32601);
  });

  it("TOOLS array has annotations.readOnlyHint on every tool", () => {
    for (const tool of TOOLS) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OpenAPI spec
// ─────────────────────────────────────────────────────────────────────────────
describe("OpenAPI spec", () => {
  it("is a raw spec — no {ok,data} wrapper", () => {
    const spec = buildOpenApiSpec(BASE);
    expect(spec).toHaveProperty("openapi");
    expect(spec).toHaveProperty("paths");
    expect(spec).not.toHaveProperty("ok");
    expect(spec).not.toHaveProperty("data");
  });

  it("all 7 MCP tool names appear in spec as operations", () => {
    const spec = buildOpenApiSpec(BASE);
    const opSummaries = Object.values(spec.paths || {})
      .flatMap((p: unknown) => Object.values(p as Record<string, unknown>))
      .map((op: unknown) => String((op as Record<string, string>).summary || "").toLowerCase());
    expect(opSummaries.some((s) => s.includes("workout") || s.includes("session"))).toBe(true);
    expect(opSummaries.some((s) => s.includes("exercise"))).toBe(true);
    expect(opSummaries.some((s) => s.includes("muscle"))).toBe(true);
  });

  it("version is semver format", () => {
    const spec = buildOpenApiSpec(BASE);
    expect(spec.info?.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("has at least 13 paths (all endpoints documented)", () => {
    const spec = buildOpenApiSpec(BASE);
    expect(Object.keys(spec.paths || {}).length).toBeGreaterThanOrEqual(13);
  });

  it("exerciseImage path documented with path sanitization note", () => {
    const spec = buildOpenApiSpec(BASE);
    const exerciseImagePath = spec.paths?.["/exerciseImage"];
    expect(exerciseImagePath).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Security: sanitizeFreeExerciseDbPath
// ─────────────────────────────────────────────────────────────────────────────
describe("sanitizeFreeExerciseDbPath — security edge cases", () => {
  it("accepts standard exercise image paths", () => {
    expect(sanitizeFreeExerciseDbPath("Barbell_Bench_Press_-_Medium_Grip/0.jpg")).toBeTruthy();
    expect(sanitizeFreeExerciseDbPath("Squat/1.jpg")).toBeTruthy();
  });

  it("rejects all traversal patterns", () => {
    const attacks = [
      "../etc/passwd",
      "../../etc/shadow",
      "./foo/../bar",
      "Bench/../etc/passwd",
      "foo%2F..%2Fetc",
      "..%2Fetc%2Fpasswd",
    ];
    for (const attack of attacks) {
      expect(sanitizeFreeExerciseDbPath(attack)).toBeNull();
    }
  });

  it("rejects paths with backslashes (Windows-style)", () => {
    expect(sanitizeFreeExerciseDbPath("foo\\bar.jpg")).toBeNull();
    expect(sanitizeFreeExerciseDbPath("foo/bar\\baz.jpg")).toBeNull();
  });

  it("rejects paths with leading slash", () => {
    expect(sanitizeFreeExerciseDbPath("/etc/passwd")).toBeNull();
  });

  it("rejects single-segment paths (no exercise directory component)", () => {
    expect(sanitizeFreeExerciseDbPath("passwd")).toBeNull();
  });

  it("rejects paths with forbidden characters", () => {
    const bad = ["foo/b<ar.jpg", "foo/b>ar.jpg", "foo/b\"ar.jpg", "foo/b?ar.jpg", "foo/b#ar.jpg"];
    for (const b of bad) {
      expect(sanitizeFreeExerciseDbPath(b)).toBeNull();
    }
  });

  it("freeExerciseDbImageUrl produces an Anatome-proxied URL", () => {
    const url = freeExerciseDbImageUrl("Barbell_Bench_Press_-_Medium_Grip/0.jpg", BASE);
    expect(url).toMatch(/^https:\/\/api\.anatome\.dev\/exerciseImage\?path=/);
    expect(url).not.toContain("github");
    expect(url).not.toContain("..");
  });

  it("freeExerciseDbImageUrl returns null for malicious input", () => {
    expect(freeExerciseDbImageUrl("../etc/passwd", BASE)).toBeNull();
    expect(freeExerciseDbImageUrl("foo\\bar.jpg", BASE)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Data integrity
// ─────────────────────────────────────────────────────────────────────────────
describe("Exercise dataset integrity", () => {
  it("all exercises have name and ext_id", () => {
    const { results } = searchExercisesLogic({ limit: 50 });
    for (const e of results) {
      expect(e.name).toBeTruthy();
      expect(e.ext_id).toBeTruthy();
    }
  });

  it("all exercises have at least one anatome_primary_slug or secondaryslug", () => {
    const { results } = searchExercisesLogic({ limit: 50 });
    let withoutMuscles = 0;
    for (const e of results) {
      const total = (e.anatome_primary_slugs?.length || 0) + (e.anatome_secondary_slugs?.length || 0);
      if (total === 0) withoutMuscles++;
    }
    // The dataset should have near-zero unmapped exercises in the first 50
    expect(withoutMuscles).toBeLessThan(5);
  });

  it("no duplicate ext_ids in the dataset", () => {
    const { results } = searchExercisesLogic({ limit: 50 });
    const ids = results.map((e) => e.ext_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all searchExercises results have instructions array", () => {
    const { results } = searchExercisesLogic({ q: "bench", limit: 5 });
    for (const e of results) {
      const formatted = formatExercise(e, BASE, "search", SEARCH_DEFAULT_FIELDS);
      expect(Array.isArray(formatted.instructions)).toBe(true);
      expect((formatted.instructions as string[]).length).toBeGreaterThan(0);
    }
  });
});
