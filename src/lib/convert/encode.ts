/** Base64 / URL / hex encoding helpers. All text goes through UTF-8, never Latin-1. */

export type EncodeMode = "base64" | "url" | "urlComponent" | "hex";

export function bytesToBase64(bytes: Uint8Array, urlSafe = false): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  const encoded = btoa(binary);
  return urlSafe ? encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : encoded;
}

export class DecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecodeError";
  }
}

/** Accepts standard and URL-safe alphabets, whitespace and missing padding. */
export function base64ToBytes(input: string): Uint8Array {
  const cleaned = input
    .replace(/^data:[^,]*;base64,/i, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 === 1) {
    throw new DecodeError("This is not valid Base64.");
  }
  const padded = cleaned.padEnd(Math.ceil(cleaned.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function bytesToHex(bytes: Uint8Array, separator = ""): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(separator);
}

export function hexToBytes(input: string): Uint8Array {
  const cleaned = input.replace(/0x/gi, "").replace(/[\s:,-]+/g, "");
  if (!/^[0-9a-fA-F]*$/.test(cleaned) || cleaned.length % 2 !== 0) throw new DecodeError("This is not valid hexadecimal.");
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(cleaned.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

const encoder = new TextEncoder();

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

/** Strict UTF-8 decode; null when the bytes are not valid text. */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export interface EncodeOptions {
  urlSafe: boolean;
}

export function encodeText(mode: EncodeMode, text: string, options: EncodeOptions = { urlSafe: false }): string {
  switch (mode) {
    case "base64":
      return bytesToBase64(utf8(text), options.urlSafe);
    case "url":
      return encodeURI(text);
    case "urlComponent":
      return encodeURIComponent(text);
    case "hex":
      return bytesToHex(utf8(text), " ");
  }
}

export type DecodeResult = { kind: "text"; text: string } | { kind: "binary"; bytes: Uint8Array };

export function decodeText(mode: EncodeMode, text: string): DecodeResult {
  switch (mode) {
    case "url":
    case "urlComponent":
      try {
        return { kind: "text", text: decodeURIComponent(text.replace(/\+/g, mode === "urlComponent" ? " " : "+")) };
      } catch {
        throw new DecodeError("This is not valid percent-encoding.");
      }
    case "base64":
    case "hex": {
      const bytes = mode === "base64" ? base64ToBytes(text) : hexToBytes(text);
      const decoded = decodeUtf8(bytes);
      return decoded === null ? { kind: "binary", bytes } : { kind: "text", text: decoded };
    }
  }
}
