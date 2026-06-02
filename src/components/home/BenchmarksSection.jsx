import React, { useState } from "react";
import { Gauge, X } from "lucide-react";
import { cn } from "@/lib/utils";

const BENCHMARKS = [
  { metric: "Image render (cold)", value: "~600ms", note: "Single layer, raw SVG" },
  { metric: "Image render (cached)", value: "<50ms", note: "After first edge hit" },
  { metric: "Complex render (3 layers, dual, female)", value: "~564ms", note: "Full dual-view diagram" },
  { metric: "Workout heatmap (3 exercises)", value: "~1.3s", note: "Resolve + render session SVG" },
  { metric: "Search (873 exercises)", value: "~1.2s", note: "Fuzzy filter in-memory" },
  { metric: "Exercise GIF (CC0)", value: "~380ms", note: "218 KB edge-served binary" },
  { metric: "MuscleInfo + top exercises", value: "~970ms", note: "Per-slug reference" },
  { metric: "Average SVG payload", value: "~4 KB", note: "Typical output size" },
  { metric: "Edge presence", value: "300+ POPs", note: "Cloudflare global network" },
  { metric: "Test coverage", value: "46/46", note: "selfTest endpoint" },
];

const LIVE_API = "https://api.anatome.dev";

async function timed(label, fn) {
  const t0 = performance.now();
  await fn();
  return { label, ms: Math.round(performance.now() - t0) };
}

export default function BenchmarksSection() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState([]);

  async function measure() {
    setRunning(true);
    setLive([]);
    const tests = [
      ["Cold SVG render", () => fetch(`${LIVE_API}/generateImage?layers=DC2626:chest&output=raw`)],
      ["Cached SVG (repeat)", () => fetch(`${LIVE_API}/generateImage?layers=DC2626:chest&output=raw&_=${Date.now()}`)],
      ["Search exercises", () => fetch(`${LIVE_API}/searchExercises?q=bench&limit=5&fields=name,anatome_imageSrc`)],
      ["MuscleInfo chest", () => fetch(`${LIVE_API}/muscleInfo?slug=chest`)],
      ["selfTest", () => fetch(`${LIVE_API}/selfTest`)],
    ];
    const results = [];
    for (const [label, fn] of tests) {
      results.push(await timed(label, fn));
      setLive([...results]);
    }
    setRunning(false);
  }

  return (
    <section>
      <div className="mb-6 text-center">
        <div className="text-xs font-mono uppercase tracking-wider text-primary mb-1">Performance</div>
        <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-tight">Benchmarks</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
          Measured on production at api.anatome.dev · 2026-06-02. Deterministic URLs cache at the edge via Cloudflare Cache API.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {BENCHMARKS.map((b) => (
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
          Measure yourself
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold">Live timing — api.anatome.dev</h3>
              <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-secondary">
                <X className="w-4 h-4" />
              </button>
            </div>
            {running && live.length === 0 && (
              <p className="text-sm text-muted-foreground">Running 5 requests…</p>
            )}
            <ul className="space-y-2">
              {live.map((r) => (
                <li key={r.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className={cn("font-mono font-medium", r.ms < 100 ? "text-primary" : "")}>{r.ms} ms</span>
                </li>
              ))}
            </ul>
            {!running && live.length > 0 && (
              <p className="text-xs text-muted-foreground mt-4">Second SVG request may show lower latency if edge cache is warm.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
