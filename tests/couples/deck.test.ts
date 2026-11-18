import { describe, expect, it } from "vitest";

import { dealSession, redealSession } from "@/lib/couples/deck";
import type { CouplesQuestion } from "@/lib/couples/types";

function pool(size: number, groups = size): CouplesQuestion[] {
  return Array.from({ length: size }, (_, index) => ({
    id: `norm:home:${index}`,
    game: "norm" as const,
    theme: "home" as const,
    prompt: `Вопрос ${index}`,
    options: ["Норм", "Стрём"] as [string, string],
    group: `base-${index % groups}`,
  }));
}

describe("couples deck", () => {
  it("deals the requested number of distinct cards", () => {
    const session = dealSession(pool(100), 20);
    expect(session.cards).toHaveLength(20);
    expect(new Set(session.cards.map((card) => card.id)).size).toBe(20);
  });

  it("clamps to the pool size", () => {
    const session = dealSession(pool(5), 30);
    expect(session.cards).toHaveLength(5);
  });

  it("re-deals away from cards already seen", () => {
    const source = pool(50);
    const first = dealSession(source, 10);
    const second = redealSession(source, 10, first.used);
    for (const card of second.cards) {
      expect(first.used.has(card.id)).toBe(false);
    }
  });

  it("falls back to the full pool when nothing fresh is left", () => {
    const source = pool(10);
    const seen = new Set(source.map((card) => card.id));
    const session = redealSession(source, 10, seen);
    expect(session.cards).toHaveLength(10);
  });

  it("prefers one card per group before repeating a base", () => {
    const session = dealSession(pool(100, 26), 26);
    expect(new Set(session.cards.map((card) => card.group)).size).toBe(26);
  });

  it("tops up with repeats when there are too few groups", () => {
    const session = dealSession(pool(50, 5), 20);
    expect(session.cards).toHaveLength(20);
  });

  it("takes turns between themes so a small theme still shows up", () => {
    const big: CouplesQuestion[] = Array.from({ length: 300 }, (_, index) => ({
      ...pool(1)[0],
      id: `norm:home:${index}`,
      theme: "home" as const,
      group: `home-${index}`,
    }));
    const small: CouplesQuestion[] = Array.from({ length: 5 }, (_, index) => ({
      ...pool(1)[0],
      id: `norm:conflict:${index}`,
      theme: "conflict" as const,
      group: `conflict-${index}`,
    }));
    for (let seed = 1; seed <= 20; seed += 1) {
      let state = seed;
      const rng = () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
      };
      const themes = dealSession([...big, ...small], 4, rng).cards.map((card) => card.theme);
      expect(themes.filter((theme) => theme === "conflict")).toHaveLength(2);
    }
  });
});
