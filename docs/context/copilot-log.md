# anatome — Copilot context log

*Auto-distilled from IdeaForge conversations (last 30 days). Source: .ideaforge-context/raw/slices/anatome.json. anatome is an open-source muscle-group image API + free-exercise-db, sibling to aironcoach.*

## Summary (3-5 bullets)

- **Build is done, hardening is the open work.** The API, MCP server, AI assist, 873-exercise ExerciseDB (free-exercise-db, CC0), 18→23 muscle slugs, OpenAPI 3.1 spec, and playground UI all shipped and are live at `anatome.dev` + `api.anatome.dev` (Cloudflare Workers). What remains is launch-readiness + a few unfinished feature tiers, not the core engine.
- **Three feature tiers were planned but NOT shipped:** tri-color muscle arrangement (primary/secondary/**accessory** — e.g. bench press should show abs only as accessory, not primary), sub-region drilldown (upper/mid/lower chest separately), and head selection as a properly-spec'd optional parameter. These are the highest-ROI product gaps vs. the RapidAPI competitor.
- **Launch is blocked on the Base44 security scan:** it flags 2 unauthenticated backend functions (`importBodyData`, `importExerciseDb`) + `selfTest` plus missing `X-Frame-Options`/`Permissions-Policy` headers — must clear before re-submitting to Base44 Launchpad. License posture is clean (Apache-2.0 code + MIT anatomy paths + CC0 exercise data); see `attribution-audit.md`.
- **Airon integration is the reference customer and the marketing wedge.** Anatome is designed as Airon's single source of truth for exercise data + muscle diagrams, via ns-api-cache proxy (`/v1/proxy/anatome/*`) and as an MCP connection on Airon's coach agent (zero Airon glue code for the AI path). Wave 4 (`api.anatome.dev` on Cloudflare) is the prerequisite — don't integrate against the Base44-hosted URL.
- **Experimentation surfaced a real infra gap:** ns-coder/OH sandbox could capture BEFORE screenshots but failed to do local `npm install` + build + AFTER screenshots, and couldn't persist `OPENROUTER_API_KEY`/`GITHUB_TOKEN` via env (only inline-in-brief worked). PR #1 (visual fixes) and PR #3 (video capture, the one real success) shipped; PR #2 was a downgrade.

## Open workstreams (ordered by ROI)

### 1. Launch-readiness: Base44 security scan + anatome.app domain
- **Status:** Blocked on the Base44 security scan (the real blocker). License posture is clean and verified (Apache-2.0 code + MIT anatomy paths from `react-native-body-highlighter` + CC0 exercise data from `free-exercise-db`); see `docs/context/attribution-audit.md` and `launch-readiness.md` §1/§2.
- **PR/commit:** None yet.
- **What's left:**
  - Apply the Base44 security-remediation build prompt (`docs/context/build-prompts/security-remediation.md`): Bearer-token auth on `importBodyData`/`importExerciseDb`, gated `selfTest`, app-wide security headers. This is the Launchpad blocker.
  - Decide canonical domain: `anatome.nextsolutions.studio` first, or jump to `anatome.app`/`anatome.dev` (`anatome.dev` + `api.anatome.dev` already live).
  - The RapidAPI listing already exists (`rapidapi.com/anatome/api/anatome`); confirm pricing tier (basic plan: 300 req/month free, then $0.001/request; unlimited localhost for dev).
  - Marketing: post-launch social copy (X/LinkedIn/HN) was offered, not yet drafted.
- **Conversation ids:** `6a1e924a6eaf0e6361f97037`, `6a22990be33b01dbc767baee`

### 2. Base44 security scan remediation (Launchpad prerequisite)
- **Status:** §1–§3 (the 3 function auth gates) **DONE in code** (2026-06-25) — `importBodyData`, `importExerciseDb`, `selfTest` now gated behind Bearer `ADMIN_TOKEN` (constant-time-ish SHA-256 compare; 503 if unset, 401 on bad token; `importExerciseDb`'s bypassable `auth.me()` half-check removed so the single-curl destructive delete loop can't run without the token; `selfTest` allows Bearer OR loopback OR existing `PROXY_SECRET`/`MCP_TRUSTED_KEY` bypass). `deno check`/`deno lint` confirm zero new errors. §4 (frontend `X-Frame-Options`/`Permissions-Policy` headers) + §5 (`ADMIN_TOKEN` generation + Base44 env + IdeaForge Secret `other/ANATOME_ADMIN_TOKEN`) still manual. Spec/record: `docs/context/build-prompts/security-remediation.md`.
- **PR/commit:** Function-gate code ready to commit/push (Base44 picks up GitHub-side function edits on redeploy per owner). §4/§5 applied via Base44 AI Chat. Spec saved as `document#6a22d0f7eddbac1603f2f1f8`; tracking task `tasks/6a22d0ffeddbac1603f2f1fc`.
- **What's left:**
  - Apply the Base44 mega-prompt: add Bearer-token auth (env `ADMIN_TOKEN`) to `importBodyData` + `importExerciseDb`; gate `selfTest` (Bearer token or localhost/internal-only).
  - Add app-wide `X-Frame-Options: DENY` (or `frame-ancestors 'none'`) + `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` headers on the Base44 frontend.
  - Save the generated `ADMIN_TOKEN` to IdeaForge Secrets as `other/ANATOME_ADMIN_TOKEN`.
  - Re-run Base44 security scan → confirm "Out of date" goes green → re-submit to Launchpad.
  - Bonus: bake the security-header rules into the Cloudflare Workers port (`/api`) so the future split inherits hardening.
- **Conversation ids:** `6a22990be33b01dbc767baee`

### 3. Unfinished feature tiers (tri-color, sub-region drilldown, head optional)
- **Status:** Planned (Wave 2), not shipped.
- **PR/commit:** None.
- **What's left (the "next-level drilldown" Sebastian asked for):**
  - **Tri-color / accessory tier:** third color for accessory muscles. Bench press must NOT show abs as primary/secondary — either no abs, or abs as accessory (third color).
  - **Sub-region drilldown:** highlight lower/middle/upper chest separately (and analogous subdivisions) — expand the muscle catalog with sub-slugs.
  - **Head selection:** make optional, properly spec'd and testable (currently scaffolded, falls back to base image).
  - Sync the engine asset URLs everywhere (muscleEngine frontend + mcpServer backend were noted as missing the asset-URL sync).
- **Conversation ids:** `6a1e924a6eaf0e6361f97037`

### 4. Frontend library mode (callbacks, hover/click)
- **Status:** Idea, not started.
- **PR/commit:** None.
- **What's left:** Port the renderer as a standalone frontend JS library with `on:hover` reactions, click callbacks, custom colors/stroke. Separate from the HTTP API surface.
- **Conversation ids:** `6a1e924a6eaf0e6361f97037`

### 5. Visual bugs still open from Wave 1
- **Status:** Partially addressed by PR #1 (visual-only React fixes); core rendering bugs not fully resolved.
- **PR/commit:** PR #1 (`ns-coder/tsk_d6de551ba686fc98`) — 7 commits, visual-only; not yet merged/deployed.
- **What's left:**
  - Front/back view switching breaks rendering; "drawn" items break in single-view mode.
  - Front/back views show a ghost arm from the other view (misaligned asset).
  - Female model not working (falls back to male).
  - Layout is jumpy when switching options in the menu.
  - Need AFTER screenshots to verify (PR #1 only captured BEFORE — local build/screenshot capability gap).
- **Conversation ids:** `6a1e924a6eaf0e6361f97037`, `6a22eac59ea25371981e4220`

### 6. Airon integration (reference customer)
- **Status:** Plan written, blocked on Wave 4 (`api.anatome.dev` on Cloudflare). Don't integrate against the Base44-hosted URL.
- **PR/commit:** None.
- **What's left:**
  - Wait for Wave 4 to ship `api.anatome.dev` (est. 2 days Cursor work, ~3-5 days realistic).
  - Add `/v1/proxy/anatome/*` namespace to ns-api-cache (alongside `/v1/proxy/exerciseapi/*`); cache 24h on search, 7d on exercise detail (CC0 static data).
  - Register Anatome MCP (`/mcp`, 5 tools) as a connection on Airon's coach agent — highest-leverage, ~30 min, zero Airon UI code.
  - Replace Airon's exercise-picker UI to call `AnatomeClient` → ns-api-cache → Anatome; use `anatome_imageSrc` directly as `<img src>` (Anatome renders the SVG, browser caches it).
  - Kill Airon's local exercise data once parity confirmed (single source of truth).
  - Circuit-breaker: 3 consecutive 5xx → fall back to a 50-exercise seed list shipped in Airon's bundle.
- **Conversation ids:** `6a1f2904d07edd3ac2396e93`, `6a2bf98cd69350873059a7fe`

### 7. GIF → video pipeline (Airon PRO-tier wedge)
- **Status:** Explored, not built.
- **PR/commit:** None.
- **What's left:** Recommended start with Path 1 (Topaz Video AI or FFmpeg+RIFE frame interpolation, ~free) on one anatome.dev GIF as a proof. Higher-effort Path 3 (Gemini/Claude vision analysis → script → Runway/Kling extension → ElevenLabs narration → FFmpeg stitch, ~$2-5 per 60s video) is the "video exercise library" PRO differentiator for Airon. Red-team risks: anatomical accuracy hallucination, anatome.dev ToS for derivative works, cost at scale.
- **Conversation ids:** `6a1f3a449761f157950e9514`

## Recent merges / completed

| Date | What | PR/SHA |
|---|---|---|
| 2026-06-05 | Anatome Muscle API v1 shipped end-to-end (Base44): `generateMuscleImage`, `mcpServer` (JSON-RPC 2.0, 3 tools), `aiMuscleAssist`, `listMuscles`, `selfTest` (10/10 passing), `openapiSpec` (OpenAPI 3.1), playground UI, auth pages, head + gender toggle scaffolding | — (Base44 deploy, not a PR) |
| 2026-06-05 | SVG engine rebuilt v1→v2→v3: from abstract blobs → anatomical silhouette → composed PNG via SVG `<image>` + `feColorMatrix` dynamic tinting; generateMuscleImage base64-encodes composed PNG for standalone image | — (Base44 deploy) |
| ~2026-06-05 | Repo confirmed live at github.com/Rippy1911/anatome (private, monorepo: `/base44` for Base44 functions, `/api` for Cloudflare Workers port) | — |
| 2026-06-05 | PR #1 opened: 40 BEFORE screenshots + 7 visual-only React fixes (Tailwind `w-4.5`→`w-4`, theme-aware code blocks, dark-mode Swagger UI, mobile spacing/overflow, CSS-variable theme colors) | [Rippy1911/anatome#1](https://github.com/Rippy1911/anatome/pull/1) (branch `ns-coder/tsk_d6de551ba686fc98`) |
| 2026-06-06 | PR #2 opened (Run 1): skeleton capture-screenshots/set-env scripts — **DOWNGRADE**, never ran `npm install`/build/screenshots | [Rippy1911/anatome#2](https://github.com/Rippy1911/anatome/pull/2) (branch `ns-coder/tsk_ab3918978b787dee`) |
| 2026-06-06 | PR #3 opened (Run 4): Playwright video recorder (3 journeys) + GitHub Release with 4 real `.webm` assets — **the one real success** of the experiment series | [Rippy1911/anatome#3](https://github.com/Rippy1911/anatome/pull/3) + Release `experiment-run4-tsk_3d85e40284b498d9` (branch `ns-coder/tsk_3d85e40284b498d9`) |
| 2026-07-06 | Repo migrated to the NextSolutionsStudio org: [github.com/NextSolutionsStudio/anatome](https://github.com/NextSolutionsStudio/anatome) (public, Apache-2.0). Full `main` history + `experiment-run4-tsk_3d85e40284b498d9` tag + `fix/security-gates-and-license-labels` branch pushed; default branch `main`; dependabot auto-regenerated fresh branches. Live repo links repointed (`Contact.jsx`, `Layout.jsx`, `HealthBar.jsx`, `Pricing.jsx`, `TERMS.md`, `api/src/routes/ciStatus.ts`). Old `Rippy1911/anatome` retained as `legacy` remote. Historical PR links above stay as-is (accurate record of the original repo). | — |
| 2026-07-27 | **Migration reversed — `Rippy1911/anatome` is canonical again.** The org copy was never linked to Base44, so `anatome.dev` kept publishing from this repo while the org copy took every code change and, from 07-27, the `api.anatome.dev` deploy. One product, two half-live repos. Consolidated back here (#47: merge of the org copy's `main`, +42,474/-60, history preserved via the shared ancestor `4d58f3a`), moved the Cloudflare deploy secrets onto this repo, and repointed the links the 07-06 migration had sent the other way. Licensing issue re-filed here as [#48](https://github.com/Rippy1911/anatome/issues/48) so the 118 catalog provenance records cite a live issue in their own repo. | [#47](https://github.com/Rippy1911/anatome/pull/47) |

## Decisions & rationale

- **Three-wave model locked to model split** (Sebastian's explicit framing): Wave 1 = Gemini 3.1 Pro for visuals; Wave 2 = Opus 4.8 for API spec (tri-color, sub-region, head, frontend lib, AI resolver, OpenAPI+MCP sync, competitive matrix); Wave 3 = Automatic/polish (mobile-first, e2e tests, perf+cache, RLS/auth model, Deno Deploy port); Wave 4 = launch (license audit, domain, RapidAPI, Airon integration, marketing).
- **Anatome becomes Airon's single source of truth for exercise data + muscle diagrams** — not "import Anatome's data into Airon" (that would double Airon's JS payload with ~3000 SVG paths and break cross-app sharing). Rationale: stable OpenAPI-locked, Apache-2.0, version-stable contract — same posture as Airon consuming Stripe.
- **MCP surface decision for the Airon workout mega-prompt: "both"** — Anatome both *exposes* an MCP server (for external agents) and Airon *consumes* MCP internally for the coach. Exposed-MCP-from-day-one is the v1 differentiator no fitness app ships with.
- **Base44-hosted backend is the source of truth, not the GitHub mirror.** `base44/functions/` is mirrored FROM Base44 (Base44 → Git sync). Fixes to those backend functions must go through Base44 AI Chat, not ns-coder PRs. ns-coder can only touch the Cloudflare Workers `/api` port. This is why the security-scan fix is a paste-and-apply prompt job, not a queued PR.
- **Open source license posture is clean and fully permissive** (Apache-2.0 code + MIT anatomy paths from HichamELBSI/react-native-body-highlighter + CC0 exercise data from yuhonas/free-exercise-db). Verified 2026-06-25 against the repo + git history; see `attribution-audit.md`.
- **ns-coder env workaround = "inline-in-brief."** Until the ns-coder-bridge v4.4-c fix (proper `SANDBOX_RUNTIME_STARTUP_ENV_VARS` / GITHUB_TOKEN + OPENROUTER_API_KEY propagation) ships, secrets must be embedded literally in `spec_markdown`. Leaky but proven (used to ship PR #22 and PR #1). Token rotation is a known recurring need.
- **DeepSeek V4 Flash data point:** bad on opaque "set up X" tasks (PR #2 downgrade), capable on artifact-driven specs (PR #3 video pipeline was the most complex task and the only clean success).
- **The "Build Anatome Mega-Prompt" iteration (`6a2c13c8`) drafted a DIFFERENT concept than the shipped API:** a "3D AI Workout-Demo Generator + Anatomy Explorer (v0.1)" — looping 3D animations of compound lifts + interactive 3D anatomy viewer + AI text→demo generator, portable to self-hosted Hetzner. This is a future-direction mega-prompt (Fable 5 single-pass), not the current shipped product — useful context for anyone considering a v2/expansion.

## Source conversations

| date | agent | title | conv_id |
|---|---|---|---|
| 2026-06-22 | prompt_architect | Build sweepCursorPRs loop | 6a3946acd837e50735d43946 |
| 2026-06-22 | pr_reviewer | PR Triage and Queue | 6a394477a29236cbbe95c125 |
| 2026-06-16 | prompt_architect | Build fc-uploads App | 6a31195ef44e3a8496d320c3 |
| 2026-06-16 | prompt_architect | BrandStudio Architect Brief | 6a30fabdfe7d7da8c81bc69e |
| 2026-06-16 | prompt_architect | BrandStudio v1 Mega-Prompt | 6a30f9a9f13d1b6b572ea9c9 |
| 2026-06-12 | prompt_architect | Build Anatome Mega-Prompt | 6a2c13c89b8979cdece46e5a |
| 2026-06-12 | business_copilot | Airon Workout App Prompt | 6a2bf98cd69350873059a7fe |
| 2026-06-06 | business_copilot | PR Status and Feedback | 6a22eac59ea25371981e4220 |
| 2026-06-05 | business_copilot | Anatome Muscle API Development | 6a1e924a6eaf0e6361f97037 |
| 2026-06-05 | business_copilot | Anatome Launchpad Submission | 6a22990be33b01dbc767baee |
| 2026-06-02 | business_copilot | Convert GIF to Video | 6a1f3a449761f157950e9514 |
| 2026-06-02 | business_copilot | Transpile Anatome for Searches | 6a1f2904d07edd3ac2396e93 |

> Note on the three org-wide conversations (`6a3946ac`, `6a394477`, `6a31195e`) and the two BrandStudio conversations (`6a30fabd`, `6a30f9a9`): anatome appears only as one repo among many in an org sweep / as a demo "golden path" use-case, not as the subject. The substantive anatome content lives in the other seven rows.
