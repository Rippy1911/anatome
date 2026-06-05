import React from "react";
import { API_BENCHMARKS, BENCHMARK_DATE, BENCHMARK_SCOPE, LIVE_API } from "@/lib/apiBenchmarks";

export default function DocsBenchmarksSection() {
  return (
    <>
      <p className="text-sm text-muted-foreground leading-relaxed my-2">
        All figures are for <span className="font-mono text-foreground">{LIVE_API}</span> only ({BENCHMARK_SCOPE}).
        Measured {BENCHMARK_DATE}. Two latency numbers matter:
      </p>
      <ul className="text-sm text-muted-foreground list-disc pl-5 my-2 space-y-1">
        <li><span className="font-mono text-foreground">X-Render-Ms</span> — Worker SVG compute time (typically &lt;5&nbsp;ms).</li>
        <li><span className="font-mono text-foreground">Round-trip p50</span> — full HTTP request from probe to edge (includes TLS + network; ~180–330&nbsp;ms in EU).</li>
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed my-2">
        Deterministic GET endpoints use <span className="font-mono text-foreground">caches.default</span> with
        <span className="font-mono text-foreground"> Cache-Control: public, max-age=86400, s-maxage=604800, immutable</span>.
        Repeat the same URL — expect <span className="font-mono text-foreground">X-Cache: HIT</span>.
        POST <span className="font-mono text-foreground">/workoutImage</span> is not edge-cached.
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
            {API_BENCHMARKS.map(({ metric, value, note }) => (
              <tr key={metric} className="border-t border-border">
                <td className="p-2 text-foreground">{metric}</td>
                <td className="p-2 font-mono text-primary">{value}</td>
                <td className="p-2 text-muted-foreground">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <pre className="bg-card border border-border rounded-lg p-4 overflow-x-auto text-xs leading-relaxed font-mono my-3"><code>{`# Server render time (Worker compute)
curl -sI "${LIVE_API}/generateImage?layers=DC2626:chest&output=raw&probe=1" | grep -i x-render-ms

# Edge cache on repeat GET (not HEAD)
curl -s -D - -o /dev/null "${LIVE_API}/generateImage?layers=DC2626:chest&output=raw" | grep -iE 'x-cache|cf-cache'
curl -s -D - -o /dev/null "${LIVE_API}/generateImage?layers=DC2626:chest&output=raw" | grep -iE 'x-cache|cf-cache'`}</code></pre>
    </>
  );
}
