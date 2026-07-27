import React from "react";
import { AI_DISCLOSURE_SHORT } from "@/components/guides/AiGeneratedBadge";

function Row({ label, children }) {
  return (
    <p className="leading-relaxed">
      <span className="font-semibold text-foreground">{label}</span> {children}
    </p>
  );
}

const A = ({ href, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="underline underline-offset-2 hover:text-foreground"
  >
    {children}
  </a>
);

/**
 * Licence and attribution for everything rendered under /guides. Mandatory on the
 * page — the progression text, the exercise GIFs and the video demos are three
 * different licences with three different holders.
 */
export default function GuidesAttribution({ sources = [], generatedAt }) {
  return (
    <footer className="mt-14 space-y-2 border-t border-border pt-6 text-xs text-muted-foreground">
      <Row label="Progression content.">
        Skill trees, cues, faults, unlock criteria, timelines and progression patterns are
        original work by NextSolutions, licensed{" "}
        <A href="https://creativecommons.org/licenses/by/4.0/">CC-BY-4.0</A>. Coaching
        conventions are synthesised from publicly discussed standards and cited below — no
        third-party text is reproduced.
      </Row>
      <Row label="Site code.">
        <A href="https://github.com/Rippy1911/anatome">anatome</A> is licensed{" "}
        <A href="https://www.apache.org/licenses/LICENSE-2.0">Apache-2.0</A>. Muscle diagrams
        are rendered by api.anatome.dev from anatomical paths in{" "}
        <A href="https://github.com/HichamELBSI/react-native-body-highlighter">
          react-native-body-highlighter
        </A>{" "}
        (MIT).
      </Row>
      <Row label="Video demos.">
        Embedded from the creators&rsquo; own YouTube channels through youtube-nocookie.com and
        clipped to the relevant seconds. Nothing is downloaded or re-hosted; all rights remain
        with the respective channels.
      </Row>
      <Row label="Exercise imagery.">
        The exercise <em>metadata</em> in{" "}
        <A href="https://github.com/yuhonas/free-exercise-db">free-exercise-db</A> — names,
        muscle mappings, instructions — is released under the Unlicense by its compiler and we
        rely on it. The accompanying <em>images</em> are a different matter: the upstream
        collection states they were gathered from the internet without established rights, so
        their provenance is unverified and we make no reuse claim for them. They are withheld
        from this page by default.
      </Row>
      <Row label="Demonstration coverage.">
        We publish a demonstration only where we hold the rights or can embed it from the
        rights holder. Many steps therefore have no demo yet; those show a related reference
        link instead of a stand-in image, and first-party clips are being produced to close
        the gap.
      </Row>
      <Row label="AI-generated media.">
        None is published here. If synthetic media is ever added it carries a visible
        &ldquo;{AI_DISCLOSURE_SHORT}&rdquo; label beside the asset before you see it, with the
        same wording exposed to screen readers (EU AI Act Article 50, applicable 2026-08-02).
      </Row>
      <Row label="Not medical advice.">
        These progressions are general strength-training information. Train within your
        ability and consult a qualified professional about pain or injury.
      </Row>

      {sources.length > 0 && (
        <details className="pt-2">
          <summary className="cursor-pointer font-semibold text-foreground">
            Cited sources ({sources.length})
          </summary>
          <ul className="mt-2 space-y-1.5 pl-4">
            {sources.map((s) => (
              <li key={s.id} className="list-disc leading-relaxed">
                {s.url ? <A href={s.url}>{s.title}</A> : s.title}
                {s.author ? ` — ${s.author}` : ""}
                {s.year ? ` (${s.year})` : ""}
                {s.tier ? <span className="text-muted-foreground/70"> · {s.tier}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      )}

      {generatedAt && <p className="pt-2 font-mono text-[11px]">Catalog snapshot {generatedAt}</p>}
    </footer>
  );
}
