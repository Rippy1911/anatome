# Self-hosting Anatome

Anatome runs entirely on Cloudflare: a Worker for the API, static assets for the site, and one
optional D1 database if you want accounts. There is no third-party account to register with, no
billing provider and no secret you must obtain from anyone. If you have a Cloudflare account, you can have your own copy running in about ten
minutes, and it will be the same software that runs anatome.dev.

This is the honest version of "open source": not a source dump next to a hosted product you
actually have to pay for, but the deployable thing.

## What you get

| Piece | Where | What it needs |
| --- | --- | --- |
| `api/` | Cloudflare Worker at your own hostname | one KV namespace, one Durable Object |
| `api/` accounts + logging | the same Worker | one D1 database — **optional** |
| repo root | Cloudflare Workers Static Assets | nothing |

No Postgres. No Redis. No S3. No third-party identity provider. The 873-exercise catalog, the
23-muscle anatomical path data and the demo GIFs are all files in the repo, bundled into the
Worker at deploy time.

The D1 database is genuinely optional. Skip it and the Worker serves the entire catalog API and
simply stops advertising the logging tools — a supported way to run this, and the fastest one.

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

### Adding accounts and logging (optional)

Skip this section entirely if you only want the catalog API.

```bash
pnpm exec wrangler d1 create anatome
```

Paste the returned `database_id` into the `[[d1_databases]]` block in `api/wrangler.toml`, then
create the schema:

```bash
pnpm exec wrangler d1 migrations apply anatome            # remote
pnpm exec wrangler d1 migrations apply anatome --local    # for `wrangler dev`
```

That is all. There is no identity provider to register with, no OAuth client to obtain and no
mail provider to configure — Anatome is its own OAuth 2.1 authorization server, and users sign in
with an email and password held only by your deployment.

Two consequences you should know before you offer this to anyone:

- **There is no password reset**, because there is no way to send email. A user who forgets their
  password loses the account. Say so on your own site, as `PRIVACY.md` does on ours.
- **You become the data controller** for whatever your users log. `PRIVACY.md` in this repo
  describes anatome.dev; publish your own version rather than pointing at ours.

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
npx wrangler deploy
```

The root `wrangler.toml` ships with **no `routes`**, so this uploads the Worker without claiming a
hostname. That is a deliberate default for our own CI, whose deploy token cannot edit zone routes —
see the comment at the top of that file. On your own zone you have both permissions, so add the
routes there and wrangler will bind the hostname for you on every deploy:

```toml
workers_dev = false
routes = [{ pattern = "example.com/*", zone_name = "example.com" }]
```

Either way the cutover is reversible: a Workers route wins over whatever the zone pointed at
before, and deleting the route restores it immediately, with no DNS change and no gap.

To point the site at your own API rather than ours, build with:

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
cd api
pnpm test                                          # pure logic + route shape, plain node
pnpm run test:workers                              # runs inside workerd against a real local D1
pnpm run typecheck
pnpm exec wrangler deploy --dry-run --outdir dist  # catches config errors before they ship
```

`test:workers` is where the account and logging tests live. They need the real runtime because a
hand-written D1 stub would only prove that the stub behaves the way its author imagined.

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
layer if you need one.

Once a user signs in, fair use is charged to **their account** instead — a durable identity that
does not depend on a session id or an egress address.

### Giving someone their day back

Sooner or later a user says the connector claims they are out of requests when they are sure they
are not. `POST /admin/rate-limit/reset` zeroes today's counter for exactly one identity. Address
them the way they addressed you — by email:

```bash
curl -X POST https://api.your-domain.example/admin/rate-limit/reset \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"email":"them@example.com"}'
# → {"ok":true,"reset":true,"scope":"user","key":"user:…:2026-08-08"}
```

`user` (the internal id), `session` (an `Mcp-Session-Id`) and `ip` also work — pass **exactly
one**. Check `scope` in the reply: it names the bucket that was actually cleared, so a `user` you
expected and an `ip` you got means you cleared a bucket nobody was in.

Signed-out callers are counted per session or per IP, and those buckets are shared, so resetting
one hands the day to everyone behind it. Resetting by email does not have that problem.

## What is deliberately not here

- **No AI.** Anatome renders, searches, resolves, stores and adds up. It never calls a model —
  when an assistant logs "oatmeal with berries", the *assistant* worked out the macros and sent
  them as structured JSON. That keeps this tier free and dependency-free.
- **No food database and no barcode lookup.** Nutrition numbers are whatever the caller supplies.
- **No coaches, no programming, no meal plans, no wearables.**
- **No payments.** There is no billing code in this repo at all.
- **No email**, and therefore no password reset. See above.

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
