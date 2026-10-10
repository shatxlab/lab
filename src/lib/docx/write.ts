/**
 * Hand-rolled WordprocessingML writer — a lossy HTML → `.docx` regenerate.
 *
 * The DOCX editor only sees sanitized, rendered HTML (mammoth output), so a
 * real OOXML round-trip is impossible. This module maps the common block and
 * inline constructs onto a minimal, valid OOXML package zipped with `fflate`:
 * headings become styled bold paragraphs, lists get literal bullet/number
 * prefixes (no `numbering.xml`), blockquotes are indented italics and `pre`
 * becomes monospace lines. Everything else degrades to its text.
 *
 * The module is pure: the only browser global it touches is `DOMParser`, and
 * when that is unavailable it falls back to a tag-stripping regex path so a
 * valid document is always produced.
 */

import { strToU8, zipSync } from "fflate";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL_OFFICE_DOCUMENT =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const REL_CORE_PROPERTIES =
  "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
const CT_DOCUMENT =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const CT_CORE_PROPERTIES = "application/vnd.openxmlformats-package.core-properties+xml";

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/**
 * XML 1.0 forbids most C0 control characters and the two non-characters
 * U+FFFE/U+FFFF; carrying them into the package would make Word reject the
 * file, so strip them before escaping.
 */
const XML_ILLEGAL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/** Strip XML-illegal characters, then escape all five predefined entities. */
export function escapeXml(value: string): string {
  return value
    .replace(XML_ILLEGAL_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A run of text plus the character formatting that applies to it. */
interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** A hard line break; `text` is ignored. */
  break?: boolean;
  /** Monospace font (used by `pre`). */
  mono?: boolean;
}

interface RunStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

function runProperties(run: Run): string {
  const parts: string[] = [];
  if (run.mono) {
    parts.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>');
  }
  if (run.bold) parts.push("<w:b/>");
  if (run.italic) parts.push("<w:i/>");
  if (run.underline) parts.push('<w:u w:val="single"/>');
  return parts.length > 0 ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
}

function renderRun(run: Run): string {
  if (run.break) return "<w:r><w:br/></w:r>";
  return `<w:r>${runProperties(run)}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
}

function renderParagraph(runs: readonly Run[], paragraphProperties?: string): string {
  const props = paragraphProperties ? `<w:pPr>${paragraphProperties}</w:pPr>` : "";
  return `<w:p>${props}${runs.map(renderRun).join("")}</w:p>`;
}

/** Walk an inline subtree, accumulating styled runs. */
function collectRuns(node: Node, style: RunStyle, out: Run[]): void {
  // 1 = element, 3 = text; numeric constants keep the module DOM-global free.
  if (node.nodeType === 3) {
    const text = (node.nodeValue ?? "").replace(/\s+/g, " ");
    if (text) out.push({ text, ...style });
    return;
  }
  if (node.nodeType !== 1) return;

  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (tag === "br") {
    out.push({ text: "", break: true });
    return;
  }

  const next: RunStyle = { ...style };
  if (tag === "strong" || tag === "b") next.bold = true;
  if (tag === "em" || tag === "i") next.italic = true;
  if (tag === "u") next.underline = true;
  // `a` and every unknown element keep their text, inheriting the current style.
  element.childNodes.forEach((child) => collectRuns(child, next, out));
}

/**
 * Collapse whitespace across run boundaries and drop the runs that became
 * empty, so adjacent tags (`Hello <b>world</b>`) do not gain double spaces.
 */
function normalizeRuns(runs: readonly Run[]): Run[] {
  const result: Run[] = [];
  let pendingSpace = true;
  for (const run of runs) {
    if (run.break) {
      result.push(run);
      pendingSpace = true;
      continue;
    }
    let text = run.text.replace(/\s+/g, " ");
    if (pendingSpace) text = text.replace(/^ /, "");
    if (!text) continue;
    pendingSpace = text.endsWith(" ");
    result.push({ ...run, text });
  }
  for (let index = result.length - 1; index >= 0; index -= 1) {
    const run = result[index]!;
    if (run.break) break;
    run.text = run.text.replace(/ $/, "");
    if (run.text) break;
  }
  const nonEmpty = result.filter((run) => run.break || run.text.length > 0);

  // Merge adjacent runs that share formatting so text stays contiguous.
  const merged: Run[] = [];
  for (const run of nonEmpty) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      !previous.break &&
      !run.break &&
      previous.bold === run.bold &&
      previous.italic === run.italic &&
      previous.underline === run.underline &&
      previous.mono === run.mono
    ) {
      previous.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

function inlineRuns(node: Node): Run[] {
  const runs: Run[] = [];
  collectRuns(node, {}, runs);
  return normalizeRuns(runs);
}

function renderList(element: Element, ordered: boolean, blocks: string[]): void {
  let index = 0;
  element.childNodes.forEach((child) => {
    if (child.nodeType !== 1) return;
    const item = child as Element;
    if (item.tagName.toLowerCase() !== "li") return;
    index += 1;
    const prefix: Run = { text: ordered ? `${index}. ` : "\u2022 " };
    const runs = normalizeRuns([prefix, ...inlineRuns(item)]);
    blocks.push(renderParagraph(runs, '<w:ind w:left="720"/>'));
  });
}

function renderPre(element: Element, blocks: string[]): void {
  const lines = (element.textContent ?? "").replace(/\r\n?/g, "\n").split("\n");
  for (const line of lines) {
    blocks.push(renderParagraph([{ text: line, mono: true }]));
  }
}

/** One supported block (or an unknown element degraded to a paragraph of text). */
function renderBlock(node: Node, blocks: string[]): void {
  if (node.nodeType === 3) {
    const text = (node.nodeValue ?? "").replace(/\s+/g, " ").trim();
    if (text) blocks.push(renderParagraph([{ text }]));
    return;
  }
  if (node.nodeType !== 1) return;

  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  switch (tag) {
    case "h1":
    case "h2":
    case "h3": {
      const level = tag.charAt(1);
      const runs = inlineRuns(element).map((run) => ({ ...run, bold: true }));
      blocks.push(renderParagraph(runs, `<w:pStyle w:val="Heading${level}"/>`));
      return;
    }
    case "p":
      blocks.push(renderParagraph(inlineRuns(element)));
      return;
    case "ul":
      renderList(element, false, blocks);
      return;
    case "ol":
      renderList(element, true, blocks);
      return;
    case "blockquote": {
      const runs = inlineRuns(element).map((run) => ({ ...run, italic: true }));
      blocks.push(renderParagraph(runs, '<w:ind w:left="720"/>'));
      return;
    }
    case "hr":
      blocks.push(
        '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>',
      );
      return;
    case "pre":
      renderPre(element, blocks);
      return;
    default: {
      // Unknown element: flatten to its inline text so nothing is lost.
      const runs = inlineRuns(element);
      if (runs.length > 0) blocks.push(renderParagraph(runs));
    }
  }
}

/** Regex fallback used when no `DOMParser` exists (e.g. exotic runtimes). */
function fallbackBlocks(html: string): string[] {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/(p|div|h[1-6]|li|blockquote|pre|tr|ul|ol|table)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "");

  const decoded = withBreaks
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");

  return decoded
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .map((line) => renderParagraph([{ text: line }]));
}

function blocksFromHtml(html: string): string[] {
  if (typeof DOMParser === "undefined") return fallbackBlocks(html);

  const document_ = new DOMParser().parseFromString(html, "text/html");
  const blocks: string[] = [];
  document_.body.childNodes.forEach((child) => renderBlock(child, blocks));
  return blocks;
}

function contentTypesXml(hasTitle: boolean): string {
  const overrides = [
    `<Override PartName="/word/document.xml" ContentType="${CT_DOCUMENT}"/>`,
    hasTitle ? `<Override PartName="/docProps/core.xml" ContentType="${CT_CORE_PROPERTIES}"/>` : "",
  ].join("");
  return (
    XML_DECLARATION +
    `<Types xmlns="${CT_NS}">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    overrides +
    "</Types>"
  );
}

function relationshipsXml(hasTitle: boolean): string {
  const core = hasTitle
    ? `<Relationship Id="rId2" Type="${REL_CORE_PROPERTIES}" Target="docProps/core.xml"/>`
    : "";
  return (
    XML_DECLARATION +
    `<Relationships xmlns="${REL_NS}">` +
    `<Relationship Id="rId1" Type="${REL_OFFICE_DOCUMENT}" Target="word/document.xml"/>` +
    core +
    "</Relationships>"
  );
}

function corePropertiesXml(title: string): string {
  return (
    XML_DECLARATION +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
    ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
    ' xmlns:dcterms="http://purl.org/dc/terms/"' +
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escapeXml(title)}</dc:title>` +
    "</cp:coreProperties>"
  );
}

function documentXml(blocks: readonly string[]): string {
  return (
    XML_DECLARATION +
    `<w:document xmlns:w="${W_NS}">` +
    `<w:body>${blocks.join("")}<w:sectPr/></w:body>` +
    "</w:document>"
  );
}

/** Build a `.docx` from sanitized HTML body markup. */
export function htmlToDocx(html: string, options?: { title?: string }): Uint8Array {
  const blocks = blocksFromHtml(html);
  if (blocks.length === 0 && options?.title) {
    blocks.push(renderParagraph([{ text: options.title }]));
  }

  const hasTitle = Boolean(options?.title);
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypesXml(hasTitle)),
    "_rels/.rels": strToU8(relationshipsXml(hasTitle)),
    "word/document.xml": strToU8(documentXml(blocks)),
  };
  if (options?.title) {
    files["docProps/core.xml"] = strToU8(corePropertiesXml(options.title));
  }

  return zipSync(files);
}