import React, { useState } from "react";
import { Code2 } from "lucide-react";
import { PUBLIC_API, RAPIDAPI_BASE, RAPIDAPI_HOST, RAPIDAPI_LISTING_URL } from "@/lib/apiBase";
import CopyBlock from "./CopyBlock";

const TABS = [
  {
    key: "rapidapi-fetch",
    label: "RapidAPI (fetch)",
    code: `// Subscribe at rapidapi.com — keep the key server-side in production
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
// Browser: attach to <img> via blob URL (headers cannot be set on <img src>)
img.src = URL.createObjectURL(blob);`,
  },
  {
    key: "bearer",
    label: "Bearer key (platform)",
    code: `// Full platform API — get a free key at anatome-body-api.base44.app/onboarding
// 41 MCP tools · food · per-user workouts · progression analytics · AI
const res = await fetch(
  "https://anatome.nextsolutions.studio/v1/exercise/search?q=bench&limit=5",
  {
    headers: {
      "Authorization": "Bearer anp_YOUR_KEY",
      "X-App-User-Id": "user-123", // your user's identifier
    },
  }
);
const { data } = await res.json();
const exercises = data.results; // [{ name, primaryMuscles, source_images, gif_url, ... }]`,
  },
  {
    key: "rapidapi-curl",
    label: "RapidAPI (curl)",
    code: `curl "${RAPIDAPI_BASE}/generateImage?layers=DC2626:chest,abs&view=front&output=raw" \\
  -H "X-RapidAPI-Key: $RAPIDAPI_KEY" \\
  -H "X-RapidAPI-Host: ${RAPIDAPI_HOST}" \\
  -o body.svg

# Search exercises (same headers on every endpoint):
curl "${RAPIDAPI_BASE}/searchExercises?q=bench&limit=5" \\
  -H "X-RapidAPI-Key: $RAPIDAPI_KEY" \\
  -H "X-RapidAPI-Host: ${RAPIDAPI_HOST}"`,
  },
  {
    key: "img",
    label: "<img> embed",
    note: (
      <>
        Browsers cannot send <span className="font-mono text-foreground">X-RapidAPI-Key</span> on{" "}
        <span className="font-mono text-foreground">&lt;img src&gt;</span> — use RapidAPI fetch + blob URL above,
        a server-side proxy, or self-host. Direct{" "}
        <span className="font-mono text-foreground">api.anatome.dev</span> works for drop-in embeds but is
        fair-use limited (100 req/day per public host).{" "}
        <a href={RAPIDAPI_LISTING_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          Subscribe on RapidAPI
        </a>{" "}
        for production server-side traffic.
      </>
    ),
    code: `<!-- Self-host (Apache-2.0) or low-traffic direct embed — no auth headers -->
<img
  src="${PUBLIC_API}/generateImage?gender=male&view=dual&layers=DC2626:chest|F59E0B:triceps&output=raw"
  alt="Muscle diagram"
  width="384"
/>`,
  },
];

export default function CodeExamples() {
  const [active, setActive] = useState("rapidapi-fetch");
  const current = TABS.find((t) => t.key === active);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Code2 className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold">Four ways to integrate</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Production integrations authenticate via RapidAPI headers or a Bearer key.
        The <span className="font-mono text-foreground">&lt;img&gt;</span> tab is for self-host or dev only.
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
