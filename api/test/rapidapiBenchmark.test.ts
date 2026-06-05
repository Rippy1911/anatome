import { describe, it, expect } from "vitest";
import { rapidapiSearchBenchmark, RAPIDAPI_HOST } from "../src/routes/rapidapiBenchmark.ts";

describe("rapidapiSearchBenchmark", () => {
  it("returns 503 when RAPIDAPI_KEY is missing", async () => {
    const res = await rapidapiSearchBenchmark({ q: "bench", limit: "1" }, {});
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("rapidapi_benchmark_unconfigured");
  });

  it("uses anatome RapidAPI host constant", () => {
    expect(RAPIDAPI_HOST).toBe("anatome.p.rapidapi.com");
  });
});
