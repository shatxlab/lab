/** Text travelling by "Send to phone": a file name and its contents. */

import { fileExtension } from "@/lib/viewer/file-kind";
import type { AssetKind } from "@/lib/workbench/kinds";

export const TEXT_SEND_KIND = "text";
/** Larger sources are not offered at all: they could never fit a QR code. */
export const MAX_SENDABLE_BYTES = 64 * 1024;
const MAX_TEXT_CHARS = 200_000;

/** Cards worth importing are small; anything bigger is a document, not a deck. */
export const MAX_FLASH_BYTES = 2 * 1024 * 1024;

/** Text that "Send to Flashcards" can read: plain text, Markdown, JSON, or CSV/TSV. */
export function canSendToFlashcards(kind: AssetKind, name: string, size: number): boolean {
  if (size > MAX_FLASH_BYTES) return false;
  if (kind === "text" || kind === "markdown" || kind === "json") return true;
  return kind === "sheet" && ["csv", "tsv"].includes(fileExtension(name));
}

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
