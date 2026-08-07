import React, { useState } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { Menu, X, Github } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import SiteFooter from "@/components/SiteFooter";
import Logo from "@/components/Logo";
import { useTheme } from "@/hooks/useTheme";

const REPO_URL = "https://github.com/Rippy1911/anatome";

// /guides is deliberately absent: the skill catalog is a work in progress, so the pages stay
// reachable by URL (and by the MCP tools, which say so) but are not advertised in the nav.
const NAV = [
  { to: "/", label: "Home" },
  { to: "/playground", label: "Playground" },
  { to: "/docs", label: "Docs" },
  { to: "/api", label: "API" },
  { to: "/use-cases", label: "Use cases" },
];

function NavLink({ to, children, onClick = undefined }) {
  const { pathname } = useLocation();
  const active = pathname === to || (to !== "/" && pathname.startsWith(`${to}/`));
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active ? "text-foreground bg-secondary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

export default function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Initialize theme on mount (applies stored/system preference before first paint of children).
  useTheme();
  return (
    <div className="min-h-screen bg-background text-foreground font-body antialiased">
      <Logo asFavicon={true} />
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-16 md:h-20 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center justify-center shrink-0" onClick={() => setIsMobileMenuOpen(false)}>
            <Logo className="h-12 md:h-16 w-auto" alt="Anatome.dev Muscle API" />
          </Link>

          <div className="flex items-center gap-2 md:hidden">
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub repository" className="p-2 text-muted-foreground hover:text-foreground">
              <Github className="w-5 h-5" />
            </a>
            <ThemeToggle />
            <button
              className="p-2 text-muted-foreground hover:text-foreground"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to}>{item.label}</NavLink>
            ))}
            <div className="ml-2 pl-2 border-l border-border shrink-0 flex items-center gap-1">
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub repository" className="p-2 text-muted-foreground hover:text-foreground">
                <Github className="w-5 h-5" />
              </a>
              <ThemeToggle />
            </div>
          </nav>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background px-4 py-4 shadow-lg absolute w-full">
            <nav className="flex flex-col gap-2">
              {NAV.map((item) => (
                <NavLink key={item.to} to={item.to} onClick={() => setIsMobileMenuOpen(false)}>
                  {item.label}
                </NavLink>
              ))}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground">
                <Github className="w-4 h-4" /> GitHub
              </a>
            </nav>
          </div>
        )}
      </header>
      <main><Outlet /></main>
      <SiteFooter />
    </div>
  );
}
