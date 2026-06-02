import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { API_BASE } from "@/lib/apiBase";
import { Sparkles, Loader2, AlertTriangle } from "lucide-react";

const SUGGESTIONS = [
  "the exercise where you bench a barbell lying down",
  "king of leg exercises with a barbell on your back",
  "curling a dumbbell to work the front of your arm",
];

export default function AiDemoCard({ baseUrl }) {
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  const run = async (text) => {
    const d = (text != null ? text : desc).trim();
    if (!d) return;
    setLoading(true); setError(null); setResult(null); setImgLoaded(false);
    try {
      const res = await base44.functions.invoke("aiDemo", { description: d });
      if (res.data?.ok) {
        setResult(res.data);
        setRemaining(res.data.remaining);
      } else {
        setError(res.data?.message || res.data?.error || "Something went wrong.");
      }
    } catch (e) {
      const data = e?.response?.data;
      setError(data?.message || data?.error || "Request failed. The daily AI demo limit may be reached.");
    } finally {
      setLoading(false);
    }
  };

  // Resolve a usable absolute image source. aiDemo returns anatome_imageSrc;
  // make relative paths absolute against the live API host so it always loads.
  const imgSrc = result?.anatome_imageSrc
    ? (result.anatome_imageSrc.startsWith("http") ? result.anatome_imageSrc : `${API_BASE}${result.anatome_imageSrc}`)
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold">AI demo — describe an exercise in plain English</h3>
        {remaining != null && <span className="ml-auto text-[11px] font-mono text-muted-foreground">{remaining} left today</span>}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        An LLM extracts the exercise name, then Anatome maps it to muscles and renders the diagram from the 873-exercise database.
      </p>

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <div className="flex gap-2">
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="Describe any exercise…"
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <button
              onClick={() => run()}
              disabled={loading || !desc.trim()}
              className="shrink-0 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Visualize"}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => { setDesc(s); run(s); }} disabled={loading}
                className="text-[11px] px-2 py-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors text-left">
                {s}
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-foreground mt-3">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="mt-3 space-y-1.5 text-xs">
              <div><span className="text-muted-foreground">LLM extracted:</span> <span className="font-semibold capitalize">{result.exercise_name_extracted}</span></div>
              <div className="text-muted-foreground">Source: <span className="font-mono">{result.source}</span></div>
              {(result.layers || []).map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm border border-border" style={{ backgroundColor: l.color, opacity: l.opacity || 1 }} />
                  <span className="text-muted-foreground">{(l.muscles || []).join(", ")}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-[#f1f5f9] dark:bg-[#0a0e17] p-3 min-h-[15rem] flex flex-col items-center justify-center text-center">
          {!result && !loading && <p className="text-xs text-muted-foreground px-4">Describe an exercise to render its muscle diagram.</p>}
          {loading && <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />}
          {result && imgSrc && (
            <div className="flex-1 flex items-center justify-center gap-4 w-full">
              <div className="flex items-center justify-center">
                {!imgLoaded && <div className="w-20 h-40 rounded-lg bg-muted animate-pulse" />}
                <img src={imgSrc} alt={result.exercise_name_extracted} onLoad={() => setImgLoaded(true)} className={`max-h-48 w-auto ${imgLoaded ? "block" : "hidden"}`} />
              </div>
              {result.exercise_image_url && (
                <div className="flex flex-col items-center gap-1">
                  <img src={result.exercise_image_url} alt={result.exercise_name_extracted} className="max-h-40 w-auto rounded-lg border border-border bg-white" />
                  <span className="text-[10px] text-muted-foreground">ExerciseDB photo</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}