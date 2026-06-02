import React from "react";
import { Bot, Workflow, Code2, Wrench } from "lucide-react";
import FlowDiagram from "@/components/aiguide/FlowDiagram";
import CodeBlock from "@/components/aiguide/CodeBlock";
import LiveDemo from "@/components/aiguide/LiveDemo";
import AironPromo from "@/components/AironPromo";

const TOOL_DEF = `{
  "name": "generate_muscle_image",
  "description": "Render an anatomical muscle diagram highlighting the muscles worked by an exercise.",
  "parameters": {
    "type": "object",
    "properties": {
      "exercise": { "type": "string", "description": "Exercise name, e.g. 'bench press'" }
    },
    "required": ["exercise"]
  }
}`;

const RESOLVE_THEN_RENDER = `// 1. Resolve an exercise name to muscle layers
const r = await fetch("https://anatome.app/functions/resolveExercise", {
  method: "POST",
  body: JSON.stringify({ exercise: "bench press" })
}).then((res) => res.json());

// 2. Embed the pre-built image URL straight in your chat reply
//    (r.image_src is a ready-to-use <img src>)
return \`Here are the muscles worked by bench press:\\n\\n![muscles](\${r.image_src})\`;`;

const OPENAI_TOOL = `import OpenAI from "openai";
const openai = new OpenAI();

const tools = [{
  type: "function",
  function: {
    name: "generate_muscle_image",
    description: "Render muscles worked by an exercise",
    parameters: {
      type: "object",
      properties: { exercise: { type: "string" } },
      required: ["exercise"]
    }
  }
}];

// When the model calls the tool, hit Anatome and return the image URL:
async function generate_muscle_image({ exercise }) {
  const r = await fetch("https://anatome.app/functions/resolveExercise", {
    method: "POST", body: JSON.stringify({ exercise })
  }).then((x) => x.json());
  return r.image_src; // drop this into your message as an image
}`;

function Heading({ icon: Icon, children }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-display font-bold tracking-tight mt-10 mb-3">
      <Icon className="w-5 h-5 text-primary" /> {children}
    </h2>
  );
}

export default function AiGuide() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
          <Bot className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-display font-bold tracking-tight">AI Guide</h1>
      </div>
      <p className="text-muted-foreground">
        Anatome is built for AI agents. Give your chatbot or fitness app the ability to <em>show</em>,
        not just describe, the muscles an exercise works — with one HTTP call.
      </p>

      <Heading icon={Workflow}>How it works</Heading>
      <p className="text-sm text-muted-foreground mb-4">
        Your LLM extracts the exercise name, Anatome resolves it to muscle layers and returns a
        ready-to-embed image URL. No rendering, no canvas, no asset hosting on your side.
      </p>
      <FlowDiagram />

      <Heading icon={Wrench}>Try it live</Heading>
      <p className="text-sm text-muted-foreground mb-4">
        This demo runs a real LLM extraction + Anatome render — the exact flow above. It's
        rate-limited to keep the demo free; the manual <a href="/" className="text-primary underline">Playground</a> is unlimited.
      </p>
      <LiveDemo />

      <Heading icon={Code2}>Drop-in: resolve then render</Heading>
      <p className="text-sm text-muted-foreground mb-3">The simplest integration — two steps, ~10 lines.</p>
      <CodeBlock label="javascript" code={RESOLVE_THEN_RENDER} />

      <Heading icon={Code2}>As an OpenAI tool / function call</Heading>
      <p className="text-sm text-muted-foreground mb-3">Register Anatome as a tool and let the model call it.</p>
      <CodeBlock label="javascript" code={OPENAI_TOOL} />

      <Heading icon={Code2}>MCP tool definition</Heading>
      <p className="text-sm text-muted-foreground mb-3">
        Anatome ships a Model Context Protocol server at <span className="font-mono text-xs">/functions/mcp</span>.
        Here's the <span className="font-mono text-xs">generate_muscle_image</span> tool schema.
      </p>
      <CodeBlock label="json" code={TOOL_DEF} />

      <div className="mt-10"><AironPromo /></div>

      <div className="mt-8 pt-6 border-t border-border text-xs text-muted-foreground">
        Anatomy paths © Hicham El Boussarghini (MIT). Exercise data from free-exercise-db (CC0-1.0).
        Anatome by NextSolutions.
      </div>
    </div>
  );
}