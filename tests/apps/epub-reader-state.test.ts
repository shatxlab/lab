// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import type { EpubBook, EpubChapter } from "@/lib/apps/epub-reader";
import {
  EPUB_READER_STORAGE_KEY,
  addBookmark,
  clampReaderPrefs,
  defaultReaderPrefs,
  openingChapterIndex,
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

function chapter(href: string, html: string): EpubChapter {
  return { id: href, href, title: href, html };
}

const COVER = chapter("cover.xhtml", '<div><img src="data:image/png;base64,AAAA"/></div>');
const TITLE_PAGE = chapter("title.xhtml", "<h1>Plate Book</h1>");
const PROSE = (href: string, text: string) =>
  chapter(href, `<h1>${href}</h1><p>${text}</p>`);

describe("openingChapterIndex", () => {
  const chapters = [
    COVER,
    TITLE_PAGE,
    PROSE("c1.xhtml", "It was a bright cold day in April, and the clocks were striking thirteen."),
    PROSE("c2.xhtml", "Second chapter with plenty of real readable prose for the threshold."),
  ];

  it("skips textless cover and title pages on a fresh open", () => {
    expect(openingChapterIndex(chapters, 0)).toBe(2);
  });

  it("keeps a remembered chapter that has readable text", () => {
    expect(openingChapterIndex(chapters, 3)).toBe(3);
  });

  it("moves a remembered cover position to the next readable chapter", () => {
    expect(openingChapterIndex(chapters, 1)).toBe(2);
  });

  it("falls back to an earlier readable chapter when nothing later has text", () => {
    const withBackCover = [...chapters, COVER];
    expect(openingChapterIndex(withBackCover, 4)).toBe(2);
  });

  it("keeps the choice when no chapter has readable text", () => {
    const plates = [COVER, chapter("p1.xhtml", "<h1>I</h1>"), TITLE_PAGE];
    expect(openingChapterIndex(plates, 1)).toBe(1);
  });

  it("clamps out-of-range preferences and handles empty books", () => {
    expect(openingChapterIndex(chapters, 99)).toBe(3);
    expect(openingChapterIndex(chapters, -5)).toBe(2);
    expect(openingChapterIndex([], 0)).toBe(0);
  });
});
