import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { absApiUrl, exerciseMediaUrl } from "@/lib/apiBase";
import { Search, Loader2, Dumbbell } from "lucide-react";

function Chip({ children, tone = "primary" }) {
  const cls = tone === "primary" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${cls}`}>{children}</span>;
}

export default function SearchDemoCard({ baseUrl }) {
  const [q, setQ] = useState("bench");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await base44.functions.invoke("searchExercises", { q, limit: 6 });
        setResults(res.data?.results || []);
      } catch { setResults([]); }
      setLoading(false);
    }, 350);
    return () => timer.current && clearTimeout(timer.current);
  }, [q]);

  const pick = (e) => { setSelected(e); setImgLoaded(false); };
  const imgSrc = selected?.anatome_imageSrc ? absApiUrl(selected.anatome_imageSrc) : null;
  const gifSrc = selected ? exerciseMediaUrl(selected) : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Dumbbell className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold">Search 873 exercises</h3>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search e.g. bench, squat, curl…"
              className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div className="mt-2 rounded-lg border border-border divide-y divide-border max-h-60 overflow-y-auto">
            {results.length === 0 && !loading && <div className="p-3 text-xs text-muted-foreground">No results.</div>}
            {results.map((e) => (
              <button key={e.id} onClick={() => pick(e)} className={`w-full text-left p-2.5 hover:bg-secondary transition-colors ${selected?.id === e.id ? "bg-secondary" : ""}`}>
                <div className="text-sm font-medium truncate">{e.name}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(e.primaryMuscles || []).slice(0, 3).map((m) => <Chip key={m}>{m}</Chip>)}
                  {(e.secondaryMuscles || []).slice(0, 2).map((m) => <Chip key={m} tone="muted">{m}</Chip>)}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-[#f1f5f9] dark:bg-[#0a0e17] p-3 min-h-[15rem] flex flex-col items-center justify-center text-center">
          {!selected && <p className="text-xs text-muted-foreground px-4">Click a result to render its muscle diagram.</p>}
          {selected && (
            <>
              <div className="flex-1 flex items-center justify-center gap-3 w-full">
                <div className="flex items-center justify-center">
                  {!imgLoaded && <div className="w-20 h-40 rounded-lg bg-muted animate-pulse" />}
                  {imgSrc && <img src={imgSrc} alt={selected.name} onLoad={() => setImgLoaded(true)} className={`max-h-40 w-auto ${imgLoaded ? "block" : "hidden"}`} />}
                </div>
                {gifSrc && (
                  <img src={gifSrc} alt="" className="max-h-36 w-auto rounded-lg border border-border object-contain bg-background" loading="lazy" />
                )}
              </div>
              <div className="mt-2 w-full">
                <div className="text-sm font-semibold truncate">{selected.name}</div>
                {selected.level && <div className="text-[11px] text-muted-foreground capitalize">{selected.level}{selected.equipment ? ` · ${selected.equipment}` : ""}</div>}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Powered by free-exercise-db (CC0). 873 exercises pre-mapped to our 23 muscle slugs.
      </p>
    </div>
  );
}