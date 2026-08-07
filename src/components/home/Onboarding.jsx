import React, { useState } from "react";
import { Check, Copy, ArrowUpRight, Sparkles } from "lucide-react";
import { PUBLIC_API, PLATFORM_URL, FAIR_USE_PER_DAY } from "@/lib/apiBase";
import CopyBlock from "@/components/home/CopyBlock";

const MCP_URL = `${PUBLIC_API}/mcp`;

const CLIENTS = [
  {
    id: "claude",
    label: "Claude",
    steps: [
      "Open Settings → Connectors",
      "Click Add custom connector",
      "Paste the URL below into Remote MCP server URL",
      "Save. Anatome shows up in the tools list right away.",
    ],
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    steps: [
      "Open Settings → Apps",
      "Click Create app",
      "Paste the URL below as the MCP server URL",
      "Set authentication to None, then save.",
    ],
  },
  {
    id: "config",
    label: "Config file",
    steps: ["For clients configured by file, add this server entry."],
    code: `{
  "mcpServers": {
    "anatome": {
      "type": "http",
      "url": "${MCP_URL}"
    }
  }
}`,
  },
  {
    id: "http",
    label: "Plain HTTP",
    steps: ["No MCP client? Every tool has a REST equivalent. No key, no header."],
    code: `curl "${PUBLIC_API}/searchExercises?q=bench&limit=3"`,
  },
];

const PROMPTS = [
  "Which muscles does a Bulgarian split squat actually work?",
  "I did bench press, rows and squats today — show me a heatmap of what I hit.",
  "Find me a beginner barbell exercise for the posterior chain and show me the movement.",
];

function UrlCopy() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(MCP_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <button
      onClick={copy}
      className="w-full flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3.5 text-left transition-colors hover:bg-primary/10"
    >
      <code className="flex-1 font-mono text-sm sm:text-base break-all">{MCP_URL}</code>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

function Step({ n, title, children }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs font-bold text-primary-foreground">
        {n}
      </div>
      <div className="min-w-0 flex-1 pb-8">
        <h3 className="font-display font-semibold leading-7">{title}</h3>
        <div className="mt-2 space-y-3 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const [client, setClient] = useState("claude");
  const active = CLIENTS.find((c) => c.id === client) || CLIENTS[0];

  return (
    <section id="onboarding" className="scroll-mt-24">
      <div className="mb-8 text-center">
        <div className="mb-1 font-mono text-xs uppercase tracking-wider text-primary">Onboarding</div>
        <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Three steps. No account, no API key.
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Anatome is a remote MCP server. Paste one URL into your assistant and start asking.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <Step n={1} title="Add the connector">
          <div className="flex flex-wrap gap-1.5">
            {CLIENTS.map((c) => (
              <button
                key={c.id}
                onClick={() => setClient(c.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  c.id === client
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <ol className="ml-4 list-decimal space-y-1 marker:text-muted-foreground/60">
            {active.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>

          {active.code ? <CopyBlock code={active.code} /> : <UrlCopy />}
        </Step>

        <Step n={2} title="Ask it something">
          <p>No setup, no profile to fill in. Try one of these:</p>
          <ul className="space-y-1.5">
            {PROMPTS.map((p) => (
              <li key={p} className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed">
                “{p}”
              </li>
            ))}
          </ul>
        </Step>

        <Step n={3} title="Know the fair-use limit">
          <p>
            Free, with a fair-use budget of{" "}
            <strong className="text-foreground">{FAIR_USE_PER_DAY} requests a day</strong>, resetting at
            00:00 UTC. Nothing to sign up for and no card on file.
          </p>
          <p>
            When you run out, the tool returns a plain explanation rather than an error — your
            assistant will tell you that you have reached the daily limit and when it resets, instead
            of claiming the connector is broken.
          </p>
        </Step>

        <div className="flex gap-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display font-semibold leading-7">Need more than that?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This is the open-source tier: the catalog, the anatomy, the diagrams, self-hostable on
              your own Cloudflare account. The hosted platform adds AI meal and workout parsing,
              interactive widgets, curated programming, coach and trainee accounts, wearable imports
              and quotas that fit a product.
            </p>
            <a
              href={PLATFORM_URL}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              platform.anatome.dev <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
