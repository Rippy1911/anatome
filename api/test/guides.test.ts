import { describe, it, expect, beforeAll } from "vitest";
import app from "../src/index.ts";
import {
  listGuides, getGuide, getGuideTree, safeGuideSlug, guideStepCount, guideImageSrc,
  sanitizeMediaEntry,
} from "../src/lib/guides.ts";
import { GUIDES } from "../src/data/guideCatalog.ts";
import { computeMcpResult, TOOLS } from "../src/routes/mcp.ts";
import { buildOpenApiSpec } from "../src/routes/openapi.ts";
import { guideCatalogAttribution } from "../src/lib/attribution.ts";

const BASE = "https://api.anatome.dev";

// The Workers Cache API and ExecutionContext are not present under Node, and
// every read route goes through withEdgeCache. Stub both so the guide routes
// can be exercised end-to-end (including their X-Cache headers).
const store = new Map<string, Response>();
const cacheStub = {
  async match(req: Request | string) {
    const hit = store.get(typeof req === "string" ? req : req.url);
    return hit ? hit.clone() : undefined;
  },
  async put(req: Request | string, res: Response) {
    store.set(typeof req === "string" ? req : req.url, res.clone());
  },
  async delete(req: Request | string) {
    return store.delete(typeof req === "string" ? req : req.url);
  },
};

beforeAll(() => {
  (globalThis as { caches?: unknown }).caches = { default: cacheStub };
});

const ENV = {} as unknown as Parameters<typeof app.fetch>[1];
const CTX = { waitUntil: (p: Promise<unknown>) => void p, passThroughOnException: () => {} } as unknown as ExecutionContext;

function get(path: string) {
  return app.request(path, {}, ENV, CTX);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bundled catalog integrity
// ─────────────────────────────────────────────────────────────────────────────
describe("bundled guide catalog", () => {
  it("bundles the calisthenics guide with 19 trees and 159 steps", () => {
    expect(Object.keys(GUIDES)).toEqual(["calisthenics"]);
    expect(Object.keys(GUIDES.calisthenics.trees)).toHaveLength(19);
    expect(guideStepCount()).toBe(159);
  });

  it("every tree the index advertises is actually bundled", () => {
    const { index, trees } = GUIDES.calisthenics;
    for (const row of index.trees) {
      expect(trees[row.slug], `missing tree file: ${row.slug}`).toBeTruthy();
    }
    expect(index.trees).toHaveLength(Object.keys(trees).length);
  });

  it("every tree has a slug matching its key, a name and ordered steps", () => {
    for (const [slug, tree] of Object.entries(GUIDES.calisthenics.trees)) {
      expect(tree.slug).toBe(slug);
      expect(tree.name).toBeTruthy();
      expect(tree.steps.length).toBeGreaterThan(0);
      const orders = tree.steps.map((s) => s.order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slug guard — traversal and malformed input
// ─────────────────────────────────────────────────────────────────────────────
describe("safeGuideSlug", () => {
  it("accepts real catalog slugs", () => {
    for (const slug of ["calisthenics", "planche", "one-arm-pull-up", "v-sit-manna"]) {
      expect(safeGuideSlug(slug)).toBe(slug);
    }
  });

  it("rejects every traversal and path-injection shape", () => {
    const attacks = [
      "..", "../", "../../etc/passwd", "./planche", "planche/../index",
      "/etc/passwd", "\\etc\\passwd", "planche/steps",
      "..%2f..%2fetc", "%2e%2e", "..\\..\\windows",
      "planche.json", "planche%00", "planche\u0000",
    ];
    for (const attack of attacks) {
      expect(safeGuideSlug(attack), `accepted: ${attack}`).toBeNull();
    }
  });

  it("rejects percent-encoded traversal in its decoded form too", () => {
    // Hono decodes query params before the guard sees them, so the guard has to
    // reject what arrives after decoding, not just the literal escape sequence.
    for (const encoded of ["%2e%2e", "%2e%2e%2f", "..%2f..%2fetc", "%2Fetc%2Fpasswd", "planche%2Findex"]) {
      expect(safeGuideSlug(decodeURIComponent(encoded)), `accepted decoded: ${encoded}`).toBeNull();
    }
  });

  it("rejects empty, whitespace, over-long and non-string input", () => {
    expect(safeGuideSlug("")).toBeNull();
    expect(safeGuideSlug("   ")).toBeNull();
    expect(safeGuideSlug("a".repeat(65))).toBeNull();
    expect(safeGuideSlug(undefined)).toBeNull();
    expect(safeGuideSlug(null)).toBeNull();
    expect(safeGuideSlug(42)).toBeNull();
    expect(safeGuideSlug("-leading")).toBeNull();
    expect(safeGuideSlug("trailing-")).toBeNull();
    expect(safeGuideSlug("double--hyphen")).toBeNull();
  });

  it("a rejected slug can never reach a bundled tree", () => {
    for (const attack of ["..", "../planche", "/planche", "index"]) {
      expect(getGuideTree("calisthenics", attack, BASE).found).toBe(false);
      expect(getGuide(attack, BASE).found).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic
// ─────────────────────────────────────────────────────────────────────────────
describe("guide logic", () => {
  it("listGuides returns each guide with counts and a self URL", () => {
    const { count, guides } = listGuides(BASE);
    expect(count).toBe(1);
    expect(guides[0].slug).toBe("calisthenics");
    expect(guides[0].tree_count).toBe(19);
    expect(guides[0].step_count).toBe(159);
    expect(guides[0].guide_url).toBe(`${BASE}/getGuide?slug=calisthenics`);
  });

  it("getGuide returns tree summaries in the catalog's curated order", () => {
    const { found, guide } = getGuide("calisthenics", BASE);
    expect(found).toBe(true);
    const trees = guide!.trees as { slug: string }[];
    expect(trees.map((t) => t.slug)).toEqual(GUIDES.calisthenics.index.trees.map((t) => t.slug));
  });

  it("getGuide summaries carry difficulty, prerequisites and a tree URL", () => {
    const { guide } = getGuide("calisthenics", BASE);
    const planche = (guide!.trees as Record<string, unknown>[]).find((t) => t.slug === "planche")!;
    expect(planche.difficulty).toBe("elite");
    expect(planche.step_count).toBeGreaterThan(0);
    expect(planche.prerequisites).toContain("foundations");
    expect(planche.tree_url).toBe(`${BASE}/getGuideTree?guide=calisthenics&tree=planche`);
    expect(String(planche.anatome_imageSrc)).toMatch(/^https:\/\/api\.anatome\.dev\/generateImage\?/);
  });

  it("getGuideTree returns full steps and defaults the guide to calisthenics", () => {
    const explicit = getGuideTree("calisthenics", "front-lever", BASE);
    const defaulted = getGuideTree(undefined, "front-lever", BASE);
    expect(explicit.found).toBe(true);
    expect(defaulted.found).toBe(true);
    expect(defaulted.tree!.guide_slug).toBe("calisthenics");
    const steps = explicit.tree!.steps as { cues: string[] }[];
    expect(steps.length).toBeGreaterThan(0);
    expect(Array.isArray(steps[0].cues)).toBe(true);
  });

  it("guideImageSrc encodes compact layers and is null without layers", () => {
    const tree = GUIDES.calisthenics.trees.planche;
    const src = guideImageSrc(tree, BASE)!;
    expect(src).toContain("/generateImage?view=dual&layers=");
    expect(src).not.toContain("#");
    expect(decodeURIComponent(src.split("layers=")[1])).toContain("DC2626:deltoids,chest,abs");
    expect(guideImageSrc({ ...tree, anatome_layers_payload: [] }, BASE)).toBeNull();
  });

  it("unknown guide and unknown tree both report not-found", () => {
    expect(getGuide("yoga", BASE).found).toBe(false);
    expect(getGuideTree("calisthenics", "backflip", BASE).found).toBe(false);
    expect(getGuideTree("yoga", "planche", BASE).found).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP routes
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /listGuides", () => {
  it("returns ok + guides + catalog attribution", async () => {
    const res = await get("/listGuides");
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.count).toBe(1);
    expect(body.guide_catalog_license).toBe("CC-BY-4.0");
    expect(body.license).toBe("Apache-2.0");
  });

  it("is edge-cached: MISS then HIT with cacheable Cache-Control", async () => {
    store.clear();
    const first = await get("/listGuides");
    expect(first.headers.get("x-cache")).toBe("MISS");
    const second = await get("/listGuides");
    expect(second.headers.get("x-cache")).toBe("HIT");
    expect(second.headers.get("cache-control")).toContain("max-age=86400");
  });

  it("carries the shared security headers and open CORS", async () => {
    const res = await get("/listGuides");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("GET /getGuide", () => {
  it("returns the guide with its tree summaries", async () => {
    const res = await get("/getGuide?slug=calisthenics");
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; slug: string; trees: unknown[]; guide_catalog_attribution: string };
    expect(body.ok).toBe(true);
    expect(body.slug).toBe("calisthenics");
    expect(body.trees).toHaveLength(19);
    expect(body.guide_catalog_attribution).toContain("CC-BY-4.0");
  });

  it("400s on a missing slug", async () => {
    const res = await get("/getGuide");
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toContain("slug");
  });

  it("400s on traversal slugs, never 404", async () => {
    for (const attack of ["../index", "..", "%2e%2e%2f", "/etc/passwd", "planche.json"]) {
      const res = await get(`/getGuide?slug=${encodeURIComponent(attack)}`);
      expect(res.status, `slug=${attack}`).toBe(400);
      expect((await res.json() as { ok: boolean }).ok).toBe(false);
    }
  });

  it("404s on a well-formed but unknown guide", async () => {
    const res = await get("/getGuide?slug=yoga");
    expect(res.status).toBe(404);
    const body = await res.json() as { ok: boolean; error: string; guide_catalog_license: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("yoga");
    expect(body.guide_catalog_license).toBe("CC-BY-4.0");
  });
});

describe("GET /getGuideTree", () => {
  it("returns a full tree with steps, muscles and an absolute image URL", async () => {
    const res = await get("/getGuideTree?guide=calisthenics&tree=planche");
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.slug).toBe("planche");
    expect(body.guide_slug).toBe("calisthenics");
    expect((body.steps as unknown[]).length).toBeGreaterThan(0);
    expect(body.primary_muscles).toContain("chest");
    expect(String(body.anatome_imageSrc)).toMatch(/^https:\/\//);
    expect(body.guide_catalog_license).toBe("CC-BY-4.0");
  });

  it("re-keys the document's own notice so licence fields stay unambiguous", async () => {
    const body = await (await get("/getGuideTree?tree=planche")).json() as Record<string, unknown>;
    // `license` must mean the code licence and `attribution` the MIT body-path
    // notice, exactly as on every other endpoint — the CC-BY terms live in the
    // guide_catalog_* fields instead of shadowing them.
    expect(body.license).toBe("Apache-2.0");
    expect(body.attribution).toBeUndefined();
    expect(body.guide_catalog_license).toBe("CC-BY-4.0");
    expect(String(body.guide_catalog_attribution_detail)).toContain("CC-BY-4.0");
  });

  it("defaults the guide when only tree is supplied", async () => {
    const res = await get("/getGuideTree?tree=handstand");
    expect(res.status).toBe(200);
    expect((await res.json() as { guide_slug: string }).guide_slug).toBe("calisthenics");
  });

  it("400s on a missing tree param", async () => {
    const res = await get("/getGuideTree?guide=calisthenics");
    expect(res.status).toBe(400);
  });

  it("400s on traversal in either slug", async () => {
    const attacks = [
      "/getGuideTree?guide=calisthenics&tree=..",
      "/getGuideTree?guide=calisthenics&tree=..%2F..%2Findex",
      "/getGuideTree?guide=..&tree=planche",
      "/getGuideTree?guide=calisthenics&tree=%2Fetc%2Fpasswd",
      "/getGuideTree?guide=calisthenics&tree=planche.json",
    ];
    for (const path of attacks) {
      const res = await get(path);
      expect(res.status, path).toBe(400);
    }
  });

  it("404s on a well-formed but unknown tree", async () => {
    const res = await get("/getGuideTree?guide=calisthenics&tree=backflip");
    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toContain("backflip");
  });

  it("does not expose the index document as a tree", async () => {
    const res = await get("/getGuideTree?guide=calisthenics&tree=index");
    expect(res.status).toBe(404);
  });

  it("is edge-cached per tree, not shared across trees", async () => {
    store.clear();
    expect((await get("/getGuideTree?tree=planche")).headers.get("x-cache")).toBe("MISS");
    expect((await get("/getGuideTree?tree=handstand")).headers.get("x-cache")).toBe("MISS");
    expect((await get("/getGuideTree?tree=planche")).headers.get("x-cache")).toBe("HIT");
  });

  it("does not cache error responses", async () => {
    store.clear();
    await get("/getGuideTree?tree=backflip");
    const second = await get("/getGuideTree?tree=backflip");
    expect(second.headers.get("x-cache")).toBe("MISS");
    expect(second.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Discovery surface: index, OpenAPI, MCP
// ─────────────────────────────────────────────────────────────────────────────
describe("guide discovery surface", () => {
  it("GET / advertises the guide endpoints and catalog licence", async () => {
    const res = await get("/");
    const body = await res.json() as { endpoints: string[]; guide_catalog_license: string };
    expect(body.endpoints).toEqual(expect.arrayContaining(["/listGuides", "/getGuide", "/getGuideTree"]));
    expect(body.guide_catalog_license).toBe("CC-BY-4.0");
  });

  it("OpenAPI documents all three guide paths under one tag", () => {
    const spec = buildOpenApiSpec(BASE);
    for (const p of ["/listGuides", "/getGuide", "/getGuideTree"]) {
      expect(spec.paths).toHaveProperty(p);
      expect((spec.paths as unknown as Record<string, { get: { tags: string[] } }>)[p].get.tags).toEqual(["Skill Guides"]);
    }
    expect(spec.tags.map((t) => t.name)).toContain("Skill Guides");
  });

  it("exposes exactly three new read-only MCP tools", () => {
    const guideTools = TOOLS.filter((t) => t.name.includes("guide"));
    expect(guideTools.map((t) => t.name)).toEqual(["list_guides", "get_guide", "get_guide_tree"]);
    for (const t of guideTools) expect(t.annotations?.readOnlyHint).toBe(true);
  });

  it("MCP list_guides returns parseable JSON with attribution", () => {
    const inner = computeMcpResult("tools/call", { name: "list_guides", arguments: {} }, BASE);
    expect(inner.ok).toBe(true);
    const parsed = JSON.parse((inner.result as { content: { text: string }[] }).content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.guide_catalog_license).toBe("CC-BY-4.0");
  });

  it("MCP get_guide_tree returns steps and rejects unknown or unsafe slugs", () => {
    const ok = computeMcpResult("tools/call", { name: "get_guide_tree", arguments: { tree: "muscle-up" } }, BASE);
    const parsed = JSON.parse((ok.result as { content: { text: string }[] }).content[0].text);
    expect(parsed.slug).toBe("muscle-up");
    expect(parsed.steps.length).toBeGreaterThan(0);

    for (const bad of [{ tree: "backflip" }, { tree: "../index" }, { tree: "" }]) {
      const inner = computeMcpResult("tools/call", { name: "get_guide_tree", arguments: bad }, BASE);
      expect(inner.ok, JSON.stringify(bad)).toBe(false);
      expect(inner.error?.code).toBe(-32602);
    }
  });

  it("MCP get_guide rejects an unknown guide", () => {
    const inner = computeMcpResult("tools/call", { name: "get_guide", arguments: { slug: "yoga" } }, BASE);
    expect(inner.ok).toBe(false);
    expect(inner.error?.code).toBe(-32602);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Media provenance
//
// free-exercise-db imagery has a broken licence chain (the upstream compiler
// states he does not own the copyright; the fork maintainer does not know the
// origin), so the API must not restate the public-domain dedication that was
// applied downstream. Everything else the catalog records must reach consumers
// untouched — downstream users need it to know what they may not redistribute.
// ─────────────────────────────────────────────────────────────────────────────
const ALL_TREE_SLUGS = Object.keys(GUIDES.calisthenics.trees);

function mediaOf(treeSlug: string): Record<string, unknown>[] {
  const { tree } = getGuideTree("calisthenics", treeSlug, BASE);
  const steps = (tree!.steps || []) as { media?: Record<string, unknown>[] }[];
  return steps.flatMap((s) => s.media || []);
}

describe("media provenance", () => {
  it("no guide response asserts CC0 or public domain for imagery", () => {
    for (const slug of ALL_TREE_SLUGS) {
      const serialized = JSON.stringify(getGuideTree("calisthenics", slug, BASE).tree);
      expect(serialized, `${slug} restates a public-domain claim`).not.toMatch(/cc0/i);
      expect(serialized, `${slug} restates a public-domain claim`).not.toMatch(/public[-\s]?domain/i);
      expect(serialized, `${slug} restates an Unlicense claim`).not.toMatch(/unlicense/i);
    }
  });

  it("marks every free-exercise-db image as unverified and not redistributable", () => {
    let checked = 0;
    for (const slug of ALL_TREE_SLUGS) {
      for (const m of mediaOf(slug)) {
        if (m.provider !== "anatome-gif") continue;
        checked++;
        expect(m.license).toBe("unverified");
        expect(m.license_url).toBeNull();
        expect(m.redistributable).toBe(false);
        expect(String(m.license_note)).toContain("issues/");
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("only offers media a client can actually fetch", () => {
    let checked = 0;
    for (const slug of ALL_TREE_SLUGS) {
      for (const m of mediaOf(slug)) {
        checked++;
        // A relative path is meaningless to an API consumer: it resolves against
        // the caller's own origin, not ours. Every entry must be absolute.
        expect(String(m.url), `${slug} serves a non-fetchable media url`).toMatch(/^https:\/\//);
        // The FLUX-generated demo GIFs were reviewed and rejected — several
        // depicted the wrong movement entirely — and were never published, so a
        // `cali-gif` entry can only be a dangling reference to a missing asset.
        expect(m.provider, `${slug} still offers a withdrawn AI demo GIF`).not.toBe("cali-gif");
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("passes every other provenance field through unmodified", () => {
    for (const slug of ALL_TREE_SLUGS) {
      const raw = GUIDES.calisthenics.trees[slug].steps.flatMap(
        (s) => (s.media || []) as Record<string, unknown>[],
      );
      const served = mediaOf(slug);
      expect(served).toHaveLength(raw.length);
      raw.forEach((before, i) => {
        const after = served[i];
        // Identity fields are never rewritten, on any entry.
        for (const k of ["provider", "url", "title", "channel", "role", "source_url", "ai_generated", "ext_id"]) {
          if (k in before) expect(after[k], `${slug}.${k}`).toEqual(before[k]);
        }
        // Entries outside the defective chain are passed through byte-for-byte,
        // including redistributable:false and share-alike markers.
        if (before.provider !== "anatome-gif") {
          expect(after, `${slug} ${String(before.provider)}`).toEqual(before);
        }
      });
    }
  });

  it("keeps non-redistributable YouTube entries flagged as such", () => {
    const youtube = ALL_TREE_SLUGS.flatMap(mediaOf).filter((m) => m.provider === "youtube");
    expect(youtube.length).toBeGreaterThan(0);
    for (const m of youtube) {
      expect(m.redistributable).toBe(false);
      expect(m.license).toBe("youtube-standard");
    }
  });

  it("keeps AI-generated media flagged with its model provenance", () => {
    // The catalog currently ships none: the FLUX demo GIFs were withdrawn after
    // review. Should any synthetic asset return, EU AI Act Art. 50(2) still
    // requires it to be labelled at the point of delivery, so the contract is
    // asserted for whatever is present rather than dropped with the assets.
    const ai = ALL_TREE_SLUGS.flatMap(mediaOf).filter((m) => m.ai_generated === true);
    for (const m of ai) {
      expect(m.redistributable).toBe(true);
      expect(m.generator).toBeTruthy();
      expect(String(m.attribution)).toContain("AI-generated");
    }
  });

  it("is idempotent — an already-honest entry is left alone", () => {
    const honest = {
      provider: "anatome-gif",
      url: "https://api.anatome.dev/exerciseGif?id=Pushups",
      license: "unverified",
      license_url: null,
      redistributable: false,
    };
    expect(sanitizeMediaEntry(honest)).toEqual(honest);
    // A genuinely CC0 image from a sound source is not downgraded.
    const commons = {
      provider: "commons",
      url: "https://upload.wikimedia.org/example.jpg",
      source_url: "https://commons.wikimedia.org/wiki/File:Example.jpg",
      license: "CC0-1.0",
      redistributable: true,
    };
    expect(sanitizeMediaEntry(commons)).toEqual(commons);
  });

  it("catches the defective chain by source_url and by proxy URL, not just provider", () => {
    for (const entry of [
      { provider: "other", source_url: "https://github.com/yuhonas/free-exercise-db/blob/main/x.json", license: "CC0-1.0" },
      { provider: "other", url: "https://api.anatome.dev/exerciseImage?path=Squat%2F0.jpg", license: "public domain" },
    ]) {
      const out = sanitizeMediaEntry(entry) as Record<string, unknown>;
      expect(out.license).toBe("unverified");
      expect(out.redistributable).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Attribution (CC-BY requires naming the licence on every content response)
// ─────────────────────────────────────────────────────────────────────────────
describe("catalog attribution", () => {
  it("names the author, the source and CC-BY-4.0", () => {
    const a = guideCatalogAttribution();
    expect(a.guide_catalog_attribution).toContain("NextSolutions");
    expect(a.guide_catalog_attribution_source).toMatch(/^https:\/\/github\.com\//);
    expect(a.guide_catalog_license).toBe("CC-BY-4.0");
    expect(a.license).toBe("Apache-2.0");
  });

  it("is present on every guide response, success and error alike", async () => {
    const paths = [
      "/listGuides",
      "/getGuide?slug=calisthenics",
      "/getGuide?slug=yoga",
      "/getGuideTree?tree=planche",
      "/getGuideTree?tree=backflip",
      "/getGuide",
    ];
    for (const p of paths) {
      const body = await (await get(p)).json() as Record<string, unknown>;
      expect(body.guide_catalog_license, p).toBe("CC-BY-4.0");
      expect(body.license, p).toBe("Apache-2.0");
    }
  });
});
