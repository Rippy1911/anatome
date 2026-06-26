import React from "react";
import ReactMarkdown from "react-markdown";

const ABOUT_MD = `# About Anatome

**Anatome** is a developer API and toolkit for generating anatomical muscle group diagrams as SVG and PNG images. With a single HTTP request, you can render clean, customizable visualizations of the human body that highlight specific muscle groups — front or back, male or female — in any color or style your application needs. Alongside the image API, Anatome ships an exercise database that maps thousands of movements to the muscles they target, plus a Model Context Protocol (MCP) server so AI agents and modern IDEs can call these tools directly.

## Who it's for

Anatome is built for fitness app developers, personal training platforms, physiotherapy and rehab tools, e-learning and educational products, and anyone building AI agents that need to reason about exercises and human anatomy. Instead of commissioning custom illustrations or wrestling with complex 3D rendering, teams can drop in a lightweight, fast, cache-friendly image URL and ship muscle visualizations in minutes. The free tier covers development and small projects, while the hosted production API scales through RapidAPI.

## Who builds it

Anatome is designed and maintained by **NextSolutions**, the studio behind the Airon AI coaching platform. We build practical developer tools and AI-powered fitness products. The Anatome API and software are open source under Apache-2.0, with anatomical path data (MIT) and exercise metadata (CC0) credited to their original authors.
`;

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
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>
  ),
};

export default function About() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <ReactMarkdown components={components}>{ABOUT_MD}</ReactMarkdown>
    </div>
  );
}