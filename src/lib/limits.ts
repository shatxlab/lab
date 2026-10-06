import { unzipSync } from "fflate";

/*
 * Bounds for untrusted files. Everything here runs in the user's own tab, so
 * an oversized or "zip bomb" file cannot attack a server — but it can still
 * exhaust memory and freeze or crash the tab. These caps keep parsing inside a
 * predictable envelope and turn a bomb into a readable error message.
 *
 * The absolute numbers are deliberate: generous enough for real documents,
 * small enough that a single malicious file cannot take the tab past a few
 * hundred megabytes of decompressed data. The limits are injectable so the
 * decision logic runs against tiny fixtures in tests.
 */

/** Raw file size accepted by any tool (compressed on disk for archives). */
export const MAX_FILE_BYTES = 64 * 1024 * 1024;

/** Maximum number of entries in a ZIP-based document (EPUB/DOCX/XLSX). */
export const MAX_ARCHIVE_ENTRIES = 5000;

/** Maximum decompressed size of any single archive entry. */
export const MAX_ARCHIVE_ENTRY_BYTES = 64 * 1024 * 1024;

/** Maximum decompressed size of the whole archive. */
export const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;

export interface ArchiveLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxEntries: MAX_ARCHIVE_ENTRIES,
  maxEntryBytes: MAX_ARCHIVE_ENTRY_BYTES,
  maxTotalBytes: MAX_ARCHIVE_UNCOMPRESSED_BYTES,
};

const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04];
/** Empty archives use the ZIP "end of central directory" signature instead. */
const ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06];

export function isZipArchive(bytes: Uint8Array): boolean {
  return startsWith(bytes, ZIP_LOCAL_HEADER) || startsWith(bytes, ZIP_EMPTY);
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

export function formatBytesLimit(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Reject a file whose raw size is beyond what the tools will read. */
export function assertFileSizeWithinLimit(
  size: number,
  label: string,
  maxBytes: number = MAX_FILE_BYTES,
): void {
  if (size > maxBytes) {
    throw new Error(`${label} is larger than ${formatBytesLimit(maxBytes)} and cannot be opened safely`);
  }
}

export type ArchiveScan = {
  entries: number;
  uncompressedBytes: number;
  maxEntryBytes: number;
};

/**
 * Reads a ZIP's central directory without inflating anything and returns the
 * declared entry count and total uncompressed size. fflate calls `filter`
 * *before* decompressing each entry, so returning `false` for every entry
 * makes this a metadata-only pass — no entry buffer is ever allocated.
 */
export function scanZipArchive(bytes: Uint8Array): ArchiveScan {
  let entries = 0;
  let uncompressedBytes = 0;
  let maxEntryBytes = 0;

  unzipSync(bytes, {
    filter: (file) => {
      entries += 1;
      uncompressedBytes += file.originalSize;
      maxEntryBytes = Math.max(maxEntryBytes, file.originalSize);
      return false;
    },
  });

  return { entries, uncompressedBytes, maxEntryBytes };
}

/**
 * Validates a ZIP-based document (EPUB, DOCX, XLSX…) before anything inflates
 * it. Throws a user-facing Error when the archive is unreadable or exceeds the
 * entry-count, per-entry or total-uncompressed limits.
 */
export function assertZipWithinLimits(
  bytes: Uint8Array,
  label: string,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): void {
  let scan: ArchiveScan;
  try {
    scan = scanZipArchive(bytes);
  } catch {
    throw new Error(`${label} is not a readable ZIP archive`);
  }

  if (scan.entries > limits.maxEntries) {
    throw new Error(`${label} contains too many files (${scan.entries.toLocaleString("en-US")})`);
  }
  if (scan.maxEntryBytes > limits.maxEntryBytes) {
    throw new Error(`${label} contains a file larger than ${formatBytesLimit(limits.maxEntryBytes)} when unzipped`);
  }
  if (scan.uncompressedBytes > limits.maxTotalBytes) {
    throw new Error(`${label} expands to more than ${formatBytesLimit(limits.maxTotalBytes)} when unzipped`);
  }
}

/**
 * fflate filter that refuses entries which individually or cumulatively exceed
 * the limits. Used during the real unzip as defence in depth: the central
 * directory can understate sizes, so the caps are re-checked while inflating.
 */
export function archiveEntryFilter(
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): (file: { originalSize: number }) => boolean {
  let total = 0;
  return (file) => {
    if (file.originalSize > limits.maxEntryBytes) return false;
    total += file.originalSize;
    return total <= limits.maxTotalBytes;
  };
}
