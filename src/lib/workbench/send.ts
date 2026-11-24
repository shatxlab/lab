/** Text and files travelling by QR or by encrypted link. */

import { encodeFileShare, fileBytesFromShare, FILE_SHARE_KIND } from "@/lib/share/codec";

export const TEXT_SEND_KIND = "text";
/** Larger sources are not offered at all: they could never fit a QR code. */
export const MAX_SENDABLE_BYTES = 64 * 1024;
/**
 * The share-by-link offer threshold. Not a guarantee — an incompressible file
 * this size still overflows the fragment cap — but deflate never rescues a
 * zip container (docx, xlsx) past it, so the dialog's "too large" stays a
 * rare exception rather than the norm.
 */
export const MAX_SHAREABLE_BYTES = 700_000;
/** QR-bound limit for the phone-send parser. */
const MAX_TEXT_CHARS = 200_000;
/** Shares are bounded by the fragment itself; this is only a sanity belt. */
const MAX_SHARED_TEXT_CHARS = 2_000_000;

export function textToSend(name: string, text: string): unknown {
  return { n: name, t: text };
}

/** A safe file name: no path, no control characters, bounded, never empty. */
export function cleanSendName(raw: unknown): string {
  const base = typeof raw === "string" ? (raw.replace(/\\/g, "/").split("/").pop() ?? "") : "";
  // eslint-disable-next-line no-control-regex
  const name = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
  return name && name !== "." && name !== ".." ? name : "received.txt";
}

export function parseTextSend(data: unknown): { name: string; text: string } | null {
  if (!data || typeof data !== "object") return null;
  const input = data as { n?: unknown; t?: unknown };
  if (typeof input.t !== "string" || input.t === "") return null;
  return { name: cleanSendName(input.n), text: input.t.slice(0, MAX_TEXT_CHARS) };
}

/** A whole file (docx, xlsx, pdf, …) travels by its bytes; the extension carries the kind. */
export { FILE_SHARE_KIND };
export { encodeFileShare };

export interface SharedFile {
  name: string;
  bytes: Uint8Array;
}

export type IncomingShared = { name: string; text: string } | SharedFile;

/** Maps a decrypted share (of either shape) to what the workbench can import, or null. */
export function parseSharedSend(incoming: { kind: string; data: unknown }): IncomingShared | null {
  if (incoming.kind === TEXT_SEND_KIND) {
    const input = incoming.data as { n?: unknown; t?: unknown } | null;
    if (!input || typeof input !== "object" || typeof input.t !== "string") return null;
    // Unlike the phone-send parser: no silent truncation, and empty files import.
    if (input.t.length > MAX_SHARED_TEXT_CHARS) return null;
    return { name: cleanSendName(input.n), text: input.t };
  }
  if (incoming.kind === FILE_SHARE_KIND) {
    const file = incoming.data as { n?: unknown; b?: unknown } | null;
    if (!file || typeof file !== "object" || typeof file.b !== "string") return null;
    const bytes = fileBytesFromShare(file.b);
    if (!bytes) return null;
    return { name: cleanSendName(file.n), bytes };
  }
  return null;
}
