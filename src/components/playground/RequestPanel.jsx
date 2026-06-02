import React, { useState, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Copy, Check, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

// TODO (post-v2): CLI tool + npm package wrappers around these same endpoints.

// Full JSON payload — used by the POST examples (supports gradients, per_muscle, defs).
function buildPayload(settings, layers) {
  return {
    gender: settings.gender,
    view: settings.view,
    layers: layers.filter((l) => (l.muscles || []).length > 0).map((l) => ({
      color: l.color, muscles: l.muscles, ...(l.opacity != null && l.opacity !== 1 ? { opacity: l.opacity } : {}),
    })),
    body_color: settings.bodyColor,
    border_color: settings.borderColor,
    border_width: settings.borderWidth,
    background: settings.background,
    width: settings.width,
    height: settings.height,
    format: "svg",
    output: "json",
  };
}

// Compact `layers` string for the GET form: "color@opacity:m1,m2|color:m3"
function buildCompactLayers(layers) {
  return layers
    .filter((l) => (l.muscles || []).length > 0)
    .map((l) => {
      const color = String(l.color || "").replace(/^#/, "");
      const head = l.opacity != null && l.opacity !== 1 ? `${color}@${l.opacity}` : color;
      return `${head}:${l.muscles.join(",")}`;
    })
    .join("|");
}

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative">
      <Button size="icon" variant="ghost" onClick={copy} className="absolute top-2 right-2 h-7 w-7 z-10">
        {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
      </Button>
      <pre className="bg-[#0a0e17] border border-border rounded-lg p-3 pr-10 overflow-x-auto text-[11px] leading-relaxed font-mono text-foreground/90 max-h-72">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Hint({ children }) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center text-muted-foreground"><Info className="w-3 h-3" /></span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function RequestPanel({ settings, layers, baseUrl }) {
  const payload = useMemo(() => buildPayload(settings, layers), [settings, layers]);
  const url = `${baseUrl}/functions/generateImage`;
  const body = JSON.stringify(payload, null, 2);

  // GET URL (compact, raw SVG out) — the killer feature for <img> embedding.
  const compact = useMemo(() => buildCompactLayers(layers), [layers]);
  const getParams = new URLSearchParams({
    gender: settings.gender, view: settings.view, layers: compact,
    width: String(settings.width), height: String(settings.height), output: "raw",
  });
  if (settings.background && settings.background !== "transparent") getParams.set("background", settings.background);
  const getUrl = `${url}?${getParams.toString()}`;

  const curlGet = `# Drop into a browser, or pipe to imgcat:\ncurl '${getUrl}' | imgcat`;
  const curlPost = `curl -X POST '${url}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(payload)}'`;
  const fetchGet = `// Compact GET — returns raw SVG text\nconst svg = await fetch('${getUrl}').then(r => r.text());\n// drop svg straight into the DOM, or use the URL in an <img>`;
  const fetchPost = `const res = await fetch('${url}', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify(${body})\n});\nconst data = await res.json();\n// data.svg contains the rendered <svg>`;
  const imgTag = `<img\n  src="${getUrl}"\n  alt="Muscles worked"\n/>`;

  return (
    <Tabs defaultValue="img" className="w-full">
      <TabsList className="grid grid-cols-5 w-full h-auto">
        <TabsTrigger value="img" className="text-[11px] px-1">&lt;img&gt;</TabsTrigger>
        <TabsTrigger value="curlGet" className="text-[11px] px-1">cURL GET</TabsTrigger>
        <TabsTrigger value="curlPost" className="text-[11px] px-1">cURL POST</TabsTrigger>
        <TabsTrigger value="fetchGet" className="text-[11px] px-1">fetch GET</TabsTrigger>
        <TabsTrigger value="fetchPost" className="text-[11px] px-1">fetch POST</TabsTrigger>
      </TabsList>

      <TabsContent value="img" className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Hint>Easiest integration — paste this tag anywhere. The image renders server-side.</Hint>
          Easiest possible integration: paste into any HTML.
        </p>
        <CodeBlock code={imgTag} />
        {compact ? (
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">Live preview of that exact URL:</p>
            <div className="rounded-lg border border-border overflow-hidden bg-secondary/40 flex justify-center p-2">
              <img src={getUrl} alt="Live preview" className="max-h-56" />
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Add a muscle to a layer to see the live preview.</p>
        )}
      </TabsContent>

      <TabsContent value="curlGet" className="mt-3 space-y-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Hint>Simplest call — a single URL. Drop it into a browser or pipe to imgcat.</Hint>
          cURL GET: simplest, just a URL.
        </p>
        <CodeBlock code={curlGet} />
      </TabsContent>

      <TabsContent value="curlPost" className="mt-3 space-y-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Hint>Needed for gradients (defs), per-muscle overrides, and side filters.</Hint>
          cURL POST: full schema for gradients &amp; per-muscle overrides.
        </p>
        <CodeBlock code={curlPost} />
      </TabsContent>

      <TabsContent value="fetchGet" className="mt-3 space-y-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Hint>Fetch the compact URL from JS; returns raw SVG text.</Hint>
          fetch GET: returns raw SVG text.
        </p>
        <CodeBlock code={fetchGet} />
      </TabsContent>

      <TabsContent value="fetchPost" className="mt-3 space-y-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Hint>Full JSON body; returns a JSON wrapper with svg + metadata.</Hint>
          fetch POST: full body, returns JSON wrapper.
        </p>
        <CodeBlock code={fetchPost} />
      </TabsContent>
    </Tabs>
  );
}