import React from "react";

const BASE = "https://anatome-form-flow.base44.app/functions/generateImage";

const PARAMS = [
  ["gender", "enum", "male", "male or female"],
  ["view", "enum", "dual", "front, back, or dual"],
  ["layers", "string", "—", "Compact: HEX:m1,m2|HEX:m3 (preferred for multi-color)"],
  ["muscles", "string", "—", "Comma-separated slugs (single-layer shortcut)"],
  ["color", "string", "#DC2626", "Color for muscles param (single-layer)"],
  ["width", "int", "768", "100–2048"],
  ["height", "int", "1024", "100–2048"],
  ["body_color", "string", "#282828", "Unselected muscle fill"],
  ["border_color", "string", "#dfdfdf", "Outline color"],
  ["border_width", "number", "1.5", "Outline thickness"],
  ["background", "string", "transparent", "Background fill"],
  ["output", "enum", "json", "json (wrapped) or raw (image/svg+xml)"],
];

const EXAMPLES = [
  ["Simplest single layer", "?gender=male&view=front&layers=DC2626:chest&output=raw"],
  ["Two layers (primary + secondary)", "?gender=male&view=dual&layers=DC2626:chest,abs|F59E0B:triceps,deltoids&output=raw"],
  ["Three layers", "?gender=male&view=front&layers=DC2626:chest|F59E0B:triceps|FCD34D:abs&output=raw"],
  ["Female back view", "?gender=female&view=back&layers=DC2626:hamstring,gluteal&output=raw"],
  ["Tall portrait, custom colors", "?width=512&height=900&body_color=%23e5e7eb&background=%23ffffff&layers=DC2626:chest&output=raw"],
  ["Single-layer shortcut (muscles + color)", "?muscles=chest,triceps&color=%23FF0000&output=raw"],
];

const POST_EXAMPLE = `const response = await fetch("https://anatome-form-flow.base44.app/functions/generateImage", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    gender: "male",
    view: "front",
    defs: [{ type: "linearGradient", id: "hot", stops: [{ offset: "0%", color: "#FBBF24" }, { offset: "100%", color: "#DC2626" }] }],
    layers: [{ color: "url(#hot)", muscles: ["chest", "abs"] }]
  })
});
const { svg } = await response.json();`;

function Code({ children }) {
  return <pre className="bg-[#0a0e17] border border-[#1e293b] rounded-lg p-4 overflow-x-auto text-[12px] leading-relaxed font-mono text-slate-100 my-3"><code>{children}</code></pre>;
}

export default function ImgUrlSpec() {
  return (
    <>
      <p className="text-sm text-muted-foreground leading-relaxed my-2">
        Every parameter the generateImage endpoint accepts. Use these to build URLs you can drop directly into <span className="font-mono text-foreground">{"<img src>"}</span> tags.
      </p>

      <h3 className="font-display font-semibold mt-6 mb-2">Query Parameters</h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-foreground">
            <tr>
              {["Parameter", "Type", "Default", "Description"].map((h) => (
                <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PARAMS.map(([p, t, d, desc]) => (
              <tr key={p} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-foreground whitespace-nowrap">{p}</td>
                <td className="px-3 py-2 text-muted-foreground">{t}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">{d}</td>
                <td className="px-3 py-2 text-muted-foreground">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="font-display font-semibold mt-8 mb-2">Examples (live)</h3>
      <div className="space-y-6">
        {EXAMPLES.map(([label, qs], i) => (
          <div key={i}>
            <p className="text-sm font-medium text-foreground mb-1">{i + 1}. {label}</p>
            <Code>{`GET /functions/generateImage${qs}`}</Code>
            <div className="rounded-lg border border-border bg-[#f1f5f9] dark:bg-[#0a0e17] p-3 flex justify-center">
              <img src={`${BASE}${qs}`} alt={label} loading="lazy" className="max-h-64 w-auto" />
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed mt-6">
        <span className="font-semibold text-foreground">Advanced:</span> For gradients, per-muscle overrides, side-filtering (left/right), or SVG defs, use POST with a JSON body. See the{" "}
        <a href="/api" className="text-primary hover:underline">OpenAPI spec</a>.
      </p>
      <Code>{POST_EXAMPLE}</Code>
    </>
  );
}