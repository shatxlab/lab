import type { AppLang } from "@/lib/apps/lang";
import { td } from "@/lib/text/diff-i18n";
import type { AssetKind } from "@/lib/workbench/kinds";

/** A downloadable export shaped like a workbench operation output. */
export interface DiffExport {
  name: string;
  type: string;
  bytes: Uint8Array;
  kind?: AssetKind;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

function slug(name: string): string {
  const stem = name.replace(/\.[^.]*$/, "");
  return stem.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "compare";
}

/** `a.txt` + `b.txt` → "a-vs-b" (a stable, filesystem-safe stem for exports). */
export function diffFileStem(leftName: string, rightName: string): string {
  const left = slug(leftName);
  const right = slug(rightName);
  return left === right ? left : `${left}-vs-${right}`;
}

/** The unified diff itself, as a `.patch` file. */
export function diffPatchOutput(leftName: string, rightName: string, patch: string): DiffExport {
  return {
    name: `${diffFileStem(leftName, rightName)}.patch`,
    type: "text/x-diff",
    bytes: new TextEncoder().encode(patch),
    kind: "text",
  };
}

/** A self-contained HTML report: title, names + summary, then the diff. */
export function diffReportOutput(lang: AppLang, leftName: string, rightName: string, patch: string, summary: string): DiffExport {
  const title = td(lang, "reportTitle");
  const subtitle = td(lang, "reportSub", { leftName, rightName, summary });
  const html = [
    "<!doctype html>",
    `<html lang="${lang}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(`${leftName} → ${rightName} — ${title}`)}</title>`,
    "<style>",
    "body{font:14px/1.5 system-ui,sans-serif;margin:2rem auto;max-width:60rem;padding:0 1rem;color:#1a1a1a}",
    "h1{font-size:1.2rem}p.meta{color:#555}",
    "pre{background:#f6f6f6;border:1px solid #ddd;border-radius:6px;padding:1rem;overflow:auto;white-space:pre-wrap;word-break:break-word}",
    "</style>",
    "</head>",
    `<body><h1>${escapeHtml(title)}</h1><p class="meta">${escapeHtml(subtitle)}</p><pre>${escapeHtml(patch)}</pre></body>`,
    "</html>",
  ].join("\n");
  return {
    name: `${diffFileStem(leftName, rightName)}-diff.html`,
    type: "text/html",
    bytes: new TextEncoder().encode(html),
    kind: "html",
  };
}
