import { describe, it, expect } from "vitest";
import {
  formatExercise,
  lookupExerciseById,
  searchExercisesLogic,
  resolveExercise,
} from "../src/lib/exercises.ts";
import { TOOLS } from "../src/routes/mcp.ts";
import { buildOpenApiSpec } from "../src/routes/openapi.ts";
import { sanitizeFreeExerciseDbPath } from "../src/lib/exercises.ts";

const BASE = "https://api.anatome.dev";

// ── Regression: getExercise response shape ────────────────────────────────────
// The audit found that developers using `response.name` (instead of
// `response.exercise.name`) get undefined. This test locks the envelope shape.
describe("getExercise response envelope", () => {
  it("formatExercise (used by getExercise handler) returns flat fields, NOT nested under 'exercise'", () => {
    const { exercise: ex } = lookupExerciseById("Barbell_Bench_Press_-_Medium_Grip");
    expect(ex).not.toBeNull();
    const formatted = formatExercise(ex!, BASE, "full");
    // Fields are flat — callers access formatted.name, not formatted.exercise.name
    expect(formatted.name).toBe("Barbell Bench Press - Medium Grip");
    expect(formatted).not.toHaveProperty("exercise");
  });

  it("searchExercises results are flat (no 'exercise' wrapper)", () => {
    const { results } = searchExercisesLogic({ q: "bench press", limit: 1 });
    expect(results.length).toBeGreaterThan(0);
    const first = formatExercise(results[0], BASE, "search");
    expect(first.name).toBeTruthy();
    expect(first).not.toHaveProperty("exercise");
  });

  it("getExercise result has source_images array when images are present", () => {
    const { exercise: ex } = lookupExerciseById("Barbell_Bench_Press_-_Medium_Grip");
    expect(ex).not.toBeNull();
    const formatted = formatExercise(ex!, BASE, "full");
    // source_images must be present and be absolute URLs via the /exerciseImage proxy
    expect(Array.isArray(formatted.source_images)).toBe(true);
    expect((formatted.source_images as string[]).length).toBeGreaterThan(0);
    expect((formatted.source_images as string[])[0]).toMatch(/^https:\/\/.*\/exerciseImage\?path=/);
  });
});

// ── Regression: MCP tool name convention ─────────────────────────────────────
// Worker MCP tools must be snake_case. Calling camelCase (searchExercises) used
// to return -32602 "Unknown tool". Tools list is the canonical reference.
describe("MCP tool names", () => {
  it("all tool names are snake_case", () => {
    for (const tool of TOOLS) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.name).not.toMatch(/[A-Z]/); // no camelCase
    }
  });

  it("includes the 10 expected tools", () => {
    const names = TOOLS.map((t) => t.name);
    const EXPECTED = [
      "generate_muscle_image",
      "list_muscles",
      "resolve_exercise",
      "search_exercises",
      "get_exercise",
      "get_exercise_gif",
      "workout_image",
      "list_guides",
      "get_guide",
      "get_guide_tree",
    ];
    for (const n of EXPECTED) expect(names).toContain(n);
    expect(names).toHaveLength(10);
  });

  it("does NOT include camelCase aliases that would confuse developers", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).not.toContain("searchExercises");
    expect(names).not.toContain("getExercise");
    expect(names).not.toContain("generateImage");
  });
});

// ── Regression: openapi spec not wrapped in {ok, data} ───────────────────────
// The platform wraps every response in {ok, data}. The Worker /openapi must
// return the raw spec so Swagger UI / RapidAPI import / openapi-fetch work.
describe("OpenAPI spec shape", () => {
  it("spec is a plain OpenAPI object, not wrapped in {ok, data}", () => {
    const spec = buildOpenApiSpec(BASE);
    // Must have top-level OpenAPI keys
    expect(spec).toHaveProperty("openapi");
    expect(spec).toHaveProperty("paths");
    expect(spec).toHaveProperty("info");
    // Must NOT be wrapped
    expect(spec).not.toHaveProperty("ok");
    expect(spec).not.toHaveProperty("data");
  });

  it("spec has at least 10 paths", () => {
    const spec = buildOpenApiSpec(BASE);
    expect(Object.keys(spec.paths || {}).length).toBeGreaterThanOrEqual(10);
  });

  it("spec version matches service version", () => {
    const spec = buildOpenApiSpec(BASE);
    expect(spec.info?.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ── Regression: path traversal in /exerciseImage ─────────────────────────────
describe("exerciseImage path sanitization (already in securityFixes — extra cases)", () => {
  it("rejects encoded traversal sequences", () => {
    expect(sanitizeFreeExerciseDbPath("..%2Fetc%2Fpasswd")).toBeNull();
  });

  it("rejects Windows-style backslash paths", () => {
    expect(sanitizeFreeExerciseDbPath("foo\\bar.jpg")).toBeNull();
  });

  it("accepts a deeply nested valid path", () => {
    const p = "Barbell_Bench_Press_-_Medium_Grip/0.jpg";
    expect(sanitizeFreeExerciseDbPath(p)).toBe(p);
  });
});

// ── Regression: resolveExercise returns snake_case response ──────────────────
// Confirmed during audit: the worker /resolveExercise returned {ok, ext_id: null}
// for some calls. This test ensures bench press resolves correctly.
describe("resolveExercise correctness", () => {
  it("resolves 'bench press' to a known exercise", () => {
    const r = resolveExercise("bench press", BASE);
    expect(r.matched).toBe(true);
    expect(r.ext_id).toBeTruthy();
    expect(r.image_src).toMatch(/^https:\/\//);
  });

  it("resolves 'squat' and returns layers payload", () => {
    const r = resolveExercise("squat", BASE);
    expect(r.matched).toBe(true);
    expect(r.layers).toBeDefined();
    expect(r.layers!.length).toBeGreaterThan(0);
  });
});
