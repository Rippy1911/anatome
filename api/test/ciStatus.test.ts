import { describe, it, expect } from "vitest";
import { _summarizeForTest, fetchCiStatus } from "../src/routes/ciStatus.ts";

describe("ciStatus summarize", () => {
  it("returns unknown when run is null", () => {
    const s = _summarizeForTest(null);
    expect(s.state).toBe("unknown");
    expect(s.ok).toBe(false);
    expect(s.url).toMatch(/github\.com/);
  });

  it("marks a completed+success run green", () => {
    const s = _summarizeForTest({ status: "completed", conclusion: "success", run_number: 42, html_url: "https://github.com/run/42", updated_at: "t" });
    expect(s.state).toBe("green");
    expect(s.label).toMatch(/passing/);
    expect(s.run_number).toBe(42);
    expect(s.url).toBe("https://github.com/run/42");
  });

  it("marks a completed+failure run red", () => {
    const s = _summarizeForTest({ status: "completed", conclusion: "failure", run_number: 7 });
    expect(s.state).toBe("red");
    expect(s.label).toMatch(/failing/);
  });

  it("marks an in-progress run running", () => {
    const s = _summarizeForTest({ status: "in_progress", conclusion: null, run_number: 9 });
    expect(s.state).toBe("running");
    expect(s.label).toMatch(/running/);
  });

  it("falls back to neutral for other conclusions", () => {
    const s = _summarizeForTest({ status: "completed", conclusion: "cancelled", run_number: 3 });
    expect(s.state).toBe("neutral");
    expect(s.label).toContain("cancelled");
  });
});

describe("ciStatus fetchCiStatus", () => {
  it("degrades to unknown when no token is set", async () => {
    const s = await fetchCiStatus({});
    expect(s.state).toBe("unknown");
    expect(s.ok).toBe(false);
  });

  it("degrades to unknown on a fetch that throws", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => { throw new Error("boom"); }) as typeof fetch;
    try {
      const s = await fetchCiStatus({ GITHUB_TOKEN: "tok" });
      expect(s.state).toBe("unknown");
    } finally {
      globalThis.fetch = original;
    }
  });
});
