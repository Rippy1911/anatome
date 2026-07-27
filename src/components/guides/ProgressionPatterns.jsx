import React from "react";
import { Activity, AlertTriangle, ClipboardCheck, Repeat, TrendingDown } from "lucide-react";
import ConfidenceBadge from "@/components/guides/ConfidenceBadge";
import { formatWeekRange } from "@/lib/guides";

function Block({ icon: Icon, title, children }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold tracking-tight">
        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Bullets({ items, className = "" }) {
  if (!items?.length) return null;
  return (
    <ul className={`space-y-1 pl-4 text-sm leading-relaxed text-muted-foreground ${className}`}>
      {items.map((t, i) => (
        <li key={i} className="list-disc">
          {t}
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children }) {
  if (!children) return null;
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

/**
 * The parts of a progression that a step ladder cannot show: where people stall,
 * what gets injured and when, how much volume is productive, and what a layoff
 * actually costs. Every block is independently optional — a tree that carries only
 * some of this data renders only those blocks.
 */
export default function ProgressionPatterns({
  patterns,
  defaults = { regressionTriggers: null, volumePatterns: null },
  confidenceLevels,
  stepNames = {},
}) {
  const prerequisites = patterns?.prerequisite_standards || [];
  const plateaus = patterns?.plateau_signatures || [];
  const injuries = patterns?.injury_risk_timeline || [];
  const volume = patterns?.volume_patterns || defaults.volumePatterns;
  const regressions = [
    ...(patterns?.regression_triggers_extra || []),
    ...(defaults.regressionTriggers || []),
  ];

  if (
    !prerequisites.length &&
    !plateaus.length &&
    !injuries.length &&
    !volume &&
    !regressions.length
  ) {
    return null;
  }

  const label = (id) => stepNames[id] || id;

  return (
    <div className="space-y-4">
      {prerequisites.length > 0 && (
        <Block icon={ClipboardCheck} title="Before you start">
          <ul className="space-y-3">
            {prerequisites.map((p, i) => (
              <li key={p.name || i} className="border-l-2 border-border pl-3">
                <p className="text-sm font-medium">
                  {p.name}
                  {p.target && <span className="text-muted-foreground"> — {p.target}</span>}
                </p>
                {p.rationale && (
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    {p.rationale}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {plateaus.length > 0 && (
        <Block icon={Activity} title="Where people get stuck">
          <div className="space-y-5">
            {plateaus.map((p, i) => (
              <div key={p.id || i}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{p.signal}</p>
                  <ConfidenceBadge level={p.confidence} definitions={confidenceLevels} />
                </div>
                {p.at_step_ids?.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Typically at: {p.at_step_ids.map(label).join(", ")}
                    {formatWeekRange(p.expected_stall_weeks)
                      ? ` · expect ${formatWeekRange(p.expected_stall_weeks)} here`
                      : ""}
                  </p>
                )}
                <Field label="Usual causes">
                  <Bullets items={p.typical_causes} />
                </Field>
                <Field label="How to break it">
                  <Bullets items={p.resolution} />
                </Field>
              </div>
            ))}
          </div>
        </Block>
      )}

      {injuries.length > 0 && (
        <Block icon={AlertTriangle} title="Injury risk over time">
          <div className="space-y-5">
            {injuries.map((r, i) => (
              <div key={r.tissue || i}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold capitalize">{r.tissue}</p>
                  {formatWeekRange(r.onset_weeks_from_entry) && (
                    <span className="text-xs text-muted-foreground">
                      risk window {formatWeekRange(r.onset_weeks_from_entry)} in
                    </span>
                  )}
                  <ConfidenceBadge level={r.confidence} definitions={confidenceLevels} />
                </div>
                {r.mechanism && (
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {r.mechanism}
                  </p>
                )}
                {r.peaks_at_step_ids?.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Peaks at: {r.peaks_at_step_ids.map(label).join(", ")}
                  </p>
                )}
                <Field label="Prevention">
                  <Bullets items={r.prophylaxis} />
                </Field>
                <Field label="Stop and reassess if">
                  <Bullets items={r.red_flags} />
                </Field>
              </div>
            ))}
          </div>
        </Block>
      )}

      {volume && (
        <Block icon={Repeat} title="How much is productive">
          {volume.productive && (
            <div className="mb-3 flex flex-wrap gap-4">
              {volume.productive.sessions_per_week && (
                <div>
                  <p className="font-display text-xl font-bold tracking-tight">
                    {volume.productive.sessions_per_week.min}–
                    {volume.productive.sessions_per_week.max}
                  </p>
                  <p className="text-xs text-muted-foreground">sessions / week</p>
                </div>
              )}
              {volume.productive.hard_sets_per_session && (
                <div>
                  <p className="font-display text-xl font-bold tracking-tight">
                    {volume.productive.hard_sets_per_session.min}–
                    {volume.productive.hard_sets_per_session.max}
                  </p>
                  <p className="text-xs text-muted-foreground">hard sets / session</p>
                </div>
              )}
            </div>
          )}
          {volume.productive?.notes && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {volume.productive.notes}
            </p>
          )}
          <Field label="You are doing too much if">
            <Bullets items={volume.too_much_signals} />
          </Field>
          {volume.deload && (
            <Field label="Deload">
              <p className="text-muted-foreground">
                {formatWeekRange(volume.deload.every_weeks)
                  ? `Every ${formatWeekRange(volume.deload.every_weeks)}. `
                  : ""}
                {volume.deload.protocol} {volume.deload.trigger}
              </p>
            </Field>
          )}
        </Block>
      )}

      {regressions.length > 0 && (
        <Block icon={TrendingDown} title="What a break costs you">
          <div className="space-y-4">
            {regressions.map((r, i) => (
              <div key={r.id || i}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{r.trigger}</p>
                  <ConfidenceBadge level={r.confidence} definitions={confidenceLevels} />
                </div>
                {r.typical_dropback && (
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {r.typical_dropback}
                  </p>
                )}
                {r.action && (
                  <p className="mt-1 text-sm leading-relaxed">
                    <span className="font-medium">Do this: </span>
                    <span className="text-muted-foreground">{r.action}</span>
                    {formatWeekRange(r.recovery_weeks)
                      ? ` (${formatWeekRange(r.recovery_weeks)} to recover)`
                      : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Block>
      )}
    </div>
  );
}
