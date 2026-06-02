import React from "react";
import ReactMarkdown from "react-markdown";
import termsMd from "../../TERMS.md?raw";

const components = {
  h1: ({ children }) => (
    <h1 className="font-display text-3xl font-bold tracking-tight mb-4">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-display text-xl font-bold tracking-tight mt-12 mb-3 scroll-mt-24">{children}</h2>
  ),
  p: ({ children }) => (
    <p className="text-sm text-muted-foreground leading-relaxed my-2">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="text-sm text-muted-foreground leading-relaxed my-2 ml-5 list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="text-sm text-muted-foreground leading-relaxed my-2 ml-5 list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  hr: () => <hr className="my-8 border-border" />,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>
  ),
};

export default function Tos() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <ReactMarkdown components={components}>{termsMd}</ReactMarkdown>
    </div>
  );
}
