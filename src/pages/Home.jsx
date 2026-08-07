import React from "react";
import { PUBLIC_API } from "@/lib/apiBase";
import Hero from "@/components/home/Hero";
import Onboarding from "@/components/home/Onboarding";
import ImageDemoCard from "@/components/home/ImageDemoCard";
import SearchDemoCard from "@/components/home/SearchDemoCard";
import McpDemoCard from "@/components/home/McpDemoCard";
import CodeExamples from "@/components/home/CodeExamples";
import BenchmarksSection from "@/components/home/BenchmarksSection";

function SectionHead({ eyebrow, title }) {
  return (
    <div className="mb-6 text-center">
      {eyebrow && <div className="text-xs font-mono uppercase tracking-wider text-primary mb-1">{eyebrow}</div>}
      <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-tight">{title}</h2>
    </div>
  );
}

export default function Home() {
  const baseUrl = PUBLIC_API;

  return (
    <div>
      <Hero />

      <div className="max-w-5xl mx-auto px-4 py-14 space-y-16">
        {/* Onboarding comes first: connecting the thing is the point of the page. */}
        <Onboarding />

        {/* Live demos — each one waits for a click rather than spending fair use on page load. */}
        <section className="space-y-5">
          <SectionHead eyebrow="Live demos" title="Press play and these call the real API" />
          <ImageDemoCard baseUrl={baseUrl} />
          <SearchDemoCard baseUrl={baseUrl} />
          <McpDemoCard />
        </section>

        {/* Code examples */}
        <section>
          <SectionHead eyebrow="Drop-in" title="Three ways to integrate" />
          <CodeExamples />
        </section>

        {/* Benchmarks */}
        <section>
          <BenchmarksSection />
        </section>
      </div>
    </div>
  );
}
