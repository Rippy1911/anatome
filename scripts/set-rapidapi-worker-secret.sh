#!/usr/bin/env bash
# Upload RAPIDAPI_KEY to the production Worker (for /benchmark/rapidapiSearch).
# Requires KEY= in rapidapi.txt (RapidAPI Application Key — NOT PROXY=).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="${ROOT}/rapidapi.txt"
cd "${ROOT}/api"

if [[ ! -f "$FILE" ]]; then
  echo "Missing ${FILE}" >&2
  exit 1
fi

KEY="$(grep -E '^(KEY|ANATOME_RAPIDAPI_KEY)=' "$FILE" | head -1 | cut -d= -f2- | tr -d '[:space:]')"
if [[ -z "$KEY" ]]; then
  echo "Add your RapidAPI Application Key to rapidapi.txt:" >&2
  echo "  KEY=your-application-key" >&2
  echo "  # or ANATOME_RAPIDAPI_KEY=..." >&2
  echo "Get it after subscribing: https://rapidapi.com/slaczka.sebastian/api/anatome" >&2
  echo "(PROXY= is the inbound proxy secret — not the consumer key.)" >&2
  exit 1
fi

printf '%s' "$KEY" | pnpm exec wrangler secret put RAPIDAPI_KEY --env production
echo "RAPIDAPI_KEY updated on production."
