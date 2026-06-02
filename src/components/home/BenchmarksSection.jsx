import React, { useState } from "react";
import { Gauge, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  API_BENCHMARKS,
  BENCHMARK_DATE,
  BENCHMARK_SCOPE,
  LIVE_MEASURE_TESTS,
} from "@/lib/apiBenchmarks";

async function measureFetch(label, fetchFn) {
  const t0 = performance.now();
  const res = await fetchFn();
  await res.arrayBuffer();
  const totalMs = Math.round(performance.now() - t0);
  const serverMs = res.headers.get("X-Render-Ms");
  const cache = res.headers.get("X-Cache") || res.headers.get("cf-cache-status") || "—";
  return {
    label,
    totalMs,
    serverMs: serverMs ? Number(serverMs) : null,
    cache,
  };
}

async function measureCached(label, url) {
  await fetch(url);
  const t0 = performance.now();
  const res = await fetch(url);
  await res.arrayBuffer();
  const totalMs = Math.round(performance.now() - t0);
  const serverMs = res.headers.get("X-Render-Ms");
  const cache = res.headers.get("X-Cache") || res.headers.get("cf-cache-status") || "—";
  return { label, totalMs, serverMs: serverMs ? Number(serverMs) : null, cache };
}

export default function BenchmarksSection() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState([]);

  async function measure() {
    setRunning(true);
    setLive([]);
    const results = [];
    for (const test of LIVE_MEASURE_TESTS) {
      const row = test.prime
        ? await measureCached(test.label, test.url)
        : await measureFetch(test.label, test.run);
      results.push(row);
      setLive([...results]);
    }
    setRunning(false);
  }

  return (
    <section>
      <div className="mb-6 text-center">
        <div className="text-xs font-mono uppercase tracking-wider text-primary mb-1">Performance</div>
        <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-tight">API benchmarks</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl mx-auto">
          Measured on production · {BENCHMARK_DATE} · {BENCHMARK_SCOPE}.
          Round-trip includes your browser → Cloudflare edge; server render is Worker compute only (<span className="font-mono text-foreground">X-Render-Ms</span>).
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {API_BENCHMARKS.map((b) => (
          <div key={b.metric} className="rounded-xl border border-border bg-card p-4">
            <div className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">{b.metric}</div>
            <div className="font-display font-bold text-2xl mt-1 text-primary">{b.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{b.note}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => { setOpen(true); measure(); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-semibold hover:bg-secondary transition-colors"
        >
          <Gauge className="w-4 h-4" />
          Measure from your browser
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold">Live — api.anatome.dev</h3>
              <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-secondary">
                <X className="w-4 h-4" />
              </button>
            </div>
            {running && live.length === 0 && (
              <p className="text-sm text-muted-foreground">Running {LIVE_MEASURE_TESTS.length} API requests…</p>
            )}
            {live.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground text-xs">
                      <th className="pb-2 font-medium">Endpoint</th>
                      <th className="pb-2 font-medium text-right">Round-trip</th>
                      <th className="pb-2 font-medium text-right">Server</th>
                      <th className="pb-2 font-medium text-right">Cache</th>
                    </tr>
                  </thead>
                  <tbody>
                    {live.map((r) => (
                      <tr key={r.label} className="border-t border-border">
                        <td className="py-2 text-muted-foreground">{r.label}</td>
                        <td className={cn("py-2 text-right font-mono", r.totalMs < 350 ? "text-primary" : "")}>{r.totalMs} ms</td>
                        <td className="py-2 text-right font-mono text-muted-foreground">{r.serverMs != null ? `${r.serverMs} ms` : "—"}</td>
                        <td className="py-2 text-right font-mono text-[11px] text-muted-foreground">{r.cache}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!running && live.length > 0 && (
              <p className="text-xs text-muted-foreground mt-4">
                Cached SVG uses a fixed URL (second fetch after warm-up). Cold URL uses a unique query param so the Worker renders fresh.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
