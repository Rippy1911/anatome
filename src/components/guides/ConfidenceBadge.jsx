import React from "react";

const STYLES = {
  "published-standard": "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  "coach-consensus": "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  estimated: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
};

/**
 * How much weight a timeline or pattern number carries. `title` carries the
 * catalog's own definition when the registry is available.
 */
export default function ConfidenceBadge({ level, definitions }) {
  if (!level) return null;
  return (
    <span
      title={definitions?.[level] || undefined}
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
        STYLES[level] || STYLES.estimated
      }`}
    >
      {level.replace(/-/g, " ")}
    </span>
  );
}
