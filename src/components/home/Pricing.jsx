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
    <div className="grid md:grid-cols-2 gap-5">
      {/* FREE / DEMO */}
      <div className="rounded-2xl border border-border bg-card p-6 flex flex-col">
        <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Free / Demo</div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-display font-bold">$0</span>
          <span className="text-sm text-muted-foreground">/month</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">No API key needed</p>
        <ul className="space-y-2.5 mt-5 flex-1">
          <Feature>Unlimited from localhost & 127.0.0.1 (perfect for development)</Feature>
          <Feature>1000 requests/day per IP · 100 requests/day per public host</Feature>
          <Feature>All endpoints included</Feature>
          <Feature>Apache-2.0 self-hosting always free</Feature>
        </ul>
      </div>

      {/* PRO */}
      <div className="rounded-2xl border-2 border-primary bg-card p-6 flex flex-col relative">
        <div className="absolute -top-3 left-6 bg-primary text-primary-foreground text-[11px] font-semibold px-2.5 py-0.5 rounded-full">RapidAPI</div>
        <div className="text-xs font-mono uppercase tracking-wider text-primary">Pro</div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-display font-bold">$5</span>
          <span className="text-sm text-muted-foreground">/month via RapidAPI</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">For production apps</p>
        <ul className="space-y-2.5 mt-5 flex-1">
          <Feature>50,000 requests/month</Feature>
          <Feature>Same endpoints, no rate limit on public hosts</Feature>
          <Feature>$0.0001/request overage</Feature>
          <Feature>Email support</Feature>
        </ul>
        <p className="text-xs text-muted-foreground mt-5 leading-relaxed border-t border-border pt-4">
          Pricing is cost-recovery — we aim for no profit. Any surplus funds infrastructure and development of the project.
          Self-host for free at{" "}
          <a href="https://github.com/Rippy1911/anatome" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">github.com/Rippy1911/anatome</a>.
        </p>
      </div>
    </div>
  );
}