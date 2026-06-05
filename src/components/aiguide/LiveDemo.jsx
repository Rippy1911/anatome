import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { absApiUrl } from "@/lib/apiBase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, AlertTriangle } from "lucide-react";
import MuscleGroupsList from "@/components/aiguide/MuscleGroupsList";

const SUGGESTIONS = ["the exercise where you bench a barbell lying down", "king of leg exercises with a barbell on your back", "curling a dumbbell to work the front of your arm"];

export default function LiveDemo() {
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [remaining, setRemaining] = useState(null);

  const run = async (text) => {
    const d = (text != null ? text : desc).trim();
    if (!d) return;
    setLoading(true); setError(null); setResult(null);
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

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Live demo — describe an exercise</h3>
        {remaining != null && <span className="ml-auto text-[11px] font-mono text-muted-foreground">{remaining} left today</span>}
      </div>

      <div className="flex gap-2">
        <Input value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="Describe any exercise in plain English..." className="h-10" />
        <Button onClick={() => run()} disabled={loading || !desc.trim()} className="h-10 shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Visualize"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => { setDesc(s); run(s); }} disabled={loading}
            className="text-[11px] px-2 py-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="grid sm:grid-cols-[200px_1fr] gap-4 items-start pt-2">
          <div className="rounded-xl border border-border overflow-hidden bg-secondary/40">
            {result.anatome_imageSrc && <img src={absApiUrl(result.anatome_imageSrc)} alt={result.exercise_name_extracted} className="w-full" />}
          </div>
          <div className="space-y-3 text-sm">
            {result.matched && (
              <div>
                <span className="text-muted-foreground">Matched exercise:</span>{" "}
                <span className="font-semibold capitalize">{result.exercise_name_extracted}</span>
              </div>
            )}
            {!result.matched && (
              <div>
                <span className="text-muted-foreground">Resolved as:</span>{" "}
                <span className="font-semibold capitalize">{result.exercise_name_extracted}</span>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Match: <span className="font-mono">{result.source}</span>
              {result.matched === false && " (no muscle map)"}
            </div>
            <MuscleGroupsList
              layers={result.layers}
              muscleGroups={result.muscle_groups}
              matched={result.matched}
            />
            {result.exercise_image_url && (
              <div className="pt-1">
                <div className="text-[11px] text-muted-foreground mb-1">free-exercise-db reference photo</div>
                <img src={result.exercise_image_url} alt={result.exercise_name_extracted} className="rounded-lg border border-border max-h-28 w-auto" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}