import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Github } from "lucide-react";
import Logo from "@/components/Logo";
import { FAIR_USE_PER_DAY } from "@/lib/apiBase";
import { HERO_PERF_TAGLINE } from "@/lib/apiBenchmarks";

// The backdrop is a real /generateImage render, baked to a static file at
// public/hero-muscles.svg. It used to be fetched live on every page load, which spent one of
// the visitor's fair-use requests before they had asked for anything.
const HERO_ART = "/hero-muscles.svg";

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.07] dark:opacity-[0.12]">
        <img src={HERO_ART} alt="" className="h-[120%] w-auto max-w-none" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 py-20 sm:py-28 text-center">
        <div className="flex justify-center mb-6 mt-4">
          <Logo className="h-[5.5rem] w-auto" alt="Anatome API" />
        </div>

        <h1 className="font-display font-extrabold text-3xl sm:text-5xl tracking-tight leading-[1.1] max-w-3xl mx-auto">
          Muscle anatomy and 873 exercises, as one connector your assistant can just use
        </h1>

        <p className="mt-5 text-sm sm:text-base text-muted-foreground font-mono">
          Open source · Apache-2.0 · no API key · {FAIR_USE_PER_DAY} requests/day free · MCP-compatible
        </p>
        <p className="mt-2 text-xs text-muted-foreground font-mono">
          {HERO_PERF_TAGLINE}
        </p>

        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a href="#onboarding" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity">
            Connect it in 30 seconds <ArrowRight className="w-4 h-4" />
          </a>
          <Link to="/playground" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-border bg-card font-semibold text-sm hover:bg-secondary transition-colors">
            Try the Playground
          </Link>
          <a href="https://github.com/Rippy1911/anatome" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-border bg-card font-semibold text-sm hover:bg-secondary transition-colors">
            Source <Github className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
