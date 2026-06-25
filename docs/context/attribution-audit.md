# Anatome — Attribution & License Audit

*2026-06-25. Verified against the committed repo + full git history (`git log --all -S`).
Goal: remove unnecessary attribution, eliminate redundancy, fix accidental mislabeling, and
keep the surface clean so downstream users attribute **Anatome** (Apache-2.0) when they reuse
our source code.*

## What the repo actually contains (verified)

Three license layers, all permissive and correctly attributable:

| Layer | Content | Source | License | Where it lives |
|---|---|---|---|---|
| Own code | API, engine, frontend, MCP | NextSolutions | **Apache-2.0** | `LICENSE`, all `src/`, `api/src/`, `base44/functions/` |
| Anatomy data | SVG path coordinates (front/back × male/female) | `HichamELBSI/react-native-body-highlighter` | **MIT** (© Hicham El Boussarghini) | imported into `BodyData` entity by `importBodyData`; bundled in `api/data/bodyPaths.json` |
| Exercise data | 873-exercise metadata + demo GIFs | `yuhonas/free-exercise-db` | **CC0-1.0** (public domain) | `Exercise` entity, `api/data/exercises.json`, `api/public/gifs/` |

**No third-party assets beyond the above.** The repo contains only these three license
layers; there is no other bundled media, font, or dataset requiring attribution.

## Findings

### F2 — License field mislabeled `MIT` in Base44 functions (ACCIDENTAL MISLABELING — FIXED)
The canonical `api/src/lib/attribution.ts` correctly sets `LICENSE = "Apache-2.0"` (Anatome's
own code license). But the **Base44 mirror** functions returned the wrong license string in API
responses:
- `base44/functions/generateImage/entry.ts:219` → was `license:"MIT"`
- `base44/functions/listMuscles/entry.ts:13` → was `license:"MIT"`
- `base44/functions/resolveExercise/entry.ts:106` → was `license:"MIT"`
- `base44/functions/getExercise/entry.ts:52` → was `license:"MIT + CC0-1.0"`
- `base44/functions/searchExercises/entry.ts:113` → was `license:"MIT + CC0-1.0"`

This conflated the *third-party path data* license (MIT) with the *project* license
(Apache-2.0), and publicly misrepresented the API as MIT-licensed. The `attribution` string
itself was correct ("Anatomy paths © Hicham … (MIT). Anatome by NextSolutions.") — it was the
separate `license` *field* that was wrong. **Done:** all five now set `license:"Apache-2.0"`,
matching the canonical Worker. (`openapi` and `aiDemo` were already correct.)

### F3 — Attribution constants duplicated across ~9 Base44 functions (REDUNDANCY)
`ATTRIBUTION`, `ATTRIBUTION_SOURCE`, `BUILT_BY`, `TRY_ALSO` are redefined inline in each of:
generateImage, searchExercises, resolveExercise, getExercise, listMuscles, mcp, openapi,
importBodyData, importExerciseDb. The `api/` Worker solved this with a single
`api/src/lib/attribution.ts` (the correct pattern). The Base44 functions can't import from
`api/` (separate runtimes), and Base44 sync makes refactoring `base44/functions/` risky.
**Action:** leave as-is for now (documented here); the duplication is a Base44-side concern
and the strings are consistent. A future Base44 build prompt could centralize them into a
shared `base44/lib/attribution.ts` if Base44 supports cross-function imports. Low priority.

### F4 — Redundant prose attribution across frontend components (ACCEPTABLE, not actionable)
The Hicham/MIT + yuhonas/CC0 attribution appears in: `Tos.jsx`, `Docs.jsx`, `AiGuide.jsx`,
`HealthBar.jsx`, `ExerciseSearch.jsx`, `ExerciseGifPreview.jsx`, `SearchDemoCard.jsx`,
`ExerciseDbSection.jsx`, `LiveDemo.jsx`. This is **legally required** (MIT requires retaining
the notice; CC0 requests attribution) and **good practice** for an open-source project. Not
redundancy to remove — it's compliance + marketing ("Powered by Anatome"). **Action:** none.
This is the surface that makes others attribute us when they copy the UI.

### F5 — `try_also: "AI fitness coach at airon.coach"` (INTENTIONAL cross-promo, keep)
Appears in every API response + is protected by `CONTRIBUTING.md §60-62` (do not remove
attribution fields). This is deliberate marketing for airon.coach. **Action:** keep.

### F6 — `NOTICE` file is accurate and sufficient (CLEAN)
`NOTICE` correctly credits Hicham (MIT paths) + yuhonas (CC0 exercises) + the Apache-2.0
project license. No changes needed. It already satisfies MIT's "retain the notice" requirement
and CC0's "attribution appreciated" request.

## Cleanup actions (executed this session)

1. **F2:** Fixed the `license` field in all 5 Base44 functions (`generateImage`, `listMuscles`,
   `resolveExercise`, `getExercise`, `searchExercises`) from `"MIT"` / `"MIT + CC0-1.0"` to
   `"Apache-2.0"`, so the public API no longer misrepresents the project license. The
   `attribution` string (which correctly names the third-party MIT paths) is unchanged. The
   genuine launch blocker is the Base44 security scan (unauthenticated
   `importBodyData`/`importExerciseDb`/`selfTest`) — covered by the `security-remediation.md`
   build prompt.
2. **F3, F4, F5, F6:** No code changes — documented as intentional/required above.

## Why we're clean for downstream attribution

- **Apache-2.0** on our code requires downstream users who redistribute our source to retain
  the license + NOTICE + copyright notice (LICENSE §4c). That's the mechanism by which others
  must attribute us.
- **MIT** on the path data requires retaining "© Hicham El Boussarghini" — we do, everywhere.
- **CC0** on exercise data is public domain (no attribution legally required), but we credit
  yuhonas anyway as a courtesy and to model the behavior we want for our own work.
- The protected API attribution fields (`attribution`, `attribution_source`, `license`,
  `built_by`, `try_also`) ensure every API consumer sees "Anatome by NextSolutions" — so even
  users who embed via `<img>` or MCP carry the attribution forward.

No commit-history cleanup is needed: no non-permissively-licensed content was ever committed.
