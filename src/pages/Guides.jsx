import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock, Layers, RotateCw } from "lucide-react";
import GuidesAttribution from "@/components/guides/GuidesAttribution";
import { DIFFICULTY_ORDER, formatWeekRange, loadGuideIndex } from "@/lib/guides";

const DIFFICULTY_STYLES = {
  beginner: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  intermediate: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  advanced: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  elite: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

function FilterRow({ label, options, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`rounded-md px-2.5 py-1 text-sm font-medium capitalize transition-colors ${
            value === opt.value
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function TreeCard({ tree }) {
  const weeks = formatWeekRange(tree.timeline_weeks);
  return (
    <Link
      to={`/guides/${tree.slug}`}
      className="flex flex-col rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/50"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            DIFFICULTY_STYLES[tree.difficulty] || DIFFICULTY_STYLES.beginner
          }`}
        >
          {tree.difficulty}
        </span>
        <span className="text-xs capitalize text-muted-foreground">{tree.family}</span>
      </div>
      <h2 className="font-display text-base font-bold tracking-tight">{tree.name}</h2>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{tree.summary}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          {tree.step_count} steps
        </span>
        {weeks && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {weeks}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function Guides() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const [difficulty, setDifficulty] = useState("all");
  const [family, setFamily] = useState("all");

  const load = useCallback(async () => {
    setState({ status: "loading", data: null, error: null });
    const res = await loadGuideIndex();
    setState(
      res.data
        ? { status: "ready", data: res.data, error: null }
        : { status: "error", data: null, error: res.error },
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const trees = useMemo(() => state.data?.trees || [], [state.data]);

  const families = useMemo(
    () => [...new Set(trees.map((t) => t.family).filter(Boolean))].sort(),
    [trees],
  );

  const difficulties = useMemo(() => {
    const present = new Set(trees.map((t) => t.difficulty));
    const order = state.data?.difficulty_order || DIFFICULTY_ORDER;
    return order.filter((d) => present.has(d));
  }, [trees, state.data]);

  const visible = trees.filter(
    (t) =>
      (difficulty === "all" || t.difficulty === difficulty) &&
      (family === "all" || t.family === family),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-4 font-display text-3xl font-bold tracking-tight">Skill Progressions</h1>
      <p className="mb-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Curated calisthenics skill trees — the ordered steps from where you are now to the full
        skill, with the unlock criteria for each one, how long it realistically takes, where
        people stall, and which muscles do the work. Free to read, open data, no account needed.
      </p>

      {state.status === "loading" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-display text-base font-bold tracking-tight">
            Skill trees are unavailable right now
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
            The catalog could not be loaded. Nothing is lost — try again in a moment.
          </p>
          <button
            type="button"
            onClick={load}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <div className="mb-6 space-y-2.5">
            <FilterRow
              label="Level"
              value={difficulty}
              onChange={setDifficulty}
              options={[
                { value: "all", label: "All" },
                ...difficulties.map((d) => ({ value: d, label: d })),
              ]}
            />
            <FilterRow
              label="Family"
              value={family}
              onChange={setFamily}
              options={[
                { value: "all", label: "All" },
                ...families.map((f) => ({ value: f, label: f })),
              ]}
            />
          </div>

          {visible.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((tree) => (
                <TreeCard key={tree.slug} tree={tree} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No skill trees match these filters.
            </p>
          )}

          <GuidesAttribution
            sources={state.data.sources}
            generatedAt={state.data._provenance?.snapshot_taken}
          />
        </>
      )}
    </div>
  );
}
