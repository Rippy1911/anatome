/** High-resolution elapsed milliseconds (≥1 so zero never appears in benchmarks). */
export function elapsedMs(start: number): number {
  return Math.max(1, Math.round(performance.now() - start));
}

export function renderTimingHeaders(ms: number): Record<string, string> {
  return { "X-Render-Ms": String(ms), "Server-Timing": `render;dur=${ms}` };
}
