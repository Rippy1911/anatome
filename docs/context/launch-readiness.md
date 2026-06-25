# Anatome — Launch-readiness checklist

**App:** Anatome — open-source muscle-group image API + ExerciseDB (Base44 appId `6a1ea0b8b40fc9c2e83c0952`, prod `https://anatome.dev`, API `https://api.anatome.dev`).
**Authored:** 2026-06-25.
**Source trail:** `anatome/docs/context/copilot-log.md` (distilled from IdeaForge conversations). Per-line conv-id citations use the table in that log's "Source conversations" section.
**Status:** The core build is done and live; launch is **blocked** on the items below, ordered by priority. The single biggest blocker is the Base44 security scan (§2) — **the 3 function auth gates are now DONE in code** (§2.1–§2.3); remaining: frontend headers + `ADMIN_TOKEN` provisioning + scan re-run.

> Checkboxes track what is done vs open. Items marked **BLOCKER** gate the Launchpad re-submission. Items marked **PREREQ** gate downstream work (Airon integration).

---

## 1. License posture — CLEAR (no blocker; verified 2026-06-25)

Verified against the committed repo + full git history. The posture is clean and fully
permissive:

| Layer | Source | License | Verified in |
|---|---|---|---|
| Code (API, engine, frontend, MCP) | NextSolutions | **Apache-2.0** | `LICENSE`, `api/src/lib/attribution.ts` (`LICENSE="Apache-2.0"`) |
| Anatomy SVG paths (front/back × male/female) | `HichamELBSI/react-native-body-highlighter` | **MIT** (© Hicham El Boussarghini) | `importBodyData/entry.ts` (the sole importer), `NOTICE`, `muscleCatalog.js` |
| Exercise metadata + demo GIFs (873) | `yuhonas/free-exercise-db` | **CC0-1.0** (public domain) | `importExerciseDb/entry.ts`, `NOTICE`, `api/data/README.md` |

MIT permits commercial use, derivative rendering/tinting, and redistribution (incl. via a paid
RapidAPI API). `NOTICE` already satisfies MIT's "retain the notice" requirement. The RapidAPI
listing already exists (`rapidapi.com/anatome/api/anatome`). The female anatomy data **is
present** (4 gender/side combos in `api/data/bodyPaths.json`; `importBodyData` fetches
`bodyFemaleFront.ts`/`bodyFemaleBack.ts`).

- [x] Confirm no non-permissively-licensed asset is bundled. **Done — clean.**
- [x] `NOTICE` credits Hicham (MIT) + yuhonas (CC0) + Apache-2.0 project license. **Accurate, no change.**
- [ ] *(optional, non-blocking)* Audit the live Base44 instance (outside this GitHub mirror) for any `BodyData`/media blob uploaded outside `importBodyData` — the one place a non-MIT asset could theoretically exist without being visible in the repo. Low risk given `importBodyData` is the documented sole importer.

> See `docs/context/attribution-audit.md` for the full attribution/license surface audit and
> the cleanup actions taken (incl. fixing a `license:"MIT"` mislabel in 4 Base44 functions →
> `license:"Apache-2.0"`).

## 2. Base44 security-scan remediation — BLOCKER (gates Launchpad re-submission)

The Base44 security scan flags two unauthenticated backend functions (`importBodyData`, `importExerciseDb`), `selfTest`, and missing `X-Frame-Options` / `Permissions-Policy` headers. **§1–§3 (the three function auth gates) are now DONE — implemented directly in code** (`base44/functions/importBodyData/entry.ts`, `importExerciseDb/entry.ts`, `selfTest/entry.ts`) with inline `tokenEquals` (SHA-256 constant-time-ish compare) + `enforceAdminAuth`/`enforceSelfTestAuth` gates; `deno check`/`deno lint` confirm the gates add zero new errors. §4 (frontend headers) + §5 (`ADMIN_TOKEN` generation/storage) remain manual. Source: copilot-log § Open workstreams item 2; conv `6a22990be33b01dbc767baee`. Verification spec: `document#6a22d0f7eddbac1603f2f1f8` / task `tasks/6a22d0ffeddbac1603f2f1fc`.

- [x] **Gate `importBodyData`** behind Bearer `ADMIN_TOKEN` (503 if unset, 401 on missing/wrong token; gate runs before any fetch/entity write). **Done in code.**
- [x] **Gate `importExerciseDb`** behind Bearer `ADMIN_TOKEN`; removed the bypassable `auth.me()` half-check; the `Exercise.list` + delete loop can no longer run without the token (single-curl destructive bug fixed). **Done in code.**
- [x] **Gate `selfTest`** (Bearer `ADMIN_TOKEN` OR loopback `localhost/127.0.0.1/::1` OR existing `PROXY_SECRET`/`MCP_TRUSTED_KEY` trusted bypass; 401 otherwise). **Done in code.**
- [ ] Apply the remaining parts of `docs/context/build-prompts/security-remediation.md` — §4 app-wide `X-Frame-Options: DENY` + `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` headers on the frontend (global middleware, not per-route), and §5 generate `ADMIN_TOKEN` (≥32 bytes, secure random) → set as Base44 env var `ADMIN_TOKEN` → store in IdeaForge Secrets as `other/ANATOME_ADMIN_TOKEN` (raw token not committed to the mirror).
- [ ] Re-run the Base44 security scan → confirm the three functions + two header findings go **green** ("Out of date" resolved).
- [ ] Confirm `other/ANATOME_ADMIN_TOKEN` exists in IdeaForge Secrets and the raw token is not committed to the mirror.
- [ ] Re-submit Anatome to the Base44 Launchpad.
- [ ] **Bonus (deferred, non-blocking):** bake the same security-header rules into the Cloudflare Workers `/api` port so the future split inherits hardening. Tracked here, not part of the Launchpad gate.

## 3. Domain plan

The copilot-log records the open subdomain decision: ship `anatome.nextsolutions.studio` first, or jump straight to `anatome.app` / `anatome.dev`. Source: copilot-log § Open workstreams item 1; conv `6a1e924a6eaf0e6361f97037`, `6a22990be33b01dbc767baee`. Note: `anatome.dev` and `api.anatome.dev` are already live per the copilot-log summary and the README, so this decision is really about the **canonical marketing/branded domain** vs. the existing `.dev` origin.

- [ ] Decide canonical domain: (a) `anatome.nextsolutions.studio` first (cheapest, fastest, keeps the NextSolutions brand tie), or (b) jump to `anatome.app` (preferred long-term brand, costs more, may already be taken — confirm availability).
- [ ] Confirm whether `anatome.app` is available; if taken, fall back to `anatome.dev` (already live) as the canonical brand and document that decision here.
- [ ] Provision / point the chosen domain; set up redirects from the non-canonical origins to the canonical one. Do not break `api.anatome.dev` (the API origin Airon depends on).

## 4. RapidAPI listing  — blocked on §1 (license) + §2 (security scan)

The commercial terms are already decided and recorded in the README + copilot-log: **basic plan = 300 requests/month free, then $0.001/request; unlimited localhost for dev.** Source: README "What is this?", copilot-log § Open workstreams item 1; conv `6a22990be33b01dbc767baee`.

- [ ] **Prerequisite:** §1 license question resolved and §2 security scan green. Do not list until both are done — listing implies a public commercial/redistribution posture that the license must permit.
- [ ] Create the RapidAPI listing for the Anatome API with the basic plan above.
- [ ] Wire RapidAPI's `x-rapidapi-proxy-secret` against Anatome's existing `PROXY_SECRET` env var (already in use per `docs/context/secret-migration-verification.md`).
- [ ] Confirm the listing's endpoints match the public surface in the README (`generateImage`, `workoutImage`, `searchExercises`, `getExercise`, `resolveExercise`, `exerciseGif`, `listMuscles`, `muscleInfo`, `listEquipment`, `mcp`, `openapi`).
- [ ] Smoke-test the RapidAPI front-door end-to-end (free-tier quota enforcement + a paid overage call).

## 5. Wave 2 feature tiers (highest product-ROI vs the RapidAPI competitor)

These are the planned-but-not-shipped tiers that most differentiate Anatome from the existing RapidAPI competitor. Source: copilot-log § Summary bullet 2, § Open workstreams item 3; conv `6a1e924a6eaf0e6361f97037`. Ship order = ROI order below; each is independently shippable.

- [ ] **Tri-color / accessory muscle tier.** Add a **third color** for **accessory** muscles. Concrete acceptance from the copilot-log: **bench press must NOT show abs as primary or secondary** — either no abs at all, or abs rendered as an **accessory** (third color). This is the single clearest differentiator vs the competitor.
- [ ] **Sub-region drilldown.** Expand the muscle catalog with sub-slugs so we can highlight **upper/mid/lower chest** separately (and analogous subdivisions for other muscle groups). Coordinate with the 18→23 muscle slug set already shipped.
- [ ] **Head selection — make optional and properly spec'd.** Currently scaffolded and falls back to the base image. Spec it as a real optional parameter with testable behavior, not a silent fallback.
- [ ] **Sync engine asset URLs everywhere.** The copilot-log notes `muscleEngine` (frontend) + `mcpServer` (backend) were missing the asset-URL sync — close that gap as part of the Wave 2 work so the tiers render consistently across surfaces.

## 6. Airon integration prerequisite — PREREQ (Wave 4 must land first)

Anatome is Airon's reference customer and marketing wedge, but integration must wait for the Cloudflare-hosted API. Source: copilot-log § Summary bullet 4, § Open workstreams item 6; conv `6a1f2904d07edd3ac2396e93`, `6a2bf98cd69350873059a7fe`.

- [ ] **PREREQ — do not integrate against the Base44-hosted URL.** Wait for Wave 4: `api.anatome.dev` on Cloudflare (est. 2 days Cursor work, ~3–5 days realistic per the copilot-log).
- [ ] Add `/v1/proxy/anatome/*` namespace to **ns-api-cache** (alongside the existing `/v1/proxy/exerciseapi/*`). Cache policy from the copilot-log: **24h on search, 7d on exercise detail** (CC0 static data).
- [ ] Register the Anatome MCP server (`/mcp`, 5 tools) as a **connection** on Airon's coach agent. Copilot-log calls this the highest-leverage step (~30 min, zero Airon UI code).
- [ ] Replace Airon's exercise-picker UI to call `AnatomeClient` → ns-api-cache → Anatome; use `anatome_imageSrc` directly as `<img src>` (Anatome renders the SVG, browser caches it).
- [ ] Once parity confirmed, **kill Airon's local exercise data** so Anatome is the single source of truth (do not double Airon's JS payload with ~3000 SVG paths — see copilot-log § Decisions).
- [ ] Circuit-breaker: 3 consecutive 5xx → fall back to a 50-exercise seed list shipped in Airon's bundle.

> Note: this checklist tracks the **anatome-side prerequisite** (Wave 4 must land). The actual ns-api-cache + Airon work happens in the aironcoach / ns-infra repos and is out of scope for anatome docs. Do not touch aironcoach from here.

## 7. Open Wave 1 visual bugs (PR #1 not yet merged)

PR #1 (`ns-coder/tsk_d6de551ba686fc98`) shipped 7 visual-only React fixes + 40 BEFORE screenshots but is **not yet merged/deployed**, and core rendering bugs are not fully resolved. Local AFTER-screenshot capability was a gap in the experiment series. Source: copilot-log § Open workstreams item 5, § Recent merges; conv `6a1e924a6eaf0e6361f97037`, `6a22eac59ea25371981e4220`.

- [ ] Front/back view switching breaks rendering; "drawn" items break in single-view mode.
- [ ] Front/back views show a **ghost arm** from the other view (misaligned asset).
- [ ] Female model not working (falls back to male — also tied to §1 female-asset decision).
- [ ] Layout is **jumpy** when switching options in the menu.
- [ ] Capture **AFTER** screenshots to verify the fixes (PR #1 only captured BEFORE — the local build/screenshot capability gap noted in the copilot-log).
- [ ] Review + merge PR #1 once AFTER screenshots confirm the visual fixes.

## 8. Out of scope for this checklist (tracked in copilot-log, not launch-blocking)

Listed so it's clear what was **deferred** and why — these are real workstreams but not launch-blocking:

- [ ] **Frontend library mode** (callbacks, hover/click, standalone renderer) — copilot-log § Open workstreams item 4; idea stage, not launch-blocking. *Deferred: separate from the HTTP API surface and the launch gate.*
- [ ] **GIF → video pipeline** (Airon PRO-tier wedge) — copilot-log § Open workstreams item 7; explored, not built. *Deferred: PRO differentiator, not needed for the RapidAPI/launch gate.*
- [ ] **"3D AI Workout-Demo Generator" v2 mega-prompt** — copilot-log § Decisions notes this drafted a *different concept* than the shipped API (conv `6a2c13c8`). *Deferred: future-direction, not the current shipped product.*

---

## Source conversation citations (trail)

| Topic | Conv id | From copilot-log |
|---|---|---|
| License / domain / RapidAPI / security scan (Launchpad) | `6a22990be33b01dbc767baee` | "Anatome Launchpad Submission" (2026-06-05) |
| Feature tiers, sub-region, head, visual bugs, female fallback | `6a1e924a6eaf0e6361f97037` | "Anatome Muscle API Development" (2026-06-05) |
| PR #1 visual fixes feedback / open bugs | `6a22eac59ea25371981e4220` | "PR Status and Feedback" (2026-06-06) |
| Airon integration / ns-api-cache proxy | `6a1f2904d07edd3ac2396e93` | "Transpile Anatome for Searches" (2026-06-02) |
| Airon workout mega-prompt (MCP "both" decision) | `6a2bf98cd69350873059a7fe` | "Airon Workout App Prompt" (2026-06-12) |
| Future-direction v2 mega-prompt (deferred) | `6a2c13c8` | "Build Anatome Mega-Prompt" (2026-06-12) |
| GIF→video (deferred) | `6a1f3a449761f157950e9514` | "Convert GIF to Video" (2026-06-02) |
