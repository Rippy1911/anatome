// Bundled body-path data (replaces the Base44 BodyData entity / loadBody()).
// The JSON is exported once from the live Base44 instance — see ../../data/README.md.
// Shape mirrors getBodyData's `.data`: { gender: { side: BodyPart[] } }.

import bodyPaths from "../../data/bodyPaths.json" assert { type: "json" };
import type { BodyData } from "./muscleEngine.ts";

export function getBodyData(): BodyData {
  return bodyPaths as unknown as BodyData;
}

/** True when the bundle has real data (used by selfTest to flag missing export). */
export function hasBodyData(): boolean {
  const d = getBodyData();
  return Boolean(
    (d?.male?.front?.length || d?.male?.back?.length) &&
    (d?.female?.front?.length || d?.female?.back?.length),
  );
}
