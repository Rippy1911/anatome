import React from "react";
import { Construction } from "lucide-react";

/**
 * The skill-progression catalog is unfinished: media coverage is incomplete and the coaching
 * cues have not been reviewed. The pages stay reachable — and the MCP tools stay listed — but
 * every entry point says so plainly rather than presenting provisional content as advice.
 *
 * The API says the same thing in machine-readable form: every guide payload carries
 * `status: "work_in_progress"`, and the three MCP tool descriptions are prefixed accordingly.
 */
export default function WipBanner() {
  return (
    <div className="mb-8 flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <Construction className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-amber-900 dark:text-amber-200">Work in progress</p>
        <p className="mt-1 leading-relaxed text-amber-900/80 dark:text-amber-200/80">
          These skill progressions are a draft. Demo media is missing on some steps, the cues have
          not been reviewed by a coach, and both the content and the structure may change without
          notice. Read them as notes, not as a training plan — and don&apos;t rely on them for
          anything where getting it wrong would hurt.
        </p>
      </div>
    </div>
  );
}
