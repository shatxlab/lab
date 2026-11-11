import { describe, expect, it } from "vitest";
import { dealNever, initialNever, NEVER_CARDS, neverPool, neverReducer } from "@/lib/couples/never/game";
import { neverStrings } from "@/lib/couples/never/i18n";
import { NEVER_CATEGORIES } from "@/lib/couples/never/types";

function seeded(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
describe.each(["en", "ru"] as const)("Never Have I Ever content (%s)", lang => {
  it("ships 172 individually identified complete authored cards with continuous category IDs", () => {
    const cards = NEVER_CARDS[lang];
    expect(cards).toHaveLength(172);
    expect(new Set(cards.map(card => card.id)).size).toBe(172);
    expect(new Set(cards.map(card => card.prompt.toLocaleLowerCase())).size).toBe(172);
    expect(new Set(cards.map(card => card.followUp.toLocaleLowerCase())).size).toBe(172);
    for (const category of NEVER_CATEGORIES) {
      const count = category === "light" ? 58 : 57;
      const pool = neverPool(lang, category);
      expect(pool).toHaveLength(count);
      expect(new Set(pool.map(card => card.id))).toEqual(new Set(
        Array.from({ length: count }, (_, i) => `${lang}-${category}-${String(i + 1).padStart(2, "0")}`),
      ));
    }
    for (const card of cards) {
      expect(card.id).toMatch(new RegExp(`^${lang}-${card.category}-\\d{2}$`));
      expect(NEVER_CATEGORIES).toContain(card.category);
      expect(card.prompt).toMatch(lang === "en" ? /^Never have I ever / : /^Я никогда не /);
      expect(card.prompt.length).toBeGreaterThan(25);
      expect(card.prompt.length).toBeLessThan(180);
      expect(card.followUp.length).toBeGreaterThan(15);
      expect(card.followUp.length).toBeLessThan(200);
      expect(card.followUp).toMatch(/\?$/);
      expect(`${card.prompt} ${card.followUp}`).not.toMatch(/TODO|lorem|https?:|<[^>]+>/i);
    }
  });
  it("excludes closer cards from the default mix and deals unique, deterministic cards", () => {
    expect(neverPool(lang, "mix")).toHaveLength(115);
    for (let seed = 0; seed < 30; seed++) {
      const cards = dealNever(lang, "mix", 20, seeded(seed));
      expect(cards).toHaveLength(20);
      expect(cards.every(card => card.category !== "closer")).toBe(true);
      expect(new Set(cards.map(card => card.id)).size).toBe(20);
      expect(cards).toEqual(dealNever(lang, "mix", 20, seeded(seed)));
    }
    expect(dealNever(lang, "closer", 1000)).toHaveLength(57);
    expect(dealNever(lang, "light", -1)).toHaveLength(1);
    expect(dealNever(lang, "stories", NaN)).toHaveLength(15);
    expect(dealNever(lang, "mix", 20, seeded(1))).not.toEqual(dealNever(lang, "mix", 20, seeded(2)));
  });
});
describe("Never Have I Ever session", () => {
  it("requires both answers, allows changes, and clears answers when advancing", () => {
    let state = initialNever(2);
    expect(neverReducer(state, { type: "next", index: 0 })).toBe(state);
    state = neverReducer(state, { type: "answer", index: state.index, player: 0, answer: "have" });
    expect(state.phase).toBe("answer");
    state = neverReducer(state, { type: "answer", index: state.index, player: 1, answer: "never" });
    expect(state.phase).toBe("story");
    state = neverReducer(state, { type: "answer", index: state.index, player: 0, answer: "never" });
    expect(state.answers).toEqual(["never", "never"]);
    state = neverReducer(state, { type: "next", index: 0 });
    expect(state.answers).toEqual([null, null]);
    expect(state.explored).toBe(1);
    expect(state.phase).toBe("answer");
    expect(neverReducer(state, { type: "next", index: 0 })).toBe(state);
    expect(neverReducer(state, { type: "skip", index: 0 })).toBe(state);
    expect(neverReducer(state, { type: "answer", index: 0, player: 0, answer: "have" })).toBe(state);
  });
  it.each([0, 1, 2])("skips after %i answers without retaining answers or scoring the card", answers => {
    let state = initialNever(1);
    if (answers > 0) state = neverReducer(state, { type: "answer", index: state.index, player: 0, answer: "have" });
    if (answers > 1) state = neverReducer(state, { type: "answer", index: state.index, player: 1, answer: "never" });
    state = neverReducer(state, { type: "skip", index: 0 });
    expect(state).toMatchObject({ phase: "summary", answers: [null, null], explored: 0, skipped: 1 });
    expect(neverReducer(state, { type: "skip", index: 0 })).toBe(state);
    expect(neverReducer(state, { type: "answer", index: state.index, player: 0, answer: "have" })).toBe(state);
  });
  it("handles an empty pool and repeated completion safely", () => {
    const empty = initialNever(0);
    expect(empty.phase).toBe("summary");
    expect(neverReducer(empty, { type: "next", index: 0 })).toBe(empty);
  });
  it("keeps all EN/RU interface keys nonempty and aligned", () => {
    expect(Object.keys(neverStrings("en"))).toEqual(Object.keys(neverStrings("ru")));
    for (const lang of ["en", "ru"] as const) expect(Object.values(neverStrings(lang)).every(text => text.trim())).toBe(true);
  });
});
