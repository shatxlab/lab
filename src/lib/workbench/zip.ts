import { Zip, ZipPassThrough } from "fflate";

import { uniqueNames } from "@/lib/image/plan";

/**
 * Pack many files into zip archives without ever holding them all at once.
 *
 * `zipSync` wants every file as bytes in memory, plus the finished archive:
 * for a thousand photos that is the whole batch twice over. Here each file is
 * read, written to the archive and let go of, and the archive itself is
 * assembled from `Blob` pieces, which the browser may keep on disk.
 *
 * The classic zip format is limited to 4 GB and 65,535 entries, so a larger
 * set comes back as several archives.
 */

export interface ZipEntry {
  name: string;
  blob: Blob;
}

export interface ZipOptions {
  /** Start a new archive before this many bytes of files. */
  maxBytes?: number;
  /** Start a new archive before this many files. */
  maxEntries?: number;
  onProgress?: (done: number, total: number) => void;
  /** Return true to stop; whatever is unfinished is dropped. */
  shouldStop?: () => boolean;
}

export const ZIP_MAX_BYTES = 3 * 1024 * 1024 * 1024;
export const ZIP_MAX_ENTRIES = 60_000;
/** Gather this many bytes of archive in memory before handing them to a Blob. */
const FLUSH_BYTES = 32 * 1024 * 1024;

export async function zipBlobs(entries: readonly ZipEntry[], options: ZipOptions = {}): Promise<Blob[]> {
  const { maxBytes = ZIP_MAX_BYTES, maxEntries = ZIP_MAX_ENTRIES, onProgress, shouldStop } = options;
  const names = uniqueNames(entries.map((entry) => entry.name));
  const archives: Blob[] = [];

  let zip: Zip | null = null;
  let pieces: BlobPart[] = [];
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let bytes = 0;
  let count = 0;

  const flush = () => {
    if (pending.length > 0) pieces.push(new Blob(pending as BlobPart[]));
    pending = [];
    pendingBytes = 0;
  };
  const open = () => {
    zip = new Zip((error, chunk) => {
      if (error) throw error;
      pending.push(chunk);
      pendingBytes += chunk.length;
      if (pendingBytes >= FLUSH_BYTES) flush();
    });
    bytes = 0;
    count = 0;
  };
  const close = () => {
    if (!zip) return;
    zip.end();
    flush();
    archives.push(new Blob(pieces, { type: "application/zip" }));
    pieces = [];
    zip = null;
  };

  for (const [position, entry] of entries.entries()) {
    if (shouldStop?.()) break;
    if (zip && (count >= maxEntries || (count > 0 && bytes + entry.blob.size > maxBytes))) close();
    if (!zip) open();
    // Photos are already compressed; storing them keeps packing fast.
    const file = new ZipPassThrough(names[position]!);
    zip!.add(file);
    file.push(new Uint8Array(await entry.blob.arrayBuffer()), true);
    bytes += entry.blob.size;
    count += 1;
    onProgress?.(position + 1, entries.length);
    // Let the page breathe between files.
    if (position % 20 === 19) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  close();
  return archives;
}

/** `images.zip`, or `images-1.zip`, `images-2.zip`… when there is more than one archive. */
export function archiveNames(base: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => (count === 1 ? `${base}.zip` : `${base}-${i + 1}.zip`));
}
