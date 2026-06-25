import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Check, X as XIcon, Activity, ExternalLink, Loader2 } from "lucide-react";
import { ATTRIBUTION_SOURCE } from "@/data/muscleCatalog";
import { PUBLIC_API } from "@/lib/apiBase";

// CI health tile. Calls the API's /ciStatus endpoint, which reads the private
// GitHub repo's latest main CI run server-side (token stays off the browser).
// Replaces the old /selfTest call — /selfTest is now admin-gated and returned
// 404 to the public, which rendered "undefined/undefined tests passing".
// Degrades to a static "CI on GitHub" link if the token isn't set or the
// upstream call fails — never shows undefined.
const DOTS = {
  green: "bg-emerald-500",
  red: "bg-destructive",
  running: "bg-amber-500 animate-pulse",
  neutral: "bg-muted-foreground",
  unknown: "bg-muted-foreground",
};

export default function HealthBar() {
  const [status, setStatus] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${PUBLIC_API}/ciStatus`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setStatus(d || null))
      .catch(() => setFailed(true));
    return () => ctrl.abort();
  }, []);

  const state = failed ? "unknown" : status?.state || "unknown";
  const label = failed ? "CI: unavailable" : status?.label || "CI: checking main…";
  const url = status?.url || "https://github.com/Rippy1911/anatome/actions";

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap text-xs text-muted-foreground border-t border-border px-4 py-3">
      <Dialog>
        <DialogTrigger asChild>
          <button className="inline-flex items-center gap-2 hover:text-foreground transition-colors">
            <span className={`w-2.5 h-2.5 rounded-full ${DOTS[state] || DOTS.unknown}`} />
            <Activity className="w-3.5 h-3.5" />
            <span className="font-mono">{label}</span>
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>CI health — GitHub Actions on main</DialogTitle></DialogHeader>
          <div className="space-y-2 text-xs">
            <p className="text-muted-foreground">
              The live status comes from the anatome API's <span className="font-mono text-foreground">/ciStatus</span> endpoint,
              which reads the latest workflow run on <span className="font-mono text-foreground">main</span> server-side.
            </p>
            <div className="flex items-center gap-2">
              {state === "green" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : state === "red" ? <XIcon className="w-3.5 h-3.5 text-destructive" /> : <Loader2 className="w-3.5 h-3.5 text-muted-foreground" />}
              <span className="font-mono">{label}</span>
              {status?.run_number != null && <span className="text-muted-foreground">run #{status.run_number}</span>}
            </div>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
              Open run in GitHub <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </DialogContent>
      </Dialog>

      <a href={ATTRIBUTION_SOURCE} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
        Anatomy paths © Hicham El Boussarghini (MIT) <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}
