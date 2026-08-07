import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plug, ArrowRight, AlertTriangle } from "lucide-react";
import { apiUrl, MCP_ENDPOINT } from "@/lib/apiBase";

const WIP_TOOLS = new Set(["list_guides", "get_guide", "get_guide_tree"]);

// Reads the live tool list from `GET /mcp` rather than repeating it here — the previous version
// said "5 MCP tools" long after there were ten. That endpoint is static and unmetered, so this
// costs nothing against fair use.
export default function McpDemoCard() {
  const [tools, setTools] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl("/mcp"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) setTools(d.tools || []); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-3">
        <Plug className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold">
          {tools ? `${tools.length} tools, live from the server` : "Tools available over MCP"}
        </h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Read straight from <span className="font-mono text-foreground">{MCP_ENDPOINT}</span> as you
        load this page — so it cannot go stale.
      </p>

      {failed && <p className="text-xs text-muted-foreground">Could not reach the API just now.</p>}

      {tools && (
        <ul className="flex flex-wrap gap-1.5">
          {tools.map((name) => (
            <li
              key={name}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[11px] ${
                WIP_TOOLS.has(name)
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "bg-secondary text-secondary-foreground"
              }`}
              title={WIP_TOOLS.has(name) ? "Work in progress — unverified content" : undefined}
            >
              {WIP_TOOLS.has(name) && <AlertTriangle className="h-3 w-3" />}
              {name}
            </li>
          ))}
        </ul>
      )}

      <Link to="/docs#mcp" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:gap-1.5 transition-all mt-4">
        What each tool does <ArrowRight className="w-3.5 h-3.5 shrink-0" />
      </Link>
    </div>
  );
}
