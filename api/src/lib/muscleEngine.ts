// Pure SVG muscle renderer. No platform deps — template-literal string generation.
// Ported faithfully from the Base44 frontend (src/lib/muscleEngine.js).
// Body path data is passed in (loaded from the bundled bodyPaths.json) to keep
// this dependency-free.

import { WRAPPER } from "../data/bodyWrappers.ts";
import { MUSCLES, ANATOMICAL_NAMES, normalizeSlug } from "../data/muscleCatalog.ts";

export interface BodyPart {
  slug: string;
  path?: { common?: string[]; left?: string[]; right?: string[] };
}
export interface SideData {
  front: BodyPart[];
  back: BodyPart[];
}
export interface BodyData {
  male: SideData;
  female: SideData;
}

export interface RenderLayer {
  color?: string;
  opacity?: number;
  stroke?: string;
  strokeWidth?: number;
  muscles?: string[];
}
export interface RenderPayload {
  gender?: string;
  view?: string;
  width?: number;
  height?: number;
  background?: string;
  body_color?: string;
  border_color?: string;
  border_width?: number;
  layers?: RenderLayer[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  per_muscle?: Record<string, any>;
  side_filter?: Record<string, "left" | "right">;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defs?: any[];
}

interface ResolvedStyle {
  fill?: string;
  opacity?: number;
  stroke?: string;
  strokeWidth?: number;
}

const DEFAULTS = {
  gender: "male",
  view: "dual",
  width: 768,
  height: 1024,
  background: "transparent",
  body_color: "#282828",
  border_color: "#dfdfdf",
  border_width: 1.5,
};

function esc(s: unknown): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Build a resolution map: slug -> { fill, opacity, stroke, strokeWidth }
function buildResolution(payload: RenderPayload): Record<string, ResolvedStyle> {
  const res: Record<string, ResolvedStyle> = {};
  const layers = Array.isArray(payload.layers) ? payload.layers : [];
  // layers: last-wins
  layers.forEach((layer) => {
    const color = layer.color;
    const op = layer.opacity != null ? layer.opacity : 1;
    (layer.muscles || []).forEach((m) => {
      const slug = normalizeSlug(m);
      res[slug] = { fill: color, opacity: op, stroke: layer.stroke, strokeWidth: layer.strokeWidth };
    });
  });
  // per_muscle overrides (highest priority)
  const pm = payload.per_muscle || {};
  Object.keys(pm).forEach((m) => {
    const slug = normalizeSlug(m);
    const o = pm[m] || {};
    res[slug] = {
      fill: o.fill != null ? o.fill : (res[slug] && res[slug].fill),
      opacity: o.opacity != null ? o.opacity : (res[slug] ? res[slug].opacity : 1),
      stroke: o.stroke != null ? o.stroke : (res[slug] && res[slug].stroke),
      strokeWidth: o.strokeWidth != null ? o.strokeWidth : (res[slug] && res[slug].strokeWidth),
    };
  });
  return res;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defsBlock(defs: any[]): string {
  if (!Array.isArray(defs) || defs.length === 0) return "";
  const parts = defs.map((d) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stops = (d.stops || []).map((s: any) =>
      `<stop offset="${esc(s.offset)}" stop-color="${esc(s.color)}"${s.opacity != null ? ` stop-opacity="${s.opacity}"` : ""}/>`
    ).join("");
    if (d.type === "linearGradient") {
      const coords = `${d.x1 != null ? ` x1="${esc(d.x1)}"` : ""}${d.y1 != null ? ` y1="${esc(d.y1)}"` : ""}${d.x2 != null ? ` x2="${esc(d.x2)}"` : ""}${d.y2 != null ? ` y2="${esc(d.y2)}"` : ""}`;
      return `<linearGradient id="${esc(d.id)}"${coords}>${stops}</linearGradient>`;
    }
    if (d.type === "radialGradient") {
      return `<radialGradient id="${esc(d.id)}">${stops}</radialGradient>`;
    }
    return "";
  });
  return `<defs>${parts.join("")}</defs>`;
}

// Render the muscle paths for a single side (front/back) of one gender.
// The body outline (contour) is drawn first, behind the muscles, stroked with
// the border color and fill none — this is the silhouette that fills the gaps
// between muscle shapes. Without it the muscles float on the raw background
// (the contour-vs-border regression). Ported from the original library's
// SvgMaleWrapper/SvgFemaleWrapper which render the outline path before children.
function renderSide(
  parts: BodyPart[],
  res: Record<string, ResolvedStyle>,
  opts: typeof DEFAULTS,
  sideFilter: Record<string, "left" | "right"> | null,
  transform: string | null,
  outline: string,
): { svg: string; rendered: string[] } {
  const { body_color, border_color, border_width } = opts;
  const rendered = new Set<string>();
  const out: string[] = [];

  // Body contour: stroked silhouette behind the muscles (fill none).
  if (outline) {
    out.push(
      `<path d="${outline}" fill="none" stroke="${esc(border_color)}" stroke-width="${border_width}" stroke-linecap="butt" data-contour="body"/>`
    );
  }

  (parts || []).forEach((part) => {
    const slug = part.slug;
    const style = res[slug];
    const filterSide = sideFilter && sideFilter[slug]; // "left" | "right"
    const path = part.path || {};

    const emit = (d: string, whichSide: "common" | "left" | "right") => {
      let fill: string = body_color;
      let opacity = 1;
      let stroke: string = border_color;
      let strokeWidth: number = border_width;
      if (style && style.fill != null) {
        // Apply highlight, unless side_filter excludes this side
        if (!filterSide || filterSide === whichSide || whichSide === "common") {
          fill = style.fill;
          if (style.opacity != null) opacity = style.opacity;
          if (style.stroke != null) stroke = style.stroke;
          if (style.strokeWidth != null) strokeWidth = style.strokeWidth;
        }
      }
      if (MUSCLES.includes(slug) || style) rendered.add(slug);
      out.push(
        `<path d="${d}" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${strokeWidth}" opacity="${opacity}" data-muscle="${esc(slug)}"/>`
      );
    };

    (path.common || []).forEach((d) => emit(d, "common"));
    (path.left || []).forEach((d) => emit(d, "left"));
    (path.right || []).forEach((d) => emit(d, "right"));
  });

  const g = transform ? `<g transform="${transform}">${out.join("")}</g>` : out.join("");
  return { svg: g, rendered: Array.from(rendered) };
}

/**
 * renderMuscleSvg(payload, bodyData)
 * bodyData: { male: { front: [...], back: [...] }, female: {...} }
 */
export function renderMuscleSvg(
  payload: RenderPayload = {},
  bodyData: BodyData,
): { svg: string; muscles_rendered: string[] } {
  const p = { ...DEFAULTS, ...payload } as typeof DEFAULTS & RenderPayload;
  const gender: "male" | "female" = p.gender === "female" ? "female" : "male";
  const view = ["front", "back", "dual"].includes(p.view as string) ? (p.view as string) : "dual";
  const data: SideData = (bodyData && bodyData[gender]) || { front: [], back: [] };

  const res = buildResolution(p);
  const sideFilter = p.side_filter || null;

  const wf = WRAPPER[gender].front;
  const wb = WRAPPER[gender].back;

  let inner = "";
  const renderedSet = new Set<string>();
  let viewBox: string;

  const collect = (r: { rendered: string[] }) => r.rendered.forEach((s) => renderedSet.add(s));

  if (view === "front") {
    const r = renderSide(data.front, res, p, sideFilter, null, wf.outline);
    inner = r.svg; collect(r);
    viewBox = wf.viewBox;
  } else if (view === "back") {
    const r = renderSide(data.back, res, p, sideFilter, null, wb.outline);
    inner = r.svg; collect(r);
    viewBox = wb.viewBox;
  } else {
    // dual: front on left, back on right, side by side.
    const rf = renderSide(data.front, res, p, sideFilter, null, wf.outline);
    const backShift = 724; // front width in user units
    const rb = renderSide(data.back, res, p, sideFilter, `translate(${backShift - 724}, 0)`, wb.outline);
    collect(rf); collect(rb);
    inner = `${rf.svg}${rb.svg}`;
    viewBox = `0 0 1448 1448`;
  }

  const defs = defsBlock(p.defs as unknown[] as any[]);
  const bg = p.background && p.background !== "transparent"
    ? `<rect x="-99999" y="-99999" width="199998" height="199998" fill="${esc(p.background)}"/>`
    : "";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${p.width}" height="${p.height}" preserveAspectRatio="xMidYMid meet">` +
    defs + bg + inner +
    `</svg>`;

  return { svg, muscles_rendered: Array.from(renderedSet).filter((s) => MUSCLES.includes(s)) };
}

export function listMuscles(): { slug: string; name: string }[] {
  return MUSCLES.map((slug) => ({ slug, name: ANATOMICAL_NAMES[slug] }));
}

export function getAnatomicalName(slug: string): string {
  return ANATOMICAL_NAMES[slug] || slug;
}
