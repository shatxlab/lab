// Hand-built JPEG/PNG files for metadata tests.
/* ------------------------------------------------------------ fixtures */

export const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
export const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
export const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

/** Build a big-endian TIFF block with Make, Orientation and a GPS IFD. */
export function buildExif(options: { orientation?: number; withGps?: boolean }): number[] {
  const make = [...ascii("Canon"), 0];
  // Layout: header(8) | IFD0 | data area
  const entries = 2 + (options.withGps ? 1 : 0); // Make, Orientation (+GPS pointer)
  const ifd0Size = 2 + entries * 12 + 4;
  const makeOffset = 8 + ifd0Size;
  const gpsOffset = makeOffset + make.length + (make.length % 2);
  const ifd0: number[] = [...be16(entries)];
  ifd0.push(...be16(0x010f), ...be16(2), ...be32(make.length), ...be32(makeOffset));
  ifd0.push(...be16(0x0112), ...be16(3), ...be32(1), ...be16(options.orientation ?? 1), 0, 0);
  if (options.withGps) ifd0.push(...be16(0x8825), ...be16(4), ...be32(1), ...be32(gpsOffset));
  ifd0.push(...be32(0));
  const data: number[] = [...make];
  if (make.length % 2) data.push(0);

  if (options.withGps) {
    const gpsEntries = 4;
    const gpsIfdSize = 2 + gpsEntries * 12 + 4;
    const latOffset = gpsOffset + gpsIfdSize;
    const lonOffset = latOffset + 24;
    const rationals = (d: number, m: number, s: number) => [...be32(d), ...be32(1), ...be32(m), ...be32(1), ...be32(s * 100), ...be32(100)];
    data.push(
      ...be16(gpsEntries),
      ...be16(1), ...be16(2), ...be32(2), ...ascii("N"), 0, 0, 0,
      ...be16(2), ...be16(5), ...be32(3), ...be32(latOffset),
      ...be16(3), ...be16(2), ...be32(2), ...ascii("W"), 0, 0, 0,
      ...be16(4), ...be16(5), ...be32(3), ...be32(lonOffset),
      ...be32(0),
      ...rationals(55, 45, 30), // 55°45'30" = 55.758333
      ...rationals(37, 36, 0), // 37°36'0" = 37.6
    );
  }
  return [...ascii("MM"), ...be16(0x2a), ...be32(8), ...ifd0, ...data];
}

export function segment(marker: number, payload: number[]): number[] {
  return [0xff, marker, ...be16(payload.length + 2), ...payload];
}

export function buildJpeg(options: { orientation?: number; withGps?: boolean; extra?: number[][] } = {}): Uint8Array {
  const parts = [
    [0xff, 0xd8],
    segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    segment(0xe1, [...ascii("Exif"), 0, 0, ...buildExif(options)]),
    segment(0xe1, [...ascii("http://ns.adobe.com/xap/1.0/"), 0, ...ascii("<x/>")]),
    segment(0xed, [...ascii("Photoshop 3.0"), 0]),
    segment(0xfe, ascii("secret comment")),
    segment(0xe2, [...ascii("ICC_PROFILE"), 0, 1, 1, 9, 9]),
    ...(options.extra ?? []),
    segment(0xdb, [0, ...new Array(64).fill(8)]),
    segment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]),
    segment(0xda, [1, 1, 0, 0, 0x3f, 0]),
    [0x12, 0x34, 0xff, 0x00, 0x56], // entropy-coded data with a stuffed FF00
    [0xff, 0xd9],
  ];
  return Uint8Array.from(parts.flat());
}

function crc32(bytes: number[]): number[] {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return be32((crc ^ 0xffffffff) >>> 0);
}

function pngChunk(type: string, data: number[]): number[] {
  const body = [...ascii(type), ...data];
  return [...be32(data.length), ...body, ...crc32(body)];
}

export function buildPng(): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...pngChunk("IHDR", [...be32(1), ...be32(1), 8, 6, 0, 0, 0]),
    ...pngChunk("tEXt", [...ascii("Author"), 0, ...ascii("Someone")]),
    ...pngChunk("eXIf", [1, 2, 3]),
    ...pngChunk("tIME", [0, 0, 0, 0, 0, 0, 0]),
    ...pngChunk("iCCP", [...ascii("icc"), 0, 0, 1]),
    ...pngChunk("IDAT", [1, 2, 3, 4]),
    ...pngChunk("IEND", []),
  ]);
}

