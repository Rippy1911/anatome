import { cn } from "@/lib/utils";

/** Shared sizing for skeleton + loaded diagram (default generateImage 768×1024 aspect). */
export const DIAGRAM_IMG_CLASS = "h-40 w-[7.5rem] object-contain object-center";

/**
 * Local CSS placeholder — does NOT call generateImage.
 * (Preloading skeleton SVGs from the API burned host-day quota on every landing visit.)
 */
export function preloadDiagramSkeleton(_baseUrl) {
  // no-op: kept for call-site compatibility
}

/**
 * Pulsing dual-view body placeholder while a muscle diagram loads.
 * @param {{ baseUrl?: string, className?: string }} props
 */
export default function MuscleDiagramSkeleton({ className = "" }) {
  return (
    <div
      className={cn(
        "animate-diagram-skeleton-pulse rounded-lg bg-muted/80 dark:bg-muted/40",
        DIAGRAM_IMG_CLASS,
        className,
      )}
      aria-hidden
    />
  );
}
