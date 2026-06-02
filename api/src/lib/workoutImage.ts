// Session heatmap: stack muscle activation across multiple exercises into one SVG.

import { PALETTE, normalizeSlug } from "../data/muscleCatalog.ts";
import { renderMuscleSvg, type BodyData, type RenderPayload } from "./muscleEngine.ts";
import { resolveExercise, type Resolved } from "./exercises.ts";

const HEAT_COLOR = PALETTE.primary;

function countToOpacity(hits: number): number {
  if (hits >= 3) return 1;
  if (hits === 2) return 0.65;
  if (hits === 1) return 0.4;
  return 0;
}

export interface WorkoutImageParams {
  exercises?: string[];
  gender?: string;
  view?: string;
  width?: number;
  height?: number;
}

export interface WorkoutExerciseSummary {
  input: string;
  exercise: string;
  matched: boolean;
  source: string;
}

export interface WorkoutImageResult {
  svg: string;
  muscles_hit: string[];
  per_muscle_count: Record<string, number>;
  exercises_resolved: WorkoutExerciseSummary[];
  gender: string;
  view: string;
}

function stackMuscleCounts(resolved: Resolved[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of resolved) {
    if (!r.matched) continue;
    for (const layer of r.layers) {
      for (const m of layer.muscles) {
        const slug = normalizeSlug(m);
        counts[slug] = (counts[slug] || 0) + 1;
      }
    }
  }
  return counts;
}

function buildRenderPayload(
  counts: Record<string, number>,
  params: WorkoutImageParams,
): RenderPayload {
  const slugs = Object.keys(counts);
  const per_muscle: Record<string, { fill: string; opacity: number }> = {};
  for (const slug of slugs) {
    per_muscle[slug] = { fill: HEAT_COLOR, opacity: countToOpacity(counts[slug]) };
  }
  const payload: RenderPayload = {
    gender: params.gender === "female" ? "female" : "male",
    view: ["front", "back", "dual"].includes(String(params.view || "")) ? params.view : "dual",
    layers: slugs.length ? [{ color: HEAT_COLOR, muscles: slugs }] : [],
    per_muscle,
  };
  if (params.width) payload.width = params.width;
  if (params.height) payload.height = params.height;
  return payload;
}

/** Build a shareable GET URL for the same render (per_muscle encoded as base64 JSON). */
export function workoutImageSrc(payload: RenderPayload, base: string): string | null {
  const layers = payload.layers || [];
  const slugs = layers.flatMap((l) => l.muscles || []);
  if (!slugs.length) return null;

  const compact = layers.map((l) => {
    const hex = String(l.color || HEAT_COLOR).replace("#", "");
    return `${hex}:${(l.muscles || []).join(",")}`;
  }).join("|");

  const gender = payload.gender === "female" ? "female" : "male";
  const view = payload.view || "dual";
  const qs = new URLSearchParams({
    gender,
    view: String(view),
    layers: compact,
    output: "raw",
  });
  if (payload.per_muscle && Object.keys(payload.per_muscle).length) {
    qs.set("per_muscle", btoa(JSON.stringify(payload.per_muscle)));
  }
  return `${base}/generateImage?${qs.toString()}`;
}

export function workoutImageLogic(
  params: WorkoutImageParams,
  bodyData: BodyData,
): WorkoutImageResult {
  const names = Array.isArray(params.exercises)
    ? params.exercises.map((e) => String(e || "").trim()).filter(Boolean)
    : [];

  const resolved = names.map((input) => ({ input, result: resolveExercise(input) }));
  const counts = stackMuscleCounts(resolved.map((r) => r.result));
  const renderPayload = buildRenderPayload(counts, params);
  const { svg } = renderMuscleSvg(renderPayload, bodyData);

  return {
    svg,
    muscles_hit: Object.keys(counts).sort(),
    per_muscle_count: counts,
    exercises_resolved: resolved.map(({ input, result }) => ({
      input,
      exercise: result.exercise,
      matched: result.matched,
      source: result.source,
    })),
    gender: renderPayload.gender as string,
    view: renderPayload.view as string,
  };
}
