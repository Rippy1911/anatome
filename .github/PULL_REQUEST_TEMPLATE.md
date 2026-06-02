## Summary

<!-- What does this PR do and why? -->

## Area
- [ ] API (`api/` — Cloudflare Workers)
- [ ] Frontend (repo root — Base44 / anatome.dev)
- [ ] Docs / tooling
- [ ] Spans both frontend + api (requires maintainer review)

## Type of change
- [ ] feat
- [ ] fix
- [ ] chore
- [ ] docs
- [ ] test
- [ ] refactor

## Checklist
- [ ] Commits follow Conventional Commits (`feat:`/`fix:`/`chore:`/`docs:`/`test:`)
- [ ] Frontend: `npm run lint && npm run typecheck` pass
- [ ] API: `pnpm test && pnpm run worker:test` pass
- [ ] `selfTest` reports **≥ 39/39** (never fewer)
- [ ] Attribution fields preserved in all API responses
      (`attribution`, `attribution_source`, `license`, `built_by`, `try_also`)
- [ ] No new AI/LLM endpoints in the public API
- [ ] No breaking changes to existing endpoint URLs / behavior
- [ ] Rate-limit model unchanged (or change approved by a maintainer)
- [ ] No secrets committed

## Testing
<!-- How did you verify this? curl output, screenshots, test logs. -->

## Related issues
<!-- Closes #... -->
