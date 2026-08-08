// Inline SVG charts for the view page.
//
// No chart library, no script tag, no external request — the page a user might forward to a
// coach should render on a locked-down network and must not tell a CDN that they opened it.
// That rules out every JS charting library, which is fine: these are three chart forms.
//
// Design decisions taken from the data-viz procedure, in its order:
//
//   1. Form follows the job. Calories-per-day and weekly-volume are magnitude over time → bars.
//      Body weight is change over time → a line with markers. Today-against-goal is a single
//      number per macro → stat tiles, not a chart, because a four-slice donut of "protein so
//      far" is decoration.
//   2. Every chart here is ONE series, so none carries a legend: the title names it. Colour is
//      identity only where two things must be told apart (bar vs goal line), and never encodes
//      the value.
//   3. Palette validated with the skill's validator, both modes:
//        light #2a78d6,#eb6834,#1baf7a — all checks pass
//        dark  #3987e5,#d95926,#199e70 — all checks pass
//      Light aqua warns on contrast (2.74:1), which obliges visible labels or a table view.
//      Both are present: every chart is direct-labelled and the page lists the rows underneath.
//   4. Marks: 2px lines, 8px markers, 4px rounded bar tops anchored to the baseline, a 2px gap
//      between bars, recessive grid.
//   5. Hover: each mark carries a <title>, which is the browser's own tooltip — no JS. That is
//      a deliberate ceiling, not an oversight: a crosshair layer needs script, and script here
//      would cost more than it returns. (ponytail: upgrade path is a <script> in this file if
//      anyone ever wants the crosshair.)
//   6. Text never wears the series colour; values and labels stay in ink tokens.

export interface Point {
  label: string;   // x tick, already short ("3 Aug")
  value: number;
  title: string;   // hover text, the full sentence
}

const PAD = { top: 16, right: 12, bottom: 28, left: 40 };

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function niceCeiling(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

/** "No data yet" said once, in the same box a chart would occupy, so the layout does not jump. */
function emptyState(title: string, hint: string): string {
  return `<figure class="chart">
  <figcaption>${esc(title)}</figcaption>
  <div class="empty">${esc(hint)}</div>
</figure>`;
}

/**
 * Bars over time, with an optional target line.
 *
 * The target is a line rather than a second bar series: it is a reference value, not a
 * comparable quantity, and drawing it as bars would invite reading the gap as a stack.
 */
export function barChart(opts: {
  title: string;
  points: Point[];
  target?: number | null;
  targetLabel?: string;
  unit?: string;
  series?: 1 | 2 | 3;
}): string {
  const { title, points, target, targetLabel = "goal", unit = "" } = opts;
  if (!points.length) return emptyState(title, "Nothing logged in this window yet.");

  const w = 720, h = 220;
  const plotW = w - PAD.left - PAD.right;
  const plotH = h - PAD.top - PAD.bottom;
  const maxValue = Math.max(...points.map((p) => p.value), target ?? 0);
  const top = niceCeiling(maxValue);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  // 2px between bars: the spacer that keeps adjacent fills from reading as one block.
  const slot = plotW / points.length;
  const barW = Math.max(2, Math.min(46, slot - 2));
  const seriesVar = `var(--series-${opts.series ?? 1})`;

  const gridLines = [0, 0.5, 1].map((f) => {
    const gy = PAD.top + plotH - f * plotH;
    return `<line x1="${PAD.left}" y1="${gy}" x2="${w - PAD.right}" y2="${gy}" class="grid"/>`
      + `<text x="${PAD.left - 6}" y="${gy + 4}" class="tick" text-anchor="end">${Math.round(top * f)}</text>`;
  }).join("");

  // Label every bar when they fit, otherwise first/last/max only — never a number on every point.
  const labelEvery = points.length <= 10 ? 1 : Math.ceil(points.length / 7);
  const maxIndex = points.reduce((bi, p, i) => (p.value > points[bi].value ? i : bi), 0);

  const bars = points.map((p, i) => {
    const x = PAD.left + i * slot + (slot - barW) / 2;
    const barH = Math.max(p.value > 0 ? 2 : 0, PAD.top + plotH - y(p.value));
    const showLabel = i % labelEvery === 0 || i === maxIndex || i === points.length - 1;
    return `<g>
      <rect x="${x.toFixed(1)}" y="${(PAD.top + plotH - barH).toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="4" fill="${seriesVar}"><title>${esc(p.title)}</title></rect>
      ${showLabel ? `<text x="${(x + barW / 2).toFixed(1)}" y="${h - 10}" class="tick" text-anchor="middle">${esc(p.label)}</text>` : ""}
    </g>`;
  }).join("");

  const targetLine = target && target > 0
    ? `<line x1="${PAD.left}" y1="${y(target).toFixed(1)}" x2="${w - PAD.right}" y2="${y(target).toFixed(1)}" class="target"/>
       <text x="${w - PAD.right}" y="${(y(target) - 6).toFixed(1)}" class="target-label" text-anchor="end">${esc(targetLabel)} ${Math.round(target)}${esc(unit)}</text>`
    : "";

  return `<figure class="chart">
  <figcaption>${esc(title)}</figcaption>
  <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}" preserveAspectRatio="xMidYMid meet">
    ${gridLines}${targetLine}${bars}
  </svg>
</figure>`;
}

/** A single line over time. Markers are 8px so they are hoverable and visible at a glance. */
export function lineChart(opts: { title: string; points: Point[]; unit?: string; series?: 1 | 2 | 3 }): string {
  const { title, points, unit = "" } = opts;
  if (points.length < 2) {
    return emptyState(title, points.length ? "One entry so far — log another to see a trend." : "Nothing logged in this window yet.");
  }

  const w = 720, h = 220;
  const plotW = w - PAD.left - PAD.right;
  const plotH = h - PAD.top - PAD.bottom;
  const values = points.map((p) => p.value);
  // Weight moves in a narrow band; a zero-based axis would flatten every real change into a
  // straight line. Padded min/max instead, and the axis labels say what the band is.
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || 1;
  const yLo = lo - span * 0.2, yHi = hi + span * 0.2;
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - yLo) / (yHi - yLo)) * plotH;

  const grid = [yLo, (yLo + yHi) / 2, yHi].map((v) => {
    const gy = y(v);
    return `<line x1="${PAD.left}" y1="${gy.toFixed(1)}" x2="${w - PAD.right}" y2="${gy.toFixed(1)}" class="grid"/>`
      + `<text x="${PAD.left - 6}" y="${(gy + 4).toFixed(1)}" class="tick" text-anchor="end">${v.toFixed(1)}</text>`;
  }).join("");

  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const seriesVar = `var(--series-${opts.series ?? 1})`;

  // Only the endpoints get a number: labelling every marker is the classic unreadable line chart.
  const markers = points.map((p, i) => {
    const isEnd = i === 0 || i === points.length - 1;
    return `<g>
      <circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4" fill="${seriesVar}" class="marker"><title>${esc(p.title)}</title></circle>
      ${isEnd ? `<text x="${x(i).toFixed(1)}" y="${(y(p.value) - 10).toFixed(1)}" class="point-label" text-anchor="${i === 0 ? "start" : "end"}">${p.value}${esc(unit)}</text>` : ""}
    </g>`;
  }).join("");

  return `<figure class="chart">
  <figcaption>${esc(title)}</figcaption>
  <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}" preserveAspectRatio="xMidYMid meet">
    ${grid}
    <path d="${d}" fill="none" stroke="${seriesVar}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${markers}
    <text x="${PAD.left}" y="${h - 10}" class="tick">${esc(points[0].label)}</text>
    <text x="${w - PAD.right}" y="${h - 10}" class="tick" text-anchor="end">${esc(points[points.length - 1].label)}</text>
  </svg>
</figure>`;
}

/**
 * A headline number with its target. Not a chart — the data's job here is one value, and the
 * form heuristic says a stat tile beats a plot for that.
 */
export function statTile(opts: {
  label: string; value: number; target?: number | null; unit?: string;
}): string {
  const { label, value, target, unit = "" } = opts;
  const pct = target && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : null;
  const remaining = target && target > 0 ? Math.round(target - value) : null;
  return `<div class="tile">
  <div class="tile-label">${esc(label)}</div>
  <div class="tile-value">${Math.round(value)}<span class="tile-unit">${esc(unit)}</span></div>
  ${target && target > 0
    ? `<div class="meter" role="img" aria-label="${pct}% of ${Math.round(target)}${esc(unit)}"><span style="width:${pct}%"></span></div>
       <div class="tile-sub">${remaining! >= 0 ? `${remaining} ${esc(unit)} left of ${Math.round(target)}` : `${Math.abs(remaining!)} ${esc(unit)} over ${Math.round(target)}`}</div>`
    : `<div class="tile-sub">no goal set</div>`}
</div>`;
}
