# AGENTS.md — Anatome

*Last updated: 2026-06-08 by IdeaForge Copilot. Read automatically by Cursor Composer, OpenAI Codex, Google Jules, Amp, ns-coder, ns-pi and any other AGENTS.md-aware coding agent. Treat as your onboarding doc.*

---

## What Anatome is

**Anatome** (homepage: anatome.dev) is an open-source **muscle-group image generator API + ExerciseDB** by NextSolutions. Apache-2.0 licensed, MCP-compatible, 873 exercises pre-mapped to muscle groups. Stack:

- **Cloudflare Workers** runtime
- **Hono** framework
- **JavaScript** (not TypeScript currently)
- **Wrangler** for deploy + local dev

Unlike Sebastian's other repos, **this one is NOT a Base44 mirror** — it's a real codebase with real build commands. You can clone, install, test, and deploy normally.

Used by Airon Coach (via npm dependency or direct API call) to render muscle-group SVGs for workout cards.

## Build + test + deploy

```bash
# Install
npm install

# Local dev (Wrangler dev server)
npm run dev
# → typically http://localhost:8787

# Lint
npm run lint            # if defined

# Type check
# (no TS yet, but JSDoc/jsconfig may exist — check)

# Test
npm test                # if defined in package.json
npm run test:unit       # if split

# Deploy (production)
npx wrangler deploy
# → deploys to Cloudflare Workers in the configured account

# Tail logs
npx wrangler tail
```

**Cursor Composer**: you have a full Linux sandbox — you CAN run `npm install`, `npm test`, `wrangler deploy --dry-run`. Use it. Self-verify before opening a PR.

**ns-coder / ns-pi**: you may not have npm dependencies installed in your sandbox. Lint/test in CI instead via GitHub Actions.

## Repo layout (best-effort)

```
src/                        Worker source code (Hono routes, handlers)
  index.js                  main entrypoint
  routes/                   per-route modules
  exercises/                exercise database + muscle mapping
  svg/                      SVG generation helpers
  mcp/                      MCP server integration
public/                     static assets if any
wrangler.toml               Cloudflare Workers config
package.json                npm scripts + deps
README.md                   the existing one is good — read it first
.github/workflows/          CI (build + test + deploy on tag)
AGENTS.md                   this file
LICENSE                     Apache-2.0
```

## How to do good work here

1. **Read first.** Check `README.md`, `package.json` scripts, `wrangler.toml`, and `src/index.js` before any change.
2. **Real CI applies.** Tests will run. Make them pass before opening a PR.
3. **Match style.** Functional ES modules, single quotes, no semicolons-at-end (check the existing files), kebab-case for files.
4. **Cloudflare Workers constraints**: no Node-specific APIs (no `fs`, no `process`). Use Web APIs (`fetch`, `Request`, `Response`, `crypto`).
5. **Don't break the public API.** If a route is documented in README, treat it as a contract. Version a new behavior, don't silently change the old one.
6. **873 exercise mappings**: the muscle-group data is the asset. Don't regenerate or refactor it without explicit approval; just edit the consumer code.
7. **Open source courtesy**: this repo may attract external contributors. Write commit messages + PR descriptions that read well to strangers.

## Commit + PR conventions

- Branch naming: `cursor/<slug>`, `ns-coder/<task-id>`, `ns-pi/<task-id>`, `chat/<slug>`, `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`
- PR title: Conventional commits style — `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `perf:`, `ci:`
- PR body: what, why, screenshots if UI-visible, breaking-change call-out if applicable, agent metadata
- Squash on merge

## Hard 'do not touch' list

- Apache-2.0 LICENSE file (don't change without explicit approval)
- `wrangler.toml` production account_id or zone bindings
- 873 exercise muscle-group mappings (edit consumers, not the data)
- `package.json` `version` bump without intent
- Lock files unless explicitly asked

## Worker fleet (who you might be)

- **Cursor Composer-2.5** — cloud VM with full Linux sandbox. **You can and SHOULD run `npm install` + `npm test` + `wrangler deploy --dry-run` before opening a PR.** Self-verify.
- **ns-coder** — OpenHands on Hetzner. Limited shell. Rely on CI for verification.
- **ns-pi** — Pi CLI on Hetzner, Haiku 4.5. Simple chores only.
- **IdeaForge Copilot** — Claude Sonnet 4.5 orchestrator + reviewer.

## When you finish

Include in PR description:
- Agent name + ID
- Model used
- Wall clock
- Whether you ran `npm test` (and the result)
- Optional: 1-line 'I'd-do-differently'

Ship good work. — Copilot 💙
