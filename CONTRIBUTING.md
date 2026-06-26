# Contributing to Anatome

Thanks for your interest in improving Anatome! The repo has two independently
deployed parts:

- **Frontend (repo root)** — the React/Vite marketing + playground app
  (deploys through Base44; `base44/config.jsonc` must stay at the repo root).
- **`api/`** — the Cloudflare Workers API at **api.anatome.dev** (deploys via `wrangler`).
- **Marketing site** — **anatome.dev** on Base44 (repo root frontend).

## Local setup

### Frontend (repo root)

```bash
npm install
cp .env.local.example .env.local   # set VITE_BASE44_APP_ID + VITE_BASE44_APP_BASE_URL
npm run dev
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

- **Frontend:** `npm run lint` must pass. (`npm run typecheck` has a known
  pre-existing baseline of failures from the Base44 export and is currently
  non-blocking — don't add new ones.)
- **API:** `pnpm test && pnpm run worker:test` must pass, and the `selfTest`
  endpoint must report **≥ 46/46** (never fewer than before your change).

PRs with failing checks will not be merged.

## Things to know before you change the API

- Every public API JSON response that carries third-party data must keep its
  legal attribution fields (`attribution`, `attribution_source`, `license`, plus
  `exercise_db_attribution` on exercise responses). Don't remove them. The
  `built_by`/`try_also` marketing fields are intentionally omitted.
- The rate-limit model is intentional (free for testing; per-IP and per-host day
  limits; a monthly tier gate). Don't change it without maintainer sign-off.
- AI features are internal-only and live in the frontend. The public API has **no**
  AI/LLM endpoints — please don't add any.
- Don't break backwards compatibility: existing URLs (RapidAPI, embedded `<img src>`,
  MCP configs) must keep working.

## PR process

1. Fork and branch from `main`.
2. Make focused changes with conventional commits.
3. Ensure all tests/linters pass.
4. Open a PR using the template; describe what changed and why.
5. **Frontend changes deploy through Base44. API changes deploy via `wrangler`.
   PRs that span both need review from a maintainer.**

By participating, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).
Questions: contact@nextsolutions.studio
