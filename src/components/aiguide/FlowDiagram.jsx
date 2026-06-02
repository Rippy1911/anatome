import React from "react";

const NODES = [
  { label: "User prompt", sub: "\u201cShow me bench press\u201d" },
  { label: "LLM", sub: "any provider" },
  { label: "Anatome", sub: "/resolveExercise" },
  { label: "Anatome", sub: "/generateImage" },
  { label: "Chat reply", sub: "embedded <img>" },
];

export default function FlowDiagram() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6 overflow-x-auto">
      <div className="flex items-stretch gap-2 sm:gap-3 min-w-max">
        {NODES.map((n, i) => (
          <React.Fragment key={i}>
            <div className="flex flex-col justify-center px-3 sm:px-4 py-3 rounded-lg border border-border bg-secondary/50 text-center min-w-[110px]">
              <div className="text-sm font-semibold">{n.label}</div>
              <div className="text-[11px] font-mono text-muted-foreground mt-0.5">{n.sub}</div>
            </div>
            {i < NODES.length - 1 && (
              <div className="flex items-center text-primary text-xl font-bold">{"\u2192"}</div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}