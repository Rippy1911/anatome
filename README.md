<div align="center">

# Anatome

**Muscle group image generator API + free-exercise-db.**
Multi-color anatomical SVGs, MCP-compatible, 873 exercises pre-mapped. By [NextSolutions](https://nextsolutions.studio).

<img src="https://api.anatome.dev/generateImage?gender=male&view=dual&width=420&layers=DC2626:chest,abs,biceps|F59E0B:triceps,deltoids,quadriceps&output=raw" alt="Anatome muscle diagram example" width="320" />

_Live example from the production API at [api.anatome.dev](https://api.anatome.dev). Marketing site: [anatome.dev](https://anatome.dev)._

</div>

---

## What is this?

Anatome turns muscle groups (and exercise names) into clean, colorable anatomical
SVG diagrams over a simple HTTP API. It also bundles an exercise database (873
exercises from [free-exercise-db](https://github.com/yuhonas/free-exercise-db),
pre-mapped to 23 muscle slugs) and speaks the [Model Context Protocol](https://modelcontextprotocol.io).

- 🎨 Multi-color layered muscle rendering (`<img src>`-friendly, `?output=raw`)
- 💪 873 exercises searchable + resolvable to muscle layers + hosted demo GIFs
- 🤖 MCP server (7 tools) + OpenAPI 3.1 spec
- 🆓 Basic plan: 300 requests/month free on RapidAPI, then $0.001/request; unlimited localhost for dev

## Repository layout

| Path | What | Deploys via |
| --- | --- | --- |
| `src/`, `base44/`, `index.html`, `vite.config.js`, … (repo root) | React/Vite marketing + playground at **anatome.dev** | Base44 |
| [`api/`](./api) | Cloudflare Workers API at **api.anatome.dev** (Hono) | `wrangler` |
| [`docs/`](./docs) | Reserved for a future docs site | — |

> The frontend lives at the **repo root** (Base44 requires `base44/config.jsonc`
> there and syncs from `main`). The Cloudflare API is an independent package under
> [`api/`](./api). See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup and PR rules.

## Quickstart

### Use the API

```bash
# Generate a muscle diagram (raw SVG)
curl "https://api.anatome.dev/generateImage?layers=DC2626:chest,abs&view=front&output=raw"

# Search exercises
curl "https://api.anatome.dev/searchExercises?q=bench&limit=5"

# Exercise demo GIF (bundled in api/public/gifs/)
curl "https://api.anatome.dev/exerciseGif?id=Bench_Press" -o bench.gif
```

Embed directly in HTML:

```html
<img src="https://api.anatome.dev/generateImage?gender=male&view=dual&layers=DC2626:chest|F59E0B:triceps&output=raw" alt="chest and triceps" />
```

### Run the frontend locally

```bash
npm install            # from the repo root
cp .env.local.example .env.local   # set VITE_BASE44_APP_ID + VITE_BASE44_APP_BASE_URL
npm run dev
```

Set `VITE_BASE44_APP_BASE_URL=https://anatome.dev` when developing against production.

### Run the API locally

```bash
cd api
pnpm install
pnpm run worker:dev
```

## Endpoints

`generateImage` · `workoutImage` · `searchExercises` · `getExercise` · `resolveExercise` ·
`exerciseGif` · `listMuscles` · `muscleInfo` · `listEquipment` · `mcp` · `openapi` · `selfTest`

Full schema: `GET https://api.anatome.dev/openapi`. MCP: `POST https://api.anatome.dev/mcp`.

Legacy Base44 paths remain at `https://anatome.dev/functions/<name>` during migration.

## License & attribution

Anatome is licensed under [Apache-2.0](./LICENSE). It builds on third-party data —
see [`NOTICE`](./NOTICE): anatomical paths from
[react-native-body-highlighter](https://github.com/HichamELBSI/react-native-body-highlighter)
(MIT) and exercise metadata from [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
(Unlicense). That dedication covers the metadata only — the dataset's photography is of
unverified origin and is not cleared for redistribution ([#21](https://github.com/Rippy1911/anatome/issues/48)).

> NextSolutions also makes [airon.coach](https://airon.coach) — an AI personal
> trainer that uses Anatome under the hood.
