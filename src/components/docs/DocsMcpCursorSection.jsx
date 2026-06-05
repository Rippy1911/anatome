import React from "react";

const MCP_URL = "https://api.anatome.dev/mcp";

export default function DocsMcpCursorSection() {
  return (
    <>
      <h3 className="font-display text-lg font-semibold mt-8 mb-2">Using Anatome in Cursor</h3>
      <p className="text-sm text-muted-foreground leading-relaxed my-2">
        Add Anatome as an MCP server in Cursor, then ask in natural language — the agent calls{" "}
        <span className="font-mono text-foreground">resolve_exercise</span> and{" "}
        <span className="font-mono text-foreground">generate_muscle_image</span>, returns a muscle diagram,
        a primary/secondary breakdown, and a ready-to-embed <span className="font-mono text-foreground">&lt;img&gt;</span> URL.
      </p>

      <p className="text-sm text-muted-foreground leading-relaxed my-2">
        <span className="font-semibold text-foreground">Cursor MCP config</span> —{" "}
        <span className="font-mono text-xs">Settings → MCP</span> or{" "}
        <span className="font-mono text-xs">~/.cursor/mcp.json</span>:
      </p>
      <pre className="bg-[#0a0e17] border border-[#1e293b] rounded-lg p-4 overflow-x-auto text-[12px] leading-relaxed font-mono text-slate-100 my-3"><code>{`{
  "mcpServers": {
    "anatome": {
      "url": "${MCP_URL}"
    }
  }
}`}</code></pre>

      <p className="text-sm text-muted-foreground leading-relaxed my-2">
        Example prompt in Cursor chat:
      </p>
      <pre className="bg-secondary/40 border border-border rounded-lg px-4 py-3 text-sm text-foreground my-3 font-mono">
        give me image of muscles involved in bench press
      </pre>

      <figure className="my-6 rounded-xl border border-border overflow-hidden bg-card shadow-sm">
        <img
          src="/docs/mcp-cursor-bench-press.png"
          alt="Cursor chat showing Anatome MCP response for bench press: muscle diagram with chest highlighted in red and shoulders in amber, muscles-involved table, matched exercise name, and embeddable generateImage URL"
          className="w-full h-auto"
          loading="lazy"
        />
        <figcaption className="px-4 py-3 text-xs text-muted-foreground border-t border-border leading-relaxed">
          Live Cursor session: Anatome MCP resolves <span className="font-mono text-foreground">bench press</span> to{" "}
          <span className="font-mono text-foreground">Barbell Bench Press — Medium Grip</span>, renders primary chest (
          <span className="font-mono text-foreground">#DC2626</span>) and secondary deltoids/triceps (
          <span className="font-mono text-foreground">#F59E0B</span>), and returns an embeddable SVG URL.
        </figcaption>
      </figure>

      <p className="text-sm text-muted-foreground leading-relaxed my-2">
        The returned URL works as a drop-in embed on direct <span className="font-mono text-foreground">api.anatome.dev</span>{" "}
        (self-host or fair-use). RapidAPI production apps should fetch the same path on{" "}
        <span className="font-mono text-foreground">anatome.p.rapidapi.com</span> with{" "}
        <span className="font-mono text-foreground">X-RapidAPI-Key</span>, then attach via blob URL. Ask for a{" "}
        <span className="font-mono text-foreground">dual view</span> or{" "}
        <span className="font-mono text-foreground">female</span> variant in follow-up messages.
      </p>
    </>
  );
}
