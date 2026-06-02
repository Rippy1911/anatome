<div align="center">

# Anatome

**Muscle group image generator API + ExerciseDB.**
Multi-color anatomical SVGs, MCP-compatible, 873 exercises pre-mapped. By [NextSolutions](https://nextsolutions.studio).

<img src="https://anatome-form-flow.base44.app/functions/generateImage?gender=male&view=dual&width=420&layers=DC2626:chest,abs,biceps|F59E0B:triceps,deltoids,quadriceps&output=raw" alt="Anatome muscle diagram example" width="320" />

_Live example, rendered by the API itself. Canonical domain is moving to `api.anatome.dev`._

</div>

---

## What is this?

Anatome turns muscle groups (and exercise names) into clean, colorable anatomical
SVG diagrams over a simple HTTP API. It also bundles an exercise database (873
exercises from [free-exercise-db](https://github.com/yuhonas/free-exercise-db),
pre-mapped to 23 muscle slugs) and speaks the [Model Context Protocol](https://modelcontextprotocol.io).

- 🎨 Multi-color layered muscle rendering (`<img src>`-friendly, `?output=raw`)
- 💪 873 exercises searchable + resolvable to muscle layers
- 🤖 MCP server (5 tools) + OpenAPI 3.1 spec
- 🆓 Basic plan: 1,000 requests/month free on RapidAPI, then $0.0001/request; unlimited localhost for dev

## Repository layout

| Path | What | Deploys via |
| --- | --- | --- |
| `src/`, `base44/`, `index.html`, `vite.config.js`, … (repo root) | React/Vite marketing + playground site | Base44 |
| [`api/`](./api) | Cloudflare Workers API (Hono) | `wrangler` |
| [`docs/`](./docs) | Reserved for a future docs site | — |

> The frontend lives at the **repo root** (Base44 requires `base44/config.jsonc`
> there and syncs from `main`). The Cloudflare API is an independent package under
> [`api/`](./api). See [`AGENTS.md`](./AGENTS.md) for the architecture decision log
> and contribution rules.

## Quickstart

### Use the API

```bash
# Generate a muscle diagram (raw SVG)
curl "https://anatome-form-flow.base44.app/functions/generateImage?layers=DC2626:chest,abs&view=front&output=raw"

# Search exercises
curl "https://anatome-form-flow.base44.app/functions/searchExercises?q=bench&limit=5"
```

Embed directly in HTML:

```html
<img src="https://anatome-form-flow.base44.app/functions/generateImage?gender=male&view=dual&layers=DC2626:chest|F59E0B:triceps&output=raw" alt="chest and triceps" />
```

### Run the frontend locally

```bash
npm install            # from the repo root
cp .env.local.example .env.local   # set VITE_BASE44_APP_ID + VITE_BASE44_APP_BASE_URL
npm run dev
```

### Run the API locally

```bash
cd api
pnpm install
pnpm run worker:dev
```

## Endpoints

`generateImage` · `searchExercises` · `getExercise` · `resolveExercise` ·
`listMuscles` · `mcp` · `openapi` · `selfTest`

Full schema: `GET /openapi`. MCP endpoint: `POST /mcp`.

## License & attribution

Anatome is licensed under [Apache-2.0](./LICENSE). It builds on third-party data —
see [`NOTICE`](./NOTICE): anatomical paths from
[react-native-body-highlighter](https://github.com/HichamELBSI/react-native-body-highlighter)
(MIT) and exercise metadata from [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
(CC0-1.0).

> NextSolutions also makes [airon.coach](https://airon.coach) — an AI personal
> trainer that uses Anatome under the hood.
