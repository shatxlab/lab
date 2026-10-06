import type { FileKind } from "@/lib/viewer/file-kind";

const ZIP_LOCAL = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** Magic numbers for formats the viewer shows without parsing them as text. */
export function sniffBinaryKind(bytes: Uint8Array): FileKind {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image"; // PNG
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image"; // JPEG
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image"; // GIF8
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && // RIFF....WEBP
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image";
  }
  return "unsupported";
}

/**
 * Only used when the name has no recognised extension. Office packages are
 * ZIP or OLE and advertise themselves in uncompressed path / stream names, so
 * a short head+tail scan is enough without pulling JSZip into the client.
 */
export function sniffOfficeKind(bytes: Uint8Array): FileKind {
  if (bytes.length === 0) return "unsupported";

  const sample = sampleForSniff(bytes);

  if (startsWith(bytes, ZIP_LOCAL)) {
    if (containsAscii(sample, "word/document.xml")) return "docx";
    if (containsAscii(sample, "xl/workbook.xml") || containsAscii(sample, "xl/workbook.bin")) {
      return "sheet";
    }
    if (containsAscii(sample, "application/vnd.oasis.opendocument.spreadsheet")) return "sheet";
    return "unsupported";
  }

  if (startsWith(bytes, OLE)) {
    if (containsUtf16LeAscii(sample, "WordDocument")) return "legacy-doc";
    if (containsUtf16LeAscii(sample, "Workbook") || containsUtf16LeAscii(sample, "Book")) {
      return "sheet";
    }
    return "unsupported";
  }

  return "unsupported";
}

function sampleForSniff(bytes: Uint8Array): Uint8Array {
  const windowSize = 128 * 1024;
  if (bytes.length <= windowSize * 2) return bytes;

  const head = bytes.subarray(0, windowSize);
  const tail = bytes.subarray(bytes.length - windowSize);
  const sample = new Uint8Array(head.length + tail.length);
  sample.set(head);
  sample.set(tail, head.length);
  return sample;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function containsAscii(haystack: Uint8Array, needle: string): boolean {
  return containsBytes(haystack, encodeAscii(needle));
}

function containsUtf16LeAscii(haystack: Uint8Array, needle: string): boolean {
  const encoded = new Uint8Array(needle.length * 2);
  for (let index = 0; index < needle.length; index += 1) {
    encoded[index * 2] = needle.charCodeAt(index);
    encoded[index * 2 + 1] = 0;
  }
  return containsBytes(haystack, encoded);
}

function encodeAscii(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;

  outer: for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) continue outer;
    }
    return true;
  }

  return false;
}
