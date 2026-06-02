import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AIAssist({ onResolve, currentLayers }) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState("");

  const submit = async () => {
    const exercise = value.trim();
    if (!exercise) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("resolveExercise", { exercise });
      const data = res.data;
      if (!data || !data.ok) { toast.error("Could not resolve exercise."); return; }
      const prev = currentLayers;
      onResolve(data.layers);
      setExplanation(data.explanation || "");
      if (!data.matched) {
        toast(`No exact match for "${exercise}" — used keyword fallback.`);
      } else {
        toast(`Loaded ${data.layers.length} layers for "${data.exercise}".`, {
          action: { label: "Undo", onClick: () => onResolve(prev) },
        });
      }
    } catch (e) {
      toast.error("Request failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Type an exercise (e.g. 'bench press')"
          className="h-11"
        />
        <Button onClick={submit} disabled={loading} className="h-11 px-4 gap-2 shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Resolve
        </Button>
      </div>
      {explanation && (
        <p className="text-xs text-muted-foreground leading-relaxed bg-secondary/50 rounded-lg p-3 border border-border">
          {explanation}
        </p>
      )}
    </div>
  );
}