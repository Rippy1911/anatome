// Single source of truth for muscle slugs, anatomical names, side presence, and the
// exercise map. Ported verbatim from the Base44 frontend (src/data/muscleCatalog.js).
// Slug naming follows HichamELBSI/react-native-body-highlighter exactly (do not rename).

export const MUSCLES: string[] = [
  "abs", "adductors", "ankles", "biceps", "calves", "chest", "deltoids",
  "feet", "forearm", "gluteal", "hamstring", "hands", "hair", "head",
  "knees", "lower-back", "neck", "obliques", "quadriceps", "tibialis",
  "trapezius", "triceps", "upper-back",
];

export const ANATOMICAL_NAMES: Record<string, string> = {
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
export const BODY_REGION: Record<string, string> = {
  chest: "upper-body",
  deltoids: "upper-body",
  triceps: "upper-body",
  biceps: "upper-body",
  forearm: "upper-body",
  trapezius: "upper-body",
  "upper-back": "upper-body",
  neck: "upper-body",
  hands: "upper-body",
  head: "other",
  hair: "other",
  "lower-back": "core",
  abs: "core",
  obliques: "core",
  quadriceps: "lower-body",
  hamstring: "lower-body",
  gluteal: "lower-body",
  adductors: "lower-body",
  calves: "lower-body",
  tibialis: "lower-body",
  ankles: "lower-body",
  feet: "lower-body",
  knees: "lower-body",
};

/** Opposing / complementary muscle groups for balance-check UX. */
export const ANTAGONISTS: Record<string, string[]> = {
  chest: ["upper-back"],
  "upper-back": ["chest"],
  biceps: ["triceps"],
  triceps: ["biceps"],
  quadriceps: ["hamstring"],
  hamstring: ["quadriceps"],
  abs: ["lower-back"],
  "lower-back": ["abs"],
  deltoids: ["trapezius"],
  trapezius: ["deltoids"],
  gluteal: ["abs"],
  obliques: ["abs"],
  forearm: ["biceps"],
  calves: ["tibialis"],
  tibialis: ["calves"],
  adductors: ["gluteal"],
  neck: ["trapezius"],
};

export const SIDE_PRESENCE: Record<string, string[]> = {
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

// Aliases so existing users can migrate with minimal changes.
export const MUSCLE_SLUG_ALIASES: Record<string, string> = {
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
  // free-exercise-db uses "abductors" (hip abductors); the closest SVG slug is
  // gluteal (the react-native-body-highlighter paths don't have a separate
  // abductor shape). Mapping to adductors would be anatomically WRONG — they are
  // antagonists. gluteal is the best available proxy.
  abductors: "gluteal",
  "hip abductors": "gluteal",
  "hip abductor": "gluteal",
  abductor: "gluteal",
};

export function normalizeSlug(input: string): string {
  if (!input) return input;
  const s = String(input).trim().toLowerCase();
  if (MUSCLES.includes(s)) return s;
  if (MUSCLE_SLUG_ALIASES[s]) return MUSCLE_SLUG_ALIASES[s];
  return s; // unknown slugs pass through (ignored at render time)
}

export function getAnatomicalName(slug: string): string {
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
