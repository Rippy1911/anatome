# Anatome API (Cloudflare Workers)

Public API at **https://api.anatome.dev** — Hono on Cloudflare Workers.

Marketing site (Base44): **https://anatome.dev**

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
`exerciseGif` · `listMuscles` · `muscleInfo` · `listEquipment` · `listGuides` · `getGuide` ·
`getGuideTree` · `mcp` · `openapi` · `selfTest`

The `listGuides` / `getGuide` / `getGuideTree` trio serves the curated skill-progression
catalog in `data/guides/`. That content is **CC-BY-4.0** (the API code stays Apache-2.0),
so those responses carry `guide_catalog_attribution` and `guide_catalog_license`.

**Not ported:** `aiDemo` — AI is internal-only on the Base44 frontend (`anatome.dev`).

## Local development

```bash
pnpm install
pnpm run worker:dev
pnpm test && pnpm run worker:test   # selfTest must stay >= 39/39
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
- **Assets:** `public/` → `ASSETS` binding for `/exerciseGif`
- **Secrets:** `wrangler secret put PROXY_SECRET` · `wrangler secret put MCP_TRUSTED_KEY`
- **Optional (home RapidAPI latency demo):** `RAPIDAPI_KEY` — your [RapidAPI Application Key](https://rapidapi.com/slaczka.sebastian/api/anatome) after subscribing (not `PROXY_SECRET`). Set with:
  ```bash
  # rapidapi.txt: KEY=your-application-key
  ./scripts/set-rapidapi-worker-secret.sh
  ```
- **Vars:** `PUBLIC_BASE_URL=https://api.anatome.dev`

## Rules

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md). Attribution fields and rate-limit model are intentional — do not remove or change without maintainer approval.
