# Self-hosting Anatome

Anatome runs entirely on Cloudflare: a Worker for the API, static assets for the site. There is
no database, no third-party account, no billing provider and no secret you must obtain from
anyone. If you have a Cloudflare account, you can have your own copy running in about ten
minutes, and it will be the same software that runs anatome.dev.

This is the honest version of "open source": not a source dump next to a hosted product you
actually have to pay for, but the deployable thing.

## What you get

| Piece | Where | What it needs |
| --- | --- | --- |
| `api/` | Cloudflare Worker at your own hostname | one KV namespace, one Durable Object |
| repo root | Cloudflare Workers Static Assets | nothing |

No Postgres. No Redis. No S3. The 873-exercise catalog, the 23-muscle anatomical path data and
the demo GIFs are all files in the repo, bundled into the Worker at deploy time.

## Prerequisites

- Node 20+ and `npm` (the site) — `pnpm` for `api/`, or plain `npm`, either is fine
- A Cloudflare account and `wrangler` logged in: `npx wrangler login`
- A domain on Cloudflare **only if** you want custom hostnames. `*.workers.dev` works without one.

## 1. Deploy the API

```bash
cd api
pnpm install                       # or npm install
pnpm exec wrangler kv namespace create RATE_LIMIT_KV
```

That prints an `id`. Put it in `api/wrangler.toml` under `[[kv_namespaces]]` (and, if you want a
separate local-dev namespace, run it again with `--preview` and set `preview_id`).

Then edit the two things that are yours rather than ours:

```toml
[vars]
PUBLIC_BASE_URL = "https://api.your-domain.example"   # used to build absolute image URLs
FAIR_USE_DAILY_LIMIT = "50"                            # your call — see below
```

and, in `[env.production]`, replace the `routes` block with your own hostname (or delete it and
set `workers_dev = true` to publish on `*.workers.dev`).

```bash
pnpm exec wrangler deploy --env production
curl https://api.your-domain.example/            # → {"ok":true,...}
curl https://api.your-domain.example/selfTest -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Choosing your fair-use limit

`FAIR_USE_DAILY_LIMIT` is the number of requests one caller gets per UTC day. It exists on the
public deployment because the public deployment is free and anyone can call it. On your own
Worker, you are the one paying for invocations, so set it to whatever suits you — `100000` if
it is an internal service, `50` if you are publishing it.

Requests from loopback and private addresses are never counted, so local development and smoke
tests are always unlimited.

`ANON_NETWORK_DAILY_LIMIT` is a separate runaway guard, not a fair-use number: see
[docs on how identity is resolved](#a-note-on-who-gets-counted) below. Leave it well above
`FAIR_USE_DAILY_LIMIT`.

### Optional secrets

None of these are required. The Worker starts and serves the whole API without any of them.

```bash
wrangler secret put ADMIN_TOKEN      # enables /admin/* and /selfTest from the public internet
wrangler secret put PROXY_SECRET     # bypass for an API marketplace that meters upstream
wrangler secret put MCP_TRUSTED_KEY  # bypass for your own first-party MCP bridge
wrangler secret put GITHUB_TOKEN     # /ciStatus badge; degrades to a static pointer without it
```

## 2. Deploy the site

```bash
cd ..            # repo root
npm install
npm run build
npx wrangler deploy --env production
```

Edit the root `wrangler.toml` `routes` first, the same way you did for the API. To point the
site at your own API rather than ours, build with:

```bash
VITE_PUBLIC_API=https://api.your-domain.example npm run build
```

You do not have to deploy the site at all. The API is independently useful, and plenty of
self-hosters will only want that.

## 3. Local development

```bash
cd api && pnpm exec wrangler dev      # → http://localhost:8787
```

```bash
# repo root, in another shell
VITE_PUBLIC_API=http://localhost:8787 npm run dev
```

Local requests come from a private address, so nothing is rate limited while you work.

## Tests

```bash
cd api && pnpm test && pnpm run typecheck
pnpm exec wrangler deploy --dry-run --outdir dist   # catches config errors before they ship
```

```bash
# repo root
npm run lint && npm run build
```

## Connecting an assistant to your own deployment

Exactly as with the public one, substituting your hostname:

```json
{
  "mcpServers": {
    "anatome": { "type": "http", "url": "https://api.your-domain.example/mcp" }
  }
}
```

## A note on who gets counted

Fair use is charged against whichever identity the Worker can actually see:

- A request carrying an `Mcp-Session-Id` is counted **per session**. The Worker issues one during
  `initialize` and compliant clients echo it back.
- Everything else is counted **per IP**.

The session hop exists because a *remote* MCP connector is called by the assistant vendor's
servers, not by the end user's device — every Claude or ChatGPT user reaches your Worker from the
same handful of egress addresses. Counting those by IP would put every one of them in a single
daily bucket and make the connector look permanently broken.

Be clear-eyed about what that buys: a session id is client-supplied and free to re-mint, so this
is a fair-use speed bump, not an access control. `ANON_NETWORK_DAILY_LIMIT` (default 10 000) caps
how much one network can take through re-minted sessions, and Cloudflare's WAF is the real flood
layer if you need one. A durable per-user budget needs a durable user, which means accounts — not
in this release.

## What is deliberately not here

- **No accounts and no per-user data.** Nothing is stored about a caller beyond a daily counter
  keyed on a hash. There is nothing to export and nothing to leak.
- **No AI.** Anatome renders, searches and resolves; it never calls a model. When an assistant
  uses these tools, the assistant does the thinking.
- **No payments.** There is no billing code in this repo at all.

If you want per-user workouts and meals, AI parsing, interactive widgets, coach and trainee
accounts or production quotas, that is the hosted platform at
[platform.anatome.dev](https://platform.anatome.dev) — a different, larger service. This repo is
the free tier, and it is complete on its own terms.

## Licensing you inherit

- **Anatome** — Apache-2.0.
- **Anatomical SVG paths** — MIT, © Hicham El Boussarghini, from
  [react-native-body-highlighter](https://github.com/HichamELBSI/react-native-body-highlighter).
  Keep the attribution the API already returns.
- **Exercise metadata** — Unlicense, from `wrkout/exercises.json`.
- **Reference photography** served through `/exerciseImage` is of **unverified origin and is not
  cleared for redistribution**. It is proxied, not vendored. If you are shipping something
  commercial, treat that endpoint as a liability and source your own imagery.
- **Skill guides** — CC-BY-4.0 content, and a work in progress: unreviewed cues, incomplete
  media. Every guide response says so in `status`.
