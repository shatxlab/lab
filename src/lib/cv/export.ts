/** Taking the CV away: semantic HTML (the source for DOCX), a real .docx, and plain text. */

import { htmlToDocx } from "@/lib/docx/write";
import type { Cv } from "@/lib/cv/schema";
import { headerOf, sectionsOf, type Block } from "@/lib/cv/sections";

const esc = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The first non-empty of a CV's own name and its owner's name, for titles and file names. */
export const titleOf = (cv: Cv): string => cv.profile.fullName.trim() || cv.name.trim() || "CV";

const entryLine = (block: Extract<Block, { kind: "entry" }>): { strong: string; rest: string } => {
  const where = [block.subtitle, block.place].filter(Boolean).join(", ");
  const tail = [block.url, block.dates].filter(Boolean).join(" · ");
  return { strong: block.title || block.subtitle, rest: [block.title ? where : block.place, tail].filter(Boolean).join(" — ") };
};

/**
 * Plain structural HTML: one `h1`, `h2` headings, paragraphs and lists. No
 * tables, columns or images, so it converts to a clean Word document and reads
 * in order for anything that parses it.
 */
export function cvToHtml(cv: Cv): string {
  const header = headerOf(cv);
  const out: string[] = [];
  if (header.name) out.push(`<h1>${esc(header.name)}</h1>`);
  if (header.headline) out.push(`<p>${esc(header.headline)}</p>`);
  if (header.contact.length) out.push(`<p>${header.contact.map(esc).join(" · ")}</p>`);
  if (header.links.length) out.push(`<p>${header.links.map((link) => esc([link.label, link.url].filter(Boolean).join(": "))).join(" · ")}</p>`);

  for (const section of sectionsOf(cv)) {
    out.push(`<h2>${esc(section.heading)}</h2>`);
    for (const block of section.blocks) {
      if (block.kind === "paragraph") out.push(`<p>${esc(block.text)}</p>`);
      else if (block.kind === "skills") out.push(`<p>${block.label ? `<strong>${esc(block.label)}:</strong> ` : ""}${esc(block.items.join(", "))}</p>`);
      else {
        const { strong, rest } = entryLine(block);
        out.push(`<p><strong>${esc(strong)}</strong>${rest ? `${strong ? ", " : ""}${esc(rest)}` : ""}</p>`);
        if (block.bullets.length) out.push(`<ul>${block.bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join("")}</ul>`);
      }
    }
  }
  return out.join("\n");
}

export function cvToDocx(cv: Cv): Uint8Array {
  return htmlToDocx(cvToHtml(cv), { title: titleOf(cv) });
}

/** Plain text with upper-case headings and "- " bullets: pastes cleanly into any form or email. */
export function cvToText(cv: Cv): string {
  const header = headerOf(cv);
  const lines: string[] = [];
  if (header.name) lines.push(header.name);
  if (header.headline) lines.push(header.headline);
  if (header.contact.length) lines.push(header.contact.join(" | "));
  for (const link of header.links) lines.push([link.label, link.url].filter(Boolean).join(": "));

  for (const section of sectionsOf(cv)) {
    if (lines.length) lines.push("");
    lines.push(section.heading.toLocaleUpperCase(cv.settings.lang === "ru" ? "ru-RU" : "en-US"));
    for (const block of section.blocks) {
      if (block.kind === "paragraph") lines.push(block.text);
      else if (block.kind === "skills") lines.push(`${block.label ? `${block.label}: ` : ""}${block.items.join(", ")}`);
      else {
        const { strong, rest } = entryLine(block);
        lines.push(`${strong}${rest ? `${strong ? ", " : ""}${rest}` : ""}`);
        for (const bullet of block.bullets) lines.push(`- ${bullet}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

/** `Alex Morgan` → `Alex-Morgan-CV.docx`. */
export function cvFileName(cv: Cv, extension: string): string {
  const slug = titleOf(cv).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "CV";
  return `${slug}-CV.${extension}`;
}

export const CV_FILE_FORMAT = "lab-cv";

/** The CV as a file you can open again: plain JSON with a format marker. */
export function cvToJson(cv: Cv): string {
  return JSON.stringify({ format: CV_FILE_FORMAT, version: 1, cv }, null, 2);
}
