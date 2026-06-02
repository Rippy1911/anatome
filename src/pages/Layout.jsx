import React from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { Activity } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import SiteFooter from "@/components/SiteFooter";
import { useTheme } from "@/hooks/useTheme";

function NavLink({ to, children }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active ? "text-foreground bg-secondary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

export default function Layout() {
  // Initialize theme on mount (applies stored/system preference before first paint of children).
  useTheme();
  return (
    <div className="min-h-screen bg-background text-foreground font-body antialiased">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Activity className="w-4.5 h-4.5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-base leading-none tracking-tight">Anatome</div>
              <div className="hidden sm:block text-[11px] text-muted-foreground leading-none mt-1 font-mono">muscle group image generator API</div>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/">Playground</NavLink>
            <NavLink to="/docs">Docs</NavLink>
            <NavLink to="/ai-guide">AI Guide</NavLink>
            <NavLink to="/api">API</NavLink>
            <div className="ml-1 pl-1 border-l border-border"><ThemeToggle /></div>
          </nav>
        </div>
      </header>
      <main><Outlet /></main>
      <SiteFooter />
    </div>
  );
}