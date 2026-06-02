// Single source of truth for muscle slugs, anatomical names, side presence, and the exercise map.
// Slug naming follows HichamELBSI/react-native-body-highlighter exactly (do not rename).

export const MUSCLES = [
  "abs", "adductors", "ankles", "biceps", "calves", "chest", "deltoids",
  "feet", "forearm", "gluteal", "hamstring", "hands", "hair", "head",
  "knees", "lower-back", "neck", "obliques", "quadriceps", "tibialis",
  "trapezius", "triceps", "upper-back",
];

export const ANATOMICAL_NAMES = {
  abs: "Rectus Abdominis",
  adductors: "Adductor Group",
  ankles: "Ankles",
  biceps: "Biceps Brachii",
  calves: "Gastrocnemius / Soleus",
  chest: "Pectoralis Major",
  deltoids: "Deltoids",
  feet: "Feet",
  forearm: "Forearm Flexors / Extensors",
  gluteal: "Gluteus Maximus / Medius",
  hamstring: "Hamstrings",
  hands: "Hands",
  hair: "Hair",
  head: "Head",
  knees: "Knees",
  "lower-back": "Erector Spinae (Lower Back)",
  neck: "Sternocleidomastoid (Neck)",
  obliques: "Obliques",
  quadriceps: "Quadriceps Femoris",
  tibialis: "Tibialis Anterior",
  trapezius: "Trapezius",
  triceps: "Triceps Brachii",
  "upper-back": "Latissimus Dorsi (Upper Back)",
};

// Which view(s) each muscle appears on (deduced from the source data files).
export const SIDE_PRESENCE = {
  abs: ["front"],
  adductors: ["front", "back"],
  ankles: ["front", "back"],
  biceps: ["front"],
  calves: ["front", "back"],
  chest: ["front"],
  deltoids: ["front", "back"],
  feet: ["front", "back"],
  forearm: ["front", "back"],
  gluteal: ["back"],
  hamstring: ["back"],
  hands: ["front", "back"],
  hair: ["front", "back"],
  head: ["front", "back"],
  knees: ["front"],
  "lower-back": ["back"],
  neck: ["front", "back"],
  obliques: ["front"],
  quadriceps: ["front"],
  tibialis: ["front"],
  trapezius: ["front", "back"],
  triceps: ["front", "back"],
  "upper-back": ["back"],
};

// mertronlp -> our slug aliases (so existing users can migrate with minimal changes).
export const MUSCLE_SLUG_ALIASES = {
  shoulders: "deltoids",
  deltoid: "deltoids",
  shoulder: "deltoids",
  gluteus: "gluteal",
  glutes: "gluteal",
  glute: "gluteal",
  calfs: "calves",
  calf: "calves",
  quads: "quadriceps",
  quad: "quadriceps",
  hamstrings: "hamstring",
  abdominals: "abs",
  ab: "abs",
  lats: "upper-back",
  lat: "upper-back",
  back: "upper-back",
  traps: "trapezius",
  trap: "trapezius",
  bicep: "biceps",
  tricep: "triceps",
  pecs: "chest",
  pec: "chest",
  oblique: "obliques",
  "lower back": "lower-back",
  "upper back": "upper-back",
  lowerback: "lower-back",
  upperback: "upper-back",
};

export function normalizeSlug(input) {
  if (!input) return input;
  const s = String(input).trim().toLowerCase();
  if (MUSCLES.includes(s)) return s;
  if (MUSCLE_SLUG_ALIASES[s]) return MUSCLE_SLUG_ALIASES[s];
  return s; // unknown slugs pass through (ignored at render time)
}

export function getAnatomicalName(slug) {
  return ANATOMICAL_NAMES[slug] || slug;
}

// Default palette for exercise resolution.
export const PALETTE = {
  primary: "#DC2626",
  secondary: "#F59E0B",
  accessory: "#FCD34D",
  accessoryOpacity: 0.5,
};

/** Playground/docs sample — three-tier coloring (primary / secondary / stabilizers). */
export const DEMO_LAYERS = [
  { color: PALETTE.primary, muscles: ["chest"], opacity: 1 },
  { color: PALETTE.secondary, muscles: ["triceps", "deltoids"], opacity: 1 },
  { color: PALETTE.accessory, muscles: ["abs"], opacity: PALETTE.accessoryOpacity },
];

export const ATTRIBUTION = "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";
export const ATTRIBUTION_SOURCE = "https://github.com/HichamELBSI/react-native-body-highlighter";