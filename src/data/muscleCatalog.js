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

export const EXERCISE_MAP = {
  "bench press": { layers: [{ intensity: "primary", muscles: ["chest"] }, { intensity: "secondary", muscles: ["triceps", "deltoids"] }, { intensity: "accessory", muscles: ["abs"] }] },
  "incline bench press": { layers: [{ intensity: "primary", muscles: ["chest", "deltoids"] }, { intensity: "secondary", muscles: ["triceps"] }, { intensity: "accessory", muscles: ["abs"] }] },
  "overhead press": { layers: [{ intensity: "primary", muscles: ["deltoids"] }, { intensity: "secondary", muscles: ["triceps", "trapezius"] }, { intensity: "accessory", muscles: ["abs", "upper-back"] }] },
  "deadlift": { layers: [{ intensity: "primary", muscles: ["gluteal", "hamstring", "lower-back"] }, { intensity: "secondary", muscles: ["quadriceps", "trapezius", "upper-back"] }, { intensity: "accessory", muscles: ["abs", "forearm"] }] },
  "squat": { layers: [{ intensity: "primary", muscles: ["quadriceps", "gluteal"] }, { intensity: "secondary", muscles: ["hamstring", "adductors", "lower-back"] }, { intensity: "accessory", muscles: ["abs", "calves"] }] },
  "pull up": { layers: [{ intensity: "primary", muscles: ["upper-back"] }, { intensity: "secondary", muscles: ["biceps", "forearm"] }, { intensity: "accessory", muscles: ["abs", "trapezius"] }] },
  "barbell row": { layers: [{ intensity: "primary", muscles: ["upper-back", "lower-back"] }, { intensity: "secondary", muscles: ["biceps", "trapezius"] }, { intensity: "accessory", muscles: ["forearm"] }] },
  "bicep curl": { layers: [{ intensity: "primary", muscles: ["biceps"] }, { intensity: "secondary", muscles: ["forearm"] }, { intensity: "accessory", muscles: [] }] },
  "tricep extension": { layers: [{ intensity: "primary", muscles: ["triceps"] }, { intensity: "secondary", muscles: [] }, { intensity: "accessory", muscles: [] }] },
  "lateral raise": { layers: [{ intensity: "primary", muscles: ["deltoids"] }, { intensity: "secondary", muscles: ["trapezius"] }, { intensity: "accessory", muscles: [] }] },
  "lat pulldown": { layers: [{ intensity: "primary", muscles: ["upper-back"] }, { intensity: "secondary", muscles: ["biceps"] }, { intensity: "accessory", muscles: ["forearm", "trapezius"] }] },
  "romanian deadlift": { layers: [{ intensity: "primary", muscles: ["hamstring", "gluteal"] }, { intensity: "secondary", muscles: ["lower-back"] }, { intensity: "accessory", muscles: ["forearm"] }] },
  "leg press": { layers: [{ intensity: "primary", muscles: ["quadriceps", "gluteal"] }, { intensity: "secondary", muscles: ["hamstring", "adductors"] }, { intensity: "accessory", muscles: ["calves"] }] },
  "leg curl": { layers: [{ intensity: "primary", muscles: ["hamstring"] }, { intensity: "secondary", muscles: ["calves"] }, { intensity: "accessory", muscles: [] }] },
  "leg extension": { layers: [{ intensity: "primary", muscles: ["quadriceps"] }, { intensity: "secondary", muscles: [] }, { intensity: "accessory", muscles: [] }] },
  "calf raise": { layers: [{ intensity: "primary", muscles: ["calves"] }, { intensity: "secondary", muscles: ["tibialis"] }, { intensity: "accessory", muscles: [] }] },
  "plank": { layers: [{ intensity: "primary", muscles: ["abs", "obliques"] }, { intensity: "secondary", muscles: ["lower-back", "deltoids"] }, { intensity: "accessory", muscles: ["gluteal", "quadriceps"] }] },
  "crunch": { layers: [{ intensity: "primary", muscles: ["abs"] }, { intensity: "secondary", muscles: [] }, { intensity: "accessory", muscles: [] }] },
  "russian twist": { layers: [{ intensity: "primary", muscles: ["obliques"] }, { intensity: "secondary", muscles: ["abs"] }, { intensity: "accessory", muscles: ["lower-back"] }] },
  "hip thrust": { layers: [{ intensity: "primary", muscles: ["gluteal"] }, { intensity: "secondary", muscles: ["hamstring"] }, { intensity: "accessory", muscles: ["abs"] }] },
  "dip": { layers: [{ intensity: "primary", muscles: ["chest", "triceps"] }, { intensity: "secondary", muscles: ["deltoids"] }, { intensity: "accessory", muscles: ["abs"] }] },
  "push up": { layers: [{ intensity: "primary", muscles: ["chest"] }, { intensity: "secondary", muscles: ["triceps", "deltoids"] }, { intensity: "accessory", muscles: ["abs", "obliques"] }] },
  "face pull": { layers: [{ intensity: "primary", muscles: ["deltoids", "trapezius"] }, { intensity: "secondary", muscles: ["upper-back"] }, { intensity: "accessory", muscles: [] }] },
  "hammer curl": { layers: [{ intensity: "primary", muscles: ["biceps", "forearm"] }, { intensity: "secondary", muscles: [] }, { intensity: "accessory", muscles: [] }] },
  "lunge": { layers: [{ intensity: "primary", muscles: ["quadriceps", "gluteal"] }, { intensity: "secondary", muscles: ["hamstring", "adductors"] }, { intensity: "accessory", muscles: ["abs", "calves"] }] },
  "front squat": { layers: [{ intensity: "primary", muscles: ["quadriceps"] }, { intensity: "secondary", muscles: ["gluteal", "abs"] }, { intensity: "accessory", muscles: ["upper-back"] }] },
  "seated cable row": { layers: [{ intensity: "primary", muscles: ["upper-back"] }, { intensity: "secondary", muscles: ["biceps", "trapezius"] }, { intensity: "accessory", muscles: ["forearm"] }] },
  "rear delt fly": { layers: [{ intensity: "primary", muscles: ["deltoids"] }, { intensity: "secondary", muscles: ["trapezius", "upper-back"] }, { intensity: "accessory", muscles: [] }] },
  "shrug": { layers: [{ intensity: "primary", muscles: ["trapezius"] }, { intensity: "secondary", muscles: ["forearm"] }, { intensity: "accessory", muscles: [] }] },
  "tricep pushdown": { layers: [{ intensity: "primary", muscles: ["triceps"] }, { intensity: "secondary", muscles: [] }, { intensity: "accessory", muscles: [] }] },
  "hanging leg raise": { layers: [{ intensity: "primary", muscles: ["abs"] }, { intensity: "secondary", muscles: ["obliques", "forearm"] }, { intensity: "accessory", muscles: ["adductors"] }] },
};

export const ATTRIBUTION = "Anatomy paths © Hicham El Boussarghini (MIT). Anatome by NextSolutions.";
export const ATTRIBUTION_SOURCE = "https://github.com/HichamELBSI/react-native-body-highlighter";