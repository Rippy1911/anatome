import React, { useState } from "react";
import { Code2 } from "lucide-react";
import CopyBlock from "./CopyBlock";

const TABS = (base) => ([
  {
    key: "img",
    label: "<img> HTML",
    code: `<img
  src="${base}/generateImage?gender=male&view=dual&layers=DC2626:chest|F59E0B:triceps&output=raw"
  alt="Muscle diagram"
  width="384"
/>`,
  },
  {
    key: "fetch",
    label: "fetch (JS)",
    code: `const res = await fetch("${base}/generateImage", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ gender: "male", view: "front", layers: [{ color: "#DC2626", muscles: ["chest"] }] })
});
const { svg } = await res.json();`,
  },
  {
    key: "curl",
    label: "curl",
    code: `curl "${base}/generateImage?layers=DC2626:chest,abs&view=front&output=raw" \\
  -o body.svg
# Or search exercises:
curl "${base}/searchExercises?q=bench&limit=5"`,
  },
]);

export default function CodeExamples({ baseUrl }) {
  const tabs = TABS(baseUrl);
  const [active, setActive] = useState("img");
  const current = tabs.find((t) => t.key === active);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Code2 className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold">Three ways to use it</h3>
      </div>
      <div className="flex gap-1 mb-3 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${active === t.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <CopyBlock code={current.code} />
    </div>
  );
}