import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, X, Database } from "lucide-react";
import { MUSCLES } from "@/data/muscleCatalog";
import ExerciseResultRow from "./ExerciseResultRow";

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
  const debounceRef = useRef(null);

  const runSearch = async () => {
    if (!q.trim() && muscle === "any" && equipment === "any" && level === "any") {
      setResults([]); setTotal(0); return;
    }
    setLoading(true);
    try {
      const res = await base44.functions.invoke("searchExercises", { q, muscle, equipment, level, limit: 20 });
      if (res.data?.ok) { setResults(res.data.results || []); setTotal(res.data.total_matched || 0); }
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

  const handleSelect = (ex) => {
    const payload = ex.anatome_layers_payload || [];
    // Build editor layers: red primary, orange secondary, accessory empty (per spec).
    const layers = payload.length
      ? payload.map((l) => ({ color: l.color, muscles: l.muscles || [], opacity: l.opacity != null ? l.opacity : 1 }))
      : [{ color: "#DC2626", muscles: ex.primaryMuscles || [], opacity: 1 }];
    onSelect(layers);
    setLoaded(ex);
  };

  return (
    <div className="space-y-3">
      {loaded && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
          <span className="text-xs text-foreground truncate">
            Loaded: <span className="font-semibold">{loaded.name}</span> · From ExerciseDB (CC0)
          </span>
          <button onClick={() => setLoaded(null)} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-4 h-4" /></button>
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