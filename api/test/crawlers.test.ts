// robots.txt on the API's own hostname.
//
// This exists because of something found in production, not because of a code review:
// `api.anatome.dev/robots.txt` was serving Cloudflare's *managed* robots.txt, which Disallows
// GPTBot, ClaudeBot, Google-Extended, CCBot, Applebot-Extended and meta-externalagent, and sets
// `ai-train=no`. That is a good default for a site that does not want to feed models, and the
// precise opposite of what a service whose only purpose is to be called by assistants needs.
//
// The Worker had no robots.txt route at all, so there was nothing to lose the argument. Now there
// is, and these tests pin the part that matters: the named crawlers are Allowed, and nobody is
// Disallowed.

import { describe, it, expect } from "vitest";
import app from "../src/index.ts";

const ENV = {} as unknown as Parameters<typeof app.fetch>[1];

async function robots(): Promise<string> {
  const res = await app.request("https://api.anatome.dev/robots.txt", {}, ENV);
  expect(res.status).toBe(200);
  return await res.text();
}

describe("robots.txt invites the crawlers this project depends on", () => {
  it("names the assistant crawlers explicitly", async () => {
    const body = await robots();
    // Explicit, not left to `User-agent: *`: a zone-level or CDN default that singles these out by
    // name beats a wildcard, and being found by them is the entire distribution strategy.
    for (const bot of ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "PerplexityBot", "Google-Extended"]) {
      expect(body).toContain(`User-agent: ${bot}`);
    }
  });

  it("disallows nothing", async () => {
    const body = await robots();
    expect(body).not.toMatch(/^\s*Disallow:\s*\/\s*$/mi);
  });

  it("gives every named agent an Allow, not just a heading", async () => {
    const lines = (await robots()).split("\n").map((l) => l.trim());
    const agents = lines.map((l, i) => [l, i] as const).filter(([l]) => l.startsWith("User-agent:"));
    expect(agents.length).toBeGreaterThan(5);
    for (const [, i] of agents) {
      expect(lines[i + 1]).toBe("Allow: /");
    }
  });

  it("points at the sitemap", async () => {
    expect(await robots()).toContain("Sitemap: https://anatome.dev/sitemap.xml");
  });
});
