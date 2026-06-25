// Pure SVG muscle renderer. No React. No npm deps. Template-literal string generation.
// Body path data is passed in (loaded from BodyData entity) to keep this dependency-free.

import { WRAPPER } from "@/data/bodyWrappers";
import { MUSCLES, ANATOMICAL_NAMES, normalizeSlug, ATTRIBUTION } from "@/data/muscleCatalog";

const DEFAULTS = {
  gender: "male",
  view: "dual",
  width: 768,
  height: 1024,
  background: "transparent",
  // Option C from the palette showcase, tuned: dark-ish muscles (#777777) on a
  // light body silhouette (#e5e7eb contour fill). Muscle fill distinct from
  // contour fill gives un-highlighted muscles visible definition.
  body_color: "#777777",
  border_color: "#c8c8c8",
  border_width: 2,
  contour: "on",
  contour_color: "#e5e7eb",
  contour_stroke: "#dadada",
  contour_width: 2,
};

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Build a resolution map: slug -> { fill, opacity, stroke, strokeWidth }
function buildResolution(payload) {
  const res = {};
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

function defsBlock(defs) {
  if (!Array.isArray(defs) || defs.length === 0) return "";
  const parts = defs.map((d) => {
    const stops = (d.stops || []).map((s) =>
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
// `offsetX` shifts the group for dual layout. The body outline (contour) is
// drawn first, behind the muscles — without it the muscles float on the raw
// background (the contour-vs-border regression). Ported from the original
// library's SvgMaleWrapper/SvgFemaleWrapper which render the outline path
// before children.
function renderSide(parts, res, opts, sideFilter, transform, outline) {
  const { body_color, border_color, border_width, contour, contour_color, contour_stroke, contour_width } = opts;
  const rendered = new Set();
  const out = [];

  // Body contour: silhouette behind the muscles.
  //   contour="on"     -> fill=contour_color + stroke (default; dark muscles on
  //                       a light body silhouette — Option C of the showcase)
  //   contour="stroke" -> fill=none + stroke (upstream look)
  //   contour="off"    -> skip (muscles float on the background)
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

  parts.forEach((part) => {
    const slug = part.slug;
    const style = res[slug];
    const filterSide = sideFilter && sideFilter[slug]; // "left" | "right"
    const path = part.path || {};

    const emit = (d, whichSide) => {
      let fill = body_color;
      let opacity = 1;
      let stroke = border_color;
      let strokeWidth = border_width;
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
export function renderMuscleSvg(payload = {}, bodyData) {
  const p = { ...DEFAULTS, ...payload };
  const gender = p.gender === "female" ? "female" : "male";
  const view = ["front", "back", "dual"].includes(p.view) ? p.view : "dual";
  const contour = ["on", "off", "stroke"].includes(p.contour) ? p.contour : "on";
  p.contour = contour;
  const data = (bodyData && bodyData[gender]) || { front: [], back: [] };

  const res = buildResolution(p);
  const sideFilter = p.side_filter || null;

  const wf = WRAPPER[gender].front;
  const wb = WRAPPER[gender].back;

  let inner = "";
  let renderedSet = new Set();
  let viewBox;

  const collect = (r) => r.rendered.forEach((s) => renderedSet.add(s));

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
    // back's viewBox starts at its own x-offset; place it next to front.
    const backShift = 724; // front width in user units
    const rb = renderSide(data.back, res, p, sideFilter, `translate(${backShift - 724}, 0)`, wb.outline);
    collect(rf); collect(rb);
    inner = `${rf.svg}${rb.svg}`;
    viewBox = `0 0 1448 1448`;
  }

  const defs = defsBlock(p.defs);
  const bg = p.background && p.background !== "transparent"
    ? `<rect x="-99999" y="-99999" width="199998" height="199998" fill="${esc(p.background)}"/>`
    : "";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${p.width}" height="${p.height}" preserveAspectRatio="xMidYMid meet">` +
    defs + bg + inner +
    `</svg>`;

  return { svg, muscles_rendered: Array.from(renderedSet).filter((s) => MUSCLES.includes(s)) };
}

export function listMuscles() {
  return MUSCLES.map((slug) => ({ slug, name: ANATOMICAL_NAMES[slug] }));
}

export function getAnatomicalName(slug) {
  return ANATOMICAL_NAMES[slug] || slug;
}

export { ATTRIBUTION };