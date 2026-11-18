/*
 * Minimal, defensive metadata handling for JPEG and PNG.
 *
 *  - readJpegMetadata: lists what a JPEG discloses (camera, software, dates,
 *    GPS position) so people can see what stripping removes.
 *  - stripJpeg / stripPng: remove metadata WITHOUT re-encoding the pixels. For
 *    JPEG, a one-tag Exif block holding only the orientation is kept so a
 *    portrait photo does not turn sideways.
 *
 * Input is untrusted, so every read is bounds-checked and a malformed file
 * yields partial results rather than an exception.
 */

export interface GpsPosition {
  latitude: number;
  longitude: number;
  altitude?: number;
}

export interface ImageMetadata {
  hasExif: boolean;
  make?: string;
  model?: string;
  lens?: string;
  software?: string;
  dateTime?: string;
  orientation?: number;
  gps?: GpsPosition;
  /** XMP / IPTC / Photoshop blocks are present. */
  hasXmp: boolean;
  hasIptc: boolean;
  hasIcc: boolean;
}

const SOI = 0xffd8;

class Reader {
  constructor(
    readonly view: DataView,
    readonly little: boolean,
  ) {}
  u16(offset: number): number {
    if (offset < 0 || offset + 2 > this.view.byteLength) throw new RangeError("exif: out of bounds");
    return this.view.getUint16(offset, this.little);
  }
  u32(offset: number): number {
    if (offset < 0 || offset + 4 > this.view.byteLength) throw new RangeError("exif: out of bounds");
    return this.view.getUint32(offset, this.little);
  }
  ascii(offset: number, length: number): string {
    if (offset < 0 || offset + length > this.view.byteLength) throw new RangeError("exif: out of bounds");
    let text = "";
    for (let index = 0; index < length; index += 1) {
      const code = this.view.getUint8(offset + index);
      if (code === 0) break;
      text += String.fromCharCode(code);
    }
    return text.trim();
  }
}

interface Entry {
  tag: number;
  type: number;
  count: number;
  /** Absolute offset of the value (inline slot or pointed-to data). */
  valueOffset: number;
}

function readIfd(reader: Reader, ifdOffset: number): Entry[] {
  const count = reader.u16(ifdOffset);
  const entries: Entry[] = [];
  for (let index = 0; index < Math.min(count, 200); index += 1) {
    const base = ifdOffset + 2 + index * 12;
    const type = reader.u16(base + 2);
    const valueCount = reader.u32(base + 4);
    const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 } as Record<number, number>)[type] ?? 1;
    const inline = size * valueCount <= 4;
    entries.push({ tag: reader.u16(base), type, count: valueCount, valueOffset: inline ? base + 8 : reader.u32(base + 8) });
  }
  return entries;
}

function rational(reader: Reader, offset: number): number {
  const numerator = reader.u32(offset);
  const denominator = reader.u32(offset + 4);
  return denominator === 0 ? 0 : numerator / denominator;
}

function dms(reader: Reader, entry: Entry): number {
  const [degrees = 0, minutes = 0, seconds = 0] = [0, 1, 2].map((index) => rational(reader, entry.valueOffset + index * 8));
  return degrees + minutes / 60 + seconds / 3600;
}

function parseTiff(tiff: DataView): Partial<ImageMetadata> {
  if (tiff.byteLength < 8) return {};
  const byteOrder = tiff.getUint16(0);
  const little = byteOrder === 0x4949;
  if (!little && byteOrder !== 0x4d4d) return {};
  const reader = new Reader(tiff, little);
  const result: Partial<ImageMetadata> = {};
  const text = (entry: Entry) => reader.ascii(entry.valueOffset, entry.count);

  let exifPointer = 0;
  let gpsPointer = 0;
  try {
    for (const entry of readIfd(reader, reader.u32(4))) {
      if (entry.tag === 0x010f) result.make = text(entry);
      else if (entry.tag === 0x0110) result.model = text(entry);
      else if (entry.tag === 0x0131) result.software = text(entry);
      else if (entry.tag === 0x0132) result.dateTime = text(entry);
      else if (entry.tag === 0x0112) result.orientation = reader.u16(entry.valueOffset);
      else if (entry.tag === 0x8769) exifPointer = reader.u32(entry.valueOffset);
      else if (entry.tag === 0x8825) gpsPointer = reader.u32(entry.valueOffset);
    }
  } catch {
    // Keep whatever was read before the damage.
  }

  if (exifPointer) {
    try {
      for (const entry of readIfd(reader, exifPointer)) {
        if (entry.tag === 0x9003) result.dateTime = text(entry);
        else if (entry.tag === 0xa434) result.lens = text(entry);
      }
    } catch {
      // ignore
    }
  }

  if (gpsPointer) {
    try {
      const gps: Record<number, Entry> = {};
      for (const entry of readIfd(reader, gpsPointer)) gps[entry.tag] = entry;
      if (gps[2] && gps[4]) {
        let latitude = dms(reader, gps[2]);
        let longitude = dms(reader, gps[4]);
        if (gps[1] && reader.ascii(gps[1].valueOffset, 1) === "S") latitude = -latitude;
        if (gps[3] && reader.ascii(gps[3].valueOffset, 1) === "W") longitude = -longitude;
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          result.gps = { latitude, longitude };
          if (gps[6]) {
            const below = gps[5] && reader.view.getUint8(gps[5].valueOffset) === 1;
            result.gps.altitude = (below ? -1 : 1) * rational(reader, gps[6].valueOffset);
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return result;
}

interface Segment {
  marker: number;
  /** Offset of the 0xFF byte. */
  start: number;
  /** Offset one past the segment's last byte. */
  end: number;
}

/** Marker segments up to (not including) the entropy-coded scan. */
function jpegSegments(bytes: Uint8Array): { segments: Segment[]; scanStart: number } | null {
  if (bytes.length < 4 || ((bytes[0]! << 8) | bytes[1]!) !== SOI) return null;
  const segments: Segment[] = [];
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return { segments, scanStart: at };
    const marker = bytes[at + 1]!;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return { segments, scanStart: at };
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      segments.push({ marker, start: at, end: at + 2 });
      at += 2;
      continue;
    }
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    if (length < 2 || at + 2 + length > bytes.length) return { segments, scanStart: bytes.length };
    segments.push({ marker, start: at, end: at + 2 + length });
    at += 2 + length;
  }
  return { segments, scanStart: at };
}

function hasPrefix(bytes: Uint8Array, offset: number, text: string): boolean {
  for (let index = 0; index < text.length; index += 1) if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  return true;
}

export function readJpegMetadata(bytes: Uint8Array): ImageMetadata {
  const meta: ImageMetadata = { hasExif: false, hasXmp: false, hasIptc: false, hasIcc: false };
  const parsed = jpegSegments(bytes);
  if (!parsed) return meta;
  for (const segment of parsed.segments) {
    const data = segment.start + 4;
    if (segment.marker === 0xe1 && hasPrefix(bytes, data, "Exif\0\0")) {
      meta.hasExif = true;
      const tiffStart = data + 6;
      Object.assign(meta, parseTiff(new DataView(bytes.buffer, bytes.byteOffset + tiffStart, segment.end - tiffStart)));
    } else if (segment.marker === 0xe1 && hasPrefix(bytes, data, "http://ns.adobe.com/xap/")) {
      meta.hasXmp = true;
    } else if (segment.marker === 0xe2 && hasPrefix(bytes, data, "ICC_PROFILE")) {
      meta.hasIcc = true;
    } else if (segment.marker === 0xed) {
      meta.hasIptc = true;
    }
  }
  return meta;
}

/** A tiny Exif block that holds nothing but the orientation tag. */
function orientationOnlyExif(orientation: number): Uint8Array {
  const body = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF header, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ];
  const length = body.length + 2;
  return Uint8Array.from([0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...body]);
}

/**
 * Remove EXIF (including GPS), XMP, IPTC/Photoshop, comments and vendor
 * segments from a JPEG without touching the compressed image data. ICC colour
 * profiles and Adobe colour-transform markers stay: dropping them changes how
 * the picture looks. A lone orientation tag is re-added when needed.
 * Returns null when the input is not a JPEG.
 */
export function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  const parsed = jpegSegments(bytes);
  if (!parsed) return null;
  const orientation = readJpegMetadata(bytes).orientation;

  const keep = (segment: Segment): boolean => {
    const data = segment.start + 4;
    if (segment.marker === 0xe0) return true; // JFIF
    if (segment.marker === 0xe2) return hasPrefix(bytes, data, "ICC_PROFILE");
    if (segment.marker === 0xee) return hasPrefix(bytes, data, "Adobe");
    if (segment.marker >= 0xe1 && segment.marker <= 0xef) return false; // APPn
    if (segment.marker === 0xfe) return false; // COM
    return true; // tables, frame headers, restart markers
  };

  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let insertedOrientation = orientation === undefined || orientation === 1 || orientation < 1 || orientation > 8;
  for (const segment of parsed.segments) {
    if (!keep(segment)) continue;
    parts.push(bytes.subarray(segment.start, segment.end));
    // Exif must follow JFIF if present, otherwise come right after SOI.
    if (!insertedOrientation && segment.marker === 0xe0) {
      parts.push(orientationOnlyExif(orientation!));
      insertedOrientation = true;
    }
  }
  if (!insertedOrientation) parts.splice(1, 0, orientationOnlyExif(orientation!));
  parts.push(bytes.subarray(parsed.scanStart));

  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME", "dSIG"]);

function pngChunks(bytes: Uint8Array): { type: string; start: number; end: number }[] | null {
  if (bytes.length < 8 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: { type: string; start: number; end: number }[] = [];
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const end = at + 12 + length;
    if (end > bytes.length) break;
    chunks.push({ type: String.fromCharCode(bytes[at + 4]!, bytes[at + 5]!, bytes[at + 6]!, bytes[at + 7]!), start: at, end });
    at = end;
  }
  return chunks;
}

export function readPngMetadata(bytes: Uint8Array): { hasText: boolean; hasExif: boolean; hasTime: boolean; hasIcc: boolean } | null {
  const chunks = pngChunks(bytes);
  if (!chunks) return null;
  const types = new Set(chunks.map((chunk) => chunk.type));
  return {
    hasText: types.has("tEXt") || types.has("zTXt") || types.has("iTXt"),
    hasExif: types.has("eXIf"),
    hasTime: types.has("tIME"),
    hasIcc: types.has("iCCP"),
  };
}

/** Drop text, Exif and timestamp chunks; the pixel data is copied untouched. */
export function stripPng(bytes: Uint8Array): Uint8Array | null {
  const chunks = pngChunks(bytes);
  if (!chunks) return null;
  const kept = chunks.filter((chunk) => !PNG_DROP.has(chunk.type));
  const out = new Uint8Array(8 + kept.reduce((sum, chunk) => sum + (chunk.end - chunk.start), 0));
  out.set(bytes.subarray(0, 8));
  let at = 8;
  for (const chunk of kept) {
    out.set(bytes.subarray(chunk.start, chunk.end), at);
    at += chunk.end - chunk.start;
  }
  return out;
}

/** True when a GIF contains more than one frame. */
export function isAnimatedGif(bytes: Uint8Array): boolean {
  if (!hasPrefix(bytes, 0, "GIF8")) return false;
  let frames = 0;
  for (let index = 0; index + 2 < bytes.length; index += 1) {
    if (bytes[index] === 0x21 && bytes[index + 1] === 0xf9 && bytes[index + 2] === 0x04) {
      frames += 1;
      if (frames > 1) return true;
    }
  }
  return false;
}
