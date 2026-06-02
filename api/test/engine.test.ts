import { describe, it, expect } from "vitest";
import { renderMuscleSvg, listMuscles } from "../src/lib/muscleEngine.ts";
import { resolveExercise } from "../src/lib/exercises.ts";
import { runSelfTest } from "../src/routes/selfTest.ts";
import { getBodyData } from "../src/lib/bodyData.ts";

const EMPTY_BODY = { male: { front: [], back: [] }, female: { front: [], back: [] } };

describe("muscleEngine", () => {
  it("renders an svg element", () => {
    const { svg } = renderMuscleSvg({ gender: "male", view: "front", layers: [] }, EMPTY_BODY);
    expect(svg).toContain("<svg");
  });

  it("uses documented default body color when body data has parts", () => {
    const bodyWithParts = {
      male: { front: [{ slug: "head", path: { common: ["M0 0"] } }], back: [] },
      female: { front: [], back: [] },
    };
    const { svg } = renderMuscleSvg({ gender: "male", view: "front", layers: [] }, bodyWithParts);
    expect(svg).toContain("#282828");
  });

  it("applies layer colors when body data has matching parts", () => {
    const bodyWithChest = {
      male: { front: [{ slug: "chest", path: { common: ["M0 0"] } }], back: [] },
      female: { front: [], back: [] },
    };
    const { svg } = renderMuscleSvg(
      { gender: "male", view: "front", layers: [{ color: "#123456", muscles: ["chest"] }] },
      bodyWithChest,
    );
    expect(svg).toContain('fill="#123456"');
  });

  it("lists 23 muscles", () => {
    expect(listMuscles()).toHaveLength(23);
  });
});

describe("resolveExercise", () => {
  it("resolves bench press to chest", () => {
    expect(resolveExercise("bench press").layers[0].muscles).toContain("chest");
  });
  it("flags nonsense as unmatched", () => {
    expect(resolveExercise("zzzzz nonsense").matched).toBe(false);
  });
});

describe("selfTest harness", () => {
  it("runs all selfTest cases green", async () => {
    const result = await runSelfTest(getBodyData());
    expect(result.ok).toBe(true);
    expect(result.passed).toBe(result.total);
    expect(result.total).toBeGreaterThanOrEqual(46);
    expect(result.failed).toBe(0);
    if (result.failed > 0) {
      result.failed_tests.forEach((t) => console.log(`  FAIL: ${t.name}: ${t.detail}`));
    }
  });
});
