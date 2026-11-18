import { describe, expect, it } from "vitest";

import { dealSession } from "@/lib/couples/deck";
import {
  HISTORY_KEY,
  cardKey,
  emptyHistory,
  hideCard,
  markSeen,
  normalizeHistory,
  rankOf,
  readHistory,
  restoreHidden,
  withoutHidden,
  writeHistory,
} from "@/lib/couples/history";
import type { CouplesStorage } from "@/lib/couples/storage";
import type { CouplesQuestion } from "@/lib/couples/types";

function memoryStorage(): CouplesStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

const card = (n: number, theme: CouplesQuestion["theme"] = "home"): CouplesQuestion => ({
  id: `ru:norm:${theme}:${n}`,
  game: "norm",
  theme,
  prompt: `Карточка ${n}`,
  options: ["Норм", "Стрём"],
  group: `g${theme}${n}`,
});

describe("card keys", () => {
  it("depend on the text, not the position, so editing a file keeps the history", () => {
    const moved: CouplesQuestion = { ...card(1), id: "different-position" };
    expect(cardKey(card(1))).toBe(cardKey(moved));
    expect(cardKey(card(1))).not.toBe(cardKey(card(2)));
    expect(cardKey(card(1))).not.toBe(cardKey({ ...card(1), game: "who" }));
  });

  it("tell apart dilemmas that share a lead-in but not their buttons", () => {
    const base = { game: "either" as const, prompt: "Что хуже?" };
    expect(cardKey({ ...base, options: ["Холод", "Жара"] })).not.toBe(cardKey({ ...base, options: ["Шум", "Тишина"] }));
    expect(cardKey({ ...base, options: ["Холод", "Жара"] })).toBe(cardKey({ ...base, options: ["Холод", "Жара"] }));
  });

  it("do not collide across a few thousand cards", () => {
    const keys = new Set(Array.from({ length: 6000 }, (_, i) => cardKey(card(i))));
    expect(keys.size).toBe(6000);
  });
});

describe("history", () => {
  it("remembers when each card was last shown", () => {
    let h = emptyHistory();
    h = markSeen(h, "a");
    h = markSeen(h, "b");
    h = markSeen(h, "a");
    expect(h.seen).toEqual({ a: 3, b: 2 });
    expect(h.seq).toBe(3);
  });

  it("hides a card for good, once, and can bring them all back", () => {
    let h = hideCard(hideCard(emptyHistory(), "a"), "a");
    expect(h.hidden).toEqual(["a"]);
    expect(restoreHidden(h).hidden).toEqual([]);
    expect(withoutHidden([card(1), card(2)], hideCard(emptyHistory(), cardKey(card(1)))).map((c) => c.prompt)).toEqual(["Карточка 2"]);
  });

  it("survives a round trip through storage, and shrugs off garbage", () => {
    const storage = memoryStorage();
    writeHistory(hideCard(markSeen(emptyHistory(), "x"), "y"), storage);
    expect(readHistory(storage)).toEqual({ seq: 1, seen: { x: 1 }, hidden: ["y"] });
    storage.data.set(HISTORY_KEY, "{not json");
    expect(readHistory(storage)).toEqual(emptyHistory());
    expect(normalizeHistory({ seen: { a: "no", b: -1, c: 4 }, hidden: ["k", 5, "k"], seq: "x" })).toEqual({ seq: 4, seen: { c: 4 }, hidden: ["k"] });
    expect(normalizeHistory(null)).toEqual(emptyHistory());
  });
});

describe("dealing by history", () => {
  const pool = Array.from({ length: 40 }, (_, i) => card(i));

  it("deals unseen cards first, however many sessions have passed", () => {
    let h = emptyHistory();
    const dealt = new Set<string>();
    // 40 cards, 10 at a time: four sessions must cover everything before any repeats.
    for (let session = 0; session < 4; session += 1) {
      const { cards } = dealSession(pool, 10, Math.random, rankOf(h));
      for (const c of cards) {
        expect(dealt.has(c.id), `repeat in session ${session}`).toBe(false);
        dealt.add(c.id);
        h = markSeen(h, cardKey(c));
      }
    }
    expect(dealt.size).toBe(40);
  });

  it("then brings back the cards seen longest ago first", () => {
    let h = emptyHistory();
    for (const c of pool) h = markSeen(h, cardKey(c)); // card 0 is the oldest, card 39 the newest
    const { cards } = dealSession(pool, 5, Math.random, rankOf(h));
    expect(cards.map((c) => c.prompt).sort()).toEqual(["Карточка 0", "Карточка 1", "Карточка 2", "Карточка 3", "Карточка 4"]);
  });

  it("keeps themes taking turns while ranking inside each", () => {
    const mixed = [...Array.from({ length: 20 }, (_, i) => card(i, "home")), ...Array.from({ length: 20 }, (_, i) => card(100 + i, "food"))];
    let h = emptyHistory();
    for (const c of mixed.filter((c) => c.theme === "home").slice(0, 10)) h = markSeen(h, cardKey(c));
    const { cards } = dealSession(mixed, 10, Math.random, rankOf(h));
    expect(cards.filter((c) => c.theme === "home")).toHaveLength(5);
    expect(cards.filter((c) => c.theme === "food")).toHaveLength(5);
    const seenHome = cards.filter((c) => c.theme === "home" && h.seen[cardKey(c)] !== undefined);
    expect(seenHome).toHaveLength(0);
  });
});
