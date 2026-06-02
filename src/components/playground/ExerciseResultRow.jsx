import React from "react";
import { Dumbbell } from "lucide-react";

const LEVEL_DOT = {
  beginner: "bg-green-500",
  intermediate: "bg-yellow-500",
  expert: "bg-red-500",
};

export default function ExerciseResultRow({ ex, onClick }) {
  const chips = [...(ex.primaryMuscles || []), ...(ex.secondaryMuscles || [])].slice(0, 4);
  return (
    <button
      onClick={() => onClick(ex)}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/60 transition-colors border-b border-border last:border-b-0"
    >
      <div className="w-8 h-8 rounded-md bg-secondary shrink-0 overflow-hidden flex items-center justify-center">
        {(ex.gif_url || ex.image_url) ? (
          <img src={ex.gif_url || ex.image_url} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
        ) : (
          <Dumbbell className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{ex.name}</div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {chips.map((m) => (
            <span key={m} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{m}</span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {ex.equipment && <span className="hidden sm:inline text-[10px] text-muted-foreground capitalize">{ex.equipment}</span>}
        {ex.level && <span className={`w-2 h-2 rounded-full ${LEVEL_DOT[ex.level] || "bg-muted-foreground"}`} title={ex.level} />}
      </div>
    </button>
  );
}