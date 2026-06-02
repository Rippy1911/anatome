import React from "react";
import { Link } from "react-router-dom";
import { Plug, ArrowRight } from "lucide-react";
import { PUBLIC_API } from "@/lib/apiBase";
import CopyBlock from "./CopyBlock";

const MCP_URL = `${PUBLIC_API}/mcp`;

const CONFIG = `{
  "mcpServers": {
    "anatome": {
      "url": "${MCP_URL}"
    }
  }
}`;

export default function McpDemoCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-3">
        <Plug className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold">Connect to any MCP-compatible AI</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Anatome exposes 5 MCP tools. Drop this config into Claude Desktop / Cursor / Continue.dev:
      </p>
      <CopyBlock code={CONFIG} />
      <Link to="/docs#mcp" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:gap-1.5 transition-all mt-4">
        5 tools: generate_muscle_image, list_muscles, search_exercises, get_exercise, resolve_exercise
        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
      </Link>
    </div>
  );
}