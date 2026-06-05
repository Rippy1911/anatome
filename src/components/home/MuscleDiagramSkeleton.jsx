import { cn } from "@/lib/utils";

/** Neutral generateImage params — muted skeleton tones, no muscle highlights. */
const SKELETON_PARAMS = {
  light: "gender=male&view=dual&body_color=%2394a3b8&border_color=%23cbd5e1&border_width=1&output=raw",
  dark: "gender=male&view=dual&body_color=%233f4f63&border_color=%2364748b&border_width=1&output=raw",
};

function skeletonSrc(baseUrl, theme) {
  return `${baseUrl}/generateImage?${SKELETON_PARAMS[theme]}`;
}

/** Shared sizing for skeleton + loaded diagram (default generateImage 768×1024 aspect). */
export const DIAGRAM_IMG_CLASS = "h-40 w-[7.5rem] object-contain object-center";

/** Warm browser cache for both theme skeleton SVGs. */
export function preloadDiagramSkeleton(baseUrl) {
  (["light", "dark"]).forEach((theme) => {
    const img = new Image();
    img.src = skeletonSrc(baseUrl, theme);
  });
}

/**
 * Pulsing dual-view body placeholder while a muscle diagram loads.
 * @param {{ baseUrl: string, className?: string }} props
 */
export default function MuscleDiagramSkeleton({ baseUrl, className = "" }) {
  return (
    <div
      className={cn("animate-diagram-skeleton-pulse", className)}
      aria-hidden
    >
      <img src={skeletonSrc(baseUrl, "light")} alt="" className={cn(DIAGRAM_IMG_CLASS, "dark:hidden")} />
      <img src={skeletonSrc(baseUrl, "dark")} alt="" className={cn(DIAGRAM_IMG_CLASS, "hidden dark:block")} />
    </div>
  );
}
