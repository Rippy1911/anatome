import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function CodeBlock({ code, label }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group rounded-xl border border-border bg-secondary/40 overflow-hidden">
      {label && (
        <div className="px-4 py-2 border-b border-border text-[11px] font-mono text-muted-foreground">{label}</div>
      )}
      <button
        onClick={copy}
        className="absolute top-2 right-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] bg-background/80 border border-border text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className="p-4 overflow-x-auto text-xs leading-relaxed font-mono text-foreground/90 whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}