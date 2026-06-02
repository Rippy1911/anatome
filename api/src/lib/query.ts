// GET query -> render payload. Ported from generateImage's payloadFromQuery /
// parseCompactLayers. Preserves the compact layer encoding used by embedded
// <img src> URLs in the wild: COLOR[@OPACITY]:m1,m2|COLOR:m3
import type { RenderPayload, RenderLayer } from "./muscleEngine.ts";

export function parseCompactLayers(str: string): RenderLayer[] {
  if (!str) return [];
  return str.split("|").map((layerStr) => {
    const idx = layerStr.indexOf(":");
    const colorPart = idx === -1 ? layerStr : layerStr.slice(0, idx);
    const musclesPart = idx === -1 ? "" : layerStr.slice(idx + 1);
    const [colorRaw, opacityStr] = colorPart.split("@");
    let color = colorRaw;
    if (/^[0-9a-fA-F]{3,8}$/.test(colorRaw)) color = "#" + colorRaw;
    const muscles = (musclesPart || "").split(",").map((s) => s.trim()).filter(Boolean);
    const layer: RenderLayer = { color, muscles };
    if (opacityStr) layer.opacity = parseFloat(opacityStr);
    return layer;
  }).filter((l) => (l.muscles || []).length > 0);
}

function decodeB64Json(b64: string): unknown {
  try { return JSON.parse(atob(b64)); } catch { return undefined; }
}

export interface QueryPayload extends RenderPayload {
  format?: string;
  output?: string;
}

export function payloadFromQuery(url: URL): QueryPayload {
  const q = url.searchParams;
  const p: QueryPayload = {};
  if (q.get("gender")) p.gender = q.get("gender") as string;
  if (q.get("view")) p.view = q.get("view") as string;
  if (q.get("width")) p.width = Number(q.get("width"));
  if (q.get("height")) p.height = Number(q.get("height"));
  if (q.get("background")) p.background = q.get("background") as string;
  if (q.get("body_color")) p.body_color = q.get("body_color") as string;
  if (q.get("border_color")) p.border_color = q.get("border_color") as string;
  if (q.get("border_width")) p.border_width = Number(q.get("border_width"));
  if (q.get("format")) p.format = q.get("format") as string;
  if (q.get("output")) p.output = q.get("output") as string;
  if (q.get("defs")) { const d = decodeB64Json(q.get("defs") as string); if (d) p.defs = d as unknown[]; }
  if (q.get("per_muscle")) { const pm = decodeB64Json(q.get("per_muscle") as string); if (pm) p.per_muscle = pm as Record<string, unknown>; }
  // Backwards compat: flat muscles param
  if (q.get("muscles")) {
    p.layers = [{ color: q.get("color") || "#DC2626", muscles: (q.get("muscles") as string).split(",").map((s) => s.trim()).filter(Boolean) }];
  }
  // Compact layers param wins if present
  if (q.get("layers")) p.layers = parseCompactLayers(q.get("layers") as string);
  return p;
}

export async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
