<div align="center">

# Anatome

**Muscle anatomy, 873 exercises and session heatmaps — free, keyless, and yours to self-host.**
By [NextSolutions](https://nextsolutions.studio).

<img src="https://api.anatome.dev/generateImage?gender=male&view=dual&width=420&layers=DC2626:chest,abs,biceps|F59E0B:triceps,deltoids,quadriceps&output=raw" alt="Anatome muscle diagram example" width="320" />

_That image is a live call to [api.anatome.dev](https://api.anatome.dev) with no credentials attached — which is the whole pitch. Site: [anatome.dev](https://anatome.dev)._

</div>

---

## What is this?

Anatome turns muscle groups and exercise names into clean, colourable anatomical SVG diagrams
over a plain HTTP API, and speaks the [Model Context Protocol](https://modelcontextprotocol.io)
so an assistant can use it as a tool with no integration work at all.

- 🔓 **No API key.** No signup, no token, no header. Every example below runs as written.
- 🎨 Multi-colour layered muscle rendering, `<img src>`-friendly via `?output=raw`
- 💪 873 exercises, searchable and resolvable to muscle layers, with hosted demo GIFs
- 🤖 MCP server (10 tools) + OpenAPI 3.1 spec
- ☁️ Runs on Cloudflare and nothing else — see [SELF_HOSTING.md](./SELF_HOSTING.md)

## Connect it to an assistant

**Claude** — Settings → Connectors → Add custom connector → paste:

```
https://api.anatome.dev/mcp
```

**ChatGPT** — Settings → Apps → Create app → same URL → authentication *None*.

**Config file** —

```json
{
  "mcpServers": {
    "anatome": { "type": "http", "url": "https://api.anatome.dev/mcp" }
  }
}
```

Then just ask: *"which muscles does a Bulgarian split squat actually work?"*

## Use the HTTP API

```bash
# Generate a muscle diagram (raw SVG)
curl "https://api.anatome.dev/generateImage?layers=DC2626:chest,abs&view=front&output=raw"

# Search exercises
curl "https://api.anatome.dev/searchExercises?q=bench&limit=5"

# Exercise demo GIF
curl "https://api.anatome.dev/exerciseGif?id=Bench_Press" -o bench.gif
```

Embed directly in HTML — no auth header to attach, so a bare `<img>` tag works:

```html
<img src="https://api.anatome.dev/generateImage?gender=male&view=dual&layers=DC2626:chest|F59E0B:triceps&output=raw" alt="chest and triceps" />
```

## Fair use

Free, with a budget of **50 requests per caller per day**, resetting at 00:00 UTC. Loopback and
private addresses are never counted, so local development is unlimited. Static catalog reads
(`/listMuscles`, `/listEquipment`, `/bodyPaths`, `/openapi`, the guide endpoints) are edge-cached
and not counted either.

Running out returns `429` with a body a program can act on:

```json
{
  "error": "daily_fair_use_limit_reached",
  "limit": 50, "used": 50, "remaining": 0,
  "reset_at": "2026-08-08T00:00:00.000Z",
  "retry_after_seconds": 62678,
  "retryable": false
}
```

The MCP endpoint is deliberately different. `initialize` and `tools/list` are **never** rate
limited — otherwise a user who is simply out of requests for the day cannot complete the
handshake, and every assistant renders that as *"connector failed"*. Only `tools/call` spends
budget, and when it runs out the call returns a normal result with `isError: true` and a
plain-English explanation, so the model tells the user the truth rather than reporting an outage.

Need more? Either [self-host it](./SELF_HOSTING.md) and set your own limit, or use the hosted
platform at [platform.anatome.dev](https://platform.anatome.dev), which adds per-user workouts
and meals, AI parsing, interactive widgets, curated programming, coach and trainee accounts and
production quotas.

## Repository layout

| Path | What | Deploys via |
| --- | --- | --- |
| [`api/`](./api) | Cloudflare Worker at **api.anatome.dev** (Hono + TypeScript) | `wrangler deploy` |
| repo root (`src/`, `index.html`, `vite.config.js`, …) | React/Vite site + playground at **anatome.dev** | `npm run build && wrangler deploy` |
| [`docs/`](./docs) | Working notes and audits | — |

Two independent deployables, no shared runtime. Neither needs a database.

## Endpoints

`generateImage` · `workoutImage` · `searchExercises` · `getExercise` · `resolveExercise` ·
`exerciseGif` · `exerciseImage` · `listMuscles` · `muscleInfo` · `listEquipment` · `bodyPaths` ·
`listGuides` · `getGuide` · `getGuideTree` · `mcp` · `openapi` · `ciStatus` · `selfTest`

Full schema: `GET https://api.anatome.dev/openapi`. Machine discovery:
`GET https://api.anatome.dev/.well-known/mcp.json`.

> ⚠️ The **skill guides** (`listGuides` / `getGuide` / `getGuideTree` and their MCP tools) are a
> **work in progress**: media coverage is incomplete and the coaching cues are unreviewed. Every
> response carries `status: "work_in_progress"` and the tool descriptions say so. Treat the
> content as provisional, not as training advice.

## Development

```bash
# API
cd api && pnpm install && pnpm run worker:dev     # → http://localhost:8787
cd api && pnpm test && pnpm run typecheck

# Site
npm install && npm run dev
npm run lint && npm run build
```

Point the site at a local Worker with `VITE_PUBLIC_API=http://localhost:8787 npm run dev`.

## License & attribution

Anatome is licensed under [Apache-2.0](./LICENSE). It builds on third-party data — see
[`NOTICE`](./NOTICE):

- **Anatomical SVG paths** — MIT, © Hicham El Boussarghini, from
  [react-native-body-highlighter](https://github.com/HichamELBSI/react-native-body-highlighter).
- **Exercise metadata** — Unlicense, from `wrkout/exercises.json`. That dedication covers the
  **metadata only**: the dataset's photography is of unverified origin and is **not** cleared for
  redistribution ([#48](https://github.com/Rippy1911/anatome/issues/48)). `/exerciseImage`
  proxies those files rather than vendoring them; do not treat them as licensed.
- **Skill guides** — CC-BY-4.0 content.

> NextSolutions also makes [airon.coach](https://airon.coach) — an AI personal trainer that uses
> Anatome under the hood.
