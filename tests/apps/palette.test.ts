import { describe, expect, it } from "vitest";

import { filterItems, normalize, type PaletteItem } from "@/lib/apps/palette";

const items: PaletteItem[] = [
  { id: "reader", group: "tools", title: "EPUB reader", keywords: "book ebook" },
  { id: "viewer", group: "tools", title: "Document viewer", keywords: "pdf word excel" },
  { id: "pdf", group: "tools", title: "PDF tools", keywords: "merge split" },
  { id: "cross", group: "tools", title: "Кроссворд", keywords: "crossword" },
  { id: "yo", group: "tools", title: "Ёлка", keywords: "" },
];

describe("palette filtering", () => {
  it("keeps the original order for an empty query", () => {
    expect(filterItems(items, "  ").map((i) => i.id)).toEqual(items.map((i) => i.id));
  });

  it("ranks title prefixes above keyword matches", () => {
    expect(filterItems(items, "pdf").map((i) => i.id)).toEqual(["pdf", "viewer"]);
  });

  it("requires every token to match", () => {
    expect(filterItems(items, "merge pdf").map((i) => i.id)).toEqual(["pdf"]);
    expect(filterItems(items, "merge zzz")).toEqual([]);
  });

  it("matches via keywords in another language", () => {
    expect(filterItems(items, "crossword").map((i) => i.id)).toEqual(["cross"]);
  });

  it("folds ё and diacritics, and allows loose subsequences", () => {
    expect(normalize("Ёлка Café")).toBe("елка cafe");
    expect(filterItems(items, "елка").map((i) => i.id)).toEqual(["yo"]);
    expect(filterItems(items, "docvwr").map((i) => i.id)).toEqual(["viewer"]);
  });
});
