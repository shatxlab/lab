import { unzipSync } from "fflate";

import { archiveEntryFilter, assertZipWithinLimits } from "@/lib/limits";

export interface EpubBook {
  title: string;
  author?: string;
  chapters: EpubChapter[];
}

export interface EpubChapter {
  id: string;
  href: string;
  title: string;
  html: string;
}

type ZipEntries = Record<string, Uint8Array>;

type ManifestItem = {
  id: string;
  href: string;
  path: string;
  mediaType: string;
  properties: string;
};

const decoder = new TextDecoder("utf-8");

const HTML_MEDIA = new Set([
  "application/xhtml+xml",
  "text/html",
  "application/html+xml",
]);

const SAFE_IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
  ico: "image/x-icon",
};

function cleanZipPath(path: string): string {
  return path.replace(/^\/+/, "");
}

function stripFragment(href: string): string {
  return href.split("#", 1)[0] ?? "";
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index) : "";
}

function resolveZipPath(baseDir: string, href: string): string | null {
  const raw = stripFragment(href).trim();
  if (!raw || /^https?:\/\//i.test(raw) || /^\/\//.test(raw) || /^data:/i.test(raw)) return null;

  const input = raw.startsWith("/") ? raw.slice(1) : [baseDir, raw].filter(Boolean).join("/");
  const parts: string[] = [];
  for (const part of input.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function readText(entries: ZipEntries, path: string, label: string): string {
  const bytes = entries[cleanZipPath(path)];
  if (!bytes) throw new Error(`EPUB reader: missing ${label} (${path})`);
  return decoder.decode(bytes);
}

function parseXml(text: string, label: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`EPUB reader: unreadable XML in ${label}`);
  }
  return doc;
}

function parseHtml(text: string): Document {
  return new DOMParser().parseFromString(text, "text/html");
}

function byLocalName(root: ParentNode, localName: string): Element[] {
  return Array.from(root.querySelectorAll("*")).filter((el) => el.localName === localName);
}

function firstByLocalName(root: ParentNode, localName: string): Element | undefined {
  return byLocalName(root, localName)[0];
}

function directChildrenByLocalName(root: Element, localName: string): Element[] {
  return Array.from(root.children).filter((el) => el.localName === localName);
}

function textOf(element: Element | undefined): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function toBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.slice(i, i + chunk));
    }
    return btoa(binary);
  }

  const bufferCtor = (globalThis as { Buffer?: { from(bytes: Uint8Array): { toString(enc: "base64"): string } } }).Buffer;
  if (bufferCtor) return bufferCtor.from(bytes).toString("base64");
  throw new Error("EPUB reader: base64 encoder is unavailable");
}

function imageMimeForPath(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return SAFE_IMAGE_MIME_BY_EXT[ext];
}

function rewriteImages(html: string, chapterPath: string, entries: ZipEntries): string {
  const doc = parseHtml(html);
  const baseDir = dirname(chapterPath);
  for (const img of Array.from(doc.getElementsByTagName("img"))) {
    const src = img.getAttribute("src") ?? "";
    const target = resolveZipPath(baseDir, src);
    if (!target) continue;

    const mime = imageMimeForPath(target);
    const imageBytes = entries[target];
    if (!mime || !imageBytes) continue;
    img.setAttribute("src", `data:${mime};base64,${toBase64(imageBytes)}`);
  }
  return doc.body?.innerHTML ?? html;
}

function metadataText(opf: Document, field: "title" | "creator"): string {
  const metadata = firstByLocalName(opf, "metadata");
  if (!metadata) return "";
  return textOf(directChildrenByLocalName(metadata, field)[0]);
}

function parseManifest(opf: Document, opfDir: string): ManifestItem[] {
  const manifest = firstByLocalName(opf, "manifest");
  if (!manifest) return [];
  return directChildrenByLocalName(manifest, "item")
    .map((item) => {
      const href = item.getAttribute("href") ?? "";
      const path = resolveZipPath(opfDir, href) ?? "";
      return {
        id: item.getAttribute("id") ?? "",
        href,
        path,
        mediaType: item.getAttribute("media-type") ?? "",
        properties: item.getAttribute("properties") ?? "",
      };
    })
    .filter((item) => item.id && item.href && item.path);
}

function spineIdrefs(opf: Document): string[] {
  const spine = firstByLocalName(opf, "spine");
  if (!spine) return [];
  return directChildrenByLocalName(spine, "itemref")
    .map((itemref) => itemref.getAttribute("idref") ?? "")
    .filter(Boolean);
}

function spineTocId(opf: Document): string {
  return firstByLocalName(opf, "spine")?.getAttribute("toc") ?? "";
}

function epub3TocLabels(entries: ZipEntries, manifest: ManifestItem[]): Map<string, string> {
  const navItem = manifest.find((item) => item.properties.split(/\s+/).includes("nav"));
  if (!navItem || !entries[navItem.path]) return new Map();

  const doc = parseHtml(decoder.decode(entries[navItem.path]));
  const navs = byLocalName(doc, "nav");
  const tocNav =
    navs.find((nav) => (nav.getAttribute("epub:type") ?? nav.getAttribute("type") ?? "") === "toc") ??
    navs[0] ??
    doc.body;
  const labels = new Map<string, string>();
  const baseDir = dirname(navItem.path);
  for (const anchor of byLocalName(tocNav, "a")) {
    const href = anchor.getAttribute("href") ?? "";
    const path = resolveZipPath(baseDir, href);
    const label = textOf(anchor);
    if (path && label && !labels.has(path)) labels.set(path, label);
  }
  return labels;
}

function epub2TocLabels(entries: ZipEntries, manifest: ManifestItem[], tocId: string): Map<string, string> {
  const ncxItem =
    manifest.find((item) => item.id === tocId) ??
    manifest.find((item) => item.mediaType === "application/x-dtbncx+xml" || item.href.toLowerCase().endsWith(".ncx"));
  if (!ncxItem || !entries[ncxItem.path]) return new Map();

  const doc = parseXml(decoder.decode(entries[ncxItem.path]), ncxItem.path);
  const labels = new Map<string, string>();
  const baseDir = dirname(ncxItem.path);
  for (const navPoint of byLocalName(doc, "navPoint")) {
    const content = firstByLocalName(navPoint, "content");
    const path = resolveZipPath(baseDir, content?.getAttribute("src") ?? "");
    const label = textOf(firstByLocalName(firstByLocalName(navPoint, "navLabel") ?? navPoint, "text"));
    if (path && label && !labels.has(path)) labels.set(path, label);
  }
  return labels;
}

function chapterHtml(entries: ZipEntries, path: string): string {
  const text = readText(entries, path, "chapter");
  const doc = parseHtml(text);
  const body = doc.body?.innerHTML ?? text;
  return rewriteImages(body, path, entries);
}

export function parseEpubBytes(bytes: Uint8Array): EpubBook {
  // Reject oversized/bomb archives from the central directory before inflating.
  assertZipWithinLimits(bytes, "This EPUB");

  let entries: ZipEntries;
  try {
    entries = unzipSync(bytes, { filter: archiveEntryFilter() });
  } catch (err) {
    throw new Error(`EPUB reader: could not open ZIP (${err instanceof Error ? err.message : String(err)})`);
  }

  if (!entries["META-INF/container.xml"]) {
    throw new Error("EPUB reader: missing META-INF/container.xml");
  }

  const containerDoc = parseXml(readText(entries, "META-INF/container.xml", "container.xml"), "container.xml");
  const rootfile = firstByLocalName(containerDoc, "rootfile");
  const opfPath = cleanZipPath(rootfile?.getAttribute("full-path") ?? "");
  if (!opfPath) throw new Error("EPUB reader: missing OPF package path in container.xml");
  if (!entries[opfPath]) throw new Error(`EPUB reader: missing OPF package (${opfPath})`);

  const opf = parseXml(readText(entries, opfPath, "OPF package"), opfPath);
  const opfDir = dirname(opfPath);
  const manifest = parseManifest(opf, opfDir);
  const manifestById = new Map(manifest.map((item) => [item.id, item]));
  const tocLabels = new Map([
    ...epub2TocLabels(entries, manifest, spineTocId(opf)),
    ...epub3TocLabels(entries, manifest),
  ]);

  const chapters = spineIdrefs(opf)
    .map((idref, index): EpubChapter | null => {
      const item = manifestById.get(idref);
      if (!item || !HTML_MEDIA.has(item.mediaType) || !entries[item.path]) return null;
      return {
        id: item.id || `chapter-${index + 1}`,
        href: item.path,
        title: tocLabels.get(item.path) || item.id || `Chapter ${index + 1}`,
        html: chapterHtml(entries, item.path),
      };
    })
    .filter((chapter): chapter is EpubChapter => chapter !== null);

  if (chapters.length === 0) throw new Error("EPUB reader: empty readable spine");

  const author = metadataText(opf, "creator") || undefined;
  return {
    title: metadataText(opf, "title"),
    ...(author ? { author } : {}),
    chapters,
  };
}
