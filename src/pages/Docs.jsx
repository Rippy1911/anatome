import React from "react";
import AironPromo from "@/components/AironPromo";
import ImgUrlSpec from "@/components/docs/ImgUrlSpec";
import ExerciseDbSection from "@/components/docs/ExerciseDbSection";
import DocsBenchmarksSection from "@/components/docs/DocsBenchmarksSection";
import DocsMcpCursorSection from "@/components/docs/DocsMcpCursorSection";

function Code({ children }) {
  return <pre className="bg-[#0a0e17] border border-[#1e293b] rounded-lg p-4 overflow-x-auto text-[12px] leading-relaxed font-mono text-slate-100 my-3"><code>{children}</code></pre>;
}
function H2({ id, children }) {
  return <h2 id={id} className="font-display text-xl font-bold tracking-tight mt-12 mb-3 scroll-mt-24">{children}</h2>;
}
function P({ children }) { return <p className="text-sm text-muted-foreground leading-relaxed my-2">{children}</p>; }

export default function Docs() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">Anatome Documentation</h1>
      <p className="text-muted-foreground mt-2">A self-hosted muscle group image generator API. Returns SVG diagrams of the human body with arbitrary muscles highlighted in arbitrary colors.</p>

      <nav className="flex flex-wrap gap-2 mt-6 text-xs">
        {[["overview","Overview"],["schema","Schema"],["authentication","Authentication"],["endpoints","Endpoints"],["benchmarks","Benchmarks"],["img-urls","Building <img> URLs"],["exercise-db","Exercises"],["mcp","MCP Server"],["examples","Examples"],["attribution","Attribution & License"]].map(([id,l])=>(
          <a key={id} href={`#${id}`} className="px-2.5 py-1 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors">{l}</a>
        ))}
      </nav>

      <H2 id="overview">Overview</H2>
      <P>Anatome renders human-body muscle diagrams as SVG. You describe what to highlight using <span className="font-mono text-foreground">layers</span> — each layer is a color plus a list of muscle slugs. Stack as many layers as you need (primary, secondary, accessory stabilizers, custom palettes). Apache-2.0 licensed and self-hostable.</P>
      <P>There are 23 canonical muscle slugs. Render priority (highest wins): <span className="font-mono text-foreground">per_muscle[slug].fill</span> → <span className="font-mono text-foreground">layers[].color</span> (last layer wins if a muscle appears in multiple) → <span className="font-mono text-foreground">body_color</span>.</P>

      <H2 id="schema">Request Schema</H2>
      <Code>{`{
  gender: "male" | "female",            // default "male"
  view: "front" | "back" | "dual",      // default "dual"
  layers: [
    { color: "#DC2626", muscles: ["chest","abs"], opacity?: 1,
      stroke?: "#000", strokeWidth?: 1 }
  ],
  defs?: [ { type: "linearGradient", id: "g",
             stops: [{ offset: "0%", color: "#000" }], x1?, y1?, x2?, y2? } ],
  width?: 768, height?: 1024,
  background?: "transparent",            // or hex / named color
  body_color?: "#3f3f3f",               // unselected muscle fill
  border_color?: "#dfdfdf", border_width?: 1,
  per_muscle?: { biceps: { fill, stroke, strokeWidth, opacity } },
  side_filter?: { biceps: "left" | "right" },
  format?: "svg" | "png",               // default "svg"
  output?: "json" | "raw"               // default "json"
}`}</Code>
      <P><span className="font-mono text-foreground">last-wins:</span> if muscle X is in layer 1 (red) and layer 3 (blue), it renders blue.</P>

      <H2 id="authentication">Authentication</H2>
      <P>Production traffic goes through <a className="text-primary hover:underline" href="https://rapidapi.com/slaczka.sebastian/api/anatome" target="_blank" rel="noopener noreferrer">RapidAPI</a>. Every request needs two headers:</P>
      <Code>{`X-RapidAPI-Key: <your Application Key>
X-RapidAPI-Host: anatome.p.rapidapi.com`}</Code>
      <P>Base URL for subscribed calls: <span className="font-mono text-foreground">https://anatome.p.rapidapi.com</span> (same paths as the Worker). Never expose your key in browser-visible <span className="font-mono text-foreground">&lt;img src&gt;</span> URLs — browsers cannot attach auth headers to image requests. Use fetch + blob URL, a server-side proxy, or self-host for embeddable SVGs.</P>
      <P>Direct <span className="font-mono text-foreground">https://api.anatome.dev</span> works without headers for development and low-traffic embeds (fair-use: 100 req/day per public host, 1000/day per IP). Localhost is unlimited.</P>
      <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm mt-3 mb-3">
        <strong>Need food search, workout logging, AI tools, or per-user data?</strong>{" "}
        The full platform at <a className="text-primary hover:underline" href="https://anatome.nextsolutions.studio" target="_blank" rel="noopener noreferrer">anatome.nextsolutions.studio</a> adds
        100 endpoints (food, calculators, per-user workouts/meals/cardio, progression analytics, MCP with 41 tools) with self-service keys
        via <span className="font-mono text-xs">Authorization: Bearer anp_…</span>.
        <a className="text-primary hover:underline ml-1" href="https://anatome-body-api.base44.app/onboarding" target="_blank" rel="noopener noreferrer">Get a free key →</a>
      </div>

      <H2 id="endpoints">Endpoints</H2>
      <P>Worker base URL: <span className="font-mono text-foreground">https://api.anatome.dev</span> · RapidAPI: <span className="font-mono text-foreground">https://anatome.p.rapidapi.com</span> (marketing site: <span className="font-mono text-foreground">https://anatome.dev</span>).</P>
      <P><span className="font-mono text-foreground">POST /generateImage</span> — main renderer (full JSON schema). Also supports GET with a simplified query syntax.</P>
      <P><span className="font-mono text-foreground">POST /workoutImage</span> — session heatmap from a list of exercise names.</P>
      <P><span className="font-mono text-foreground">GET /searchExercises</span> · <span className="font-mono text-foreground">GET /getExercise</span> · <span className="font-mono text-foreground">GET/POST /resolveExercise</span> — exercise catalog + muscle layers.</P>
      <P><span className="font-mono text-foreground">GET /exerciseGif</span> — hosted 2-frame demo GIF per exercise (<span className="font-mono text-foreground">?id=&lt;ext_id&gt;</span>).</P>
      <P><span className="font-mono text-foreground">GET /listMuscles</span> · <span className="font-mono text-foreground">GET /muscleInfo</span> · <span className="font-mono text-foreground">GET /listEquipment</span> — discovery.</P>
      <P><span className="font-mono text-foreground">POST /mcp</span> — MCP JSON-RPC 2.0. <span className="font-mono text-foreground">GET /openapi</span> for the full spec.</P>
      <P className="text-xs text-muted-foreground">Legacy Base44 paths: <span className="font-mono">https://anatome.dev/functions/&lt;name&gt;</span> (same handlers during migration).</P>
      <P>Response (output=json): <span className="font-mono text-foreground">{`{ ok, svg, format, gender, view, muscles_rendered, attribution, license, duration_ms }`}</span>. With <span className="font-mono text-foreground">output=raw</span> the SVG is returned directly with <span className="font-mono text-foreground">Content-Type: image/svg+xml</span>.</P>

      <H2 id="benchmarks">Benchmarks</H2>
      <DocsBenchmarksSection />

      <H2 id="img-urls">Building &lt;img&gt; URLs (Full Spec)</H2>
      <ImgUrlSpec />

      <H2 id="exercise-db">Exercises (873)</H2>
      <ExerciseDbSection />

      <H2 id="muscle-slugs">Muscle Slug Aliases</H2>
      <P>Slug names follow react-native-body-highlighter. Common aliases are auto-normalized, so these all resolve correctly:</P>
      <Code>{`shoulders → deltoids     calfs → calves      quads → quadriceps
gluteus  → gluteal       lats  → upper-back  traps → trapezius
pecs     → chest         hamstrings → hamstring`}</Code>

      <H2 id="mcp">MCP Server</H2>
      <P>Anatome ships a Model Context Protocol (MCP) server over JSON-RPC 2.0. Point any MCP-compatible client at the endpoint below and it gains five muscle-visualization tools.</P>

      <DocsMcpCursorSection />

      <P><span className="font-semibold text-foreground">Endpoint URL</span></P>
      <Code>{`https://api.anatome.dev/mcp`}</Code>
      <P className="text-xs text-muted-foreground">Legacy Base44 host: <span className="font-mono">https://anatome.dev/functions/mcp</span></P>

      <P><span className="font-semibold text-foreground">Tools exposed (5)</span></P>
      <P><span className="font-mono text-foreground">generate_muscle_image</span> — render an SVG of highlighted muscles. Params: <span className="font-mono">gender, view, layers[], defs?, width?, height?, background?, body_color?</span></P>
      <P><span className="font-mono text-foreground">list_muscles</span> — get the catalog of 23 muscle slugs + anatomical names + which view they appear on.</P>
      <P><span className="font-mono text-foreground">resolve_exercise</span> — fuzzy-match an exercise name, return ready-to-render layers (backed by our 873-exercise database).</P>
      <P><span className="font-mono text-foreground">search_exercises</span> — search the 873-exercise database with optional muscle/equipment/level filters.</P>
      <P><span className="font-mono text-foreground">get_exercise</span> — fetch a single exercise (by name, id, or random) with full instructions, images, and anatome layers.</P>

      <P><span className="font-semibold text-foreground">JSON-RPC 2.0 quickstart</span></P>
      <Code>{`# 1. initialize — handshake
curl -X POST https://api.anatome.dev/mcp \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# 2. tools/list — discover the 5 tools
curl -X POST https://api.anatome.dev/mcp \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# 3. tools/call — render bench press
curl -X POST https://api.anatome.dev/mcp \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
       "params":{"name":"generate_muscle_image",
         "arguments":{"view":"front",
           "layers":[{"color":"#DC2626","muscles":["chest"]},
                     {"color":"#F59E0B","muscles":["triceps","deltoids"]}]}}}'`}</Code>

      <P><span className="font-semibold text-foreground">Claude Desktop</span> — add to <span className="font-mono text-xs">~/Library/Application Support/Claude/claude_desktop_config.json</span> (macOS):</P>
      <Code>{`{
  "mcpServers": {
    "anatome": {
      "url": "https://api.anatome.dev/mcp"
    }
  }
}`}</Code>

      <P><span className="font-semibold text-foreground">Continue.dev / Cline / Cursor</span> — same URL in their MCP config (see screenshot above):</P>
      <Code>{`{
  "mcpServers": {
    "anatome": {
      "url": "https://api.anatome.dev/mcp",
      "transport": "http"
    }
  }
}`}</Code>

      <P><span className="font-semibold text-foreground">Other clients</span> — any JSON-RPC 2.0 MCP client works. See <a className="text-primary hover:underline" href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer">modelcontextprotocol.io</a>.</P>
      <P><span className="font-mono text-foreground">Pricing:</span> Basic plan on RapidAPI — <span className="font-medium text-foreground">300 requests/month included</span>, then <span className="font-mono text-foreground">$0.001</span> per request. Localhost and 127.0.0.1 are <span className="font-medium text-foreground">unlimited</span> for development. Production traffic via RapidAPI uses <span className="font-mono text-xs">X-RapidAPI-Proxy-Secret</span>; MCP integrations can use <span className="font-mono text-xs">X-Mcp-Trusted-Key</span>.</P>

      <H2 id="examples">Examples</H2>
      <P>RapidAPI (production) — same headers on every call:</P>
      <Code>{`# Three-tier bench press (primary / secondary / stabilizers)
curl -X POST https://anatome.p.rapidapi.com/generateImage \\
  -H 'X-RapidAPI-Key: $RAPIDAPI_KEY' \\
  -H 'X-RapidAPI-Host: anatome.p.rapidapi.com' \\
  -H 'Content-Type: application/json' \\
  -d '{"view":"dual","layers":[
    {"color":"#DC2626","muscles":["chest"]},
    {"color":"#F59E0B","muscles":["triceps","deltoids"]},
    {"color":"#FCD34D","muscles":["abs"],"opacity":0.5}
  ]}'

# Compact GET with the same three layers
curl "https://anatome.p.rapidapi.com/generateImage?layers=DC2626:chest|F59E0B:triceps,deltoids|FCD34D@0.5:abs&output=raw" \\
  -H "X-RapidAPI-Key: $RAPIDAPI_KEY" \\
  -H "X-RapidAPI-Host: anatome.p.rapidapi.com" \\
  -o bench.svg

# Resolve an exercise from the 873-exercise database (primary + secondary)
curl "https://anatome.p.rapidapi.com/resolveExercise?exercise=bench+press" \\
  -H "X-RapidAPI-Key: $RAPIDAPI_KEY" \\
  -H "X-RapidAPI-Host: anatome.p.rapidapi.com"`}</Code>
      <P>Direct Worker (dev / self-host / low-traffic embeds — no auth headers):</P>
      <Code>{`GET https://api.anatome.dev/generateImage?layers=DC2626:chest|F59E0B:triceps,deltoids|FCD34D@0.5:abs&output=raw`}</Code>

      <H2 id="attribution">Attribution & License</H2>
      <ul className="text-sm text-muted-foreground leading-relaxed my-2 space-y-1.5 list-disc pl-5">
        <li><span className="text-foreground font-medium">This API (Anatome):</span> Apache-2.0 — by NextSolutions.</li>
        <li><span className="text-foreground font-medium">Anatomical SVG path data:</span> MIT (© Hicham El Boussarghini), ported from <a className="text-primary hover:underline" href="https://github.com/HichamELBSI/react-native-body-highlighter" target="_blank" rel="noopener noreferrer">react-native-body-highlighter</a>.</li>
        <li><span className="text-foreground font-medium">Exercise metadata:</span> catalog names / muscles / instructions bundled with Anatome (Apache-2.0 distribution).</li>
      </ul>

      <div className="mt-10"><AironPromo /></div>
    </div>
  );
}