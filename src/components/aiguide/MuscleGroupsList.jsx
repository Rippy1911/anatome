import React from "react";

const PRIMARY = "#dc2626";
const SECONDARY = "#f59e0b";
const ACCESSORY = "#fcd34d";

function layerLabel(layer) {
  const c = String(layer.color || "").toLowerCase();
  if (c === PRIMARY) return "Primary";
  if (c === SECONDARY) return "Secondary";
  if (c === ACCESSORY || (layer.opacity != null && layer.opacity < 1)) return "Accessory";
  return "Muscles";
}

function flattenLayers(layers) {
  const seen = new Set();
  const out = [];
  for (const l of layers || []) {
    for (const m of l.muscles || []) {
      if (!seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    }
  }
  return out;
}

/** Renders primary/secondary/accessory muscle slugs from aiDemo / resolveExercise layers. */
export default function MuscleGroupsList({ layers, muscleGroups, matched, className = "" }) {
  const flat = (muscleGroups?.length ? muscleGroups : flattenLayers(layers));
  const layerRows = (layers || []).filter((l) => (l.muscles || []).length > 0);

  if (!layerRows.length && !flat.length) {
    if (matched === false) {
      return (
        <p className={`text-xs text-muted-foreground ${className}`}>
          No muscle mapping found for this exercise. Try a more specific name.
        </p>
      );
    }
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="text-[11px] font-medium text-foreground">Muscle groups</div>
      {layerRows.length > 0 ? (
        <div className="space-y-1">
          {layerRows.map((l, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span
                className="w-3 h-3 rounded-sm border border-border shrink-0 mt-0.5"
                style={{ backgroundColor: l.color, opacity: l.opacity ?? 1 }}
              />
              <span>
                <span className="text-muted-foreground">{layerLabel(l)}:</span>{" "}
                <span className="font-mono">{(l.muscles || []).join(", ")}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs font-mono text-foreground">{flat.join(", ")}</p>
      )}
      {flat.length > 0 && layerRows.length > 1 && (
        <p className="text-[10px] text-muted-foreground">
          All: <span className="font-mono">{flat.join(", ")}</span>
        </p>
      )}
    </div>
  );
}
