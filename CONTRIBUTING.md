# Contributing to Anatome

Thanks for your interest in improving Anatome! The repo has two independently
deployed parts:

- **`api/`** — the Cloudflare Workers API at **api.anatome.dev** (deploys via `wrangler`).
- **Site (repo root)** — the React/Vite site + playground at **anatome.dev**, built to static
  files and served by Cloudflare Workers Static Assets (also `wrangler`).

Neither has a database or a third-party dependency you need an account for. See
[SELF_HOSTING.md](./SELF_HOSTING.md) if you want your own copy running.

## Local setup

### Site (repo root)

```bash
npm install
npm run dev
# point it at a local Worker instead of production:
VITE_PUBLIC_API=http://localhost:8787 npm run dev
```

### API (Cloudflare Workers)

```bash
cd api
pnpm install
pnpm run worker:dev    # wrangler dev
```

Secrets (`PROXY_SECRET`, `MCP_TRUSTED_KEY`) are set with `wrangler secret put` —
never commit them.

Exercise demo GIFs live in `api/public/gifs/` (git-tracked). To regenerate:
`python3 scripts/generate-exercise-gifs.py`.

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — a new capability
- `fix:` — a bug fix
- `chore:` — tooling/maintenance
- `docs:` — documentation only
- `test:` — tests only
- `refactor:` / `ci:` — as appropriate

Add a scope when helpful, e.g. `feat(api): add muscle catalog endpoint`.

## Tests (required before opening a PR)

- **Site:** `npm run lint` and `npm run build` must pass.
- **API:** `pnpm test` and `pnpm run typecheck` must pass, and the `selfTest`
  endpoint must stay green (never fewer passing cases than before your change).
  `pnpm exec wrangler deploy --dry-run --outdir dist` catches config errors that
  tests cannot.

PRs with failing checks will not be merged.

## Things to know before you change the API

- Every public API JSON response that carries third-party data must keep its
  legal attribution fields (`attribution`, `attribution_source`, `license`, plus
  `exercise_db_attribution` on exercise responses). Don't remove them. The
  `built_by`/`try_also` marketing fields are intentionally omitted.
- **Anatome is keyless and stays keyless.** No `Authorization` header, no plans, no
  quota tiers, no billing hooks. If a change needs one of those, it belongs in the
  hosted platform, not here.
- The fair-use model is deliberate and subtle in two places: the MCP handshake
  (`initialize` / `tools/list`) is never metered, and an exhausted `tools/call`
  returns `isError` inside a normal result rather than a JSON-RPC error. Both exist
  so an assistant reports "you're out of requests today" instead of "the connector
  is broken". Read the header comment in `api/src/lib/rateLimit.ts` before changing
  anything there, and don't delete the tests that pin it.
- The public API has **no** AI/LLM endpoints — please don't add any. Anatome renders,
  searches and resolves; the model calling it does the thinking.
- Don't break backwards compatibility: existing URLs (embedded `<img src>`, MCP
  configs) must keep working.

## PR process

1. Fork and branch from `main`.
2. Make focused changes with conventional commits.
3. Ensure all tests/linters pass.
4. Open a PR using the template; describe what changed and why.
5. Both halves deploy via `wrangler`, independently. PRs that span both need review
   from a maintainer.

By participating, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).
Questions: contact@nextsolutions.studio
