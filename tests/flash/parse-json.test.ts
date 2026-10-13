import { describe, expect, it } from "vitest";

import { MAX_FIELD_LENGTH } from "@/lib/flash/model";
import { parseImport, parseJsonCards, toJson, toTsv } from "@/lib/flash/parse";

describe("JSON import", () => {
  it("reads an array of front/back objects, with tags as a list or a string", () => {
    const result = parseImport(JSON.stringify([{ front: "sun", back: "солнце", tags: ["nature", "easy"] }, { front: "moon", back: "луна", tags: "night" }]));
    expect(result).toEqual({
      cards: [
        { front: "sun", back: "солнце", tags: ["nature", "easy"] },
        { front: "moon", back: "луна", tags: ["night"] },
      ],
      skipped: 0,
    });
  });

  it("knows the usual names for the two sides, in either case and language", () => {
    const result = parseImport(JSON.stringify([{ Question: "2+2", Answer: "4" }, { term: "cat", definition: "a pet" }, { q: "x", a: "y" }, { вопрос: "кот", ответ: "cat" }]));
    expect(result.cards.map((c) => [c.front, c.back])).toEqual([["2+2", "4"], ["cat", "a pet"], ["x", "y"], ["кот", "cat"]]);
  });

  it("reads pairs, with an optional third tags item, and numbers as text", () => {
    const result = parseImport('[["one", 1], ["two", "2", "digits math"]]');
    expect(result.cards).toEqual([
      { front: "one", back: "1", tags: [] },
      { front: "two", back: "2", tags: ["digits", "math"] },
    ]);
  });

  it("reads a { cards } wrapper and the Send-to-phone shape", () => {
    expect(parseImport('{"name":"X","cards":[{"front":"a","back":"b"}]}').cards).toHaveLength(1);
    expect(parseImport('{"n":"X","c":[["a","b"],["c","d","t"]]}').cards).toHaveLength(2);
  });

  it("reads a plain term-to-definition map", () => {
    expect(parseImport('{"sun":"солнце","moon":"луна"}').cards).toEqual([
      { front: "sun", back: "солнце", tags: [] },
      { front: "moon", back: "луна", tags: [] },
    ]);
  });

  it("counts entries that lack a side as skipped", () => {
    const result = parseImport('[{"front":"a","back":"b"},{"front":"only"},{"back":"only"},"junk",null,["x"]]');
    expect(result.cards).toHaveLength(1);
    expect(result.skipped).toBe(5);
  });

  it("leaves JSON that is not a deck to the other readers", () => {
    expect(parseJsonCards('{"name":"x","version":2}')).toBeNull();
    expect(parseJsonCards("{broken")).toBeNull();
    expect(parseJsonCards("plain text")).toBeNull();
    expect(parseJsonCards('{"a":{"b":1}}')).toBeNull();
    // A bracket that is not JSON still imports as lines.
    expect(parseImport("[draft] — a note").cards).toEqual([{ front: "[draft]", back: "a note", tags: [] }]);
  });

  it("keeps long fields within the limit and an empty array empty", () => {
    expect(parseImport("[]")).toEqual({ cards: [], skipped: 0 });
    expect(parseImport(JSON.stringify([{ front: "x".repeat(MAX_FIELD_LENGTH + 1000), back: "y" }])).cards[0]!.front.length).toBe(MAX_FIELD_LENGTH);
  });

  it("round-trips an exported deck, keeping tags and Unicode", () => {
    const cards = [
      { front: "line\nbreak", back: 'say "hi"', tags: ["a", "b"] },
      { front: "кот", back: "cat", tags: [] },
    ];
    expect(parseImport(toJson(cards)).cards).toEqual(cards);
    expect(parseImport(toTsv(cards)).cards).toEqual(cards);
    expect(toJson(cards).endsWith("\n")).toBe(true);
  });
});
