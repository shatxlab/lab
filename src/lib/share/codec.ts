/**
 * "Share by link": a document travels inside a link's fragment
 * (`#share=1.<kdf>.<salt>.<iv>.<ct>`), deflated and encrypted with a key
 * derived from a passphrase. Fragments never reach a server, but anyone who
 * holds the link holds the ciphertext, so the passphrase is the whole secret:
 * it must travel by a different channel, and the same fragment plus the same
 * passphrase decrypt on any device — the salt and KDF parameters ride in the
 * link, so derivation is deterministic and needs no server.
 *
 * There is no separate password check: AES-GCM is authenticated, so a wrong
 * passphrase derives a wrong key, the tag check fails and decrypt throws.
 * The same failure covers a tampered or damaged fragment, which is honest —
 * nothing can tell those apart. Because guessing happens offline, the KDF is
 * deliberately slow and the UI should generate the passphrase itself.
 */

import { Inflate, deflateSync, strFromU8, strToU8 } from "fflate";

import { sendLink } from "@/lib/send/codec";
import { SHARE_WORDS } from "@/lib/share/words";

export const SHARE_VERSION = "1";
const PREFIX = "share=";

/** A whole file (docx, xlsx, pdf, …) rides as base64 of its deflated bytes. */
export const FILE_SHARE_KIND = "file";

/** One KDF for now; the field is in every link so it can evolve per link. */
export const SHARE_KDF = "pbkdf2-600000";
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

/**
 * A link fragment of this size rides in the URL bar, a clipboard and chat
 * messages; a QR code does not, so this path has no QR button — the send
 * codec keeps that niche.
 */
export const MAX_SHARE_FRAGMENT_CHARS = 1_000_000;
/** Decoded JSON is capped separately, so a tiny payload cannot expand into a huge one. */
export const MAX_SHARE_DECODED_BYTES = 4 * 1024 * 1024;

const KIND = /^[a-z]{1,12}$/;
const BASE64URL = /^[A-Za-z0-9_-]*$/;
/** Trimmed and bounded: the KDF cost is per attempt, so an unbounded passphrase is a hang. */
const MAX_PASSPHRASE_CHARS = 512;

export interface IncomingShare {
  kind: string;
  data: unknown;
}

export type EncodeShareResult =
  | { ok: true; fragment: string; size: number }
  | { ok: false; reason: "kind" | "passphrase" | "tooLarge"; size: number };

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const remainder = text.length % 4;
  if (remainder === 1) throw new Error("bad base64url length");
  const padded = `${text.replace(/-/g, "+").replace(/_/g, "/")}${remainder === 0 ? "" : "=".repeat(4 - remainder)}`;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Inflate with a hard output cap; throws when the data would expand past it. */
function inflateCapped(bytes: Uint8Array, cap: number): Uint8Array<ArrayBuffer> {
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

async function deriveShareKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", strToU8(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** The clear-text header, authenticated as AES-GCM associated data. */
function headerAad(version: string, kdf: string, saltText: string, ivText: string): Uint8Array<ArrayBuffer> {
  return strToU8(`${version}.${kdf}.${saltText}.${ivText}`);
}

/** Passphrases are typed on other keyboards: normalize before deriving. */
function normalizePassphrase(passphrase: string): string {
  const pass = passphrase.trim().normalize("NFKC");
  if (!pass || pass.length > MAX_PASSPHRASE_CHARS) throw new Error("bad passphrase");
  return pass;
}

/**
 * `size` is the fragment length either way, so the UI can say how far over the
 * limit it is. The kind travels inside the encrypted payload, so the link
 * leaks nothing about the document.
 */
export async function encodeShare(kind: string, data: unknown, passphrase: string): Promise<EncodeShareResult> {
  if (!KIND.test(kind)) return { ok: false, reason: "kind", size: 0 };
  let pass: string;
  try {
    pass = normalizePassphrase(passphrase);
  } catch {
    return { ok: false, reason: "passphrase", size: 0 };
  }
  const payload = JSON.stringify({ kind, data });
  // Cap the decoded size at encode time too: a highly compressible payload
  // could pass the fragment cap yet never survive the decoder's inflate cap.
  if (strToU8(payload).length > MAX_SHARE_DECODED_BYTES) return { ok: false, reason: "tooLarge", size: 0 };
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const saltText = toBase64Url(salt);
  const ivText = toBase64Url(iv);
  const key = await deriveShareKey(pass, salt);
  const deflated = deflateSync(strToU8(payload), { level: 9 });
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: headerAad(SHARE_VERSION, SHARE_KDF, saltText, ivText) }, key, deflated),
  );
  const fragment = `${PREFIX}${SHARE_VERSION}.${SHARE_KDF}.${saltText}.${ivText}.${toBase64Url(encrypted)}`;
  const size = fragment.length;
  return size <= MAX_SHARE_FRAGMENT_CHARS ? { ok: true, fragment, size } : { ok: false, reason: "tooLarge", size };
}

/** Parse a URL fragment (with or without the leading `#`); any failure is `null`. */
export async function decodeShare(fragment: string, passphrase: string): Promise<IncomingShare | null> {
  const text = fragment.replace(/^#/, "");
  if (!text.startsWith(PREFIX) || text.length > MAX_SHARE_FRAGMENT_CHARS) return null;
  const parts = text.slice(PREFIX.length).split(".");
  if (parts.length !== 5) return null;
  const [version, kdf, saltText, ivText, ctText] = parts;
  if (version !== SHARE_VERSION || kdf !== SHARE_KDF) return null;
  if (!BASE64URL.test(saltText) || !BASE64URL.test(ivText) || !BASE64URL.test(ctText)) return null;
  let pass: string;
  try {
    pass = normalizePassphrase(passphrase);
  } catch {
    return null;
  }
  try {
    const salt = fromBase64Url(saltText);
    const iv = fromBase64Url(ivText);
    if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES) return null;
    const key = await deriveShareKey(pass, salt);
    const deflated = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: headerAad(version, kdf, saltText, ivText) },
        key,
        fromBase64Url(ctText),
      ),
    );
    const json = strFromU8(inflateCapped(deflated, MAX_SHARE_DECODED_BYTES));
    const parsed = JSON.parse(json) as { kind?: unknown; data?: unknown };
    if (typeof parsed.kind !== "string" || !KIND.test(parsed.kind)) return null;
    return { kind: parsed.kind, data: parsed.data };
  } catch {
    // Wrong passphrase, tampered ciphertext, broken deflate, oversized JSON — all just `null`.
    return null;
  }
}

/** The link a recipient opens: the tool's own page with the fragment attached. */
export function shareLink(origin: string, toolPath: string, fragment: string): string {
  return sendLink(origin, toolPath, fragment);
}

/**
 * A whole file as its deflated bytes, base64url'd inside the encrypted
 * payload. The name is trusted input here (the caller cleans it), and kind
 * detection on the receiving side works off the file extension alone.
 */
export async function encodeFileShare(name: string, bytes: Uint8Array, passphrase: string): Promise<EncodeShareResult> {
  return encodeShare(FILE_SHARE_KIND, { n: name, b: toBase64Url(deflateSync(bytes, { level: 9 })) }, passphrase);
}

/** The file back: base64url of deflated bytes, inflated again under the same hard cap. */
export function fileBytesFromShare(encoded: string): Uint8Array | null {
  if (!BASE64URL.test(encoded)) return null;
  try {
    return inflateCapped(fromBase64Url(encoded), MAX_SHARE_DECODED_BYTES);
  } catch {
    return null;
  }
}

/** Six random words from the 256-word list — 48 bits, no modulo bias, typeable. */
export function generatePassphrase(words = 6): string {
  const picked: string[] = [];
  for (let i = 0; i < words; i += 1) {
    picked.push(SHARE_WORDS[crypto.getRandomValues(new Uint8Array(1))[0]]);
  }
  return picked.join("-");
}
