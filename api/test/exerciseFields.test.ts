import { describe, it, expect } from "vitest";
import { parseFieldsParam, projectRecord, SEARCH_DEFAULT_FIELDS } from "../src/lib/exerciseFields.ts";
import { buildExerciseRecord, formatExercise } from "../src/lib/exercises.ts";
import type { ExerciseRow } from "../src/lib/exercises.ts";

const sample: ExerciseRow = {
  ext_id: "Bench_Press",
  name: "Bench Press",
  instructions: ["Lie on bench.", "Press up."],
  primaryMuscles: ["chest"],
  secondaryMuscles: ["triceps"],
  anatome_primary_slugs: ["chest"],
  anatome_secondary_slugs: ["triceps"],
  equipment: "barbell",
  level: "intermediate",
};

describe("parseFieldsParam", () => {
  it("uses search defaults when omitted", () => {
    expect(parseFieldsParam(undefined, SEARCH_DEFAULT_FIELDS)).toEqual(SEARCH_DEFAULT_FIELDS);
  });

  it("returns all fields for getExercise when omitted", () => {
    expect(parseFieldsParam(undefined, null)).toBeNull();
  });

  it("parses comma list", () => {
    const f = parseFieldsParam("name,instructions,gif_url", SEARCH_DEFAULT_FIELDS);
    expect(f?.has("instructions")).toBe(true);
    expect(f?.has("gif_url")).toBe(true);
    expect(f?.has("anatome_imageSrc")).toBe(false);
  });

  it("all expands to null", () => {
    expect(parseFieldsParam("all", SEARCH_DEFAULT_FIELDS)).toBeNull();
  });
});

describe("formatExercise", () => {
  const base = "https://api.anatome.dev";

  it("search defaults include gif_url and instructions", () => {
    expect(SEARCH_DEFAULT_FIELDS.has("gif_url")).toBe(true);
    expect(SEARCH_DEFAULT_FIELDS.has("instructions")).toBe(true);
    expect(SEARCH_DEFAULT_FIELDS.has("anatome_layers_payload")).toBe(true);
  });

  it("search projection uses anatome-hosted gif", () => {
    const row = formatExercise(sample, base, "search", SEARCH_DEFAULT_FIELDS);
    expect(row.gif_url).toMatch(/\/exerciseGif\?id=Bench_Press&v=5$/);
    expect(String(row.gif_url)).not.toContain("githubusercontent");
  });

  it("includes instructions in search default", () => {
    const row = formatExercise(sample, base, "search", SEARCH_DEFAULT_FIELDS);
    expect(row.instructions).toEqual(["Lie on bench.", "Press up."]);
    expect(row.name).toBe("Bench Press");
    expect(row.gif_url).toContain("/exerciseGif");
  });

  it("can trim search via fields list", () => {
    const row = formatExercise(sample, base, "search", new Set(["name", "gif_url"]));
    expect(row.instructions).toBeUndefined();
    expect(row.gif_url).toBeTruthy();
  });

  it("buildExerciseRecord image_url matches gif_url on Anatome", () => {
    const full = buildExerciseRecord(sample, base);
    expect(full.image_url).toBe(full.gif_url);
    expect(String(full.image_url)).toContain("/exerciseGif?id=Bench_Press&v=5");
  });

  it("buildExerciseRecord always has instructions", () => {
    const full = buildExerciseRecord(sample, base);
    expect(full.instructions).toHaveLength(2);
    expect(full.gif_url).toContain("/exerciseGif?id=Bench_Press&v=5");
  });

  it("projectRecord drops unlisted keys", () => {
    const slim = projectRecord({ a: 1, b: 2 }, new Set(["a"] as never));
    expect(slim).toEqual({ a: 1 });
  });
});
