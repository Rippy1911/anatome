import React from "react";
import ReactMarkdown from "react-markdown";

const TERMS_MD = `# Terms of Use

_Last updated: June 2026_

Welcome to **Anatome** ("the Service"), a muscle group image generator API operated by NextSolutions ("we", "us", "our"). By accessing or using the Service, you agree to be bound by these Terms of Use.

## 1. The Service

Anatome provides an API that renders anatomical muscle diagrams as SVG/PNG images, along with an accompanying exercise database and Model Context Protocol (MCP) server. The Service is offered both as a hosted API and as open-source software under the Apache-2.0 license.

## 2. Acceptable Use

You agree not to:

- Use the Service for any unlawful purpose or in violation of any applicable laws.
- Attempt to circumvent rate limits, authentication, or other access controls.
- Resell or redistribute the hosted API as a competing service without proper attribution.
- Use the Service in a way that could damage, disable, or impair our infrastructure.

## 3. Rate Limits & Fair Use

The free tier includes a limited number of requests per month. Localhost and development traffic is unlimited. Production traffic is subject to the limits described in our documentation and on RapidAPI. We reserve the right to throttle or suspend access that exceeds fair-use thresholds.

## 4. Attribution & Licensing

- The Anatome API and software are licensed under **Apache-2.0** by NextSolutions.
- Anatomical SVG path data is **MIT licensed** (© Hicham El Boussarghini), ported from react-native-body-highlighter.
- Exercise metadata is from **wrkout/exercises.json** (**Unlicense**); reference photography served by `/exerciseImage` is uncleared — image copyright is unverified and **not** covered by the metadata Unlicense.

When self-hosting or redistributing, you must retain all applicable license notices.

## 5. No Warranty

The Service is provided "as is" without warranties of any kind, express or implied. We do not guarantee that the Service will be uninterrupted, error-free, or medically accurate. Anatome diagrams are for illustrative and educational purposes only and do not constitute medical advice.

## 6. Limitation of Liability

To the maximum extent permitted by law, NextSolutions shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.

## 7. Changes to These Terms

We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the revised Terms.

## 8. Contact

For questions about these Terms, please contact us via [nextsolutions.studio](https://nextsolutions.studio).
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
      <ReactMarkdown components={components}>{TERMS_MD}</ReactMarkdown>
    </div>
  );
}