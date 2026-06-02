# Changelog

All notable changes to this project are documented here. The format is based on
[Conventional Changelog](https://www.conventionalcommits.org/) and this project
adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `api/` package reserved for the Cloudflare Workers port (Phase 3).
- Project legal scaffolding: LICENSE (Apache-2.0), NOTICE, CONTRIBUTING,
  CODE_OF_CONDUCT, GitHub issue/PR templates, and CI workflow.
- `AGENTS.md` + `.cursor/rules` with the port-out architecture and constraints.

### Changed
- Frontend remains at the repository root (required by Base44's GitHub sync); the
  Cloudflare API is an independent package under `api/`.

## [1.2.0] - 2026-06-02

### Added
- ExerciseDB integration (873 exercises pre-mapped)
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
