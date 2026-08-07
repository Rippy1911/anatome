import React, { useState } from "react";
import { Code2 } from "lucide-react";
import { PUBLIC_API, MCP_ENDPOINT, FAIR_USE_PER_DAY } from "@/lib/apiBase";
import CopyBlock from "./CopyBlock";

// Every example is unauthenticated, because every call is. There is no key tab any more and no
// marketplace tab: the paid path is the hosted platform, not a header.
const TABS = [
  {
    key: "img",
    label: "<img> embed",
    note: (
      <>
        No auth headers, so it works straight from HTML. Fair use is {FAIR_USE_PER_DAY} requests
        a day per caller — for an embed on a busy page, self-host the Worker or use the platform.
      </>
    ),
    code: `<img
  src="${PUBLIC_API}/generateImage?gender=male&view=dual&layers=DC2626:chest|F59E0B:triceps&output=raw"
  alt="Muscle diagram"
  width="384"
/>`,
  },
  {
    key: "fetch",
    label: "fetch",
    code: `const res = await fetch(
  "${PUBLIC_API}/searchExercises?q=bench&limit=5"
);
const { results } = await res.json();

// Out of fair use? 429 with a body you can act on:
// { error: "daily_fair_use_limit_reached", retryable: false, reset_at: "…" }`,
  },
  {
    key: "mcp",
    label: "MCP",
    note: <>Point any MCP client at this URL. No token, no registration step.</>,
    code: `{
  "mcpServers": {
    "anatome": { "type": "http", "url": "${MCP_ENDPOINT}" }
  }
}`,
  },
];

export default function CodeExamples() {
  const [active, setActive] = useState("img");
  const current = TABS.find((t) => t.key === active);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Code2 className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold">Ways to integrate</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Three shapes, one API, no credentials in any of them.
      </p>
      <div className="flex gap-1 mb-3 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${active === t.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <CopyBlock code={current.code} note={current.note} />
    </div>
  );
}
