import React from "react";
import { ChevronRight, Clock, Lock, Target } from "lucide-react";
import ConfidenceBadge from "@/components/guides/ConfidenceBadge";
import StepMedia from "@/components/guides/StepMedia";
import { formatWeekRange } from "@/lib/guides";

const LEVEL_STYLES = {
  beginner: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  intermediate: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  advanced: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  elite: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

function LevelBadge({ level }) {
  if (!level) return null;
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        LEVEL_STYLES[level] || LEVEL_STYLES.beginner
      }`}
    >
      {level}
    </span>
  );
}

/** "3 × 45–60s, rest 120s, 3–4×/week" from the programming block. */
function programmingLine(p) {
  if (!p) return null;
  const parts = [];
  if (p.sets && p.reps_or_hold) parts.push(`${p.sets} × ${p.reps_or_hold}`);
  else if (p.reps_or_hold) parts.push(p.reps_or_hold);
  if (p.rest_seconds) parts.push(`rest ${p.rest_seconds}s`);
  if (p.frequency_per_week) parts.push(`${p.frequency_per_week}×/week`);
  return parts.length ? parts.join(" · ") : null;
}

/** "60s × 3 sets — ≥45° lean" from the unlock criteria. */
function unlockLine(u) {
  if (!u) return null;
  const unit = u.metric === "hold_seconds" ? "s" : u.metric === "reps" ? " reps" : "";
  const head = u.value != null ? `${u.value}${unit}${u.sets ? ` × ${u.sets} sets` : ""}` : null;
  return [head, u.notes].filter(Boolean).join(" — ") || null;
}

function Detail({ title, children }) {
  if (!children) return null;
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

function List({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="space-y-1 pl-4 text-sm leading-relaxed">
      {items.map((t, i) => (
        <li key={i} className="list-disc marker:text-muted-foreground">
          {t}
        </li>
      ))}
    </ul>
  );
}

function Step({ step, index, mediaPreference, confidenceLevels }) {
  const programming = programmingLine(step.programming);
  const unlock = unlockLine(step.unlock);
  const weeks = formatWeekRange(step.timeline?.typical_weeks);

  return (
    <details className="group rounded-xl border border-border bg-card transition-colors hover:border-primary/40 open:border-primary/40">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs font-bold">
          {step.order ?? index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display font-bold tracking-tight">{step.name}</span>
            <LevelBadge level={step.level} />
            {weeks && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {weeks}
              </span>
            )}
          </span>
          {step.intent && (
            <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
              {step.intent}
            </span>
          )}
          {unlock && (
            <span className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-medium">Unlocks next at</span> {unlock}
              </span>
            </span>
          )}
        </span>
        <ChevronRight
          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
      </summary>

      <div className="grid gap-5 border-t border-border p-4 md:grid-cols-2">
        <div className="space-y-4">
          <Detail title="Cues">
            <List items={step.cues} />
          </Detail>
          <Detail title="Common faults">
            <List items={step.common_faults} />
          </Detail>
          {step.safety_notes && (
            <Detail title="Safety">
              <p className="text-sm leading-relaxed text-muted-foreground">{step.safety_notes}</p>
            </Detail>
          )}
          {programming && (
            <Detail title="Programming">
              <p className="flex items-start gap-1.5 text-sm">
                <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                {programming}
              </p>
            </Detail>
          )}
          {step.timeline && (
            <Detail title="Time on this step">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                {weeks || "—"}
                <ConfidenceBadge
                  level={step.timeline.confidence}
                  definitions={confidenceLevels}
                />
              </p>
              {step.timeline.from_level && (
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Entering from: {step.timeline.from_level}
                </p>
              )}
            </Detail>
          )}
          {step.drills?.length > 0 && (
            <Detail title="Drills">
              <ul className="space-y-2">
                {step.drills.map((d) => (
                  <li key={d.slug || d.name}>
                    <p className="text-sm font-medium">
                      {d.name}
                      {d.role && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          {d.role}
                        </span>
                      )}
                    </p>
                    <List items={d.instructions} />
                  </li>
                ))}
              </ul>
            </Detail>
          )}
        </div>

        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Demo
          </h4>
          <StepMedia media={step.media} preference={mediaPreference} />
        </div>
      </div>
    </details>
  );
}

/** The ordered progression. One `<details>` per step so deep links and mobile both behave. */
export default function StepLadder({ steps = [], mediaPreference, confidenceLevels }) {
  if (!steps.length) {
    return <p className="text-sm text-muted-foreground">No steps published for this tree yet.</p>;
  }
  return (
    <ol className="space-y-2.5">
      {steps.map((step, i) => (
        <li key={step.id || i}>
          <Step
            step={step}
            index={i}
            mediaPreference={mediaPreference}
            confidenceLevels={confidenceLevels}
          />
        </li>
      ))}
    </ol>
  );
}
