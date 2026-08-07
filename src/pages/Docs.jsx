import React from "react";
import { FAIR_USE_PER_DAY, PLATFORM_URL } from "@/lib/apiBase";
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
        {[["overview","Overview"],["schema","Schema"],["fair-use","Fair use"],["endpoints","Endpoints"],["benchmarks","Benchmarks"],["img-urls","Building <img> URLs"],["exercise-db","Exercises"],["mcp","MCP Server"],["examples","Examples"],["attribution","Attribution & License"]].map(([id,l])=>(
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

      <H2 id="fair-use">Authentication &amp; fair use</H2>
      <P><strong className="text-foreground">There is no authentication.</strong> No signup, no API key, no token, no header. Every endpoint below is callable from a browser, a shell or an MCP client exactly as written.</P>
      <P>What there is instead is a fair-use budget: <strong className="text-foreground">{FAIR_USE_PER_DAY} requests per caller per day</strong>, resetting at 00:00 UTC. Requests from a loopback or private address are unlimited, so local development and self-hosted smoke tests never count.</P>
      <P>Static catalog reads — <span className="font-mono text-foreground">/listMuscles</span>, <span className="font-mono text-foreground">/listEquipment</span>, <span className="font-mono text-foreground">/bodyPaths</span>, <span className="font-mono text-foreground">/openapi</span> and the guide endpoints — are edge-cached and not counted at all. The budget applies to rendering and searching.</P>
      <P>Over the limit, REST endpoints return <span className="font-mono text-foreground">429</span> with a body designed to be read by a program:</P>
      <Code>{`{
  "ok": false,
  "error": "daily_fair_use_limit_reached",
  "scope": "ip",
  "limit": ${FAIR_USE_PER_DAY},
  "used": ${FAIR_USE_PER_DAY},
  "remaining": 0,
  "reset_at": "2026-08-08T00:00:00.000Z",
  "retry_after_seconds": 62678,
  "retryable": false,
  "message": "Daily fair-use limit reached: ..."
}`}</Code>
      <P>The MCP endpoint behaves differently on purpose. <span className="font-mono text-foreground">initialize</span> and <span className="font-mono text-foreground">tools/list</span> are never rate limited — otherwise a user who is simply out of requests could not connect, and every assistant renders that as a broken connector. Only <span className="font-mono text-foreground">tools/call</span> spends budget, and when it runs out the call returns a normal result with <span className="font-mono text-foreground">isError: true</span> and a plain-English explanation, so the model tells the user the truth instead of reporting a failure.</P>
      <P>MCP callers are counted per session rather than per IP, because a remote connector reaches the API from the assistant vendor&apos;s servers — one shared address for every user of that assistant.</P>
      <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm mt-3 mb-3">
        <strong>Need more than fair use?</strong>{" "}
        Two options, both fine. Self-host this Worker on your own Cloudflare account and set your own limit — see{" "}
        <a className="text-primary hover:underline" href="https://github.com/Rippy1911/anatome/blob/main/SELF_HOSTING.md" target="_blank" rel="noopener noreferrer">SELF_HOSTING.md</a>.
        Or use the hosted platform at{" "}
        <a className="text-primary hover:underline" href={PLATFORM_URL} target="_blank" rel="noopener noreferrer">platform.anatome.dev</a>, which adds
        per-user workouts and meals, AI parsing, interactive widgets, curated programming, coach and trainee accounts and production quotas.
      </div>

      <H2 id="endpoints">Endpoints</H2>
      <P>Base URL: <span className="font-mono text-foreground">https://api.anatome.dev</span> (this site: <span className="font-mono text-foreground">https://anatome.dev</span>).</P>
      <P><span className="font-mono text-foreground">POST /generateImage</span> — main renderer (full JSON schema). Also supports GET with a simplified query syntax.</P>
      <P><span className="font-mono text-foreground">POST /workoutImage</span> — session heatmap from a list of exercise names.</P>
      <P><span className="font-mono text-foreground">GET /searchExercises</span> · <span className="font-mono text-foreground">GET /getExercise</span> · <span className="font-mono text-foreground">GET/POST /resolveExercise</span> — exercise catalog + muscle layers.</P>
      <P><span className="font-mono text-foreground">GET /exerciseGif</span> — hosted 2-frame demo GIF per exercise (<span className="font-mono text-foreground">?id=&lt;ext_id&gt;</span>).</P>
      <P><span className="font-mono text-foreground">GET /listMuscles</span> · <span className="font-mono text-foreground">GET /muscleInfo</span> · <span className="font-mono text-foreground">GET /listEquipment</span> · <span className="font-mono text-foreground">GET /bodyPaths</span> — discovery and raw anatomical path data for client-side rendering.</P>
      <P><span className="font-mono text-foreground">GET /listGuides</span> · <span className="font-mono text-foreground">GET /getGuide</span> · <span className="font-mono text-foreground">GET /getGuideTree</span> — skill progressions. <strong className="text-foreground">Work in progress</strong>: unverified content, incomplete media, every response carries <span className="font-mono text-foreground">status: &quot;work_in_progress&quot;</span>.</P>
      <P><span className="font-mono text-foreground">POST /mcp</span> — MCP JSON-RPC 2.0 over Streamable HTTP. <span className="font-mono text-foreground">GET /openapi</span> for the full spec, <span className="font-mono text-foreground">GET /.well-known/mcp.json</span> for machine discovery.</P>
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
      <P>Anatome ships a Model Context Protocol server over Streamable HTTP. Point any MCP-compatible client at the endpoint below — there is no key, no registration and no OAuth step.</P>

      <DocsMcpCursorSection />

      <P><span className="font-semibold text-foreground">Endpoint URL</span></P>
      <Code>{`https://api.anatome.dev/mcp`}</Code>

      <P><span className="font-semibold text-foreground">Tools exposed (10)</span></P>
      <P><span className="font-mono text-foreground">generate_muscle_image</span> — render an SVG of highlighted muscles. Params: <span className="font-mono">gender, view, layers[], defs?, width?, height?, background?, body_color?</span></P>
      <P><span className="font-mono text-foreground">list_muscles</span> — the catalog of 23 muscle slugs + anatomical names + which view they appear on.</P>
      <P><span className="font-mono text-foreground">resolve_exercise</span> — fuzzy-match an exercise name, return ready-to-render layers.</P>
      <P><span className="font-mono text-foreground">search_exercises</span> — search the 873-exercise database with optional muscle/equipment/level filters.</P>
      <P><span className="font-mono text-foreground">get_exercise</span> — fetch a single exercise (by name, id, or random) with full instructions, images and layers.</P>
      <P><span className="font-mono text-foreground">get_exercise_gif</span> — the hosted demo GIF URL for an exercise.</P>
      <P><span className="font-mono text-foreground">workout_image</span> — stack a session&apos;s exercises into one heatmap SVG.</P>
      <P><span className="font-mono text-foreground">list_guides</span> · <span className="font-mono text-foreground">get_guide</span> · <span className="font-mono text-foreground">get_guide_tree</span> — <strong className="text-foreground">work in progress.</strong> Their descriptions carry the same warning, so a model reading the tool list knows to hedge.</P>

      <P><span className="font-semibold text-foreground">JSON-RPC quickstart</span></P>
      <Code>{`# 1. initialize — handshake (never rate limited)
curl -X POST https://api.anatome.dev/mcp \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# 2. tools/list — discover the tools (never rate limited)
curl -X POST https://api.anatome.dev/mcp \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# 3. tools/call — render bench press (this one spends fair use)
curl -X POST https://api.anatome.dev/mcp \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
       "params":{"name":"generate_muscle_image",
         "arguments":{"view":"front",
           "layers":[{"color":"#DC2626","muscles":["chest"]},
                     {"color":"#F59E0B","muscles":["triceps","deltoids"]}]}}}'`}</Code>

      <P><span className="font-semibold text-foreground">Claude</span> — Settings → Connectors → Add custom connector, paste the URL. For Claude Desktop&apos;s config file (<span className="font-mono text-xs">~/Library/Application Support/Claude/claude_desktop_config.json</span> on macOS):</P>
      <Code>{`{
  "mcpServers": {
    "anatome": {
      "type": "http",
      "url": "https://api.anatome.dev/mcp"
    }
  }
}`}</Code>

      <P><span className="font-semibold text-foreground">ChatGPT</span> — Settings → Apps → Create app, paste the same URL, authentication None.</P>
      <P><span className="font-semibold text-foreground">Other clients</span> — any MCP client works. See <a className="text-primary hover:underline" href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer">modelcontextprotocol.io</a>.</P>

      <H2 id="examples">Examples</H2>
      <Code>{`# Three-tier bench press (primary / secondary / stabilizers)
curl -X POST https://api.anatome.dev/generateImage \\
  -H 'Content-Type: application/json' \\
  -d '{"view":"dual","layers":[
    {"color":"#DC2626","muscles":["chest"]},
    {"color":"#F59E0B","muscles":["triceps","deltoids"]},
    {"color":"#FCD34D","muscles":["abs"],"opacity":0.5}
  ]}'

# Compact GET with the same three layers
curl "https://api.anatome.dev/generateImage?layers=DC2626:chest|F59E0B:triceps,deltoids|FCD34D@0.5:abs&output=raw" \\
  -o bench.svg

# Resolve an exercise from the 873-exercise database (primary + secondary)
curl "https://api.anatome.dev/resolveExercise?exercise=bench+press"`}</Code>
      <P>Every one of those runs as written — no header to add, nothing to sign up for.</P>

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