import React from "react";
import { Link } from "react-router-dom";

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-background/60">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] font-mono text-muted-foreground text-center">
        <a
          href="https://nextsolutions.studio"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Built with ♥ by NextSolutions
        </a>
        <span className="flex items-center gap-2">
          <Link to="/tos" className="hover:text-foreground transition-colors">Terms</Link>
          <span aria-hidden="true">·</span>
          <span>© 2026 NextSolutions</span>
        </span>
        <a
          href="https://airon.coach"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary transition-colors"
        >
          Try our AI coach: airon.coach →
        </a>
      </div>
    </footer>
  );
}