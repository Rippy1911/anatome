import React from "react";
import { Dumbbell, HeartPulse, GraduationCap, Bot, Smartphone, Stethoscope } from "lucide-react";

const USE_CASES = [
  {
    icon: Dumbbell,
    title: "Fitness & Workout Apps",
    body: "Show users exactly which muscles each exercise targets. Render highlighted muscle diagrams next to every workout, plan, or set so trainees understand what they're training at a glance.",
  },
  {
    icon: HeartPulse,
    title: "Personal Training Platforms",
    body: "Give coaches a visual way to explain programming. Generate per-exercise and per-session muscle maps that make weekly volume and muscle balance instantly readable.",
  },
  {
    icon: Stethoscope,
    title: "Physiotherapy & Rehab",
    body: "Illustrate affected muscle groups and rehab targets in patient-facing tools. Clean, neutral anatomy diagrams help clinicians communicate treatment areas clearly.",
  },
  {
    icon: GraduationCap,
    title: "Education & E-Learning",
    body: "Power anatomy lessons, quizzes, and study tools with on-demand muscle visualizations. No illustration budget or 3D engine required — just an image URL.",
  },
  {
    icon: Bot,
    title: "AI Agents & Assistants",
    body: "Connect the Anatome MCP server so AI coaches and IDE agents can resolve an exercise from natural language and return the matching muscle diagram automatically.",
  },
  {
    icon: Smartphone,
    title: "Mobile & Wearable Apps",
    body: "Lightweight, cache-friendly SVG/PNG output keeps payloads small and rendering fast — ideal for native mobile apps and embedded fitness experiences.",
  },
];

export default function UseCases() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight mb-4">Use Cases</h1>
      <p className="text-sm text-muted-foreground leading-relaxed mb-10 max-w-2xl">
        The Anatome muscle visualizer API powers anatomy diagrams across fitness, health, education,
        and AI products. Here are some of the most common ways developers put it to work.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {USE_CASES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-lg border border-border bg-card p-5">
            <Icon className="w-6 h-6 text-primary mb-3" />
            <h2 className="font-display text-base font-bold tracking-tight mb-2">{title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}