import { describe, expect, it } from "vitest";

import { convertCase, splitWords, type CaseMode } from "@/lib/text/case";
import { runRegex } from "@/lib/text/regex-core";
import { testRegex } from "@/lib/text/regex";
import { analyzeText, countSentences, extractWords, splitDuration, topWords } from "@/lib/text/stats";

describe("analyzeText", () => {
  it("counts words, characters, sentences and paragraphs", () => {
    const stats = analyzeText("Hello world. How are you?\n\nSecond paragraph here!");
    expect(stats.words).toBe(8);
    expect(stats.sentences).toBe(3);
    expect(stats.paragraphs).toBe(2);
    expect(stats.lines).toBe(3);
    expect(stats.characters).toBe(49);
    expect(stats.charactersNoSpaces).toBe(41);
  });

  it("is Unicode-aware: Cyrillic words, emoji, combining marks, bytes", () => {
    expect(extractWords("Привет, мир! It's 5 o'clock")).toEqual(["Привет", "мир", "It's", "5", "o'clock"]);
    expect(analyzeText("👨‍👩‍👧").characters).toBe(1);
    expect(analyzeText("e\u0301").characters).toBe(1);
    expect(analyzeText("Я").bytes).toBe(2);
  });

  it("handles empty text", () => {
    const stats = analyzeText("");
    expect(stats).toMatchObject({ characters: 0, words: 0, sentences: 0, paragraphs: 0, lines: 0, bytes: 0 });
  });

  it("estimates reading time", () => {
    const stats = analyzeText("word ".repeat(400));
    expect(stats.readingMinutes).toBe(2);
    expect(splitDuration(2.5)).toEqual({ minutes: 2, seconds: 30 });
  });

  it("does not count punctuation-only fragments as sentences", () => {
    expect(countSentences("Wait... what?! Really")).toBe(3);
    expect(countSentences("...")).toBe(0);
  });

  it("ranks the most used words case-insensitively", () => {
    expect(topWords("the cat and The dog and THE bird", 2)).toEqual([
      { word: "the", count: 3 },
      { word: "and", count: 2 },
    ]);
  });
});

describe("convertCase", () => {
  const cases: [CaseMode, string, string][] = [
    ["upper", "Hello мир", "HELLO МИР"],
    ["lower", "Hello МИР", "hello мир"],
    ["title", "the quick brown FOX, it's here", "The Quick Brown Fox, It's Here"],
    ["sentence", "hELLO there. how ARE you? fine", "Hello there. How are you? Fine"],
    ["invert", "Hello Мир", "hELLO мИР"],
    ["camel", "some_variable-name here", "someVariableNameHere"],
    ["pascal", "some variable name", "SomeVariableName"],
    ["snake", "parseHTTPResponse2 Now", "parse_http_response_2_now"],
    ["constant", "max retry count", "MAX_RETRY_COUNT"],
    ["kebab", "Some Title Here", "some-title-here"],
    ["dot", "Some Title Here", "some.title.here"],
    ["snake", "привет мир", "привет_мир"],
    ["title", "привет мир", "Привет Мир"],
  ];
  it.each(cases)("%s: %s", (mode, input, expected) => {
    expect(convertCase(input, mode)).toBe(expected);
  });

  it("splits camel case and digits", () => {
    expect(splitWords("fooBarBaz12x")).toEqual(["foo", "Bar", "Baz", "12", "x"]);
  });
});

describe("runRegex", () => {
  it("lists matches with positions, groups and named groups", () => {
    const result = runRegex({ pattern: "(?<key>\\w+)=(\\d+)", flags: "g", text: "a=1, b=22" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matches).toHaveLength(2);
    expect(result.matches[1]).toMatchObject({ index: 5, end: 9, text: "b=22", groups: ["b", "22"], named: { key: "b" } });
  });

  it("lists every match even without the g flag, but replaces only the first", () => {
    const result = runRegex({ pattern: "a", flags: "", text: "aaa", replacement: "b" });
    expect(result).toMatchObject({ ok: true, replaced: "baa" });
    expect(result.ok && result.matches).toHaveLength(3);
  });

  it("supports replacement groups and flags", () => {
    const result = runRegex({ pattern: "(\\w+)@(\\w+)", flags: "gi", text: "Bob@Example", replacement: "$2:$1" });
    expect(result.ok && result.replaced).toBe("Example:Bob");
  });

  it("reports invalid patterns and ignores unknown flags", () => {
    const bad = runRegex({ pattern: "(", flags: "g", text: "x" });
    expect(bad.ok).toBe(false);
    expect(runRegex({ pattern: "x", flags: "gqq", text: "x" }).ok).toBe(true);
  });

  it("avoids infinite loops on empty matches and caps results", () => {
    const empty = runRegex({ pattern: "", flags: "g", text: "ab" });
    expect(empty.ok && empty.matches).toHaveLength(3);
    const many = runRegex({ pattern: "a", flags: "g", text: "a".repeat(5000) });
    expect(many.ok && many.truncated).toBe(true);
    expect(many.ok && many.matches).toHaveLength(1000);
  });

  it("falls back to inline evaluation when Worker is unavailable", async () => {
    const result = await testRegex({ pattern: "\\d+", flags: "g", text: "a1b22" });
    expect(result.ok && (result as { matches: unknown[] }).matches).toHaveLength(2);
  });
});
