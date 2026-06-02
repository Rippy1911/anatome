import React from "react";

function Code({ children }) {
  return <pre className="bg-[#0a0e17] border border-border rounded-lg p-4 overflow-x-auto text-[12px] leading-relaxed font-mono text-foreground/90 my-3"><code>{children}</code></pre>;
}

const PATTERN_A = `const { results } = await fetch("/functions/searchExercises?q=bench&limit=5").then(r => r.json());
const first = results[0];
// drop into HTML:
// <img src={first.anatome_imageSrc} alt={first.name} />`;

const PATTERN_B = `const { exercise } = await fetch("/functions/getExercise?name=bench+press").then(r => r.json());
console.log(exercise.instructions);    // array of step-by-step strings
console.log(exercise.anatome_imageSrc); // ready for <img src>`;

const PATTERN_C = `const { exercise } = await fetch("/functions/getExercise?muscle=chest&limit=10").then(r => r.json());
// exercise is an array of 10 chest exercises in this mode`;

const SCHEMA = `{
  "id": "6a1eafe8624b43ad8b56bc7e",
  "ext_id": "Wide-Grip_Barbell_Bench_Press",
  "name": "Wide-Grip Barbell Bench Press",
  "force": "push",
  "level": "intermediate",
  "mechanic": "compound",
  "equipment": "barbell",
  "category": "strength",
  "primaryMuscles": ["chest"],
  "secondaryMuscles": ["shoulders", "triceps"],
  "instructions": [
    "Lie back on a flat bench with feet firm on the floor...",
    "As you breathe in, come down slowly until you feel the bar on your middle chest.",
    "After a second pause, bring the bar back to the starting position...",
    "Repeat the movement for the prescribed amount of repetitions."
  ],
  "images": [
    "Wide-Grip_Barbell_Bench_Press/0.jpg",
    "Wide-Grip_Barbell_Bench_Press/1.jpg"
  ],
  "image_url": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Wide-Grip_Barbell_Bench_Press/0.jpg",
  "anatome_primary_slugs": ["chest"],
  "anatome_secondary_slugs": ["deltoids", "triceps"],
  "anatome_layers_payload": [
    { "color": "#DC2626", "muscles": ["chest"] },
    { "color": "#F59E0B", "muscles": ["deltoids", "triceps"] }
  ],
  "anatome_imageSrc": "/functions/generateImage?gender=male&view=dual&layers=DC2626:chest|F59E0B:deltoids,triceps&output=raw"
}`;

export default function ExerciseDbSection() {
  return (
    <>
      <p className="text-sm text-muted-foreground leading-relaxed my-2">
        Anatome ships with 873 exercises from free-exercise-db (CC0, public domain by yuhonas), pre-mapped to our 23 muscle slugs.
        Every exercise has a pre-built <span className="font-mono text-foreground">anatome_imageSrc</span> URL ready for <span className="font-mono text-foreground">{"<img src>"}</span>.
      </p>

      <h3 className="font-display font-semibold mt-6 mb-1">Pattern A — Search-and-render</h3>
      <Code>{PATTERN_A}</Code>

      <h3 className="font-display font-semibold mt-6 mb-1">Pattern B — Get-by-name (AI-friendly)</h3>
      <Code>{PATTERN_B}</Code>

      <h3 className="font-display font-semibold mt-6 mb-1">Pattern C — Browse by muscle</h3>
      <Code>{PATTERN_C}</Code>

      <h3 className="font-display font-semibold mt-8 mb-1">Exercise schema</h3>
      <p className="text-sm text-muted-foreground">Example: <span className="font-mono text-foreground">GET /functions/getExercise?name=bench+press</span></p>
      <Code>{SCHEMA}</Code>

      <p className="text-sm text-muted-foreground leading-relaxed mt-3">
        Full schema in the <a href="/api" className="text-primary hover:underline">OpenAPI spec</a>. Source data:{" "}
        <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">free-exercise-db on GitHub</a>.
      </p>
    </>
  );
}