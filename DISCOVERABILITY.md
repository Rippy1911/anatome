# Being the connector assistants reach for

The goal is narrow and worth stating: when someone tells ChatGPT or Claude *"log my breakfast"*
or *"track my workouts"*, Anatome should be what the assistant already has, or the first thing it
finds. Everything below is aimed at that, in the order it pays off.

This file separates **what is code** (done, in the repo) from **what is an operator action**
(needs an account, a login, or a human).

---

## Why an assistant picks a connector

Three mechanisms, in descending order of how much they actually decide the outcome:

1. **It is already installed.** A connector the user added wins every time. So the goal is
   *installs*, and the lever on installs is the 30-second onboarding — paste one URL, no key.
2. **The tool list reads like the user's sentence.** Model tool-selection is mostly a semantic
   match between the request and the tool's `name` + `description`. This is the highest-leverage
   text in the whole project and it is code, not marketing.
3. **The assistant searched and found it.** Registries, `llms.txt`, and pages that answer the
   query people actually type.

Most projects spend their effort on (3) and neglect (2), which is backwards.

---

## Done in code

### Tool descriptions written for retrieval, not for docs

Every tool description names the *user phrasing* it serves, because that is what the model
matches against. `get_exercise_history` says "this is the tool for 'is my bench going anywhere'";
`get_day` says "use this instead of calling list_meals and list_workouts separately". A
description that only restates the function name loses to one that quotes the request.

### `llms.txt` opens with the trigger list

The first section after the summary is a list of literal user sentences Anatome answers. An LLM
crawler reading one page gets the mapping immediately, rather than inferring it from an endpoint
table.

It also states plainly what Anatome is **not** (no food database, no barcode, no AI on the
server). Being wrongly retrieved for "look up the calories in a Big Mac" and then failing is
worse for reputation than not being retrieved.

### Machine discovery

| Surface | What it carries |
|---|---|
| `/.well-known/mcp.json` | name, description, capabilities, transport, both auth modes, fair use, links to llms.txt + OpenAPI + repo |
| `/.well-known/oauth-protected-resource` | RFC 9728 — what a 401 points at |
| `/.well-known/oauth-authorization-server` | RFC 8414 — enables one-click sign-in |
| `/openapi` | OpenAPI 3.1 with the fair-use contract in the description |
| `/` | human-and-machine readable summary, `what_it_does`, auth shape |
| `/llms.txt` | one file at the repo root, copied at build time to **both** `anatome.dev/llms.txt` and `api.anatome.dev/llms.txt` |
| `robots.txt` | GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Google-Extended and the rest named `Allow` explicitly, on both hostnames |

Both files are served from the **API** hostname as well as the site, and that is the half that
was missing. `https://api.anatome.dev/mcp` is the string in every listing, every config snippet
and every "paste this URL" instruction, so the API origin — not the marketing site — is where an
agent or a crawler actually arrives. It was answering 404 for `llms.txt`.

> ⚠️ **A robots.txt in the repo does not mean a robots.txt on the wire.** `api.anatome.dev` was
> serving Cloudflare's **managed** robots.txt, which `Disallow`s GPTBot, ClaudeBot,
> Google-Extended, CCBot, Applebot-Extended and meta-externalagent and sets `ai-train=no`. Nothing
> in this repo asked for that and nothing in this repo revealed it — it took fetching the live URL.
> A Worker route now serves the permissive file, but the managed one is injected at the **zone**,
> so if it still wins, the fix is in the dashboard under **AI Crawl Control** and it is an operator
> action. Check the live URL, not the repo:
>
> ```bash
> curl -s https://api.anatome.dev/robots.txt | head -20
> ```

`.well-known/mcp.json` declares `authentication.type: "none"` with OAuth listed as *optional*,
because most of the surface genuinely needs no account. A registry that reads it as
"requires auth" would filter Anatome out of exactly the searches it should win.

### The connector cannot look broken

Two failure modes were fixed because they poison installs more than any listing helps:
a rate-limited user could not complete the MCP handshake (rendered as "connector failed"), and an
exhausted `tools/call` returned a protocol error the model never saw. Both now explain
themselves. A connector that appears broken once gets removed and never re-added.

---

## Operator actions

Roughly in order of value per minute spent.

### 1. List it in the MCP registries

- **Official MCP registry** (`modelcontextprotocol/registry`) — the one clients read.
- **`punkpeye/awesome-mcp-servers`** and **`wong2/awesome-mcp-servers`** — PRs, high traffic.
- **Smithery**, **Glama**, **mcp.so**, **PulseMCP** — directories assistants and users browse.
- **ChatGPT app directory**, once submissions are open for your account.

Use the same one-line description everywhere, and make it the sentence a user would say:
*"Log meals, workouts and supplements by talking to your assistant. Free, no API key."*

### 2. Publish the pages that answer the query

The site is a static SPA, so anything a crawler must read has to be in the HTML it serves.
Highest-value pages, each answering a real search:

- "how to track calories with ChatGPT"
- "ChatGPT workout tracker"
- "MCP nutrition tracker" / "MCP fitness server"
- "free MyFitnessPal alternative API"
- "log workouts with Claude"

Each should show the literal prompt to type and the one URL to paste. That is the whole funnel.

### 3. Search Console + Bing Webmaster

Submit `https://anatome.dev/sitemap.xml`, request indexing on the pages above. The sitemap is in
the repo and served; it just needs submitting once.

### 4. Coaches — the actual distribution channel

The share link is the pitch, not the API. A coach does not want an MCP server; they want their
client's last month on one screen without buying either of them a subscription.

- The demo is 30 seconds: a client says *"share my last month with my coach"*, and a URL arrives.
- Free for both sides, no seat cost, nothing to install for the coach.
- What to say: *"Your clients log by talking to ChatGPT. You get a link. No app, no per-client
  fee."*
- Where: PT/coaching subreddits, the strength-coach corners of Instagram and YouTube, and
  small-gym owners who currently run on spreadsheets.

Anatome deliberately has no coach accounts or client management — that is
[platform.anatome.dev](https://platform.anatome.dev), and the free tier is the on-ramp to it.

### 5. Make the repo public and keep it that way

The docs claim "fully self-hostable open source". `Rippy1911/anatome` is the public repo and
carries this code. Keeping the two in sync is what makes the claim true, and open-source
credibility is a real acquisition channel for developer-facing tools.

---

## What to measure

Vanity numbers are a trap here. The ones that mean something:

| Metric | Where | Why it matters |
|---|---|---|
| `initialize` calls / day | Worker logs | installs, the only top-of-funnel number that counts |
| distinct accounts with ≥1 write | D1 | connectors that became users |
| accounts with ≥7 active days | D1 | retention, the number that predicts everything else |
| `create_view_link` calls | D1 | the coach channel actually being used |
| 429s by scope | Analytics Engine | whether 50/day is the right number |

If installs rise and week-one retention does not, the problem is the product, not the listing —
and no amount of directory submissions will fix it.
