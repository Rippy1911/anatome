import React, { useState, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

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

export default function RequestPanel({ settings, layers, baseUrl }) {
  const payload = useMemo(() => buildPayload(settings, layers), [settings, layers]);
  const url = `${baseUrl}/functions/generateImage`;
  const body = JSON.stringify(payload, null, 2);

  const curl = `curl -X POST '${url}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(payload)}'`;

  const js = `const res = await fetch('${url}', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify(${body})\n});\nconst data = await res.json();\n// data.svg contains the rendered <svg>`;

  const mcp = JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "generate_muscle_image", arguments: payload },
  }, null, 2);

  return (
    <Tabs defaultValue="curl" className="w-full">
      <TabsList className="grid grid-cols-3 w-full">
        <TabsTrigger value="curl">cURL</TabsTrigger>
        <TabsTrigger value="fetch">fetch</TabsTrigger>
        <TabsTrigger value="mcp">MCP</TabsTrigger>
      </TabsList>
      <TabsContent value="curl" className="mt-3"><CodeBlock code={curl} /></TabsContent>
      <TabsContent value="fetch" className="mt-3"><CodeBlock code={js} /></TabsContent>
      <TabsContent value="mcp" className="mt-3"><CodeBlock code={mcp} /></TabsContent>
    </Tabs>
  );
}