import React from "react";
import { CalendarClock, TrendingDown, TrendingUp } from "lucide-react";
import ConfidenceBadge from "@/components/guides/ConfidenceBadge";
import { formatWeekRange } from "@/lib/guides";

function VarianceRow({ driver }) {
  const faster = driver.direction === "faster";
  const Icon = faster ? TrendingUp : TrendingDown;
  return (
    <li className="flex gap-2.5">
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${faster ? "text-emerald-500" : "text-amber-500"}`}
        aria-hidden="true"
      />
      <div>
        <p className="text-sm font-medium">
          {driver.factor?.replace(/_/g, " ")}
          <span className="ml-1.5 font-normal text-muted-foreground">
            — {faster ? "speeds you up" : "slows you down"}
            {driver.impact ? ` · ${driver.impact} impact` : ""}
          </span>
        </p>
        {driver.note && (
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{driver.note}</p>
        )}
      </div>
    </li>
  );
}

/**
 * How long this skill actually takes, and what moves the number. Rendered only
 * where the catalog carries `timeline` — trees without it simply omit the section.
 */
export default function TimelinePanel({ timeline, defaultDrivers = [], confidenceLevels }) {
  if (!timeline) return null;

  const headline = timeline.human_label || formatWeekRange(timeline.typical_weeks);
  const drivers = [...(timeline.variance_drivers_extra || []), ...defaultDrivers];

  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold tracking-tight">
        <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />
        How long it takes
      </h2>

      {headline && (
        <div className="mb-4 rounded-lg bg-secondary/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {formatWeekRange(timeline.typical_weeks) && (
              <span className="font-display text-2xl font-bold tracking-tight">
                {formatWeekRange(timeline.typical_weeks)}
              </span>
            )}
            <ConfidenceBadge level={timeline.confidence} definitions={confidenceLevels} />
          </div>
          {timeline.human_label && (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {timeline.human_label}
            </p>
          )}
        </div>
      )}

      <dl className="mb-4 grid gap-3 sm:grid-cols-2">
        {timeline.from_level && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Measured from
            </dt>
            <dd className="mt-0.5 text-sm leading-relaxed">{timeline.from_level}</dd>
          </div>
        )}
        {timeline.conditioning_hours_per_week != null && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Assumed training load
            </dt>
            <dd className="mt-0.5 text-sm">
              ~{timeline.conditioning_hours_per_week} h/week of relevant conditioning
            </dd>
          </div>
        )}
      </dl>

      {timeline.notes && (
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{timeline.notes}</p>
      )}

      {drivers.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What changes the number
          </h3>
          <ul className="space-y-2.5">
            {drivers.map((d, i) => (
              <VarianceRow key={`${d.factor}-${i}`} driver={d} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
