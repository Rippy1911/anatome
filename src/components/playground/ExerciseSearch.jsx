import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, X, Database } from "lucide-react";
import { MUSCLES } from "@/data/muscleCatalog";
import ExerciseResultRow from "./ExerciseResultRow";
import { PUBLIC_API, exerciseMediaUrl } from "@/lib/apiBase";

const EQUIPMENT = ["any", "barbell", "dumbbell", "cable", "machine", "body only", "kettlebells", "bands", "medicine ball", "exercise ball", "e-z curl bar", "foam roll", "other"];
const LEVELS = ["any", "beginner", "intermediate", "expert"];

function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex w-full rounded-lg bg-secondary p-1 gap-1">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={`flex-1 min-h-[34px] rounded-md text-xs font-medium capitalize transition-colors ${value === o ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

export default function ExerciseSearch({ onSelect }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("any");
  const [equipment, setEquipment] = useState("any");
  const [level, setLevel] = useState("any");
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(null);
  const [loadedDetail, setLoadedDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const debounceRef = useRef(null);

  const runSearch = async () => {
    if (!q.trim() && muscle === "any" && equipment === "any" && level === "any") {
      setResults([]); setTotal(0); return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (q.trim()) params.set("q", q);
      if (muscle !== "any") params.set("muscle", muscle);
      if (equipment !== "any") params.set("equipment", equipment);
      if (level !== "any") params.set("level", level);
      const res = await fetch(`${PUBLIC_API}/searchExercises?${params}`);
      const data = await res.json();
      if (data?.ok) { setResults(data.results || []); setTotal(data.total_matched || 0); }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(runSearch, 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, muscle, equipment, level]);

  const handleSelect = async (ex) => {
    const payload = ex.anatome_layers_payload || [];
    const layers = payload.length
      ? payload.map((l) => ({ color: l.color, muscles: l.muscles || [], opacity: l.opacity != null ? l.opacity : 1 }))
      : [{ color: "#DC2626", muscles: ex.primaryMuscles || [], opacity: 1 }];
    onSelect(layers, ex);
    setLoaded(ex);
    setLoadedDetail(null);
    setDetailLoading(true);
    try {
      const id = ex.ext_id || ex.id;
      const params = new URLSearchParams({
        fields: "name,instructions,keywords,movementType,variations,relatedExerciseIds",
      });
      if (id) params.set("id", id);
      else if (ex.name) params.set("name", ex.name);
      const res = await fetch(`${PUBLIC_API}/getExercise?${params}`);
      const data = await res.json();
      if (data?.ok && data.exercise) setLoadedDetail(data.exercise);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {loaded && (
        <div className="flex items-center gap-3 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
          {exerciseMediaUrl(loaded) && (
            <img
              src={exerciseMediaUrl(loaded)}
              alt=""
              className="w-14 h-14 rounded-md border border-border object-cover bg-background shrink-0"
              loading="lazy"
            />
          )}
          <span className="text-xs text-foreground truncate flex-1">
            Loaded: <span className="font-semibold">{loaded.name}</span> · ExerciseDB (CC0)
          </span>
          <button
            type="button"
            onClick={() => { setLoaded(null); setLoadedDetail(null); onSelect(null, null); }}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Clear loaded exercise"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loaded && (detailLoading || loadedDetail?.instructions?.length > 0) && (
        <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Instructions</div>
          {detailLoading ? (
            <p className="text-xs text-muted-foreground">Loading steps…</p>
          ) : (
            <ol className="list-decimal list-inside text-xs text-foreground space-y-1 max-h-40 overflow-y-auto">
              {loadedDetail.instructions.map((step, i) => (
                <li key={i} className="leading-relaxed">{step}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      <div className="relative">
        {loading ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" /> : <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 873 exercises..." className="pl-9 h-10" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Muscle</Label>
          <Select value={muscle} onValueChange={setMuscle}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="any">Any muscle</SelectItem>
              {MUSCLES.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Equipment</Label>
          <Select value={equipment} onValueChange={setEquipment}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-64">
              {EQUIPMENT.map((eq) => <SelectItem key={eq} value={eq} className="capitalize">{eq === "any" ? "Any equipment" : eq}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Level</Label>
        <Segmented value={level} onChange={setLevel} options={LEVELS} />
      </div>

      {results.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-3 py-1.5 bg-secondary/40 text-[11px] font-mono text-muted-foreground flex items-center gap-1.5">
            <Database className="w-3 h-3" /> {total} match{total === 1 ? "" : "es"}{total > results.length ? ` · showing ${results.length}` : ""}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {results.map((ex) => <ExerciseResultRow key={ex.id} ex={ex} onClick={handleSelect} />)}
          </div>
        </div>
      )}
      {!loading && results.length === 0 && (q.trim() || muscle !== "any" || equipment !== "any" || level !== "any") && (
        <p className="text-xs text-muted-foreground px-1">No exercises match your filters.</p>
      )}
    </div>
  );
}