import { describe, expect, it } from "vitest";

import { CURATED } from "@/lib/couples/cards";
import type { CuratedCard } from "@/lib/couples/cards";
import type { GameId, Lang } from "@/lib/couples/types";

const GAMES: GameId[] = ["norm", "either", "who"];
const LANGS: Lang[] = ["en", "ru"];

const MIN_CARDS = 28;
const MAX_PROMPT = 110;
const MAX_FOLLOW_UP = 90;
const MAX_OPTION = 60;
/** More cards than this opening with the same three words reads as a template. */
const MAX_SAME_OPENING = 4;

function opening(prompt: string): string {
  return prompt.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).slice(0, 3).join(" ");
}

function eachDeck(run: (lang: Lang, theme: string, game: GameId, cards: readonly CuratedCard[]) => void) {
  for (const lang of LANGS) {
    for (const [theme, games] of Object.entries(CURATED[lang])) {
      for (const game of GAMES) run(lang, theme, game, games[game]);
    }
  }
}

describe("curated couples cards", () => {
  it("has an English theme only where there is a Russian one (Russian is written first)", () => {
    for (const theme of Object.keys(CURATED.en)) expect(Object.keys(CURATED.ru)).toContain(theme);
  });

  it("covers every theme in Russian", () => {
    expect(Object.keys(CURATED.ru).sort()).toEqual(
      ["conflict", "food", "friends", "future", "habits", "home", "money", "romance", "tender", "travel"],
    );
  });

  it("has enough cards per game", () => {
    eachDeck((lang, theme, game, cards) => {
      expect(cards.length, `${lang}/${theme}/${game}`).toBeGreaterThanOrEqual(MIN_CARDS);
    });
  });

  it("never repeats a prompt or a follow-up within a deck", () => {
    eachDeck((lang, theme, game, cards) => {
      const prompts = cards.map((card) => card.prompt);
      const followUps = cards.map((card) => card.followUp);
      expect(new Set(prompts).size, `${lang}/${theme}/${game} prompts`).toBe(prompts.length);
      expect(new Set(followUps).size, `${lang}/${theme}/${game} follow-ups`).toBe(followUps.length);
    });
  });

  it("keeps every card short enough for a phone screen", () => {
    eachDeck((lang, theme, game, cards) => {
      for (const card of cards) {
        const where = `${lang}/${theme}/${game}: ${card.prompt}`;
        expect(card.prompt.trim().length, where).toBeGreaterThan(0);
        expect(card.prompt.length, where).toBeLessThanOrEqual(MAX_PROMPT);
        expect(card.followUp.trim().length, where).toBeGreaterThan(0);
        expect(card.followUp.length, where).toBeLessThanOrEqual(MAX_FOLLOW_UP);
      }
    });
  });

  it("does not open too many cards the same way", () => {
    eachDeck((lang, theme, game, cards) => {
      const counts = new Map<string, number>();
      for (const card of cards) {
        const key = opening(card.prompt);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const [key, count] of counts) {
        expect(count, `${lang}/${theme}/${game} opens ${count}× with “${key}”`).toBeLessThanOrEqual(
          MAX_SAME_OPENING,
        );
      }
    });
  });

  it("gives every either card two distinct, short options", () => {
    eachDeck((lang, theme, game, cards) => {
      if (game !== "either") return;
      for (const card of cards) {
        const where = `${lang}/${theme}: ${card.prompt}`;
        expect(card.options, where).toBeDefined();
        const [a, b] = card.options ?? ["", ""];
        expect(a.trim().length, where).toBeGreaterThan(0);
        expect(a, where).not.toBe(b);
        expect(a.length, where).toBeLessThanOrEqual(MAX_OPTION);
        expect(b.length, where).toBeLessThanOrEqual(MAX_OPTION);
      }
    });
  });

  it("leaves the fixed options of norm and who to the game", () => {
    eachDeck((lang, theme, game, cards) => {
      if (game === "either") return;
      for (const card of cards) expect(card.options, `${lang}/${theme}/${game}`).toBeUndefined();
    });
  });

  it("phrases who cards as questions about the pair", () => {
    eachDeck((lang, theme, game, cards) => {
      if (game !== "who") return;
      for (const card of cards) {
        expect(card.prompt.trim().endsWith("?"), `${lang}/${theme}: ${card.prompt}`).toBe(true);
      }
    });
  });
});
