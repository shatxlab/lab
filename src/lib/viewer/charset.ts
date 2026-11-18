/**
 * BOM, declared charset, then UTF-8-or-windows-1251. Shared by CSV/TSV, plain
 * text, Markdown, and the HTML-as-.xls path that already had this problem.
 */

const CHARSET_LABELS: Record<string, string> = {
  utf8: "utf-8",
  "utf-8": "utf-8",
  unicode: "utf-16le",
  utf16: "utf-16le",
  "utf-16": "utf-16le",
  "utf-16le": "utf-16le",
  "utf-16be": "utf-16be",
  "windows-1251": "windows-1251",
  cp1251: "windows-1251",
  "cp-1251": "windows-1251",
  "windows-1252": "windows-1252",
  cp1252: "windows-1252",
  "iso-8859-1": "iso-8859-1",
  "iso-8859-5": "iso-8859-5",
  "koi8-r": "koi8-r",
  "koi8-u": "koi8-u",
};

function decodeWith(charset: string, bytes: Uint8Array): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** UTF-8 / UTF-16 BOM, or a UTF-16 markup file that starts with `<`. */
export function sniffBomCharset(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  if (bytes[0] === 0x3c && bytes[1] === 0x00) return "utf-16le";
  if (bytes[0] === 0x00 && bytes[1] === 0x3c) return "utf-16be";
  return null;
}

function sniffDeclaredCharset(bytes: Uint8Array): string | null {
  const head = new TextDecoder("iso-8859-1").decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  const declared =
    /encoding\s*=\s*["']?\s*([a-z0-9_\-]+)/i.exec(head) ??
    /charset\s*=\s*["']?\s*([a-z0-9_\-]+)/i.exec(head);

  if (!declared) return null;
  return CHARSET_LABELS[declared[1]!.toLowerCase()] ?? declared[1]!;
}

function looksLikeUtf16Le(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  if (sample.length < 8) return false;

  let oddZeros = 0;
  const pairs = Math.floor(sample.length / 2);
  for (let index = 0; index < pairs; index += 1) {
    if (sample[index * 2 + 1] === 0) oddZeros += 1;
  }

  return oddZeros / pairs > 0.8;
}

/**
 * Valid UTF-8 wins; otherwise assume windows-1251. That matches the Cyrillic
 * exports this viewer already special-cases, without pulling in a detector.
 */
export function sniffTextCharset(bytes: Uint8Array): string {
  const bom = sniffBomCharset(bytes);
  if (bom) return bom;
  if (looksLikeUtf16Le(bytes)) return "utf-16le";

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "utf-8";
  } catch {
    return "windows-1251";
  }
}

export function sniffMarkupCharset(bytes: Uint8Array): string {
  const bom = sniffBomCharset(bytes);
  if (bom) return bom;

  const declared = sniffDeclaredCharset(bytes);
  if (declared) return declared;

  return sniffTextCharset(bytes);
}

export function decodeMarkupBytes(bytes: Uint8Array): string {
  return decodeWith(sniffMarkupCharset(bytes), bytes);
}

export function decodeTextBytes(bytes: Uint8Array): string {
  return decodeWith(sniffTextCharset(bytes), bytes);
}
