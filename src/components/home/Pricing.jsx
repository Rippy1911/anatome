import React from "react";
import { Check } from "lucide-react";

function Feature({ children }) {
  return (
    <li className="flex items-start gap-2 text-sm text-muted-foreground">
      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

export default function Pricing() {
  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-2xl border-2 border-primary bg-card p-6 flex flex-col relative">
        <div className="absolute -top-3 left-6 bg-primary text-primary-foreground text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
          Basic
        </div>
        <div className="text-xs font-mono uppercase tracking-wider text-primary">Via RapidAPI</div>
        <div className="mt-2 flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl font-display font-bold">$0</span>
          <span className="text-sm text-muted-foreground">base · pay only for overage</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          1,000 requests included every month, then{" "}
          <span className="font-mono text-foreground">$0.0001</span> per request.
        </p>
        <ul className="space-y-2.5 mt-5 flex-1">
          <Feature>1,000 requests/month included (Basic plan)</Feature>
          <Feature>$0.0001 per request above the monthly allowance</Feature>
          <Feature>All endpoints — images, ExerciseDB, MCP</Feature>
          <Feature>Unlimited from localhost for development & testing</Feature>
          <Feature>Apache-2.0 — self-host for free anytime</Feature>
        </ul>
        <p className="text-xs text-muted-foreground mt-5 leading-relaxed border-t border-border pt-4">
          Pricing is cost-recovery — we aim for no profit. Any surplus funds infrastructure and development.
          Self-host at{" "}
          <a href="https://github.com/Rippy1911/anatome" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            github.com/Rippy1911/anatome
          </a>
          {" "}or subscribe on{" "}
          <a href="https://rapidapi.com/anatome/api/anatome" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            RapidAPI
          </a>.
        </p>
      </div>
    </div>
  );
}
