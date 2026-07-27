// Bundled skill-progression catalog (CC-BY-4.0), mirroring the layout of the
// upstream content repo at _content/calisthenics/catalog.
//
// Imported statically rather than served through the ASSETS binding: the whole
// catalog is ~268 KB of JSON that every guide response reshapes (attribution,
// derived counts, anatome_imageSrc). ASSETS would add a subrequest per call for
// data that is smaller than the exercise bundle already compiled in. See
// ../../data/README.md.

import calisthenicsIndex from "../../data/guides/calisthenics/index.json" assert { type: "json" };
import backLever from "../../data/guides/calisthenics/back-lever.json" assert { type: "json" };
import dragonFlag from "../../data/guides/calisthenics/dragon-flag.json" assert { type: "json" };
import elbowLever from "../../data/guides/calisthenics/elbow-lever.json" assert { type: "json" };
import foundations from "../../data/guides/calisthenics/foundations.json" assert { type: "json" };
import frontLever from "../../data/guides/calisthenics/front-lever.json" assert { type: "json" };
import handstand from "../../data/guides/calisthenics/handstand.json" assert { type: "json" };
import hangingLegRaise from "../../data/guides/calisthenics/hanging-leg-raise.json" assert { type: "json" };
import humanFlag from "../../data/guides/calisthenics/human-flag.json" assert { type: "json" };
import mobilityFundamentals from "../../data/guides/calisthenics/mobility-fundamentals.json" assert { type: "json" };
import muscleUp from "../../data/guides/calisthenics/muscle-up.json" assert { type: "json" };
import nordicCurl from "../../data/guides/calisthenics/nordic-curl.json" assert { type: "json" };
import oneArmPullUp from "../../data/guides/calisthenics/one-arm-pull-up.json" assert { type: "json" };
import oneArmPushUp from "../../data/guides/calisthenics/one-arm-push-up.json" assert { type: "json" };
import pistolSquat from "../../data/guides/calisthenics/pistol-squat.json" assert { type: "json" };
import planche from "../../data/guides/calisthenics/planche.json" assert { type: "json" };
import planchePushUp from "../../data/guides/calisthenics/planche-push-up.json" assert { type: "json" };
import shrimpSquat from "../../data/guides/calisthenics/shrimp-squat.json" assert { type: "json" };
import skinTheCat from "../../data/guides/calisthenics/skin-the-cat.json" assert { type: "json" };
import vSitManna from "../../data/guides/calisthenics/v-sit-manna.json" assert { type: "json" };

export interface GuideTreeSummary {
  slug: string;
  name: string;
  difficulty: string;
  family: string;
  group?: string;
}

export interface GuideIndexDoc {
  schema_version: number;
  kind: string;
  name: string;
  summary: string;
  trees: GuideTreeSummary[];
  difficulty_order: string[];
  license: string;
  sources_legend?: Record<string, string>;
}

export interface GuideStep {
  id: string;
  order: number;
  name: string;
  level?: string;
  intent?: string;
  cues?: string[];
  common_faults?: string[];
  drills?: unknown[];
  exercise_refs?: unknown[];
  programming?: Record<string, unknown>;
  unlock?: Record<string, unknown>;
  media?: unknown[];
}

export interface GuideTreeDoc {
  schema_version: number;
  kind: string;
  slug: string;
  name: string;
  family: string;
  difficulty: string;
  summary: string;
  prerequisites?: string[];
  primary_muscles?: string[];
  secondary_muscles?: string[];
  anatome_layers_payload?: { color: string; muscles: string[] }[];
  steps: GuideStep[];
  license?: string;
  attribution?: string;
}

export interface Guide {
  slug: string;
  index: GuideIndexDoc;
  trees: Record<string, GuideTreeDoc>;
}

const calisthenicsTrees = {
  "back-lever": backLever,
  "dragon-flag": dragonFlag,
  "elbow-lever": elbowLever,
  "foundations": foundations,
  "front-lever": frontLever,
  "handstand": handstand,
  "hanging-leg-raise": hangingLegRaise,
  "human-flag": humanFlag,
  "mobility-fundamentals": mobilityFundamentals,
  "muscle-up": muscleUp,
  "nordic-curl": nordicCurl,
  "one-arm-pull-up": oneArmPullUp,
  "one-arm-push-up": oneArmPushUp,
  "pistol-squat": pistolSquat,
  "planche": planche,
  "planche-push-up": planchePushUp,
  "shrimp-squat": shrimpSquat,
  "skin-the-cat": skinTheCat,
  "v-sit-manna": vSitManna,
} as unknown as Record<string, GuideTreeDoc>;

/** Every bundled guide, keyed by guide slug. */
export const GUIDES: Record<string, Guide> = {
  calisthenics: {
    slug: "calisthenics",
    index: calisthenicsIndex as unknown as GuideIndexDoc,
    trees: calisthenicsTrees,
  },
};

export const GUIDE_SLUGS = Object.keys(GUIDES);

/** Default guide for single-argument lookups (`/getGuideTree?tree=planche`). */
export const DEFAULT_GUIDE_SLUG = "calisthenics";
