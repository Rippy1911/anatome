# Base44 Build Prompt — Launchpad security-scan remediation

> **STATUS (2026-06-25): §1–§3 IMPLEMENTED DIRECTLY IN CODE.** The three function auth gates
> (`importBodyData`, `importExerciseDb`, `selfTest`) have been applied directly to
> `anatome/base44/functions/*/entry.ts` as reviewable code (inline `tokenEquals` SHA-256
> constant-time-ish compare + `enforceAdminAuth`/`enforceSelfTestAuth` gates). `deno check` + `deno lint`
> confirm the gates add **zero** new type/lint errors (all remaining errors are pre-existing
> untyped-JS-`any` in the original function bodies). §4 (frontend security headers) and §5 (generate
> `ADMIN_TOKEN` + store in Base44 env + IdeaForge Secret `other/ANATOME_ADMIN_TOKEN`) are **still
> manual** — see below. §6 smoke-test contract still applies once §5 is done. This file is now a
> **record/spec**, not a to-paste prompt; keep it for traceability.

**Target app:** Anatome (Base44 appId `6a1ea0b8b40fc9c2e83c0952`, production origin `https://anatome.dev`, API origin `https://api.anatome.dev`)
**Paste location:** Base44 AI Chat for the Anatome app (Base44 → Git one-way mirror; backend functions are edited via Base44, NOT via GitHub PRs).
**Source conversation ids:** `6a22990be33b01dbc767baee` (Anatome Launchpad Submission), `6a1e924a6eaf0e6361f97037` (Anatome Muscle API Development).
**Verification spec document id:** `document#6a22d0f7eddbac1603f2f1f8` / tracking task `tasks/6a22d0ffeddbac1603f2f1fc`.
**Severity:** Launchpad-blocking. The Base44 security scan currently flags 3 functions + missing frontend headers as "Out of date"; this must go green before re-submitting to Launchpad.
**Authored:** 2026-06-25. Traceable to `anatome/docs/context/copilot-log.md` § "Open workstreams" → item 2.

> **Paste everything below the rule line into Base44 AI Chat.** Replace `<ADMIN_TOKEN>` only if Base44 forces a literal value at generation time; otherwise let Base44 generate the token and you store it afterwards (see step 4). Never commit a real secret to the GitHub mirror.

---

## Prompt

You are hardening the Anatome app for its Base44 Launchpad re-submission. The Base44 security scan is flagging three unauthenticated backend functions and two missing frontend security headers. Fix all of them in one pass, generate an admin token, and verify before declaring done. **Do not change any public API behavior, response shapes, or route paths** — this is purely access-control + header hardening. Existing callers (`generateImage`, `searchExercises`, `getExercise`, `resolveExercise`, `mcp`, `openapi`, `listMuscles`, `exerciseGif`, `workoutImage`) must keep working unauthenticated exactly as they do today.

### Background you need to know

- Anatome is an open-source muscle-group image API + ExerciseDB. Public read endpoints are intentionally open (Apache-2.0, RapidAPI public listing). The three functions below are **admin/import** endpoints that must NOT be public.
- Anatome already uses native Base44 environment variables for secrets (not the IdeaForge `Secret` entity). Existing env vars in use: `PUBLIC_BASE_URL`, `PROXY_SECRET` (RapidAPI proxy bypass), `MCP_TRUSTED_KEY` (trusted MCP client bypass). Add `ADMIN_TOKEN` alongside them following the same pattern.
- The frontend lives at the repo root (`base44/config.jsonc` is there) and deploys via Base44. The Cloudflare Workers API at `api.anatome.dev` is a separate package under `api/` and is NOT in scope for this prompt (a later port will inherit these hardening rules).

### 1. Gate `importBodyData` behind Bearer-token auth (env `ADMIN_TOKEN`)

`importBodyData` is a backend import/admin function and must require a valid admin token. It must reject unauthenticated calls with `401 Unauthorized`.

**Current state (ground truth):** the existing `importBodyData/entry.ts` has **zero** auth — `Deno.serve` opens a `try` block, immediately creates the Base44 client, and jumps straight into `fetch(s.url)` + `BodyData` upserts (`base44.asServiceRole.entities.BodyData.filter/update/create`). There is no `base44.auth.me()` check, no token check, nothing. The gate must be inserted at the very top of the handler, before any `fetch` or entity call.

- Read the token from the Base44 environment variable named `ADMIN_TOKEN`.
- Accept it as a Bearer token in the `Authorization` header: `Authorization: Bearer <ADMIN_TOKEN>`.
- Use a **constant-time** string comparison (not `===`) when validating the supplied token against `ADMIN_TOKEN` to avoid timing attacks. Base44 functions run on **Deno**, which does **not** expose Node's `crypto.timingSafeEqual`, so use `crypto.subtle` to hash both tokens to SHA-256 digests and compare the hex digests with `===` (the hash comparison leaks no timing information about the secret). Paste this helper verbatim near the top of the function file and call it from the gate:

```js
// Constant-time-ish token compare for Deno (no crypto.timingSafeEqual available).
// Hash both sides to SHA-256 and compare the hex digests; the digest comparison
// itself reveals no timing information about the secret token.
async function tokenEquals(supplied, stored) {
  if (!stored) return false;                       // unset config → never accept
  if (typeof supplied !== "string" || supplied.length === 0) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(supplied)),
    crypto.subtle.digest("SHA-256", enc.encode(stored)),
  ]);
  const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
  return hex(a) === hex(b);
}
```

- **Evaluate the `ADMIN_TOKEN` gate BEFORE any entity read or write** (and before the upstream `fetch` of the GitHub SVG sources). The gate is the first thing the handler does after parsing the request.
- If `ADMIN_TOKEN` is unset/empty, the function must refuse to serve ANY import (return `503 Service Unavailable` with a clear message that the admin token is not configured) — **return `503` before touching any data** (no `fetch`, no `BodyData` read/write), and never fall through to "no auth required".
- On a missing/invalid/malformed `Authorization` header, return `401 Unauthorized` with a generic body (do not leak whether the token exists).
- Do not change the function's import behavior, request/response schema, or entity writes once auth passes.

### 2. Gate `importExerciseDb` behind Bearer-token auth (env `ADMIN_TOKEN`)

Apply the **exact same** auth gate as `importBodyData` (same `ADMIN_TOKEN` env var, same Bearer scheme, same constant-time compare, same `401`/`503` semantics). Keep the import logic and Exercise entity writes unchanged once auth passes.

**Current state (ground truth — `importExerciseDb/entry.ts`):** the function has a **broken half-check** at **lines 53–54**:

```js
const user = await base44.auth.me().catch(() => null);
if (user && user.role !== "admin") { return Response.json({ ok: false, error: "Forbidden: admin only" }, { status: 403 }); }
```

This is bypassable: an **anonymous** caller (no session) makes `user` `null`, the `if` is skipped, and the function proceeds — at **lines 61–64** — to **wipe and rewrite the entire Exercise table**:

```js
const existing = await base44.asServiceRole.entities.Exercise.list("-created_date", 2000);
for (let i = 0; i < existing.length; i += 25) {
  await Promise.all(existing.slice(i, i + 25).map((e) => base44.asServiceRole.entities.Exercise.delete(e.id)));
}
```

That delete-then-bulk-insert is **single-curl destructive** today: any anonymous request wipes all Exercise rows and replaces them. So the fix here is non-negotiable:

- Remove the `base44.auth.me()` guard at lines 53–54 **entirely** and replace it with the `ADMIN_TOKEN` Bearer gate from §1. The token gate must be the **sole** auth check, evaluated **before** `fetch(SOURCE_URL)` (line 56) and **before** the `Exercise.list` + delete loop (lines 61–64) — i.e. before **any** entity read or write.
- If `ADMIN_TOKEN` is unset/empty, return `503` **before touching any data** — specifically, `Exercise.list` and the delete loop must **never run** when the token is unset. A single anonymous `curl` against an unset-token function must leave the Exercise table byte-for-byte unchanged.
- Do not keep the `base44.auth.me()` check as a secondary gate unless it is rewritten to **deny by default when `user` is null** rather than allow. The safest fix is to delete it and rely solely on the Bearer gate.
- Once the gate passes, the existing import logic (muscle mapping, delete-then-bulk-insert, unmapped reporting) runs unchanged.

### 3. Gate `selfTest` (Bearer token OR localhost / internal-only)

`selfTest` is a diagnostics endpoint. It must NOT be openly callable from the public internet, but it should still run for legitimate admin and local-dev use. Gate it with an OR condition — allow the request through if **any** of the following is true:

- A valid `Authorization: Bearer <ADMIN_TOKEN>` header is supplied (same token + constant-time compare as above), **OR**
- The request is determined to be local/internal: caller host is `localhost` / `127.0.0.1` / `::1`, **OR** the request carries a trusted internal indicator (e.g. an internal Base44 runtime header that Base44 itself sets for self-test runs, or a loopback/`x-forwarded-for: 127.0.0.1`-style signal that Base44's own infra provides). Use whichever internal signal Base44 reliably exposes for self-test invocations; if none is available, fall back to **localhost/loopback host only**.
- If none of the conditions match, return `401 Unauthorized` with a generic body.
- Do not change what `selfTest` returns or its 10/10 passing behavior once the gate passes.
- Important: keep `selfTest` callable by Base44's own runtime so the Launchpad/health checks still see it green. If you are unsure whether Base44's internal self-test call carries an identifying header, prefer the **Bearer token path** as the documented way to run it externally and the **loopback path** for internal calls, and add a code comment noting which signal is being trusted.

### 4. Add app-wide security headers on the frontend

Add the following response headers to **all** frontend responses served by the Anatome Base44 app (every page, every static asset, every client route — applied globally, not per-route):

- `X-Frame-Options: DENY`  *(equivalently, if you implement via Content-Security-Policy, use `frame-ancestors 'none'` — pick one approach and apply it consistently; do not emit both `X-Frame-Options` and a conflicting CSP `frame-ancestors`.)*
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

Requirements:

- The headers must apply globally (a single middleware/response-wrapper, not copied into each route handler).
- They must not break the playground UI, the OpenAPI/Swagger UI, or the `<img src>` embedding pattern documented in the README (the API endpoints at `api.anatome.dev` are a separate origin and are NOT affected by these frontend headers — confirm the frontend embed of API images still renders).
- Do not strip or weaken any existing headers Base44 already sets; only **add** these.

### 5. Generate the admin token and store it in IdeaForge Secrets

- Generate a cryptographically random `ADMIN_TOKEN` (≥ 32 bytes, base64url or hex). Use the platform's secure random source, not `Math.random()`.
- Set it as the Base44 environment variable `ADMIN_TOKEN` for the Anatome app (same place `PROXY_SECRET` and `MCP_TRUSTED_KEY` live).
- Save the generated token to **IdeaForge Secrets** under the key `other/ANATOME_ADMIN_TOKEN` so it is recoverable by the NextSolutions team. Use the placeholder value pattern the IdeaForge Secret store expects; do not print the raw token into the chat log, the function source, or any committed file — only into the env var and the IdeaForge Secret entry.

### 6. Smoke-test contract (self-verify BEFORE declaring done)

Run/confirm each of the following before you report this prompt as complete. If any fails, fix it before declaring done.

- [ ] `importBodyData` with **no** `Authorization` header → `401`. With a **wrong** bearer → `401`. With the **correct** bearer → succeeds and performs the import exactly as before.
- [ ] `importExerciseDb` with **no** `Authorization` header → `401`. With a **wrong** bearer → `401`. With the **correct** bearer → succeeds and performs the import exactly as before.
- [ ] `importExerciseDb` with **no** auth **and `ADMIN_TOKEN` unset** → `503` **and zero Exercise rows deleted** — capture the Exercise row count before the call and after the call and confirm they are identical (the gate must short-circuit before the `Exercise.list` + delete loop runs). This is the regression test for the single-curl destructive bug.
- [ ] `selfTest` from a public/external caller with **no** auth → `401`. From **localhost** → runs and returns the expected passing result. With the **correct** bearer → runs and returns the expected passing result.
- [ ] With `ADMIN_TOKEN` **unset** in the environment, `importBodyData`, `importExerciseDb`, and the bearer path of `selfTest` all return `503` (or otherwise refuse) rather than serving unauthenticated.
- [ ] A public read endpoint (e.g. `generateImage`, `searchExercises`) called with **no** auth still works exactly as before — no regression to the public API.
- [ ] Frontend responses include `X-Frame-Options: DENY` (or `Content-Security-Policy: frame-ancestors 'none'`) **and** `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` on every route, including static assets.
- [ ] The README's `<img src="https://api.anatome.dev/...&output=raw">` embed pattern still renders from the frontend page (the new headers are on the frontend origin, not the API origin, so this must still work — confirm it).
- [ ] The IdeaForge Secret `other/ANATOME_ADMIN_TOKEN` exists and contains the generated token. The raw token does **not** appear in any function source, the chat log, or the GitHub mirror.
- [ ] Re-run the Base44 security scan and confirm the three previously-flagged functions (`importBodyData`, `importExerciseDb`, `selfTest`) and the two header findings are now **green / "Out of date" resolved**. Paste the scan result summary into your completion report.

### Out of scope for this prompt (do NOT do)

- Do not touch the Cloudflare Workers API under `api/` — a later port will inherit these rules.
- Do not change the public read endpoints, the OpenAPI 3.1 spec, the MCP server surface, or the 873-exercise muscle mappings.
- Do not rotate `PROXY_SECRET` or `MCP_TRUSTED_KEY` — only add `ADMIN_TOKEN`.
- Do not refactor the SVG engine, the playground UI, or anything unrelated to the security findings.

When done, report: which functions were gated and how, which internal signal `selfTest` trusts, the exact header names/values applied and how they were applied globally, confirmation that `other/ANATOME_ADMIN_TOKEN` was stored, and the green security-scan summary.
