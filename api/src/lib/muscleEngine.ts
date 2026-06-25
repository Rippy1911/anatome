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
  // Body contour (silhouette behind the muscles):
  //   "on"     — fill with contour_color + stroke contour_stroke (default; POC look)
  //   "stroke" — outline only (fill none; upstream react-native-body-highlighter look)
  //   "off"    — do not render the contour (muscles float on the background)
  contour?: string;
  contour_color?: string;   // fill of the contour; defaults to body_color
  contour_stroke?: string;  // stroke of the contour; defaults to border_color
  contour_width?: number;   // stroke width; defaults to border_width
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
  // Option C from the palette showcase, tuned: dark-ish muscles (#777777) on a
  // light body silhouette (#e5e7eb contour fill). Keeping muscle fill distinct
  // from the contour fill is what gives un-highlighted muscles visible
  // definition — the previous body_color=#282828 + contour filled with
  // body_color merged into one blob.
  body_color: "#575757",
  border_color: "#c8c8c8",
  border_width: 2,
  contour: "on",
  // Dedicated contour defaults (previously undefined → silently fell back to
  // body_color/border_color, so the contour had no independent default).
  contour_color: "#e5e7eb",
  contour_stroke: "#dadada",
  contour_width: 2,
};

function esc(s: unknown): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Coerce an arbitrary client-supplied value to a safe integer in [min, max],
// falling back to `fallback` when the value is missing/NaN/out of range.
// Used for every numeric attribute interpolated into the SVG markup without
// esc() (width, height, stroke-width, opacity, etc.) — strings like
// `100" onload="alert(1)` are rejected, closing the attribute-breakout vector.
function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

// Coerce an arbitrary client-supplied value to a finite number in [min, max],
// falling back to `fallback` when missing/NaN/out of range. Used for fractional
// SVG attributes (opacity) that must not be rounded.
function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
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
  const { body_color, border_color, border_width, contour, contour_color, contour_stroke, contour_width } = opts;
  const rendered = new Set<string>();
  const out: string[] = [];

  // Body contour: the silhouette drawn behind the muscles.
  //   contour="on"     -> fill=contour_color + stroke (default; dark muscles on
  //                       a light body silhouette — Option C of the showcase)
  //   contour="stroke" -> fill=none + stroke (upstream react-native-body-highlighter look)
  //   contour="off"    -> skip entirely (muscles float on the background)
  // contour_color/stroke/width have their own defaults (#e5e7eb / #dfdfdf / 2);
  // the || fallbacks only kick in if a caller explicitly passes an empty value.
  if (outline && contour !== "off") {
    const cFill = contour === "stroke" ? "none" : (contour_color || body_color);
    const cStroke = contour_stroke || border_color;
    const cWidth = contour_width != null ? contour_width : border_width;
    out.push(
      `<path d="${outline}" fill="${esc(cFill)}" stroke="${esc(cStroke)}" stroke-width="${cWidth}" stroke-linecap="butt" data-contour="body"/>`
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
  // Sanitize every numeric attribute that is interpolated into the SVG markup
  // without esc() (width/height/stroke-width/opacity/contour_width). The POST
  // path passes the raw JSON body straight through, so these can be arbitrary
  // strings — coerce to safe bounded numbers to prevent attribute breakout.
  // (An-M1: width/height were live-confirmed; the rest are the same class.)
  p.width = clampInt(p.width, 1, 4096, DEFAULTS.width);
  p.height = clampInt(p.height, 1, 4096, DEFAULTS.height);
  p.border_width = clampNum(p.border_width, 0, 100, DEFAULTS.border_width);
  if (p.contour_width != null) p.contour_width = clampNum(p.contour_width, 0, 100, DEFAULTS.border_width);
  if (Array.isArray(p.layers)) {
    p.layers = p.layers.map((layer) => ({
      ...layer,
      strokeWidth: layer.strokeWidth != null ? clampNum(layer.strokeWidth, 0, 100, 1) : layer.strokeWidth,
      opacity: layer.opacity != null ? clampNum(layer.opacity, 0, 1, 1) : layer.opacity,
    }));
  }
  if (p.per_muscle) {
    p.per_muscle = Object.fromEntries(
      Object.entries(p.per_muscle).map(([k, o]) => [k, {
        ...(o as Record<string, unknown>),
        strokeWidth: o && (o as { strokeWidth?: unknown }).strokeWidth != null
          ? clampNum((o as { strokeWidth?: unknown }).strokeWidth, 0, 100, 1)
          : (o as { strokeWidth?: unknown }).strokeWidth,
        opacity: o && (o as { opacity?: unknown }).opacity != null
          ? clampNum((o as { opacity?: unknown }).opacity, 0, 1, 1)
          : (o as { opacity?: unknown }).opacity,
      }]),
    );
  }
  if (Array.isArray(p.defs)) {
    p.defs = p.defs.map((d) => {
      const def = d as { stops?: { opacity?: unknown }[] };
      if (Array.isArray(def.stops)) {
        def.stops = def.stops.map((s) => ({
          ...s,
          opacity: s.opacity != null ? clampNum(s.opacity, 0, 1, 1) : s.opacity,
        }));
      }
      return def;
    });
  }
  const gender: "male" | "female" = p.gender === "female" ? "female" : "male";
  const view = ["front", "back", "dual"].includes(p.view as string) ? (p.view as string) : "dual";
  const contour = ["on", "off", "stroke"].includes(p.contour as string) ? (p.contour as string) : "on";
  p.contour = contour;
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
