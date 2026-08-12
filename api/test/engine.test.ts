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
    // Option C (tuned) defaults: muscle fill #575757, contour fill #e5e7eb (distinct, so
    // un-highlighted muscles keep visible definition against the body silhouette).
    expect(svg).toContain("#575757");
    expect(svg).toContain("#e5e7eb");
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

  // muscles_rendered is the only machine-readable statement about an image the caller cannot see.
  // It used to name every muscle group drawn — i.e. all of them, on every request — so an MCP
  // client asking for chest got back a list of nineteen and told the user nineteen were worked.
  it("reports only the muscles that were actually highlighted", () => {
    const body = {
      male: {
        front: [
          { slug: "chest", path: { common: ["M0 0"] } },
          { slug: "abs", path: { common: ["M1 1"] } },
          { slug: "quadriceps", path: { common: ["M2 2"] } },
        ],
        back: [],
      },
      female: { front: [], back: [] },
    };
    const { muscles_rendered } = renderMuscleSvg(
      { gender: "male", view: "front", layers: [{ color: "#123456", muscles: ["chest"] }] },
      body,
    );
    expect(muscles_rendered).toEqual(["chest"]);
  });

  it("reports nothing when nothing was highlighted", () => {
    const body = {
      male: { front: [{ slug: "chest", path: { common: ["M0 0"] } }], back: [] },
      female: { front: [], back: [] },
    };
    const { svg, muscles_rendered } = renderMuscleSvg({ gender: "male", view: "front", layers: [] }, body);
    // The body is still drawn — this is about what we CLAIM, not what we paint.
    expect(svg).toContain('data-muscle="chest"');
    expect(muscles_rendered).toEqual([]);
  });
});

describe("resolveExercise", () => {
  it("resolves bench press to chest", () => {
    expect(resolveExercise("bench press").layers[0].muscles).toContain("chest");
  });
  it("flags nonsense as unmatched", () => {
    expect(resolveExercise("zzzzz nonsense").matched).toBe(false);
  });

  // "Barbell row" is the 5x5 lift and the vernacular name everyone types. It scored
  // `Upright Barbell Row` above `Bent Over Barbell Row` because "upright" is one word and
  // "bent over" is two. Upright rows are deltoids and traps; the user meant their back.
  it("resolves an unqualified row to a horizontal row, not an upright one", () => {
    const r = resolveExercise("barbell row");
    expect(r.ext_id).toBe("Bent_Over_Barbell_Row");
    expect(r.layers[0].muscles).toContain("upper-back");
  });

  it("still resolves an upright row when that is what was asked for", () => {
    expect(resolveExercise("upright barbell row").ext_id).toBe("Upright_Barbell_Row");
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
