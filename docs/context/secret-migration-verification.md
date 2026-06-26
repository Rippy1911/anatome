# Anatome — Secret encryption migration verification

**Date:** 2026-06-25
**Scope:** Verify whether anatome reads the IdeaForge `Secret` entity and whether it needs
any adaptation for the cross-repo Secret encryption migration
(see `/.secret-migration-backup/MIGRATION-DESIGN.md`).

## Result: NO code changes required

Anatome does **not** read the IdeaForge `Secret` entity. It therefore requires **no**
adaptation for the Secret encryption migration and does not need `ENCRYPTION_KEY`
mirrored into its app settings.

## What was scanned

Every file under `anatome/base44/functions/**/*.{ts,js}` (12 functions):

- `aiDemo/entry.ts`
- `generateImage/entry.ts`
- `getBodyData/entry.ts`
- `getExercise/entry.ts`
- `importBodyData/entry.ts`
- `importExerciseDb/entry.ts`
- `listMuscles/entry.ts`
- `mcp/entry.ts`
- `openapi/entry.ts`
- `resolveExercise/entry.ts`
- `searchExercises/entry.ts`
- `selfTest/entry.ts`

Plus `anatome/base44/entities/*.jsonc` and the repo surface for cross-app bridge calls.

## Patterns checked (all returned NO matches for the Secret entity)

- `entities.Secret.` — **0 matches**
- `Secret.filter` / `Secret.find` / `Secret.findOne` / `Secret.update` / `Secret.create` / `Secret.remove` — **0 matches**
- `asServiceRole.entities.Secret` — **0 matches**
- Cross-app ideaforge calls: `callIdeaforge`, `/functions/secret`, `/api/secrets`, `devChatEndpoint`, `call*Dev` — **0 matches**
- `ENCRYPTION_KEY` — **0 matches**
- `getSecret` (native Base44 workspace-secret accessor) — **0 matches**
- Any `.env` / secret-entity handling — **0 matches**

The substring "secret" only appears as the **RapidAPI proxy-secret request header**
(`x-rapidapi-proxy-secret`) compared against `Deno.env.get("PROXY_SECRET")`, and the
`MCP_TRUSTED_KEY` env var — these are unrelated to the IdeaForge `Secret` entity.

## Secret mechanism anatome actually uses

**Native Base44 environment variables** (app settings), not the `Secret` entity, not
`ENCRYPTION_KEY`:

- `PUBLIC_BASE_URL` — public API origin (default `https://api.anatome.dev`)
- `PROXY_SECRET` — RapidAPI proxy bypass
- `MCP_TRUSTED_KEY` — trusted MCP client bypass

Entities anatome actually reads (for reference, none are secret-related):
`Exercise`, `BodyData`, `RateLimit`. Anatome defines **no `Secret` entity**
(`base44/entities/` contains only `BodyData.jsonc`, `Exercise.jsonc`,
`RateLimit.jsonc`, `User.jsonc`).

## Does anatome need `ENCRYPTION_KEY` mirrored?

**No.** Anatome has no `ENCRYPTION_KEY` usage (it does not follow the
superagents-style `SecretVault` + `ENCRYPTION_KEY` pattern), and it does not read the
IdeaForge `Secret` store. There is nothing for the migration's unified reader
conditional (`value_algo === 'aes-256-gcm' ? await decryptValue(s.value) : s.value`)
to wrap.

## Conclusion

Per `MIGRATION-DESIGN.md` § "Per-project scope" (anatome row) and § "Sub-agent
instructions": anatome is clear. No reader functions to adapt, no `ENCRYPTION_KEY` to
mirror, no schema change. The migration can proceed in ideaforge / nextsolutions-hub /
file-core-vault / superagents without any anatome-side coordination.
