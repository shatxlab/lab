import { sniffBinaryKind, sniffOfficeKind } from "@/lib/viewer/sniff";

export type FileKind =
  | "markdown"
  | "sheet"
  | "docx"
  | "text"
  | "json"
  | "html"
  | "pdf"
  | "image"
  | "legacy-doc"
  | "unsupported";

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdown", "mkd", "mkdn", "mdtext"]);
const SHEET_EXTENSIONS = new Set(["xlsx", "xlsm", "xlsb", "xls", "csv", "tsv", "ods", "fods", "dbf"]);
const TEXT_EXTENSIONS = new Set(["txt", "log"]);
const JSON_EXTENSIONS = new Set(["json"]);
const HTML_EXTENSIONS = new Set(["html", "htm", "xhtml"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg", "ico"]);

/** CSV-family files are text, so they get decoded before SheetJS sees them. */
export const TEXT_SHEET_EXTENSIONS = new Set(["csv", "tsv"]);

export const ACCEPTED_EXTENSIONS = [
  ...MARKDOWN_EXTENSIONS,
  ...SHEET_EXTENSIONS,
  ...TEXT_EXTENSIONS,
  ...JSON_EXTENSIONS,
  ...HTML_EXTENSIONS,
  ...PDF_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  "docx",
  "doc",
].map((extension) => `.${extension}`);

export function fileExtension(fileName: string): string {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/**
 * Detection is extension-first on purpose. Browsers report the MIME type of a
 * `.csv` inconsistently and hand `.docx` over as `application/zip` often enough
 * that trusting it would reject files that parse fine.
 */
export function detectFileKind(fileName: string): FileKind {
  const extension = fileExtension(fileName);

  if (MARKDOWN_EXTENSIONS.has(extension)) return "markdown";
  if (SHEET_EXTENSIONS.has(extension)) return "sheet";
  if (TEXT_EXTENSIONS.has(extension)) return "text";
  if (JSON_EXTENSIONS.has(extension)) return "json";
  if (HTML_EXTENSIONS.has(extension)) return "html";
  if (PDF_EXTENSIONS.has(extension)) return "pdf";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (extension === "docx") return "docx";
  if (extension === "doc") return "legacy-doc";

  return "unsupported";
}

/**
 * Trust the filename when it is a known type. Only sniff bytes when the name
 * would otherwise be rejected — a renamed `.xlsx` still opens, a `.md` is
 * never reclassified from ZIP magic, and an extension-less file whose head
 * parses as a JSON document gets the JSON viewer.
 */
export function resolveFileKind(fileName: string, bytes: Uint8Array): FileKind {
  const named = detectFileKind(fileName);
  if (named !== "unsupported") return named;

  const binary = sniffBinaryKind(bytes);
  if (binary !== "unsupported") return binary;

  const office = sniffOfficeKind(bytes);
  if (office !== "unsupported") return office;

  return sniffJsonHead(bytes);
}

/** A short decoded head that opens with `{` or `[` is a JSON document. */
function sniffJsonHead(bytes: Uint8Array): FileKind {
  try {
    const head = new TextDecoder("utf-8", { fatal: false })
      .decode(bytes.subarray(0, 4096))
      .replace(/^\uFEFF/, "");
    const trimmed = head.trimStart();
    return trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "unsupported";
  } catch {
    return "unsupported";
  }
}

const KIND_LABELS: Record<FileKind, string> = {
  markdown: "Markdown",
  sheet: "Spreadsheet",
  docx: "Word",
  text: "Text",
  json: "JSON",
  html: "HTML",
  pdf: "PDF",
  image: "Image",
  "legacy-doc": "Word 97-2003",
  unsupported: "Unsupported",
};

export function fileKindLabel(kind: FileKind): string {
  return KIND_LABELS[kind];
}
