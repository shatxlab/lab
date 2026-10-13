/**
 * The résumé as a page. A template is a class on one sheet, styled in `cv.css`
 * (`classic`, `modern`, `minimal`, `ats`): the structure is always the same
 * single column of real text — header, then each section with a standard heading —
 * which is what applicant-tracking systems read best.
 */

import * as React from "react";

import type { Cv } from "@/lib/cv/schema";
import { headerOf, isWebUrl, sectionsOf, type Block } from "@/lib/cv/sections";

/** Accent colours that stay readable (and print well) on white. */
export const ACCENT_HEX: Record<string, string> = {
  blue: "#1f4f99",
  green: "#1b6b3a",
  violet: "#4a3aa7",
  red: "#a32626",
  ink: "#111111",
};

function Link({ url, label }: { url: string; label?: string }) {
  const text = label || url;
  return isWebUrl(url) ? <a href={url}>{text}</a> : <>{text}</>;
}

function Entry({ block }: { block: Extract<Block, { kind: "entry" }> }) {
  const sub = [block.subtitle, block.place].filter(Boolean).join(", ");
  return (
    <div className="cv-entry">
      <div className="cv-entry-head">
        <span className="cv-title">{block.title || block.subtitle}</span>
        {block.dates && <span className="cv-dates">{block.dates}</span>}
      </div>
      {block.title && sub && <div className="cv-sub">{sub}</div>}
      {!block.title && block.place && <div className="cv-sub">{block.place}</div>}
      {block.url && (
        <div className="cv-sub">
          <Link url={block.url} />
        </div>
      )}
      {block.bullets.length > 0 && (
        <ul>
          {block.bullets.map((bullet, i) => (
            <li key={i}>{bullet}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CvDocument({ cv }: { cv: Cv }) {
  const { settings } = cv;
  const header = headerOf(cv);
  const sections = sectionsOf(cv);

  return (
    <article
      className={`cv-sheet cv-${settings.template} cv-${settings.paper} ${settings.density === "compact" ? "cv-compact" : ""} ${settings.decorations ? "" : "cv-plain"}`}
      lang={settings.lang}
      style={{ "--cv-accent": ACCENT_HEX[settings.accent] } as React.CSSProperties}
    >
      <header>
        {header.name && <h1>{header.name}</h1>}
        {header.headline && <p className="cv-headline">{header.headline}</p>}
        {header.contact.length > 0 && <p className="cv-contact">{header.contact.join(" · ")}</p>}
        {header.links.length > 0 && (
          <p className="cv-contact">
            {header.links.map((link, i) => (
              <React.Fragment key={i}>
                {i > 0 && " · "}
                {link.label && link.url ? (
                  <>
                    {link.label}: <Link url={link.url} />
                  </>
                ) : (
                  <Link url={link.url} label={link.label} />
                )}
              </React.Fragment>
            ))}
          </p>
        )}
      </header>

      {sections.map((section) => (
        <section key={section.id}>
          <h2>{section.heading}</h2>
          {section.blocks.map((block, i) =>
            block.kind === "paragraph" ? (
              <p key={i}>{block.text}</p>
            ) : block.kind === "skills" ? (
              <p key={i} className="cv-skill-line">
                {block.label && <span className="cv-skill-label">{block.label}: </span>}
                {block.items.join(", ")}
              </p>
            ) : (
              <Entry key={i} block={block} />
            ),
          )}
        </section>
      ))}
    </article>
  );
}
