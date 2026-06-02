# Anatome API (Cloudflare Workers)

The public Anatome API, served from Cloudflare Workers using [Hono](https://hono.dev).

> **Status:** scaffold in progress. The port from Base44 Deno functions
> (`../base44/functions/`) lands in **Phase 3**. See [`../AGENTS.md`](../AGENTS.md).

## Planned layout

```
api/
├── src/
│   ├── index.ts          # Hono app + route registration
│   ├── routes/           # one module per endpoint
│   └── lib/              # shared: muscleEngine.ts, rateLimit.ts, attribution.ts
├── data/                 # bundled static JSON (bodyPaths.json, exercises.json)
├── test/                 # unit + worker tests (incl. selfTest parity)
├── wrangler.toml         # Worker config, KV binding, routes (Phase 3)
└── package.json
```

## Endpoints (mirror the Base44 functions, minus aiDemo)

`GET/POST /generateImage` · `GET /searchExercises` · `GET /getExercise` ·
`GET/POST /resolveExercise` · `GET /listMuscles` · `POST /mcp` · `GET /openapi` ·
`GET /selfTest`

**Not ported:** `aiDemo` — AI is internal-only and stays on the Base44 frontend.

## Local development

```bash
pnpm install
pnpm run worker:dev     # wrangler dev
pnpm test               # unit tests
pnpm run worker:test    # worker/integration tests (selfTest must be >= 39/39)
```

## Configuration

- **KV:** `RATE_LIMIT_KV` (keys `ip_day:<hash>:<date>` / `host_day:<hash>:<date>`, TTL ~36h)
- **Secrets:** `wrangler secret put PROXY_SECRET` and `wrangler secret put MCP_TRUSTED_KEY`
- **Routes:** `api.anatome.dev/*`

## Rules

Read [`../AGENTS.md`](../AGENTS.md) before changing anything. In short: keep
attribution fields, keep the rate-limit model, never add AI endpoints, never break
backwards compatibility.
