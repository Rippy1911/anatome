// The inline SVG charts on the share page.
//
// These are pure string functions, so they belong in the fast suite — but the bugs they had were
// *visual*, and neither was reachable by reading the code. Both were found by minting a real link
// and looking at the rendered page. What is pinned here is what looking at it revealed.

import { describe, it, expect } from "vitest";
import { barChart, type Point } from "../src/lib/charts.ts";

const PLOT_W = 720 - 44 - 16;

function days(n: number, value: (i: number) => number): Point[] {
  return Array.from({ length: n }, (_, i) => ({
    label: `${(i % 28) + 1} Jul`,
    value: value(i),
    title: `day ${i}`,
  }));
}

/** The x positions of every drawn x-axis label, in SVG user units. */
function labelPositions(svg: string): number[] {
  return [...svg.matchAll(/<text x="([\d.]+)" y="\d+" class="tick" text-anchor="middle"/g)]
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

describe("x-axis labels do not collide", () => {
  // The bug: the max-value and last labels were added unconditionally, so on a 30-day chart the
  // peak landed one slot from a regular tick and the two rendered on top of each other. On the
  // live page that read as "19 Ju20 Jul".
  for (const n of [3, 7, 10, 14, 21, 30, 60, 90, 180, 365]) {
    it(`over ${n} days`, () => {
      // A pronounced peak at 37% along — far enough from the ends to sit near a regular tick.
      const svg = barChart({ title: "Calories per day", points: days(n, (i) => (i === Math.floor(n * 0.37) ? 3000 : 1800)) });
      const xs = labelPositions(svg);
      expect(xs.length).toBeGreaterThan(0);
      for (let i = 1; i < xs.length; i++) {
        // ~48px is about what a "20 Jul" label occupies at this font size.
        expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(48);
      }
    });
  }

  it("still labels every bar when they comfortably fit", () => {
    const svg = barChart({ title: "t", points: days(7, () => 100) });
    expect(labelPositions(svg)).toHaveLength(7);
  });

  it("never floods a long window with labels", () => {
    const svg = barChart({ title: "t", points: days(365, (i) => i) });
    // Selective labels, not one per point — the whole reason the rule exists.
    expect(labelPositions(svg).length).toBeLessThanOrEqual(12);
  });

  it("keeps the last label, which is what tells you the range", () => {
    const svg = barChart({ title: "t", points: days(30, () => 1800) });
    const xs = labelPositions(svg);
    // Flat series, so no peak competes: the final slot should be labelled.
    expect(xs[xs.length - 1]).toBeGreaterThan(44 + PLOT_W * 0.9);
  });
});

describe("a chart with nothing in it says so", () => {
  it("treats an all-zero padded series as empty", () => {
    // The caller pads one point per day in the window, so `points.length` is never zero and the
    // original `!points.length` guard could not fire. An empty log rendered axes, a goal line and
    // no bars — which reads as a broken chart rather than an empty log.
    const svg = barChart({ title: "Calories per day", points: days(14, () => 0), target: 2600 });
    expect(svg).toContain("Nothing logged in this window yet.");
    expect(svg).not.toContain("goal 2600");
    expect(svg).not.toMatch(/<rect[^>]*fill="var\(--series/);
  });

  it("draws normally as soon as one day has data", () => {
    const svg = barChart({ title: "Calories per day", points: days(14, (i) => (i === 9 ? 2100 : 0)), target: 2600 });
    expect(svg).not.toContain("Nothing logged in this window yet.");
    expect(svg).toMatch(/<rect[^>]*fill="var\(--series/);
  });
});
