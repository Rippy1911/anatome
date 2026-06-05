// Opaque pagination cursor for searchExercises / MCP search_exercises.

import type { SearchParams } from "./exercises.ts";

export interface SearchCursorState {
  q?: string;
  muscle?: string;
  equipment?: string;
  level?: string;
  offset: number;
}

export function encodeSearchCursor(state: SearchCursorState): string {
  const json = JSON.stringify(state);
  const b64 = btoa(json);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSearchCursor(cursor: string): SearchCursorState | null {
  try {
    const trimmed = String(cursor || "").trim();
    if (!trimmed) return null;
    const padLen = (4 - (trimmed.length % 4)) % 4;
    const padded = trimmed.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLen);
    const parsed = JSON.parse(atob(padded)) as SearchCursorState;
    if (typeof parsed.offset !== "number" || parsed.offset < 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Merge cursor with explicit query params (cursor wins when present). */
export function resolveSearchParams(params: SearchParams & { cursor?: string | null }): SearchParams {
  if (!params.cursor) return params;
  const decoded = decodeSearchCursor(params.cursor);
  if (!decoded) return params;
  return {
    q: decoded.q ?? params.q,
    muscle: decoded.muscle ?? params.muscle,
    equipment: decoded.equipment ?? params.equipment,
    level: decoded.level ?? params.level,
    limit: params.limit,
    offset: decoded.offset,
  };
}

export function buildNextSearchCursor(
  params: SearchParams,
  offset: number,
  limit: number,
  total: number,
): string | null {
  const next = offset + limit;
  if (next >= total) return null;
  const key = String(params.q || "").trim();
  return encodeSearchCursor({
    q: key || undefined,
    muscle: params.muscle && params.muscle !== "any" ? String(params.muscle) : undefined,
    equipment: params.equipment && params.equipment !== "any" ? String(params.equipment) : undefined,
    level: params.level && params.level !== "any" ? String(params.level) : undefined,
    offset: next,
  });
}
