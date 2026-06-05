import { describe, it, expect } from "vitest";
import { deriveKeywords, computeVariations, computeRelatedExerciseIds } from "../src/lib/exerciseEnrichment.ts";
import { encodeSearchCursor, decodeSearchCursor } from "../src/lib/searchCursor.ts";
import { buildExerciseRecord, getByName, searchExercisesLogic } from "../src/lib/exercises.ts";

const base = "https://api.anatome.dev";

describe("exerciseEnrichment", () => {
  it("derives keywords from exercise fields", () => {
    const { exercise } = getByName("bench press");
    expect(exercise).toBeTruthy();
    const kw = deriveKeywords(exercise!);
    expect(kw.some((k) => k.includes("bench"))).toBe(true);
    expect(kw.some((k) => k.includes("chest") || k === "chest")).toBe(true);
  });

  it("computes variations and related ids for bench press", () => {
    const { exercise } = getByName("bench press");
    expect(exercise).toBeTruthy();
    const vars = computeVariations(exercise!, base);
    const related = computeRelatedExerciseIds(exercise!);
    expect(vars.length).toBeGreaterThan(0);
    expect(related.length).toBeGreaterThan(0);
    expect(vars[0].ext_id).not.toBe(exercise!.ext_id);
  });

  it("buildExerciseRecord includes movementType alias", () => {
    const { exercise } = getByName("bench press");
    const row = buildExerciseRecord(exercise!, base);
    expect(row.movementType).toBe(row.mechanic);
  });
});

describe("searchCursor", () => {
  it("round-trips cursor state", () => {
    const cur = encodeSearchCursor({ q: "bench", offset: 20 });
    const decoded = decodeSearchCursor(cur);
    expect(decoded?.q).toBe("bench");
    expect(decoded?.offset).toBe(20);
  });

  it("search returns next_cursor when more results exist", () => {
    const page = searchExercisesLogic({ q: "", limit: 5, offset: 0 });
    expect(page.total).toBeGreaterThan(5);
    expect(page.next_cursor).toBeTruthy();
    const page2 = searchExercisesLogic({ cursor: page.next_cursor, limit: 5 });
    expect(page2.results[0]?.ext_id).not.toBe(page.results[0]?.ext_id);
  });
});
