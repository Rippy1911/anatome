import { describe, it, expect } from "vitest";
import {
  freeExerciseDbImageUrl,
  freeExerciseDbRawUrl,
  freeExerciseDbImageUrls,
  sanitizeFreeExerciseDbPath,
  buildExerciseRecord,
  formatExercise,
  FREE_EXERCISE_DB_RAW_BASE,
} from "../src/lib/exercises.ts";
import { SEARCH_DEFAULT_FIELDS } from "../src/lib/exerciseFields.ts";
import type { ExerciseRow } from "../src/lib/exercises.ts";

const BASE = "https://api.anatome.dev";

const bench: ExerciseRow = {
  ext_id: "Barbell_Bench_Press_-_Medium_Grip",
  name: "Barbell Bench Press - Medium Grip",
  primaryMuscles: ["chest"],
  secondaryMuscles: ["shoulders", "triceps"],
  anatome_primary_slugs: ["chest"],
  anatome_secondary_slugs: ["deltoids", "triceps"],
  images: ["Barbell_Bench_Press_-_Medium_Grip/0.jpg", "Barbell_Bench_Press_-_Medium_Grip/1.jpg"],
};

describe("sanitizeFreeExerciseDbPath", () => {
  it("accepts a normal relative path", () => {
    expect(sanitizeFreeExerciseDbPath("Barbell_Bench_Press_-_Medium_Grip/0.jpg"))
      .toBe("Barbell_Bench_Press_-_Medium_Grip/0.jpg");
  });

  it("accepts paths with spaces and hyphens", () => {
    expect(sanitizeFreeExerciseDbPath("One-Arm Open Palm Kettlebell Clean/0.jpg"))
      .toBe("One-Arm Open Palm Kettlebell Clean/0.jpg");
  });

  it("rejects empty / nullish", () => {
    expect(sanitizeFreeExerciseDbPath("")).toBeNull();
    expect(sanitizeFreeExerciseDbPath(null as unknown as string)).toBeNull();
    expect(sanitizeFreeExerciseDbPath(undefined as unknown as string)).toBeNull();
  });

  it("rejects path traversal", () => {
    expect(sanitizeFreeExerciseDbPath("../etc/passwd")).toBeNull();
    expect(sanitizeFreeExerciseDbPath("foo/../../bar")).toBeNull();
  });

  it("rejects leading slash and backslashes", () => {
    expect(sanitizeFreeExerciseDbPath("/etc/passwd")).toBeNull();
    expect(sanitizeFreeExerciseDbPath("foo\\bar")).toBeNull();
  });

  it("rejects disallowed characters", () => {
    expect(sanitizeFreeExerciseDbPath("foo/bar?<script>")).toBeNull();
    expect(sanitizeFreeExerciseDbPath("foo:bar/0.jpg")).toBeNull();
  });

  it("rejects a single segment (no folder)", () => {
    expect(sanitizeFreeExerciseDbPath("0.jpg")).toBeNull();
  });
});

describe("freeExerciseDbRawUrl", () => {
  it("builds the canonical upstream URL with slashes preserved", () => {
    expect(freeExerciseDbRawUrl("Barbell_Bench_Press_-_Medium_Grip/0.jpg"))
      .toBe(`${FREE_EXERCISE_DB_RAW_BASE}Barbell_Bench_Press_-_Medium_Grip/0.jpg`);
  });

  it("percent-encodes spaces per segment but keeps slashes", () => {
    expect(freeExerciseDbRawUrl("One-Arm Open Palm/0.jpg"))
      .toBe(`${FREE_EXERCISE_DB_RAW_BASE}One-Arm%20Open%20Palm/0.jpg`);
  });

  it("returns null for invalid input", () => {
    expect(freeExerciseDbRawUrl("../x")).toBeNull();
    expect(freeExerciseDbRawUrl(null)).toBeNull();
  });
});

describe("freeExerciseDbImageUrl (Anatome-hosted)", () => {
  it("points at the /exerciseImage passthrough, not raw github", () => {
    const u = freeExerciseDbImageUrl("Barbell_Bench_Press_-_Medium_Grip/0.jpg", BASE);
    expect(u).toBe(`${BASE}/exerciseImage?path=${encodeURIComponent("Barbell_Bench_Press_-_Medium_Grip/0.jpg")}`);
    expect(u).not.toContain("githubusercontent");
  });

  it("returns null for invalid paths", () => {
    expect(freeExerciseDbImageUrl("../x", BASE)).toBeNull();
  });
});

describe("freeExerciseDbImageUrls", () => {
  it("resolves every image in the array", () => {
    const urls = freeExerciseDbImageUrls(bench.images, BASE);
    expect(urls).toHaveLength(2);
    for (const u of urls) {
      expect(u).toContain("/exerciseImage?path=");
      expect(u).toContain(encodeURIComponent("Barbell_Bench_Press_-_Medium_Grip/"));
    }
  });

  it("drops invalid entries silently", () => {
    expect(freeExerciseDbImageUrls(["../bad", "ok/0.jpg"], BASE)).toHaveLength(1);
  });
});

describe("buildExerciseRecord / formatExercise expose source_images", () => {
  it("buildExerciseRecord includes Anatome-hosted source_images", () => {
    const full = buildExerciseRecord(bench, BASE);
    expect(Array.isArray(full.source_images)).toBe(true);
    expect((full.source_images as string[]).length).toBe(2);
    expect((full.source_images as string[])[0]).toContain("/exerciseImage?path=");
    expect(String((full.source_images as string[])[0])).not.toContain("githubusercontent");
    // raw relative paths are still present for back-compat
    expect(Array.isArray(full.images)).toBe(true);
  });

  it("search default projection includes source_images", () => {
    expect(SEARCH_DEFAULT_FIELDS.has("source_images")).toBe(true);
    const row = formatExercise(bench, BASE, "search", SEARCH_DEFAULT_FIELDS);
    expect(Array.isArray(row.source_images)).toBe(true);
    expect((row.source_images as string[]).length).toBe(2);
  });

  it("source_images is empty array when images missing", () => {
    const noImg = { ...bench, images: undefined };
    const full = buildExerciseRecord(noImg, BASE);
    expect(full.source_images).toEqual([]);
  });
});
