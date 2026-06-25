/**
 * Production API benchmarks — api.anatome.dev only.
 * Round-trip p50 measured 2026-06-02 (curl probe, 5-run median after warm-up).
 * Server render from X-Render-Ms on generateImage (Worker compute, excludes network).
 */
export const LIVE_API = "https://api.anatome.dev";

export const BENCHMARK_DATE = "2026-06-02";
export const BENCHMARK_SCOPE = "api.anatome.dev only — excludes Base44 frontend latency";

/** Static cards on Home + Docs */
export const API_BENCHMARKS = [
  { metric: "Server SVG render", value: "<5 ms", note: "Worker compute (X-Render-Ms), single layer" },
  { metric: "Round-trip cold (p50)", value: "~280 ms", note: "GET /generateImage, unique URL" },
  { metric: "Round-trip cached (p50)", value: "~180 ms", note: "Same URL, X-Cache: HIT + network" },
  { metric: "Complex SVG (p50)", value: "~270 ms", note: "3 layers · dual · female" },
  { metric: "Search exercises", value: "~290 ms", note: "873 records, in-memory filter" },
  { metric: "getExercise", value: "~270 ms", note: "Fuzzy name lookup" },
  { metric: "muscleInfo", value: "~200 ms", note: "Slug reference + top exercises" },
  { metric: "workoutImage POST", value: "~320 ms", note: "3 exercises, session heatmap" },
  { metric: "Exercise GIF", value: "~330 ms", note: "~218 KB edge asset" },
  { metric: "SVG payload (raw)", value: "~54 KB", note: "Single-layer chest highlight" },
  { metric: "Edge network", value: "300+ POPs", note: "Cloudflare global CDN" },
  { metric: "CI health", value: "GitHub Actions", note: "Frontend + API checks on main" },
];

export const HERO_PERF_TAGLINE = "Sub-5ms server render · ~280ms cold RTT · edge-cached SVGs";

/** Live browser tests — must hit api.anatome.dev only */
export const LIVE_MEASURE_TESTS = [
  {
    id: "svg-cold",
    label: "SVG render (cold URL)",
    run: () => fetch(`${LIVE_API}/generateImage?layers=DC2626:chest&output=raw&probe=${Date.now()}`),
  },
  {
    id: "svg-cached",
    label: "SVG render (cached URL)",
    url: `${LIVE_API}/generateImage?layers=DC2626:chest&output=raw`,
    prime: true,
  },
  {
    id: "search",
    label: "searchExercises",
    run: () => fetch(`${LIVE_API}/searchExercises?q=bench&limit=5`),
  },
  {
    id: "muscle-info",
    label: "muscleInfo",
    run: () => fetch(`${LIVE_API}/muscleInfo?slug=chest`),
  },
  {
    id: "exercise-gif",
    label: "exerciseGif",
    run: () => fetch(`${LIVE_API}/exerciseGif?id=Barbell_Bench_Press_-_Medium_Grip`),
  },
];
