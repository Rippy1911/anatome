import { describe, it, expect } from "vitest";
import { getBodyData } from "../src/lib/bodyData.ts";
import {
  searchExercisesLogic, listEquipment, getMuscleInfo, resolveExercise, lookupExerciseById,
} from "../src/lib/exercises.ts";
import { workoutImageLogic } from "../src/lib/workoutImage.ts";

const BASE = "https://api.anatome.dev";

describe("P1 API features", () => {
  it("searchExercisesLogic paginates with offset", () => {
    const page0 = searchExercisesLogic({ q: "", limit: 10, offset: 0 });
    const page1 = searchExercisesLogic({ q: "", limit: 10, offset: 10 });
    expect(page0.total).toBeGreaterThan(50);
    expect(page0.offset).toBe(0);
    expect(page0.limit).toBe(10);
    expect(page0.results).toHaveLength(10);
    expect(page1.results[0]?.ext_id).not.toBe(page0.results[0]?.ext_id);
  });

  it("listEquipment returns sorted unique values", () => {
    const eq = listEquipment();
    expect(eq.length).toBeGreaterThan(5);
    expect(eq).toContain("barbell");
    expect([...eq].sort((a, b) => a.localeCompare(b))).toEqual(eq);
  });

  it("getMuscleInfo returns counts and top exercises for chest", () => {
    const info = getMuscleInfo("chest", BASE);
    expect(info).not.toBeNull();
    expect(info!.slug).toBe("chest");
    expect(info!.body_region).toBe("upper-body");
    expect(info!.exercise_count.primary).toBeGreaterThan(5);
    expect(info!.top_exercises.length).toBeGreaterThan(0);
    expect(info!.top_exercises[0].anatome_imageSrc).toMatch(/^https:\/\//);
  });

  it("resolveExercise includes anatome_imageSrc when base is provided", () => {
    const bench = resolveExercise("bench press", BASE);
    expect(bench.matched).toBe(true);
    expect(bench.anatome_imageSrc).toMatch(/^https:\/\/api\.anatome\.dev\/generateImage/);

    const db = resolveExercise("bench press", BASE);
    if (db.source === "exercise_db") {
      expect(db.anatome_imageSrc).toMatch(/^https:\/\//);
    }
  });

  it("lookupExerciseById falls back from Bench_Press to fuzzy name", () => {
    const { exercise, match } = lookupExerciseById("Bench_Press");
    expect(exercise).not.toBeNull();
    expect(match).toBe("id_fallback_to_name");
  });

  it("workoutImageLogic stacks muscles across a session", () => {
    const result = workoutImageLogic({
      exercises: ["bench press", "squat", "overhead press"],
      gender: "male",
      view: "dual",
    }, getBodyData());
    expect(result.muscles_hit.length).toBeGreaterThan(3);
    expect(result.per_muscle_count.chest).toBeGreaterThanOrEqual(1);
    expect(result.exercises_resolved).toHaveLength(3);
    expect(result.svg).toContain("<svg");
    expect(result.svg).toContain("#DC2626");
  });
});
