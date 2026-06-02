import React from "react";
import { API_BASE } from "@/lib/apiBase";
import Hero from "@/components/home/Hero";
import ImageDemoCard from "@/components/home/ImageDemoCard";
import SearchDemoCard from "@/components/home/SearchDemoCard";
import McpDemoCard from "@/components/home/McpDemoCard";
import { Link } from "react-router-dom";
import { Bot, ArrowRight } from "lucide-react";
import CodeExamples from "@/components/home/CodeExamples";
import BenchmarksSection from "@/components/home/BenchmarksSection";
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
          <Link
            to="/ai-guide"
            className="block rounded-2xl border border-border bg-card p-6 hover:bg-secondary/40 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-4 h-4 text-primary" />
              <h3 className="font-display font-semibold">AI Guide — describe an exercise in plain English</h3>
              <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto" />
            </div>
            <p className="text-xs text-muted-foreground">
              Live LLM extraction + muscle diagram demo (rate-limited). Integrate Anatome into chatbots via resolveExercise — no AI endpoint on the public API.
            </p>
          </Link>
          <McpDemoCard />
        </section>

        {/* Code examples */}
        <section>
          <SectionHead eyebrow="Drop-in" title="Three ways to integrate" />
          <CodeExamples baseUrl={baseUrl} />
        </section>

        {/* Benchmarks */}
        <section>
          <BenchmarksSection />
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