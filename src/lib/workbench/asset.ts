/**
 * An Asset is the workbench's open file: a name, a kind, and a set of lazy
 * representations that operations read from.
 *
 * Representations are lazy and cached on purpose. Reading a `.xlsx` should not
 * pull in SheetJS, and opening an image should not decode a PDF, so each
 * accessor dynamic-imports only the parser it needs on first use. This is the
 * same "defer the heavy library" rule the viewer already follows, just moved
 * behind one uniform interface.
 */

import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { Workbook } from "@/lib/viewer/sheet";
import { detectAssetKind, isDataAssetKind, type AssetKind, type DataAssetKind } from "@/lib/workbench/kinds";

/**
 * The minimum a file-like object must expose. `File` and `Blob`-backed inputs
 * satisfy it structurally, and tests can pass a plain object, so nothing in
 * this module touches a browser global at runtime.
 */
export interface AssetSource {
  name: string;
  size: number;
  type?: string;
  /** `File.lastModified`, when the source is a real file. */
  lastModified?: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface Asset {
  readonly id: string;
  readonly kind: AssetKind;
  readonly name: string;
  readonly size: number;
  /** Lowercase extension without the dot ("" when there is none). */
  readonly extension: string;
  readonly source: AssetSource;

  /** Raw bytes, read once and cached. */
  bytes(): Promise<Uint8Array>;
  /** Decoded text, honouring BOM/declared charset. */
  text(): Promise<string>;
  /** Parsed JSON/YAML/TOML value (or parsed JSON for any other text). */
  json(): Promise<unknown>;
  /** Parsed spreadsheet workbook (null workbook for HTML-markup sheets). */
  workbook(): Promise<Workbook>;
  /** PDF.js document proxy; the caller owns destroying it. */
  pdf(): Promise<PDFDocumentProxy>;
}

let nextAssetId = 0;

function extensionOf(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/**
 * Build an asset around a source. `kind` overrides detection when the caller
 * already knows better (e.g. text pasted into the workbench, which has no
 * filename to sniff).
 */
export function createAsset(source: AssetSource, kind?: AssetKind): Asset {
  const extension = extensionOf(source.name);
  const resolvedKind = kind ?? detectAssetKind(source.name);
  const id = `asset-${(nextAssetId += 1)}`;

  let bytesPromise: Promise<Uint8Array> | undefined;
  const bytes = (): Promise<Uint8Array> =>
    (bytesPromise ??= source.arrayBuffer().then((buffer) => new Uint8Array(buffer)));

  const text = async (): Promise<string> => {
    const { decodeTextBytes } = await import("@/lib/viewer/charset");
    return decodeTextBytes(await bytes());
  };

  const json = async (): Promise<unknown> => {
    if (isDataAssetKind(resolvedKind)) {
      const { parseData } = await import("@/lib/convert/data");
      return parseData(resolvedKind, await text());
    }
    const { parseJson } = await import("@/lib/viewer/json");
    return parseJson(await text()).value;
  };

  const workbook = async (): Promise<Workbook> => {
    const { parseWorkbook } = await import("@/lib/viewer/sheet");
    const view = await bytes();
    const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
    return parseWorkbook({ buffer, extension });
  };

  const pdf = async (): Promise<PDFDocumentProxy> => {
    const { openPdf } = await import("@/lib/viewer/pdf");
    return openPdf(await bytes());
  };

  return {
    id,
    kind: resolvedKind,
    name: source.name,
    size: source.size,
    extension,
    source,
    bytes,
    text,
    json,
    workbook,
    pdf,
  };
}

/** Wrap a `File` (or any object with name/size/type/arrayBuffer). */
export function createAssetFromFile(file: File): Asset {
  return createAsset({
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
    arrayBuffer: () => file.arrayBuffer(),
  });
}

/** Wrap in-memory text as a UTF-8 asset (pasted content, generated output). */
export function createAssetFromText(name: string, text: string, kind?: AssetKind): Asset {
  const encoded = new TextEncoder().encode(text);
  // Text we already hold is never binary: a name with no extension ("paste")
  // should still be a text asset, while a known extension ("data.json") wins.
  const detected = kind ?? detectAssetKind(name);
  const resolved = detected === "binary" ? "text" : detected;
  return createAsset(
    {
      name,
      size: encoded.byteLength,
      type: "text/plain;charset=utf-8",
      arrayBuffer: async () => encoded.buffer as ArrayBuffer,
    },
    resolved,
  );
}

/** Wrap in-memory bytes (a converted output, a decoded payload). */
export function createAssetFromBytes(name: string, value: Uint8Array, kind?: AssetKind): Asset {
  return createAsset(
    {
      name,
      size: value.byteLength,
      arrayBuffer: async () => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer,
    },
    kind,
  );
}

/** Convenience: the default data format for a structured asset. */
export type { DataAssetKind };
