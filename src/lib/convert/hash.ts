import { bytesToHex, utf8 } from "@/lib/convert/encode";

export type HashAlgorithm = "MD5" | "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

export const HASH_ALGORITHMS: readonly HashAlgorithm[] = ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"];

/* ------------------------------------------------------------------ MD5 */
// MD5 is cryptographically broken and Web Crypto omits it, but checksums for
// downloads and legacy systems still use it, so a small implementation lives
// here. Do not use it for security.

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5(data: Uint8Array): Uint8Array {
  const bitLength = data.length * 8;
  const paddedLength = (((data.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 2 ** 32), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < paddedLength; offset += 64) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      f = (f + a + K[i]! + view.getUint32(offset + g * 4, true)) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((f << S[i]!) | (f >>> (32 - S[i]!)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((word, index) => outView.setUint32(index * 4, word, true));
  return out;
}

/* ------------------------------------------------------------ dispatcher */

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error("Web Crypto is not available in this browser context.");
  return api;
}

/** Copy into a plain ArrayBuffer-backed view, as Web Crypto's types require. */
function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function digest(algorithm: HashAlgorithm, data: Uint8Array): Promise<Uint8Array> {
  if (algorithm === "MD5") return md5(data);
  return new Uint8Array(await subtle().digest(algorithm, buffer(data)));
}

/** HMAC with the given secret (SHA family only — HMAC-MD5 is not offered). */
export async function hmac(algorithm: Exclude<HashAlgorithm, "MD5">, key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await subtle().importKey("raw", buffer(key), { name: "HMAC", hash: algorithm }, false, ["sign"]);
  return new Uint8Array(await subtle().sign("HMAC", cryptoKey, buffer(data)));
}

export interface HashRow {
  algorithm: HashAlgorithm;
  hex: string;
}

export async function hashAll(data: Uint8Array, secret?: string): Promise<HashRow[]> {
  const rows: HashRow[] = [];
  for (const algorithm of HASH_ALGORITHMS) {
    if (secret) {
      if (algorithm === "MD5") continue;
      rows.push({ algorithm, hex: bytesToHex(await hmac(algorithm, utf8(secret), data)) });
    } else {
      rows.push({ algorithm, hex: bytesToHex(await digest(algorithm, data)) });
    }
  }
  return rows;
}
