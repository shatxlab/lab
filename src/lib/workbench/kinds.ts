/**
 * The workbench's own asset taxonomy.
 *
 * The document viewer already classifies files into {@link FileKind}s. The
 * workbench needs a slightly wider vocabulary: it also owns the structured
 * data formats the converter understands (YAML, TOML) and a catch-all
 * `binary` bucket for anything that is not text-like. Everything else maps
 * one-to-one, so this module is the single place that translates between the
 * two without re-implementing extension or byte sniffing.
 */

import type { DataFormat } from "@/lib/convert/data";
import { detectFileKind, fileExtension, resolveFileKind, type FileKind } from "@/lib/viewer/file-kind";

export type AssetKind =
  | "pdf"
  | "docx"
  | "markdown"
  | "html"
  | "text"
  | "json"
  | "yaml"
  | "toml"
  | "sheet"
  | "image"
  | "epub"
  | "binary";

export const ASSET_KINDS: readonly AssetKind[] = [
  "pdf",
  "docx",
  "markdown",
  "html",
  "text",
  "json",
  "yaml",
  "toml",
  "sheet",
  "image",
  "epub",
  "binary",
];

/** Data formats that are edited as source text but parsed into a value. */
export const DATA_ASSET_KINDS = ["json", "yaml", "toml"] as const;
export type DataAssetKind = (typeof DATA_ASSET_KINDS)[number];

export function isDataAssetKind(kind: AssetKind): kind is DataAssetKind {
  return kind === "json" || kind === "yaml" || kind === "toml";
}

/** The converter's format name for a structured asset. */
export function dataFormatFor(kind: DataAssetKind): DataFormat {
  return kind;
}

const YAML_EXTENSIONS = new Set(["yaml", "yml"]);
const TOML_EXTENSIONS = new Set(["toml"]);
const EPUB_EXTENSIONS = new Set(["epub"]);

const FILE_KIND_TO_ASSET: Record<FileKind, AssetKind> = {
  markdown: "markdown",
  sheet: "sheet",
  docx: "docx",
  text: "text",
  json: "json",
  html: "html",
  pdf: "pdf",
  image: "image",
  "legacy-doc": "binary",
  unsupported: "binary",
};

export function assetKindFromFileKind(kind: FileKind): AssetKind {
  return FILE_KIND_TO_ASSET[kind];
}

/**
 * Classify a file by name, and by content when a head of bytes is supplied.
 * YAML and TOML are extension-only: they are plain text and no reliable magic
 * bytes distinguish them, so a renamed file stays `text` rather than guessing.
 */
export function detectAssetKind(fileName: string, bytes?: Uint8Array): AssetKind {
  const extension = fileExtension(fileName);
  if (YAML_EXTENSIONS.has(extension)) return "yaml";
  if (TOML_EXTENSIONS.has(extension)) return "toml";
  // An EPUB is a zip, so byte sniffing would misread it; the extension decides.
  if (EPUB_EXTENSIONS.has(extension)) return "epub";

  const kind = bytes ? resolveFileKind(fileName, bytes) : detectFileKind(fileName);
  return assetKindFromFileKind(kind);
}

/** Kinds an editor can write back without losing the document's structure. */
export const EDITABLE_ASSET_KINDS: ReadonlySet<AssetKind> = new Set<AssetKind>([
  "text",
  "markdown",
  "html",
  "json",
  "yaml",
  "toml",
  "sheet",
]);

export function isEditable(kind: AssetKind): boolean {
  return EDITABLE_ASSET_KINDS.has(kind);
}

/** Text-bearing kinds: what text tools (count, case, regex, encode) accept. */
export const TEXTUAL_ASSET_KINDS: ReadonlySet<AssetKind> = new Set<AssetKind>([
  "text",
  "markdown",
  "html",
  "json",
  "yaml",
  "toml",
]);

export function isTextual(kind: AssetKind): boolean {
  return TEXTUAL_ASSET_KINDS.has(kind);
}

/**
 * Kinds `extractComparableText` can turn into text a line diff makes sense on.
 * Images and raw binary carry no text to compare.
 */
export const COMPARABLE_ASSET_KINDS: ReadonlySet<AssetKind> = new Set<AssetKind>([
  "text",
  "markdown",
  "html",
  "json",
  "yaml",
  "toml",
  "sheet",
  "docx",
  "pdf",
]);

export function isComparable(kind: AssetKind): boolean {
  return COMPARABLE_ASSET_KINDS.has(kind);
}
