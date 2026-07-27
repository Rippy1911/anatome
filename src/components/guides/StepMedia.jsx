import React, { useState } from "react";
import { ExternalLink, Film, Info } from "lucide-react";
import AiGeneratedBadge, { AI_DISCLOSURE_SHORT } from "@/components/guides/AiGeneratedBadge";
import {
  clipLabel,
  isAiGenerated,
  mediaProvenance,
  pickStepMedia,
  youTubeEmbedUrl,
} from "@/lib/guides";

const ROLE_LABEL = {
  reference: "Related clip from the same movement family — not this exact step.",
  placeholder: "Loosely related clip only — it does not demonstrate this step.",
};

function Note({ children }) {
  return (
    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/**
 * The honest empty state. Most steps land here: we have no demonstration we are
 * allowed to redistribute, so we say so and link out to a related clip where the
 * catalog has one, rather than filling the space with a stand-in image.
 */
function NoDemo({ reference }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Film className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        No demo available yet
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        We only publish demonstrations we have the rights to. A first-party clip for this
        step is on the way.
      </p>
      {reference && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {ROLE_LABEL[reference.role] || "Related clip."}
          </p>
          <a
            href={reference.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-2 hover:text-foreground"
          >
            {reference.title || "Watch on YouTube"}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
          {reference.channel && (
            <span className="ml-1.5 text-xs text-muted-foreground">· {reference.channel}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One step's demo asset. YouTube clips are embedded through youtube-nocookie.com and
 * trimmed to the curated seconds — never downloaded or re-hosted. Image media is shown
 * only when the media policy allows it, and is never presented as reusable.
 */
export default function StepMedia({ media, preference }) {
  const [override, setOverride] = useState(null);
  const [imageBroken, setImageBroken] = useState(false);

  const picked = pickStepMedia(media, override || preference);

  if (picked.mode === "none") return <NoDemo reference={picked.reference} />;

  if (picked.mode === "gif" && !imageBroken) {
    const ai = isAiGenerated(picked.media);
    const unverified = mediaProvenance(picked.media) === "unverified";
    return (
      <div>
        {picked.note && <Note>{picked.note}</Note>}
        <div className="relative mt-1 flex justify-center rounded-lg border border-border bg-secondary/40 p-2">
          {ai && <AiGeneratedBadge media={picked.media} placement="overlay" />}
          <img
            src={picked.media.url}
            alt={`${picked.media.title}${ai ? ` — ${AI_DISCLOSURE_SHORT}` : ""}`}
            loading="lazy"
            onError={() => setImageBroken(true)}
            className="h-auto max-h-64 w-auto rounded"
          />
        </div>
        {ai && <AiGeneratedBadge media={picked.media} />}
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{picked.media.title}</span>
          {unverified && (
            <span className="rounded bg-secondary px-1.5 py-0.5 font-medium">
              Origin unverified — not offered for reuse
            </span>
          )}
          {picked.alternate && (
            <button
              type="button"
              onClick={() => setOverride("video")}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Switch to video
            </button>
          )}
        </p>
      </div>
    );
  }

  // An image host can still fail on us; fall through to the video rather than a broken frame.
  const pick = imageBroken ? pickStepMedia(media, "video") : picked;
  if (pick.mode === "none") return <NoDemo reference={pick.reference} />;

  const embed = youTubeEmbedUrl(pick.media);
  if (!embed) return <NoDemo reference={pick.reference} />;

  const label = clipLabel(pick.media);

  return (
    <div>
      {imageBroken ? (
        <Note>Demo image unavailable — showing the video.</Note>
      ) : (
        picked.note && <Note>{picked.note}</Note>
      )}
      <div className="relative mt-1 w-full overflow-hidden rounded-lg border border-border pt-[56.25%]">
        <iframe
          src={embed}
          title={pick.media.title}
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          className="absolute inset-0 h-full w-full"
        />
      </div>
      {isAiGenerated(pick.media) && <AiGeneratedBadge media={pick.media} />}
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          {pick.media.channel}
          {label ? ` · ${label}` : ""}
        </span>
        {pick.alternate && (
          <button
            type="button"
            onClick={() => setOverride("gif")}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Switch to image
          </button>
        )}
      </p>
    </div>
  );
}
