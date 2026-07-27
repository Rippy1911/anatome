import React, { useState } from "react";
import { muscleDiagramUrl } from "@/lib/guides";

/**
 * Muscle map for a skill tree, rendered by api.anatome.dev from the tree's
 * hand-curated `anatome_layers_payload`. Key-free public endpoint, so the URL is
 * used directly as an image source.
 */
export default function MuscleDiagram({
  layers,
  primary = [],
  secondary = [],
  name,
  view = "dual",
  width = 420,
  className = "",
}) {
  const [failed, setFailed] = useState(false);
  const src = muscleDiagramUrl(layers, { view, width });

  if (!src || failed) return null;

  const described = [primary.join(", "), secondary.join(", ")].filter(Boolean).join("; ");

  return (
    <figure className={className}>
      <img
        src={src}
        alt={`Muscles worked by ${name || "this skill"}${described ? `: ${described}` : ""}`}
        width={width}
        loading="lazy"
        onError={() => setFailed(true)}
        className="mx-auto h-auto max-h-[300px] w-full max-w-[280px] object-contain sm:max-w-[340px]"
      />
      <figcaption className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {primary.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#DC2626]" aria-hidden="true" />
            Primary: {primary.join(", ")}
          </span>
        )}
        {secondary.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#F59E0B]" aria-hidden="true" />
            Secondary: {secondary.join(", ")}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
