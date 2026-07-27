import React from "react";
import { Sparkles } from "lucide-react";

export const AI_DISCLOSURE_SHORT = "AI-generated illustration — not a real athlete";

const AI_DISCLOSURE_LONG =
  "This image was produced by an AI model. It is an illustration of the shape, not a " +
  "recording of a real athlete, and it is not biomechanically guaranteed. Follow the " +
  "written cues and the linked video demo rather than the pixels.";

/**
 * Visible synthetic-media disclosure for EU AI Act Article 50, applicable 2026-08-02.
 *
 * Art. 50(4) requires a deployer to disclose artificially generated image content, and
 * 50(5) requires that disclosure to be clear, distinguishable, present at first exposure,
 * and accessible. A machine-readable `ai_generated` flag alone does not satisfy this, so
 * this component renders an always-visible chip (never hover-only, never behind a click),
 * states the model where the catalog records it, and exposes the same wording to assistive
 * technology. Callers must additionally carry {@link AI_DISCLOSURE_SHORT} in the media's
 * own `alt` text so the label survives when images fail to load.
 *
 * Currently unexercised: the only AI assets in the catalog were the locally generated demo
 * GIFs, which were rejected on review and are filtered out before render. Kept so that any
 * future `ai_generated: true` asset is labelled the moment it appears rather than shipping
 * unlabelled six days before the obligation lands.
 *
 * Not covered here — these are pipeline obligations, not frontend ones: the machine-readable
 * mark embedded in the artefact itself (Art. 50(2), C2PA or equivalent) and the validator gate
 * that fails a build when an AI asset lacks one.
 */
export default function AiGeneratedBadge({ media, placement = "below" }) {
  const disclosure = media?.ai?.disclosure_text || AI_DISCLOSURE_LONG;
  const model = media?.ai?.model;

  return (
    <div className={placement === "overlay" ? "absolute left-2 top-2 z-10" : "mt-2"}>
      <span
        role="note"
        aria-label={`${AI_DISCLOSURE_SHORT}. ${disclosure}`}
        className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black shadow-sm"
      >
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        {AI_DISCLOSURE_SHORT}
      </span>
      {placement !== "overlay" && (
        <p className="mt-1.5 rounded-md border-l-2 border-amber-500 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {disclosure}
          {model && <span className="block pt-1 font-mono text-[11px]">Model: {model}</span>}
        </p>
      )}
    </div>
  );
}
