import React from "react";
import { Dumbbell, ArrowRight } from "lucide-react";

export default function AironPromo() {
  return (
    <a
      href="https://airon.coach"
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Dumbbell className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm flex items-center gap-1.5">
            Anatome is a free open-source tool by NextSolutions
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            We also make <span className="font-semibold text-foreground">airon.coach</span> — an
            AI-powered personal trainer that uses Anatome under the hood for exercise visualization.
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary mt-2 group-hover:gap-1.5 transition-all">
            Try it <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </a>
  );
}