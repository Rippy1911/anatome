import React from "react";

const ROWS = [
  ["Image render (cold)", "~600ms", "Single layer, raw SVG via GET /generateImage"],
  ["Image render (cached)", "<50ms", "Same URL after caches.default HIT (X-Cache: HIT)"],
  ["Complex render", "~564ms", "3 layers, dual view, female — deterministic cache key"],
  ["Workout heatmap", "~1.3s", "POST /workoutImage — 3 exercises (not edge-cached)"],
  ["Search (873 exercises)", "~1.2s", "GET /searchExercises — in-memory filter"],
  ["Exercise GIF", "~380ms", "GET /exerciseGif — 218 KB immutable asset"],
  ["MuscleInfo", "~970ms", "GET /muscleInfo?slug=chest — counts + top exercises"],
  ["Average SVG payload", "~4 KB", "Typical generateImage output size"],
  ["Edge presence", "300+ POPs", "Cloudflare Workers + Cache API"],
  ["Test coverage", "46/46", "GET /selfTest on production"],
];

export default function DocsBenchmarksSection() {
  return (
    <>
      <p className="text-sm text-muted-foreground leading-relaxed my-2">
        Production benchmarks measured 2026-06-02 at <span className="font-mono text-foreground">https://api.anatome.dev</span>.
        Deterministic GET endpoints use the Cloudflare Cache API (<span className="font-mono text-foreground">caches.default</span>) with
        <span className="font-mono text-foreground"> Cache-Control: public, max-age=86400, s-maxage=604800, immutable</span>.
        Check <span className="font-mono text-foreground">X-Cache: HIT</span> or <span className="font-mono text-foreground">cf-cache-status</span> on repeat requests.
      </p>
      <div className="overflow-x-auto my-4">
        <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
          <thead className="bg-secondary/60">
            <tr>
              <th className="text-left p-2 font-medium">Metric</th>
              <th className="text-left p-2 font-medium">Value</th>
              <th className="text-left p-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([metric, value, note]) => (
              <tr key={metric} className="border-t border-border">
                <td className="p-2 text-foreground">{metric}</td>
                <td className="p-2 font-mono text-primary">{value}</td>
                <td className="p-2 text-muted-foreground">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <pre className="bg-[#0a0e17] border border-[#1e293b] rounded-lg p-4 overflow-x-auto text-[12px] leading-relaxed font-mono text-slate-100 my-3"><code>{`# Verify edge cache on a deterministic SVG URL
curl -sI "https://api.anatome.dev/generateImage?layers=DC2626:chest&output=raw" | grep -iE 'cache|x-cache'
# Repeat immediately — expect X-Cache: HIT (and often cf-cache-status: HIT)`}</code></pre>
    </>
  );
}
