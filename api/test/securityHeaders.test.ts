import { describe, it, expect } from "vitest";
import app from "../src/index.ts";

// Minimal env stub: the security-headers middleware runs before any route logic
// that needs KV/ASSETS, so an empty env is enough to assert the headers.
const ENV = {} as unknown as Parameters<typeof app.fetch>[1];

function headers(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  res.headers.forEach((v, k) => { out[k.toLowerCase()] = v; });
  return out;
}

describe("security headers (launch-readiness §2/§4)", () => {
  it("attaches X-Frame-Options, Permissions-Policy, nosniff, HSTS, Referrer-Policy on a 200", async () => {
    const res = await app.request("/listMuscles", {}, ENV);
    const h = headers(res);
    // Assert the status the test name claims. This used to 500 (no `caches` under node) and
    // still passed, because only the headers were checked.
    expect(res.status).toBe(200);
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["permissions-policy"]).toBe("geolocation=(), microphone=(), camera=()");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("still attaches the headers on error responses (>=400)", async () => {
    const res = await app.request("/exerciseGif", {}, ENV); // missing id -> 4xx (no env deps)
    const h = headers(res);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["permissions-policy"]).toBe("geolocation=(), microphone=(), camera=()");
    expect(h["x-content-type-options"]).toBe("nosniff");
  });

  it("still attaches the headers on 404", async () => {
    const res = await app.request("/does-not-exist", {}, ENV);
    const h = headers(res);
    expect(res.status).toBe(404);
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
  });
});
