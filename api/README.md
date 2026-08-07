# Anatome API (Cloudflare Workers)

Public API at **https://api.anatome.dev** — Hono on Cloudflare Workers.

Site: **https://anatome.dev** (static assets, deployed from the repo root).

**No authentication.** No API key, no token, no header. The only gate is a daily fair-use
budget — see [Fair use](#fair-use) below.

## Layout

```
api/
├── src/           # Hono app, routes, shared lib
├── data/          # bodyPaths.json, exercises.json (873 rows), guides/ (skill catalog)
├── public/gifs/   # 873 exercise demo GIFs (bundled, served at /exerciseGif)
├── test/
└── wrangler.toml
```

## Endpoints

`generateImage` · `workoutImage` · `searchExercises` · `getExercise` · `resolveExercise` ·
`exerciseGif` · `exerciseImage` · `listMuscles` · `muscleInfo` · `listEquipment` · `bodyPaths` ·
`listGuides` · `getGuide` · `getGuideTree` · `mcp` · `openapi` · `ciStatus` · `selfTest` ·
`admin/stats` · `admin/rate-limit/reset` · `.well-known/mcp.json`

The `listGuides` / `getGuide` / `getGuideTree` trio serves the curated skill-progression
catalog in `data/guides/`. That content is **CC-BY-4.0** (the API code stays Apache-2.0),
so those responses carry `guide_catalog_attribution` and `guide_catalog_license`.

> ⚠️ **The guide endpoints are a work in progress.** Media coverage is incomplete and the
> coaching cues are unreviewed. Every response carries `status: "work_in_progress"` and the
> three MCP tool descriptions are prefixed `[WORK IN PROGRESS]`. Keep those in step if you
> touch the catalog.

There are no AI/LLM endpoints and there will not be any. Anatome renders, searches and
resolves; the model calling it does the thinking.

## Fair use

`FAIR_USE_DAILY_LIMIT` requests per caller per UTC day (default **50**). Loopback and private
addresses are unlimited. Static catalog reads are edge-cached and unmetered.

Two behaviours on the MCP path exist for a specific reason and are pinned by tests in
`test/fairUse.test.ts`:

1. **`initialize`, `tools/list`, `ping` and notifications are never metered.** Rate-limiting the
   handshake means a user who is out of requests cannot connect at all, and every host reports
   that as a broken connector.
2. **An exhausted `tools/call` returns HTTP 200 with `isError: true`**, not a JSON-RPC error, so
   the calling model reads the explanation instead of the host swallowing it.

MCP callers are counted per `Mcp-Session-Id` rather than per IP, because a remote connector
reaches the Worker from the assistant vendor's egress addresses. See the header comment in
`src/lib/rateLimit.ts` — including what that does and does not buy.

## Local development

```bash
pnpm install
pnpm run worker:dev
pnpm test && pnpm run typecheck     # selfTest must stay green
pnpm exec wrangler deploy --dry-run --outdir dist
```

Regenerate GIFs (optional, already committed under `public/gifs/`):

```bash
python3 scripts/generate-exercise-gifs.py
```

Build exercise demo MP4s (OpenRouter + ffmpeg retime to ~1.25s rep):

```bash
brew install ffmpeg
export OPENROUTER_API_KEY=sk-or-...
python3 scripts/gif-to-video.py --id Barbell_Bench_Press_-_Medium_Grip --suffix .openrouter
# defaults: kling-v3.0-std, 720p, 3s gen → 1.25s rep (~$0.42/video)
python3 scripts/gif-to-video.py --model alibaba/wan-2.7 --duration 2   # cheaper experiment
python3 scripts/gif-to-video.py --backend blend --suffix .blend --id Air_Bike
```

## Configuration

- **KV:** `RATE_LIMIT_KV`
- **Durable Object:** `RATE_LIMIT_DO` (`RateLimiterDO`) — the primary counter; KV is the fallback
- **Assets:** `public/` → `ASSETS` binding for `/exerciseGif`
- **Vars:** `PUBLIC_BASE_URL` · `FAIR_USE_DAILY_LIMIT` (default 50) · `ANON_NETWORK_DAILY_LIMIT`
  (runaway guard, default 10000) · `UPGRADE_URL`
- **Secrets, all optional** — the Worker serves the whole API without any of them:
  ```bash
  wrangler secret put ADMIN_TOKEN      # /admin/* and public /selfTest
  wrangler secret put PROXY_SECRET     # bypass for a marketplace that meters upstream
  wrangler secret put MCP_TRUSTED_KEY  # bypass for a first-party MCP bridge
  wrangler secret put GITHUB_TOKEN     # /ciStatus badge; degrades gracefully without it
  ```

## Rules

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md) and [`../AGENTS.md`](../AGENTS.md). Attribution
fields and the fair-use model are intentional — do not remove or change without maintainer
approval. Deploying it yourself: [`../SELF_HOSTING.md`](../SELF_HOSTING.md).
