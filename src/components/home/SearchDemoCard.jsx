import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { absApiUrl, exerciseMediaUrl } from "@/lib/apiBase";
import { fetchSearchDemo } from "@/lib/searchDemoSources";
import { Search, Loader2, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import MuscleDiagramSkeleton, { DIAGRAM_IMG_CLASS } from "@/components/home/MuscleDiagramSkeleton";

function Chip({ children, tone = "primary" }) {
  const cls = tone === "primary" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${cls}`}>{children}</span>;
}

function exerciseKey(e) {
  return e?.ext_id || e?.id || e?.name;
}

export default function SearchDemoCard({ baseUrl }) {
  const [q, setQ] = useState("bench");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [searchTiming, setSearchTiming] = useState(null);
  const [diagramTiming, setDiagramTiming] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [totalMatched, setTotalMatched] = useState(null);
  const timer = useRef(null);
  const abortRef = useRef(null);
  const muscleImgRef = useRef(null);
  const diagramStartRef = useRef(null);
  const diagramDoneRef = useRef(false);
  const loadTargetRef = useRef(null);
  const browsing = !q.trim();

  const finishDiagramTiming = () => {
    if (diagramStartRef.current == null || diagramDoneRef.current) return;
    diagramDoneRef.current = true;
    setDiagramTiming({ ms: Math.round(performance.now() - diagramStartRef.current) });
  };

  useEffect(() => {
    // Stop auto-search after a 429 — further keystrokes would burn the shared host bucket.
    if (rateLimited) return undefined;

    if (timer.current) clearTimeout(timer.current);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    timer.current = setTimeout(async () => {
      setLoading(true);
      setFetchError(null);
      const out = await fetchSearchDemo({ baseUrl, q, limit: 6, signal: ctrl.signal });
      if (ctrl.signal.aborted || out.error === "aborted") return;
      setSearchTiming({
        latencyMs: out.latencyMs,
        sourceLabel: out.sourceLabel,
        upstreamMs: out.upstreamMs,
      });
      if (out.rateLimited) {
        setRateLimited(true);
        setResults([]);
        setSelected(null);
        setTotalMatched(null);
        setFetchError(out.error || "Daily fair-use limit reached — try again tomorrow or get an API key.");
      } else if (!out.ok) {
        setResults([]);
        setSelected(null);
        setTotalMatched(null);
        setFetchError(out.error || "Request failed");
      } else {
        const list = out.results;
        setResults(list);
        setTotalMatched(out.totalMatched);
        setSelected((prev) => {
          const prevKey = exerciseKey(prev);
          if (prevKey && list.some((e) => exerciseKey(e) === prevKey)) return prev;
          return list[0] || null;
        });
      }
      setLoading(false);
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      ctrl.abort();
    };
  }, [q, baseUrl, rateLimited]);

  const pick = (e) => {
    setSelected(e);
    setImgError(false);
  };

  const imgSrc = selected?.anatome_imageSrc ? absApiUrl(selected.anatome_imageSrc) : null;
  const gifSrc = selected ? exerciseMediaUrl(selected) : null;
  const diagramKey = selected && imgSrc ? `${exerciseKey(selected)}|${imgSrc}` : null;

  const markDiagramLoaded = () => {
    if (loadTargetRef.current !== diagramKey) return;
    setImgLoaded(true);
    finishDiagramTiming();
  };

  useLayoutEffect(() => {
    setImgError(false);
    setDiagramTiming(null);
    diagramDoneRef.current = false;
    loadTargetRef.current = diagramKey;

    if (!diagramKey || !imgSrc) {
      diagramStartRef.current = null;
      setImgLoaded(false);
      return;
    }

    diagramStartRef.current = performance.now();
    setImgLoaded(false);

    const syncFromDom = () => {
      if (loadTargetRef.current !== diagramKey) return;
      const el = muscleImgRef.current;
      // SVG diagrams may report naturalWidth 0; `complete` is the reliable signal.
      if (el?.complete) {
        setImgLoaded(true);
        finishDiagramTiming();
      }
    };

    syncFromDom();
    let frame = 0;
    if (!muscleImgRef.current?.complete) {
      frame = requestAnimationFrame(syncFromDom);
    }
    return () => cancelAnimationFrame(frame);
  }, [diagramKey, imgSrc]);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-primary" />
          <h3 className="font-display font-semibold">Search 873 exercises</h3>
        </div>
        <div className="text-[10px] font-mono text-muted-foreground tabular-nums text-right space-y-0.5">
          {searchTiming && !loading && (
            <p>
              search {searchTiming.latencyMs} ms
              <span className="text-muted-foreground/70"> · {searchTiming.sourceLabel}</span>
            </p>
          )}
          {selected && imgSrc && !imgError && (
            <p className={diagramTiming ? "" : "text-muted-foreground/60"}>
              {diagramTiming
                ? <>diagram {diagramTiming.ms} ms<span className="text-muted-foreground/70"> · generateImage</span></>
                : "diagram …"}
            </p>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search or clear to browse all 873…"
              className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          {fetchError && (
            <p className="mt-1.5 text-[10px] text-destructive font-mono">{fetchError}</p>
          )}
          <div className="mt-2 rounded-lg border border-border overflow-hidden max-h-60 flex flex-col">
            {browsing && results.length > 0 && !loading && (
              <div className="px-3 py-1.5 bg-secondary/40 text-[10px] font-mono text-muted-foreground shrink-0 border-b border-border">
                Browse · showing {results.length} of {totalMatched ?? 873}
              </div>
            )}
            <div className="divide-y divide-border overflow-y-auto flex-1 min-h-0">
            {results.length === 0 && loading && (
              <div className="p-3 text-xs text-muted-foreground">Loading…</div>
            )}
            {results.length === 0 && !loading && !fetchError && !browsing && (
              <div className="p-3 text-xs text-muted-foreground">No results for that query.</div>
            )}
            {results.map((e) => (
              <button
                key={exerciseKey(e)}
                onClick={() => pick(e)}
                className={`w-full text-left p-2.5 hover:bg-secondary transition-colors ${exerciseKey(selected) === exerciseKey(e) ? "bg-secondary" : ""}`}
              >
                <div className="text-sm font-medium truncate">{e.name}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(e.primaryMuscles || []).slice(0, 3).map((m) => <Chip key={m}>{m}</Chip>)}
                  {(e.secondaryMuscles || []).slice(0, 2).map((m) => <Chip key={m} tone="muted">{m}</Chip>)}
                </div>
              </button>
            ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-[#f1f5f9] dark:bg-[#0a0e17] p-3 min-h-[15rem] flex flex-col items-center justify-center text-center">
          {!selected && !loading && (
            <p className="text-xs text-muted-foreground px-4">
              {browsing ? "Pick any exercise below to preview its muscle diagram." : "Click a result to render its muscle diagram."}
            </p>
          )}
          {selected && (
            <>
              <div className="flex-1 flex items-center justify-center gap-3 w-full min-h-[10rem] relative">
                <div className="relative flex items-center justify-center h-40 w-[7.5rem] shrink-0">
                  {imgSrc && !imgLoaded && !imgError && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <MuscleDiagramSkeleton />
                    </div>
                  )}
                  {imgSrc && !imgError && (
                    <img
                      key={diagramKey}
                      ref={muscleImgRef}
                      src={imgSrc}
                      alt={selected.name}
                      onLoad={markDiagramLoaded}
                      onError={() => {
                        if (loadTargetRef.current !== diagramKey) return;
                        setImgError(true);
                        setImgLoaded(false);
                        diagramStartRef.current = null;
                        diagramDoneRef.current = false;
                        setDiagramTiming(null);
                      }}
                      className={cn(DIAGRAM_IMG_CLASS, "transition-opacity duration-200", imgLoaded ? "opacity-100" : "opacity-0")}
                    />
                  )}
                  {!imgSrc && (
                    <p className="text-[11px] text-muted-foreground px-2">No muscle diagram for this exercise.</p>
                  )}
                  {imgError && (
                    <p className="text-[11px] text-muted-foreground px-2">Diagram failed to load.</p>
                  )}
                </div>
                {gifSrc && (
                  <img
                    src={gifSrc}
                    alt=""
                    className="max-h-36 w-auto rounded-lg border border-border object-contain bg-background"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
              </div>
              <div className="mt-2 w-full">
                <div className="text-sm font-semibold truncate">{selected.name}</div>
                {selected.level && (
                  <div className="text-[11px] text-muted-foreground capitalize">
                    {selected.level}
                    {selected.equipment ? ` · ${selected.equipment}` : ""}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        873 exercises pre-mapped to Anatome&apos;s 23 muscle slugs. Live calls go to{" "}
        <span className="font-mono text-foreground">api.anatome.dev</span>.
      </p>
    </div>
  );
}
