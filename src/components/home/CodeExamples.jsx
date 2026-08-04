import React, { useState } from "react";
import { Code2 } from "lucide-react";
import { PUBLIC_API, RAPIDAPI_BASE, RAPIDAPI_HOST, RAPIDAPI_LISTING_URL } from "@/lib/apiBase";
import CopyBlock from "./CopyBlock";

const TABS = [
  {
    key: "img",
    label: "<img> embed",
    note: (
      <>
        Direct <span className="font-mono text-foreground">api.anatome.dev</span> embeds are fair-use
        limited (150 req/day per public host). For production volume use a Bearer key or{" "}
        <a href={RAPIDAPI_LISTING_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          RapidAPI
        </a>.
      </>
    ),
    code: `<!-- Drop-in SVG — no auth headers -->
<img
  src="${PUBLIC_API}/generateImage?gender=male&view=dual&layers=DC2626:chest|F59E0B:triceps&output=raw"
  alt="Muscle diagram"
  width="384"
/>`,
  },
  {
    key: "bearer",
    label: "Bearer key",
    code: `const res = await fetch(
  "${PUBLIC_API}/searchExercises?q=bench&limit=5",
  { headers: { Authorization: "Bearer ana_live_YOUR_KEY" } }
);
const { results } = await res.json();`,
  },
  {
    key: "rapidapi-fetch",
    label: "RapidAPI (optional)",
    code: `// Alternate billing channel — keep the key server-side
const res = await fetch(
  "${RAPIDAPI_BASE}/generateImage?gender=male&view=dual&layers=DC2626:chest|F59E0B:triceps&output=raw",
  {
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": "${RAPIDAPI_HOST}",
    },
  }
);
const blob = await res.blob();
img.src = URL.createObjectURL(blob);`,
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
        Start with a direct <span className="font-mono text-foreground">&lt;img&gt;</span> embed or a Bearer key.
        RapidAPI remains an optional billing channel.
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
