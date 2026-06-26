# Changelog

All notable changes to this project are documented here. The format is based on
[Conventional Changelog](https://www.conventionalcommits.org/) and this project
adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.0.0] - 2026-06-26

### Added
- Cloudflare Workers API (`api/`) with bundled `bodyPaths.json`, `exercises.json`, and
  873 exercise demo GIFs under `api/public/gifs/`.
- P1 endpoints: `workoutImage`, `muscleInfo`, `listEquipment`, `exerciseGif`.
- `/exerciseImage` proxy — serves free-exercise-db CC0 reference photos through the
  Anatome host; adds `source_images[]` field to every exercise record.
- MCP tools expanded from 5 → 7: `get_exercise_gif` and `workout_image` added.
- MCP `annotations.readOnlyHint: true` on all read-only tools (MCP 2025 spec).
- MCP protocol version updated to `2025-03-26`.
- Security headers on every response: `X-Frame-Options`, `Permissions-Policy`,
  `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`.
- Durable Object rate limiter (`RateLimiterDO`) as primary counter (KV fallback).
- Structured request logging via Workers Observability.
- `source_images[]` field on exercise responses — Anatome-hosted absolute URLs for
  CC0 reference photos from free-exercise-db.
- Playground exercise GIF preview when loading from free-exercise-db.
- Project legal scaffolding: LICENSE (Apache-2.0), NOTICE, CONTRIBUTING,
  CODE_OF_CONDUCT, SECURITY.md, GitHub issue/PR templates, and CI workflow.
- `dependabot.yml` for automated dependency updates.
- `llms.txt` for LLM-accessible project summary.

### Fixed
- **An-M1** SVG attribute injection: `width`, `height`, `strokeWidth`, `opacity`
  coerced through `clampInt`/`clampNum` — strings like `100" onload="alert(1)"`
  are rejected.
- **An-M2** Rate-limit bypass via `Origin: http://localhost`: `bypassCheck` now
  grants bypass ONLY on private-range `cf-connecting-ip`, not client-controlled
  `Origin`/`Referer` headers.
- **An-M3** `selfTest` XFF trust removed: loopback detection is hostname-only.
- `abductors` muscle alias: exercises listing "abductors" now map to `gluteal`
  (the closest SVG proxy) instead of silently dropping. Mapping to `adductors`
  would be anatomically wrong — they are antagonists.

### Changed
- Production domains: marketing **anatome.dev** (Base44), API **api.anatome.dev** (Worker).
- Frontend/API examples and docs use Worker paths (`/generateImage`, not `/functions/...`).
- Frontend remains at the repository root (required by Base44's GitHub sync).
- Default body_color: #3f3f3f → #282828
- Default border_width: 1 → 1.5
- Cache: max-age=3600 → 86400 (browser) + 604800 (CDN) + ETag
- License: MIT → Apache-2.0

### Removed
- Baked attribution from SVG output
- AI assist from main playground (moved to AI Guide page only)

## [1.2.0] - 2026-06-02

### Added
- free-exercise-db integration (873 exercises pre-mapped)
- MCP server with 5 tools
- Rate limiting (per-IP day, per-host day)
- OpenAPI 3.1 spec
- Landing page with live demos

### Changed
- Default body_color: #3f3f3f → #282828
- Default border_width: 1 → 1.5
- Cache: max-age=3600 → 86400 (browser) + 604800 (CDN) + ETag
- License: MIT → Apache-2.0

### Removed
- Baked attribution from SVG output
- AI assist from main playground (moved to AI Guide page only)
