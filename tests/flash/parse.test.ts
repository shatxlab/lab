import { describe, expect, it } from "vitest";

import { parseDelimited, parseImport, parseLines, toTsv } from "@/lib/flash/parse";

const pairs = (text: string) => parseImport(text).cards.map((card) => [card.front, card.back]);

describe("parseImport — lines", () => {
  it("splits on spaced dashes and colons, first separator wins", () => {
    expect(pairs("cat — кошка\ndog - собака\nbird – птица\nfish: рыба")).toEqual([
      ["cat", "кошка"],
      ["dog", "собака"],
      ["bird", "птица"],
      ["fish", "рыба"],
    ]);
  });

  it("does not split hyphenated words and keeps later separators in the answer", () => {
    expect(pairs("well-known — famous - popular\nmother-in-law — a spouse's mother")).toEqual([
      ["well-known", "famous - popular"],
      ["mother-in-law", "a spouse's mother"],
    ]);
  });

  it("skips lines without a term and a definition, and counts them", () => {
    const result = parseImport("hello — привет\njust a word\n — no front\n\n");
    expect(result.cards).toHaveLength(1);
    expect(result.skipped).toBe(2);
  });

  it("handles Windows line endings and a BOM", () => {
    expect(pairs("﻿one — раз\r\ntwo — два\r\n")).toEqual([
      ["one", "раз"],
      ["two", "два"],
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parseImport("  \n\n")).toEqual({ cards: [], skipped: 0 });
  });
});

describe("parseImport — TSV", () => {
  it("reads front, back and tags columns", () => {
    const result = parseImport("sun\tсолнце\tnature space\nmoon\tлуна\n");
    expect(result.cards).toEqual([
      { front: "sun", back: "солнце", tags: ["nature", "space"] },
      { front: "moon", back: "луна", tags: [] },
    ]);
  });

  it("uses a header row to find the tags column and skips the header", () => {
    const result = parseImport("front\tback\textra\ttags\na\tb\tx\tone two\n");
    expect(result.cards).toEqual([{ front: "a", back: "b", tags: ["one", "two"] }]);
  });

  it("supports quoted cells with tabs, quotes and newlines", () => {
    const result = parseImport('"a\tb"\t"say ""hi""\nthere"\n');
    expect(result.cards[0]).toMatchObject({ front: "a\tb", back: 'say "hi"\nthere' });
  });
});

describe("parseImport — CSV", () => {
  it("detects a header and the comma delimiter", () => {
    const result = parseImport("front,back,tags\nhola,hello,spanish\n\"a, b\",\"c, d\",\n");
    expect(result.cards).toEqual([
      { front: "hola", back: "hello", tags: ["spanish"] },
      { front: "a, b", back: "c, d", tags: [] },
    ]);
  });

  it("detects semicolons and Russian header names", () => {
    expect(parseImport("вопрос;ответ\nстол;table\n").cards).toEqual([{ front: "стол", back: "table", tags: [] }]);
  });

  it("falls back to headerless CSV when most lines have commas", () => {
    expect(pairs("red,красный\nblue,синий")).toEqual([
      ["red", "красный"],
      ["blue", "синий"],
    ]);
  });
});

describe("limits", () => {
  it("caps a deck import and reports the overflow as skipped", () => {
    const text = Array.from({ length: 5003 }, (_, i) => `q${i} — a${i}`).join("\n");
    const result = parseLines(text);
    expect(result.cards).toHaveLength(5000);
    expect(result.skipped).toBe(3);
  });

  it("truncates oversized fields", () => {
    const result = parseImport(`${"x".repeat(9000)} — short`);
    expect(result.cards[0]!.front).toHaveLength(4000);
  });
});

describe("toTsv", () => {
  it("round-trips through parseImport, including awkward cells", () => {
    const cards = [
      { front: "plain", back: "text", tags: ["a", "b"] },
      { front: "tab\there", back: 'quote " and\nnewline', tags: [] },
    ];
    expect(parseImport(toTsv(cards)).cards).toEqual(cards);
  });
});

describe("parseDelimited", () => {
  it("keeps empty cells and drops fully empty rows", () => {
    expect(parseDelimited("a,,c\n\n,,\nd,e,f", ",")).toEqual([
      ["a", "", "c"],
      ["d", "e", "f"],
    ]);
  });
});
