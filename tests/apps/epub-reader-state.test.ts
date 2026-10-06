// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import type { EpubBook } from "@/lib/apps/epub-reader";
import {
  EPUB_READER_STORAGE_KEY,
  addBookmark,
  clampReaderPrefs,
  defaultReaderPrefs,
  progressForBook,
  readReaderState,
  searchChapters,
  upsertProgress,
  writeReaderState,
} from "@/lib/apps/epub-reader-state";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function bookWithManyMatches(): EpubBook {
  return {
    title: "Search Fixture",
    chapters: [
      {
        id: "one",
        href: "one.xhtml",
        title: "One",
        html: "<h1>One</h1><p>Alpha marker first chapter.</p>",
      },
      {
        id: "two",
        href: "two.xhtml",
        title: "Two",
        html: `<h1>Two</h1><p>${Array.from({ length: 80 }, (_, index) => `marker ${index}`).join(" ")}</p>`,
      },
    ],
  };
}

describe("epub reader state", () => {
  it("round-trips the new stored shape", () => {
    const storage = new MemoryStorage();
    const initial = {
      prefs: { theme: "sepia" as const, fontSize: 20, lineHeight: 1.8, maxWidth: 82 },
      books: {
        "epub:roundtrip": {
          progress: { chapterHref: "two.xhtml", chapterProgress: 0.42, updatedAt: 123 },
          bookmarks: [
            {
              id: "b1",
              chapterHref: "two.xhtml",
              chapterTitle: "Two",
              progress: 0.42,
              label: "Two · 42%",
              createdAt: 456,
            },
          ],
        },
      },
    };

    writeReaderState(initial, storage);

    expect(readReaderState(storage)).toEqual(initial);
  });

  it("migrates the MVP href-only shape on read", () => {
    const storage = new MemoryStorage();
    storage.setItem(EPUB_READER_STORAGE_KEY, JSON.stringify({ "epub:legacy": { chapterHref: "old.xhtml" } }));

    const state = readReaderState(storage);

    expect(state.prefs).toEqual(defaultReaderPrefs());
    expect(progressForBook(state, "epub:legacy")).toEqual({
      chapterHref: "old.xhtml",
      chapterProgress: 0,
      updatedAt: 0,
    });
  });

  it("clamps reader preferences to readable bounds", () => {
    expect(clampReaderPrefs({ theme: "night", fontSize: 8, lineHeight: 0.7, maxWidth: 140 })).toEqual({
      theme: "night",
      fontSize: 16,
      lineHeight: 1.35,
      maxWidth: 92,
    });
    expect(clampReaderPrefs({ theme: "paper", fontSize: 30, lineHeight: 3, maxWidth: 20 })).toEqual({
      theme: "paper",
      fontSize: 24,
      lineHeight: 2,
      maxWidth: 58,
    });
  });

  it("searches chapter text across chapters and caps results", () => {
    const results = searchChapters(bookWithManyMatches(), "marker");

    expect(results).toHaveLength(50);
    expect(results[0]).toMatchObject({ chapterIndex: 0, chapterTitle: "One" });
    expect(results.some((result) => result.chapterIndex === 1)).toBe(true);
    expect(results[0]?.snippet).toContain("marker");
  });

  it("stored JSON keeps metadata only, never fixture chapter text", () => {
    const storage = new MemoryStorage();
    const withProgress = upsertProgress(readReaderState(storage), "epub:safe", {
      chapterHref: "one.xhtml",
      chapterProgress: 0.25,
      updatedAt: 1000,
    });
    const withBookmark = addBookmark(withProgress, "epub:safe", {
      id: "safe-bookmark",
      chapterHref: "one.xhtml",
      chapterTitle: "One",
      progress: 0.25,
      label: "One · 25%",
      createdAt: 1001,
    });

    writeReaderState(withBookmark, storage);

    const raw = storage.getItem(EPUB_READER_STORAGE_KEY) ?? "";
    expect(raw).toContain("one.xhtml");
    expect(raw).not.toContain("Alpha marker first chapter");
    expect(raw).not.toContain("<p>");
  });
});
