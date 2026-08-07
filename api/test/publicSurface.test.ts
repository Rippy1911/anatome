import { describe, it, expect } from "vitest";
import * as worker from "../src/index.ts";
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
  "/listGuides",
  "/getGuide",
  "/getGuideTree",
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
      "list_guides",
      "get_guide",
      "get_guide_tree",
    ]);
  });
});

describe("worker module shape", () => {
  it("exports only a default handler and Durable Object classes", () => {
    // workerd inspects every named export of the entrypoint and refuses to start if one is not
    // a handler: `Incorrect type for map entry 'X': the provided value is not of type 'function
    // or ExportedHandler'`. A stray `export const` therefore takes production down at boot —
    // and neither `wrangler deploy --dry-run` (which only bundles) nor a unit test that imports
    // the Hono app directly will notice. This did happen: `export const API_VERSION` broke
    // `wrangler dev` outright and would have broken the deploy.
    const allowed = new Set(["default", "RateLimiterDO"]);
    const unexpected = Object.keys(worker).filter((k) => !allowed.has(k));
    expect(unexpected).toEqual([]);

    for (const name of Object.keys(worker)) {
      const value = (worker as Record<string, unknown>)[name];
      expect(typeof value === "function" || typeof value === "object").toBe(true);
    }
  });
});
