# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 2.x (current) | ✅ |
| 1.x | ❌ — please upgrade |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email **contact@nextsolutions.studio** with:

- A concise description of the vulnerability
- Steps to reproduce (curl commands, PoC code, etc.)
- Impact assessment (what an attacker could achieve)
- Any suggested fix if you have one

You should receive an acknowledgement within **48 hours** and a status update
within **7 days**. We ask that you give us reasonable time to ship a fix before
public disclosure — we'll credit you in the release notes unless you prefer
otherwise.

## Scope

The following are **in scope**:

- The Cloudflare Workers API at `api.anatome.dev` (`api/`)
- The Base44 functions under `base44/functions/`
- Rate-limit bypass or quota exhaustion attacks
- SVG attribute injection in rendered diagrams
- Information disclosure from the exercise/muscle dataset endpoints

The following are **out of scope**:

- Cloudflare platform vulnerabilities (report to Cloudflare)
- Base44 platform vulnerabilities (report to Base44)
- Denial-of-service attacks limited to a single IP (covered by rate-limiting)
- Issues in third-party data (free-exercise-db CC0, react-native-body-highlighter MIT)

## Known mitigations

- SVG numeric attributes are coerced via `clampInt`/`clampNum` (no attribute injection)
- Rate-limit bypass is IP-only — `Origin`/`Referer` headers grant no extra quota
- All secrets (`PROXY_SECRET`, `MCP_TRUSTED_KEY`, `ADMIN_TOKEN`) are set via
  `wrangler secret put`, never committed
