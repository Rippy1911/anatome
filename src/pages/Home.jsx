import React from "react";
import { API_BASE } from "@/lib/apiBase";
import Hero from "@/components/home/Hero";
import ImageDemoCard from "@/components/home/ImageDemoCard";
import SearchDemoCard from "@/components/home/SearchDemoCard";
import AiDemoCard from "@/components/home/AiDemoCard";
import McpDemoCard from "@/components/home/McpDemoCard";
import CodeExamples from "@/components/home/CodeExamples";
import Pricing from "@/components/home/Pricing";

function SectionHead({ eyebrow, title }) {
  return (
    <div className="mb-6 text-center">
      {eyebrow && <div className="text-xs font-mono uppercase tracking-wider text-primary mb-1">{eyebrow}</div>}
      <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-tight">{title}</h2>
    </div>
  );
}

export default function Home() {
  const baseUrl = API_BASE;

  return (
    <div>
      <Hero baseUrl={baseUrl} />

      <div className="max-w-5xl mx-auto px-4 py-14 space-y-16">
        {/* Live demos */}
        <section className="space-y-5">
          <SectionHead eyebrow="Live demos" title="Everything below is calling the real API" />
          <ImageDemoCard baseUrl={baseUrl} />
          <SearchDemoCard baseUrl={baseUrl} />
          <AiDemoCard baseUrl={baseUrl} />
          <McpDemoCard />
        </section>

        {/* Code examples */}
        <section>
          <SectionHead eyebrow="Drop-in" title="Three ways to integrate" />
          <CodeExamples baseUrl={baseUrl} />
        </section>

        {/* Pricing */}
        <section>
          <SectionHead eyebrow="Pricing" title="Simple, cost-recovery pricing" />
          <Pricing />
        </section>
      </div>
    </div>
  );
}