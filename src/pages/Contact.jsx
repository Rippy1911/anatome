import React from "react";
import { Mail, Github, Globe } from "lucide-react";

export default function Contact() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight mb-4">Contact</h1>
      <p className="text-sm text-muted-foreground leading-relaxed mb-8">
        Have a question about the Anatome muscle visualizer API, need help with integration, or
        want to report an issue? Reach out through any of the channels below — we're happy to help.
      </p>

      <div className="space-y-4">
        <a
          href="mailto:hello@nextsolutions.studio"
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:border-primary transition-colors"
        >
          <Mail className="w-5 h-5 text-primary shrink-0" />
          <div>
            <div className="text-sm font-semibold text-foreground">Email</div>
            <div className="text-sm text-muted-foreground">hello@nextsolutions.studio</div>
          </div>
        </a>

        <a
          href="https://github.com/Rippy1911/anatome"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:border-primary transition-colors"
        >
          <Github className="w-5 h-5 text-primary shrink-0" />
          <div>
            <div className="text-sm font-semibold text-foreground">GitHub</div>
            <div className="text-sm text-muted-foreground">Open an issue or contribute on GitHub</div>
          </div>
        </a>

        <a
          href="https://nextsolutions.studio"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:border-primary transition-colors"
        >
          <Globe className="w-5 h-5 text-primary shrink-0" />
          <div>
            <div className="text-sm font-semibold text-foreground">Website</div>
            <div className="text-sm text-muted-foreground">nextsolutions.studio</div>
          </div>
        </a>
      </div>
    </div>
  );
}