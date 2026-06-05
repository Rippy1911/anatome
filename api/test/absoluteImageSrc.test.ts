import { describe, it, expect } from "vitest";
import { absoluteImageSrc, normalizeLegacyFunctionPath } from "../src/lib/exercises.ts";

const base = "https://api.anatome.dev";

describe("normalizeLegacyFunctionPath", () => {
  it("strips /functions from relative paths", () => {
    expect(normalizeLegacyFunctionPath("/functions/generateImage?layers=DC2626:chest&output=raw"))
      .toBe("/generateImage?layers=DC2626:chest&output=raw");
  });

  it("strips /functions from absolute URLs", () => {
    const out = normalizeLegacyFunctionPath(
      "https://api.anatome.dev/functions/generateImage?output=raw",
    );
    expect(out).toBe("https://api.anatome.dev/generateImage?output=raw");
  });
});

describe("absoluteImageSrc", () => {
  it("rewrites legacy RapidAPI relative paths", () => {
    expect(absoluteImageSrc("/functions/generateImage?output=raw", base))
      .toBe(`${base}/generateImage?output=raw`);
  });
});
