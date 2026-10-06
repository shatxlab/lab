import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";

import {
  archiveEntryFilter,
  assertFileSizeWithinLimit,
  assertZipWithinLimits,
  DEFAULT_ARCHIVE_LIMITS,
  isZipArchive,
  scanZipArchive,
  type ArchiveLimits,
} from "@/lib/limits";

/** Small limits so byte-cap decisions can be exercised with a few-byte fixture. */
const tiny: ArchiveLimits = { maxEntries: 3, maxEntryBytes: 4, maxTotalBytes: 10 };

function zip(entries: Record<string, string>): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(entries)) files[name] = strToU8(value);
  return zipSync(files);
}

describe("isZipArchive", () => {
  it("recognises a real ZIP", () => {
    expect(isZipArchive(zip({ "a.txt": "hi" }))).toBe(true);
  });

  it("rejects plain text and empty input", () => {
    expect(isZipArchive(strToU8("not a zip"))).toBe(false);
    expect(isZipArchive(new Uint8Array())).toBe(false);
  });
});

describe("assertFileSizeWithinLimit", () => {
  it("allows a size exactly at the limit", () => {
    expect(() => assertFileSizeWithinLimit(100, "Doc", 100)).not.toThrow();
  });

  it("rejects a size over the limit with a readable message", () => {
    expect(() => assertFileSizeWithinLimit(101, "Doc", 100)).toThrow(/larger than/);
  });
});

describe("scanZipArchive", () => {
  it("counts entries, totals and the largest entry without inflating", () => {
    const scan = scanZipArchive(zip({ "a.txt": "hello", "b.txt": "hi" }));
    expect(scan.entries).toBe(2);
    expect(scan.uncompressedBytes).toBe(7);
    expect(scan.maxEntryBytes).toBe(5);
  });

  it("returns zeroes for an empty archive", () => {
    expect(scanZipArchive(zipSync({}))).toEqual({ entries: 0, uncompressedBytes: 0, maxEntryBytes: 0 });
  });
});

describe("assertZipWithinLimits", () => {
  it("accepts an archive within limits", () => {
    expect(() => assertZipWithinLimits(zip({ "a.txt": "hi" }), "Doc", tiny)).not.toThrow();
  });

  it("rejects too many entries", () => {
    const archive = zip({ a: "1", b: "1", c: "1", d: "1" });
    expect(() => assertZipWithinLimits(archive, "Doc", tiny)).toThrow(/too many files/);
  });

  it("rejects a single entry over the per-entry cap", () => {
    expect(() => assertZipWithinLimits(zip({ a: "12345" }), "Doc", tiny)).toThrow(/larger than/);
  });

  it("rejects a total over the cumulative cap", () => {
    const archive = zip({ a: "1234", b: "1234", c: "1234" });
    expect(() => assertZipWithinLimits(archive, "Doc", tiny)).toThrow(/expands to more than/);
  });

  it("reports an unreadable archive instead of leaking the ZIP parser error", () => {
    expect(() => assertZipWithinLimits(strToU8("garbage"), "Doc", tiny)).toThrow(/not a readable ZIP/);
  });
});

describe("archiveEntryFilter", () => {
  it("rejects an oversized entry and stops once the total is reached", () => {
    const filter = archiveEntryFilter(tiny);
    expect(filter({ originalSize: 5 })).toBe(false);
    expect(filter({ originalSize: 4 })).toBe(true);
    expect(filter({ originalSize: 4 })).toBe(true);
    expect(filter({ originalSize: 3 })).toBe(false);
  });

  it("defaults to the production limits", () => {
    expect(archiveEntryFilter()({ originalSize: DEFAULT_ARCHIVE_LIMITS.maxEntryBytes })).toBe(true);
    expect(archiveEntryFilter()({ originalSize: DEFAULT_ARCHIVE_LIMITS.maxEntryBytes + 1 })).toBe(false);
  });
});
