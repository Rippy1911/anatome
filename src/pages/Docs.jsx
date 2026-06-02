import React from "react";

function Code({ children }) {
  return <pre className="bg-[#0a0e17] border border-border rounded-lg p-4 overflow-x-auto text-[12px] leading-relaxed font-mono text-foreground/90 my-3"><code>{children}</code></pre>;
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
        {[["overview","Overview"],["schema","Schema"],["endpoints","Endpoints"],["migration","mertronlp Migration"],["mcp","MCP Tools"],["examples","Examples"],["attribution","Attribution & License"]].map(([id,l])=>(
          <a key={id} href={`#${id}`} className="px-2.5 py-1 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors">{l}</a>
        ))}
      </nav>

      <H2 id="overview">Overview</H2>
      <P>Anatome renders human-body muscle diagrams as SVG. You describe what to highlight using <span className="font-mono text-foreground">layers</span> — each layer is a color plus a list of muscle slugs. The MIT-licensed, more flexible alternative to mertronlp's muscle-group-image-generator.</P>
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

      <H2 id="endpoints">Endpoints</H2>
      <P><span className="font-mono text-foreground">POST /functions/generateImage</span> — main renderer (full JSON schema). Also supports GET with a simplified query syntax.</P>
      <P><span className="font-mono text-foreground">GET /functions/listMuscles</span> — full muscle catalog (slugs + anatomical names + view presence).</P>
      <P><span className="font-mono text-foreground">GET/POST /functions/resolveExercise</span> — resolve an exercise name into colored layers.</P>
      <P><span className="font-mono text-foreground">POST /functions/mcp</span> — MCP JSON-RPC 2.0 server.</P>
      <P><span className="font-mono text-foreground">GET /functions/openapi</span> — OpenAPI 3.1 spec. <span className="font-mono text-foreground">GET /functions/selfTest</span> — test suite.</P>
      <P>Response (output=json): <span className="font-mono text-foreground">{`{ ok, svg, format, gender, view, muscles_rendered, attribution, license, duration_ms }`}</span>. With <span className="font-mono text-foreground">output=raw</span> the SVG is returned directly with <span className="font-mono text-foreground">Content-Type: image/svg+xml</span>.</P>

      <H2 id="migration">mertronlp Migration Guide</H2>
      <P>Slug names follow react-native-body-highlighter, not mertronlp. Aliases are auto-normalized, so existing slugs mostly still work:</P>
      <Code>{`shoulders → deltoids     calfs → calves      quads → quadriceps
gluteus  → gluteal       lats  → upper-back  traps → trapezius
pecs     → chest         hamstrings → hamstring`}</Code>
      <P>Endpoint equivalents:</P>
      <Code>{`/getImage?muscleGroups=chest,abs&color=#FF0000
  → { layers: [{ color: "#FF0000", muscles: ["chest","abs"] }] }

/getMulticolorImage?primaryMuscleGroups=chest&secondaryMuscleGroups=triceps
                    &primaryColor=red&secondaryColor=blue
  → { layers: [{color:"red",muscles:["chest"]},
               {color:"blue",muscles:["triceps"]}] }

/getIndividualColorImage
  → one layer per muscle`}</Code>

      <H2 id="mcp">MCP Tools</H2>
      <P>The MCP server exposes three tools over JSON-RPC 2.0 at <span className="font-mono text-foreground">/functions/mcp</span>:</P>
      <P><span className="font-mono text-foreground">generate_muscle_image</span>, <span className="font-mono text-foreground">list_muscles</span>, <span className="font-mono text-foreground">resolve_exercise</span>.</P>
      <Code>{`{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "generate_muscle_image",
    "arguments": { "view": "front",
      "layers": [{ "color": "#DC2626", "muscles": ["chest"] }] } } }`}</Code>

      <H2 id="examples">Examples</H2>
      <Code>{`# Single muscle group, red, front view
curl -X POST /functions/generateImage \\
  -H 'Content-Type: application/json' \\
  -d '{"view":"front","layers":[{"color":"#DC2626","muscles":["chest","abs"]}]}'

# Raw SVG (embed directly in <img> after data-uri encoding)
GET /functions/generateImage?muscles=biceps,triceps&color=%23DC2626&output=raw

# Resolve an exercise
GET /functions/resolveExercise?exercise=deadlift`}</Code>

      <H2 id="attribution">Attribution & License</H2>
      <P>Anatomy paths © Hicham El Boussarghini (MIT), ported from <a className="text-primary hover:underline" href="https://github.com/HichamELBSI/react-native-body-highlighter" target="_blank" rel="noopener noreferrer">react-native-body-highlighter</a> (converted from React Native SVG to server-rendered SVG). Anatome by NextSolutions. Licensed MIT.</P>
    </div>
  );
}