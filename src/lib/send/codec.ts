/**
 * "Send to phone": a small piece of data travels inside a link's fragment
 * (`#send=1.<kind>.<payload>`), shown as a QR code the phone's camera app can
 * open. The payload is JSON, deflated and base64url-encoded. Fragments never
 * reach a server, but they are untrusted input on the receiving side, so
 * decoding is size-bounded and every failure is simply `null`.
 */

import { Inflate, deflateSync, strFromU8, strToU8 } from "fflate";

export const SEND_VERSION = "1";
const PREFIX = "send=";
/**
 * The whole fragment. The QR code carries it plus the link's origin and path, at error-correction
 * level M (2 331 bytes at most): M tolerates glare and smudges on a screen, and level L trips up
 * some decoders at certain sizes (jsQR fails on every version-23 code at L, none at M).
 */
export const MAX_FRAGMENT_CHARS = 2200;
/** Decoded JSON is capped separately, so a tiny payload cannot expand into a huge one. */
export const MAX_DECODED_BYTES = 256 * 1024;

const KIND = /^[a-z]{1,12}$/;
const BASE64URL = /^[A-Za-z0-9_-]*$/;

export interface IncomingSend {
  kind: string;
  data: unknown;
}

export type EncodeResult =
  | { ok: true; fragment: string; size: number }
  | { ok: false; size: number };

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Inflate with a hard output cap; throws when the data would expand past it. */
function inflateCapped(bytes: Uint8Array, cap: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const stream = new Inflate((chunk) => {
    total += chunk.length;
    if (total > cap) throw new Error("too large");
    chunks.push(chunk);
  });
  stream.push(bytes, true);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** `size` is the fragment length either way, so the UI can say how far over the limit it is. */
export function encodeSend(kind: string, data: unknown): EncodeResult {
  if (!KIND.test(kind)) return { ok: false, size: 0 };
  const payload = toBase64Url(deflateSync(strToU8(JSON.stringify(data)), { level: 9 }));
  const fragment = `${PREFIX}${SEND_VERSION}.${kind}.${payload}`;
  const size = fragment.length;
  return size <= MAX_FRAGMENT_CHARS ? { ok: true, fragment, size } : { ok: false, size };
}

/** Parse a URL fragment (with or without the leading `#`); anything unexpected is `null`. */
export function decodeSend(fragment: string): IncomingSend | null {
  const text = fragment.replace(/^#/, "");
  if (!text.startsWith(PREFIX) || text.length > MAX_FRAGMENT_CHARS) return null;
  const parts = text.slice(PREFIX.length).split(".");
  if (parts.length !== 3) return null;
  const [version, kind, payload] = parts as [string, string, string];
  if (version !== SEND_VERSION || !KIND.test(kind) || !BASE64URL.test(payload)) return null;
  try {
    const json = strFromU8(inflateCapped(fromBase64Url(payload), MAX_DECODED_BYTES));
    return { kind, data: JSON.parse(json) as unknown };
  } catch {
    return null;
  }
}

/** The link a phone opens: the tool's own page with the fragment attached. */
export function sendLink(origin: string, toolPath: string, fragment: string): string {
  const path = toolPath.endsWith("/") ? toolPath : `${toolPath}/`;
  return `${origin}${path}#${fragment}`;
}
