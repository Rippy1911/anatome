# AGENTS.md — Anatome

*Read automatically by Cursor, Codex, Claude Code, Jules, Amp, and any other AGENTS.md-aware
coding agent. Treat it as your onboarding doc.*

---

## What Anatome is

**Anatome** (site: anatome.dev) is a **free, keyless** muscle-anatomy and exercise API, plus an
MCP server. Apache-2.0. Two independent deployables, both on Cloudflare, neither with a database:

| Path | What | Runtime | Deploy |
| --- | --- | --- | --- |
| `api/` | Public API + MCP at **api.anatome.dev** | Cloudflare Workers, Hono, **TypeScript** | `wrangler deploy --env production` |
| repo root | Site + playground at **anatome.dev** | Vite + React 18 + Tailwind, **static assets** | `npm run build && wrangler deploy --env production` |

Used by [airon.coach](https://airon.coach) to render muscle-group SVGs on workout cards.

> **This file was badly stale until 2026-08-07** — it claimed the project was JavaScript with no
> TypeScript, described a `src/` layout the Worker never had, and predated both the keyless
> migration and the removal of Base44. If something here contradicts the code, the code wins;
> please fix this file in the same PR.

## Build, test, deploy

```bash
# ---- API (api/) ----
cd api
pnpm install                 # npm works too; pnpm-lock.yaml is what CI uses
pnpm run worker:dev          # local Worker → http://localhost:8787
pnpm test                    # vitest, ~256 tests
pnpm run typecheck           # tsc --noEmit — must be clean
pnpm exec wrangler deploy --dry-run --outdir dist   # catches config errors

# ---- Site (repo root) ----
npm install
npm run dev                  # Vite dev server
npm run lint                 # eslint --quiet — must be clean
npm run build                # → dist/
```

Point the site at a local Worker: `VITE_PUBLIC_API=http://localhost:8787 npm run dev`.

CI (`.github/workflows/ci.yml`) runs all of the above on self-hosted runners and deploys the API
from `main` behind a manual approval gate.

## The things most likely to trip you up

1. **There are no API keys.** If you find yourself adding an `Authorization` header, a plan, a
   quota tier or a billing hook, stop — that is the hosted platform's job, not this repo's.
   Anatome's entire auth story is "there isn't one", and the docs, the OpenAPI description and
   the landing page all promise that.

2. **`initialize` and `tools/list` must never be rate limited.** Metering the MCP handshake means
   a user who is merely out of requests for the day cannot connect, and every host renders that
   as *"connector failed"* — the most misleading failure this API can produce. Only `tools/call`
   spends budget. There is a test pinning this; do not "simplify" it away.

3. **An exhausted `tools/call` returns HTTP 200 with `isError: true`, not a JSON-RPC error.**
   Same reason: hosts swallow protocol errors and the model never sees why. See
   `rateLimitToolResult` in `api/src/index.ts`.

4. **Fair use is not keyed on the IP for MCP.** A remote connector is called by the assistant
   vendor's servers, so every user of that assistant shares one address. Requests carrying an
   `Mcp-Session-Id` are counted per session; see the header comment in `api/src/lib/rateLimit.ts`
   before changing anything there.

5. **Never trust `Referer` / `Origin` for identity.** It is client-controlled. An earlier version
   used it to pick a rate-limit bucket and was spoofable (An-M2). Identity comes from
   `cf-connecting-ip` and the session id, nothing else.

6. **Bump `CACHE_VERSION` in `api/src/lib/edgeCache.ts` whenever a cacheable response body
   changes.** Entries are stored `immutable` for a week and the CI token has no cache-purge
   scope, so without a bump the edge keeps serving the old body after your deploy.

7. **Workers runtime only.** No `fs`, no `process`, no Node built-ins in `api/src`. Web APIs
   (`fetch`, `Request`, `Response`, `crypto`) only.

8. **The exercise data is the asset.** Don't regenerate or refactor `api/data/exercises.json` or
   the muscle mappings without explicit approval; edit consumers instead.

9. **Guides are a work in progress and every surface says so.** Tool descriptions carry a
   `[WORK IN PROGRESS]` prefix, payloads carry `status: "work_in_progress"`, both site pages show
   a banner, and `/guides` is unlinked from the nav. If you touch the guide catalog, keep all
   four in step.

10. **Photography licensing.** Exercise *metadata* is Unlicense. The *photography* served through
    `/exerciseImage` is of unverified origin and is **not** cleared for redistribution. Never
    write a CC0 or public-domain claim over the imagery — that has been fixed twice already.

## Layout

```
api/
  src/index.ts            Hono app: all routes
  src/routes/             mcp.ts · openapi.ts · admin.ts · selfTest.ts · ciStatus.ts
  src/lib/                rateLimit.ts · rateLimiterDO.ts · meter.ts · edgeCache.ts ·
                          exercises.ts · muscleEngine.ts · guides.ts · attribution.ts
  src/data/               muscleCatalog.ts · guideCatalog.ts · bodyWrappers.ts
  data/                   exercises.json · bodyPaths.json · guides/
  public/gifs/            generated demo GIFs (static assets binding)
  test/                   vitest; test/setup.ts installs a `caches.default` shim
  wrangler.toml           KV + Durable Object + vars
src/                      React site (pages/ components/ lib/ hooks/ data/)
public/                   logo.png, hero-muscles.svg, docs screenshots
wrangler.toml             site deployment (static assets)
SELF_HOSTING.md           the deploy-it-yourself guide — keep it true
```

## Conventions

- Branches: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`, `cursor/<slug>`
- PR titles: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `perf:`, `ci:`)
- Squash on merge
- TypeScript in `api/`, JSX in `src/`. Match the file you are editing.
- Tests live beside the behaviour they protect. If you fix a bug, pin it with a test that fails
  without your change.

## Hard "do not touch" list

- `LICENSE` (Apache-2.0)
- `wrangler.toml` production account/zone bindings
- The 873 exercise muscle mappings
- `package.json` version, without intent
- Lock files, unless explicitly asked

## When you finish

In the PR description: what changed and why, whether `pnpm test` / `npm run build` passed and
their output, any behaviour you could not verify, and a call-out for anything breaking.
