# Anatome API (Cloudflare Workers)

Public API at **https://api.anatome.dev** — Hono on Cloudflare Workers.

Marketing site (Base44): **https://anatome.dev**

## Layout

```
api/
├── src/           # Hono app, routes, shared lib
├── data/          # bodyPaths.json, exercises.json (873 rows)
├── public/gifs/   # 873 exercise demo GIFs (bundled, served at /exerciseGif)
├── test/
└── wrangler.toml
```

## Endpoints

`generateImage` · `workoutImage` · `searchExercises` · `getExercise` · `resolveExercise` ·
`exerciseGif` · `listMuscles` · `muscleInfo` · `listEquipment` · `mcp` · `openapi` · `selfTest`

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

## Configuration

- **KV:** `RATE_LIMIT_KV`
- **Assets:** `public/` → `ASSETS` binding for `/exerciseGif`
- **Secrets:** `wrangler secret put PROXY_SECRET` · `wrangler secret put MCP_TRUSTED_KEY`
- **Vars:** `PUBLIC_BASE_URL=https://api.anatome.dev`

## Rules

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md). Attribution fields and rate-limit model are intentional — do not remove or change without maintainer approval.
