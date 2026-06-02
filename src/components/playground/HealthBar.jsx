import React, { useEffect, useState } from "react";
import { PUBLIC_API } from "@/lib/apiBase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Check, X as XIcon, Activity, ExternalLink } from "lucide-react";
import { ATTRIBUTION_SOURCE } from "@/data/muscleCatalog";

export default function HealthBar() {
  const [status, setStatus] = useState("loading");
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch(`${PUBLIC_API}/selfTest`)
      .then((res) => res.json())
      .then((d) => {
        setResult(d);
        if (d.failed === 0) setStatus("green");
        else if (d.passed > d.failed) setStatus("yellow");
        else setStatus("red");
      })
      .catch(() => setStatus("red"));
  }, []);

  const dot = { loading: "bg-muted-foreground animate-pulse", green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-destructive" }[status];
  const label = result ? `${result.passed}/${result.total} tests passing` : "running self-test…";

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap text-xs text-muted-foreground border-t border-border px-4 py-3">
      <Dialog>
        <DialogTrigger asChild>
          <button className="inline-flex items-center gap-2 hover:text-foreground transition-colors">
            <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
            <Activity className="w-3.5 h-3.5" />
            <span className="font-mono">{label}</span>
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Self-test results</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            {result?.tests?.map((t) => (
              <div key={t.name} className="flex items-start gap-2 text-xs">
                {t.passed ? <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> : <XIcon className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />}
                <div>
                  <span className="font-mono">{t.name}</span>
                  {!t.passed && t.detail && <span className="text-destructive/80 ml-2">{t.detail}</span>}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <a href={ATTRIBUTION_SOURCE} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
        Anatomy paths © Hicham El Boussarghini (MIT) <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}