import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, ExternalLink } from "lucide-react";

import { HERO_PERF_TAGLINE } from "@/lib/apiBenchmarks";

const HERO_QS = "?gender=male&view=dual&layers=DC2626:chest,quadriceps,biceps|F59E0B:deltoids,abs,calves|FCD34D:triceps,gluteal,trapezius&output=raw";

export default function Hero({ baseUrl }) {
  const [loaded, setLoaded] = useState(false);
  const heroSrc = `${baseUrl}/functions/generateImage${HERO_QS}`;

  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* Background live SVG from our own API */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.07] dark:opacity-[0.12]">
        <img src={heroSrc} alt="" onLoad={() => setLoaded(true)} className="h-[120%] w-auto max-w-none" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 py-20 sm:py-28 text-center">
        <div className="inline-flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="font-display font-bold text-2xl tracking-tight">Anatome</span>
        </div>

        <h1 className="font-display font-extrabold text-3xl sm:text-5xl tracking-tight leading-[1.1] max-w-3xl mx-auto">
          The flexible muscle group image generator API for fitness apps and AI coaches
        </h1>

        <p className="mt-5 text-sm sm:text-base text-muted-foreground font-mono">
          Open source · Apache-2.0 · 1,000 free requests/month · MCP-compatible · 873 exercises included
        </p>
        <p className="mt-2 text-xs text-muted-foreground font-mono">
          {HERO_PERF_TAGLINE}
        </p>

        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/playground" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity">
            Try the Playground <ArrowRight className="w-4 h-4" />
          </Link>
          <a href="https://rapidapi.com/anatome/api/anatome" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-border bg-card font-semibold text-sm hover:bg-secondary transition-colors">
            View on RapidAPI <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}