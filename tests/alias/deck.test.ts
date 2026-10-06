import { describe, expect, it } from "vitest";

import {
  advanceDeck,
  createDeck,
  currentWord,
  refillDeck,
  shuffle,
} from "@/lib/alias/deck";

/** Deterministic rng so shuffle assertions are stable. */
function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("deck helpers", () => {
  it("shuffles without losing or creating words", () => {
    const source = ["a", "b", "c", "d", "e", "f"];
    const shuffled = shuffle(source, seededRng(7));

    expect([...shuffled].sort()).toEqual([...source].sort());
    expect(source).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("is deterministic for a seeded rng", () => {
    expect(shuffle(["a", "b", "c", "d"], seededRng(42))).toEqual(
      shuffle(["a", "b", "c", "d"], seededRng(42)),
    );
  });

  it("exposes the first word and advances past it", () => {
    const deck = ["apple", "pear", "plum"];
    expect(currentWord(deck)).toBe("apple");
    expect(advanceDeck(deck)).toEqual(["pear", "plum"]);
    expect(deck).toEqual(["apple", "pear", "plum"]);
  });

  it("only refills an exhausted deck", () => {
    const pool = ["a", "b", "c"];
    expect(refillDeck(["x", "y"], pool)).toEqual(["x", "y"]);
  });

  it("excludes words already used this session when it refills", () => {
    const pool = ["a", "b", "c", "d"];
    const deck = refillDeck([], pool, new Set(["a", "b"]), seededRng(1));
    expect([...deck].sort()).toEqual(["c", "d"]);
  });

  it("falls back to the full pool once everything has been used", () => {
    const pool = ["a", "b"];
    const deck = refillDeck([], pool, new Set(pool), seededRng(1));
    expect([...deck].sort()).toEqual(["a", "b"]);
  });

  it("builds a full shuffled deck for a pool", () => {
    const deck = createDeck(["one", "two", "three"], seededRng(11));
    expect([...deck].sort()).toEqual(["one", "three", "two"]);
  });

  it("never repeats a word until the whole pool has been used", () => {
    const pool = Array.from({ length: 120 }, (_, index) => `w${index}`);
    const used = new Set<string>();
    let deck = createDeck(pool, seededRng(7));
    const seen: string[] = [];

    for (let i = 0; i < pool.length; i += 1) {
      const word = currentWord(deck);
      expect(word).not.toBeNull();
      if (!word) break;
      expect(seen).not.toContain(word);
      seen.push(word);
      used.add(word);
      deck = refillDeck(advanceDeck(deck), pool, used, seededRng(i + 1));
    }

    expect(seen).toHaveLength(pool.length);
    expect(new Set(seen).size).toBe(pool.length);
  });
});
