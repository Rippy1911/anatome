import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyBlock({ code, label }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="relative group">
      {label && <div className="text-[11px] font-mono text-muted-foreground mb-1.5">{label}</div>}
      <pre className="bg-[#0a0e17] border border-border rounded-lg p-4 pr-12 overflow-x-auto text-[12px] leading-relaxed font-mono text-foreground/90"><code>{code}</code></pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 inline-flex items-center justify-center w-8 h-8 rounded-md bg-secondary/80 hover:bg-secondary border border-border transition-colors"
        aria-label="Copy"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
    </div>
  );
}