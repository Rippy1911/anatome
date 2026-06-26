import { describe, it, expect } from "vitest";
import { buildOpenApiSpec } from "../src/routes/openapi.ts";
import { TOOLS } from "../src/routes/mcp.ts";

const PUBLIC_ENDPOINTS = [
  "/generateImage",
  "/workoutImage",
  "/searchExercises",
  "/getExercise",
  "/resolveExercise",
  "/listMuscles",
  "/muscleInfo",
  "/listEquipment",
  "/mcp",
  "/openapi",
  "/ciStatus",
  "/selfTest",
];

describe("public API surface (no AI exposure)", () => {
  it("OpenAPI paths exclude aiDemo and LLM routes", () => {
    const spec = buildOpenApiSpec("https://api.anatome.dev");
    const paths = Object.keys(spec.paths || {});
    expect(paths).not.toContain("/aiDemo");
    expect(paths.some((p) => /ai|llm/i.test(p))).toBe(false);
    for (const p of PUBLIC_ENDPOINTS) {
      if (p !== "/mcp" && p !== "/openapi" && p !== "/ciStatus" && p !== "/selfTest") {
        expect(paths).toContain(p);
      }
    }
  });

  it("MCP tools exclude aiDemo", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).not.toContain("ai_demo");
    expect(names).not.toContain("aiDemo");
    expect(names.some((n) => /ai|llm/i.test(n))).toBe(false);
    expect(names).toEqual([
      "generate_muscle_image",
      "list_muscles",
      "resolve_exercise",
      "search_exercises",
      "get_exercise",
      "get_exercise_gif",
      "workout_image",
    ]);
  });
});
