import React from "react";
import { exerciseMediaUrl } from "@/lib/apiBase";

export default function ExerciseGifPreview({ exercise, onClear }) {
  if (!exercise) return null;

  const gifSrc = exerciseMediaUrl(exercise);
  const muscles = [...(exercise.primaryMuscles || []), ...(exercise.secondaryMuscles || [])];

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">Loaded from free-exercise-db — licence unverified, not cleared for reuse</div>
          <div className="text-sm font-semibold truncate">{exercise.name}</div>
          {muscles.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {muscles.map((m) => (
                <span key={m} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
        {onClear && (
          <button type="button" onClick={onClear} className="text-[11px] text-muted-foreground hover:text-foreground shrink-0">
            Clear
          </button>
        )}
      </div>
      {gifSrc && (
        <div className="rounded-lg border border-border bg-background overflow-hidden flex items-center justify-center min-h-[120px]">
          <img
            src={gifSrc}
            alt={`${exercise.name} demo`}
            className="max-h-40 w-auto object-contain"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}
