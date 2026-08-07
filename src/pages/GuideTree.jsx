import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, RotateCw, ShieldAlert } from "lucide-react";
import GuidesAttribution from "@/components/guides/GuidesAttribution";
import WipBanner from "@/components/guides/WipBanner";
import MuscleDiagram from "@/components/guides/MuscleDiagram";
import ProgressionPatterns from "@/components/guides/ProgressionPatterns";
import StepLadder from "@/components/guides/StepLadder";
import TimelinePanel from "@/components/guides/TimelinePanel";
import { loadGuideIndex, loadGuideTree, resolveSources, treeHasGif } from "@/lib/guides";

function Shell({ children }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link
        to="/guides"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All skill progressions
      </Link>
      {children}
    </div>
  );
}

function Chips({ items, label }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {items.map((t) => (
        <span key={t} className="rounded bg-secondary px-2 py-0.5 text-xs capitalize">
          {t.replace(/-/g, " ")}
        </span>
      ))}
    </div>
  );
}

export default function GuideTree() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: "loading", tree: null, error: null });
  const [meta, setMeta] = useState(null);
  const [mediaPreference, setMediaPreference] = useState("video");

  const load = useCallback(async () => {
    setState({ status: "loading", tree: null, error: null });
    const [treeRes, indexRes] = await Promise.all([loadGuideTree(slug), loadGuideIndex()]);
    setMeta(indexRes.data);
    setState(
      treeRes.data
        ? { status: "ready", tree: treeRes.data, error: null }
        : { status: treeRes.error === "notfound" ? "notfound" : "error", tree: null, error: treeRes.error },
    );
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const tree = state.tree;

  const stepNames = useMemo(
    () => Object.fromEntries((tree?.steps || []).map((s) => [s.id, s.name])),
    [tree],
  );

  const sources = useMemo(
    () => resolveSources(tree?.sources_used || tree?.timeline?.source_ids, meta?.sources),
    [tree, meta],
  );

  if (state.status === "loading") {
    return (
      <Shell>
        <div className="h-8 w-56 animate-pulse rounded bg-card" />
        <div className="mt-4 h-40 animate-pulse rounded-xl bg-card" />
        <div className="mt-4 space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      </Shell>
    );
  }

  if (state.status === "notfound") {
    return (
      <Shell>
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="font-display text-lg font-bold tracking-tight">
            No skill tree called &ldquo;{slug}&rdquo;
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            It may have been renamed. Browse the full list instead.
          </p>
          <Link
            to="/guides"
            className="mt-4 inline-block rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            All skill progressions
          </Link>
        </div>
      </Shell>
    );
  }

  if (state.status === "error") {
    return (
      <Shell>
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <h1 className="font-display text-lg font-bold tracking-tight">
            This skill tree could not be loaded
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Try again in a moment.</p>
          <button
            type="button"
            onClick={load}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      </Shell>
    );
  }

  const showGifToggle = treeHasGif(tree);

  return (
    <Shell>
      <WipBanner />
      <header className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-secondary px-2 py-0.5 font-semibold uppercase tracking-wide">
            {tree.difficulty}
          </span>
          <span className="capitalize text-muted-foreground">{tree.family}</span>
          <span className="text-muted-foreground">· {(tree.steps || []).length} steps</span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{tree.name}</h1>
        {tree.summary && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {tree.summary}
          </p>
        )}
      </header>

      <div className="mb-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-3">
          {tree.prerequisites?.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Prerequisites
              </span>
              {tree.prerequisites.map((p) => (
                <Link
                  key={p}
                  to={`/guides/${p}`}
                  className="rounded bg-secondary px-2 py-0.5 text-xs capitalize hover:text-primary"
                >
                  {p.replace(/-/g, " ")}
                </Link>
              ))}
            </div>
          )}
          <Chips label="Equipment" items={tree.equipment} />
          {tree.goal?.notes && (
            <p className="text-sm leading-relaxed">
              <span className="font-semibold">Goal: </span>
              <span className="text-muted-foreground">
                {tree.goal.notes}
                {tree.goal.value
                  ? ` (${tree.goal.value}${tree.goal.value_max ? `–${tree.goal.value_max}` : ""}${
                      tree.goal.metric === "hold_seconds" ? "s" : ""
                    }${tree.goal.sets ? ` × ${tree.goal.sets}` : ""})`
                  : ""}
              </span>
            </p>
          )}
          {tree.safety?.injury_risk && (
            <p className="flex items-start gap-1.5 text-sm leading-relaxed">
              <ShieldAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                aria-hidden="true"
              />
              <span>
                <span className="font-semibold capitalize">{tree.safety.injury_risk} injury risk.</span>{" "}
                <span className="text-muted-foreground">{tree.safety.notes}</span>
              </span>
            </p>
          )}
        </div>

        <MuscleDiagram
          layers={tree.anatome_layers_payload}
          primary={tree.primary_muscles}
          secondary={tree.secondary_muscles}
          name={tree.name}
          className="rounded-xl border border-border bg-card p-4 md:w-[340px]"
        />
      </div>

      <div className="space-y-4">
        <TimelinePanel
          timeline={tree.timeline}
          defaultDrivers={meta?.default_variance_drivers}
          confidenceLevels={meta?.confidence_levels}
        />

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold tracking-tight">The progression</h2>
            {showGifToggle && (
              <div
                role="group"
                aria-label="Demo media type"
                className="flex rounded-md border border-border p-0.5"
              >
                {["video", "gif"].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setMediaPreference(mode)}
                    aria-pressed={mediaPreference === mode}
                    className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                      mediaPreference === mode
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mode === "gif" ? "Image" : "Video"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <StepLadder
            steps={tree.steps}
            mediaPreference={mediaPreference}
            confidenceLevels={meta?.confidence_levels}
          />
        </section>

        <ProgressionPatterns
          patterns={tree.progression_patterns}
          defaults={{
            regressionTriggers: meta?.default_regression_triggers,
            volumePatterns: meta?.default_volume_patterns,
          }}
          confidenceLevels={meta?.confidence_levels}
          stepNames={stepNames}
        />

        {tree.divergence_notes && (
          <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
            <h2 className="mb-2 font-display text-lg font-bold tracking-tight">
              Where coaches disagree
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {tree.divergence_notes}
            </p>
          </section>
        )}
      </div>

      <GuidesAttribution
        sources={sources.length ? sources : meta?.sources}
        generatedAt={meta?._provenance?.snapshot_taken}
      />
    </Shell>
  );
}
