import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ImageIcon, ArrowRight, Play } from "lucide-react";
import CopyBlock from "./CopyBlock";

const QS = "?gender=male&view=front&layers=DC2626:chest|F59E0B:triceps|FCD34D:abs&output=raw";

// Click-to-run, not run-on-mount. Fair use is 50 requests a day per caller, and a landing page
// that spends several of them before the visitor has asked for anything is a bad trade — for
// them and for the origin. Nothing here loads until someone presses the button.
export default function ImageDemoCard({ baseUrl }) {
  const [run, setRun] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = `${baseUrl}/generateImage${QS}`;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <ImageIcon className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold">See it in action</h3>
      </div>
      <div className="grid sm:grid-cols-[200px_1fr] gap-5 items-start">
        <div className="rounded-xl border border-border bg-[#f1f5f9] dark:bg-[#0a0e17] flex items-center justify-center h-56 overflow-hidden">
          {!run && (
            <button
              onClick={() => setRun(true)}
              className="inline-flex flex-col items-center gap-2 px-4 py-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background">
                <Play className="w-4 h-4" />
              </span>
              Run it live
            </button>
          )}
          {run && !loaded && <div className="w-24 h-44 rounded-lg bg-muted animate-pulse" />}
          {run && (
            <img
              src={url}
              alt="Chest, triceps and abs highlighted"
              onLoad={() => setLoaded(true)}
              className={`max-h-52 w-auto transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0 absolute"}`}
            />
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <CopyBlock code={url} label="The exact URL — no key, no header:" />
          <Link to="/playground" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:gap-1.5 transition-all">
            Try changing the URL <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
