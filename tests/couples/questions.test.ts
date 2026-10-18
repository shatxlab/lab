import { describe, expect, it } from "vitest";

import { CURATED } from "@/lib/couples/cards";
import {
  PER_THEME,
  buildAllQuestions,
  buildGameQuestions,
  questionsFor,
  resolveOptions,
} from "@/lib/couples/questions";
import { THEME_IDS } from "@/lib/couples/themes";
import type { GameId, Lang, ThemeId } from "@/lib/couples/types";

const GAMES: GameId[] = ["norm", "either", "who"];

/** How many cards a theme should hold: its curated size, or the generated default. */
function expectedSize(game: GameId, theme: ThemeId, lang: Lang): number {
  return CURATED[lang][theme]?.[game].length ?? PER_THEME;
}

describe("couples question builder", () => {
  it("builds the same structure for the English deck", () => {
    for (const game of GAMES) {
      for (const theme of THEME_IDS) {
        expect(questionsFor(game, theme, "en"), `en/${game}/${theme}`).toHaveLength(
          expectedSize(game, theme, "en"),
        );
      }
    }
    const identity = (question: { prompt: string; options: readonly string[] }) => `${question.prompt}|${question.options.join("|")}`;
    const enPrompts = buildAllQuestions("en").map(identity);
    const ruPrompts = buildAllQuestions("ru").map(identity);
    expect(new Set(enPrompts).size).toBe(enPrompts.length);
    expect(new Set([...enPrompts, ...ruPrompts]).size).toBe(enPrompts.length + ruPrompts.length);
    // Generated themes still use the "Which of us would…" frame.
    expect(enPrompts.some((prompt) => prompt.includes("Which of us"))).toBe(true);
  });

  it("keeps the norm options per language", () => {
    for (const question of questionsFor("norm", "all", "en")) {
      expect(question.options).toEqual(["Normal", "Nah"]);
    }
  });

  it("gives generated themes 300 prompts and curated themes exactly their cards", () => {
    for (const lang of ["en", "ru"] as const) {
      for (const game of GAMES) {
        for (const theme of THEME_IDS) {
          const curated = CURATED[lang][theme]?.[game];
          expect(questionsFor(game, theme, lang), `${lang}/${game}/${theme}`).toHaveLength(
            curated ? curated.length : PER_THEME,
          );
        }
      }
    }
  });

  it("carries a follow-up on curated cards only", () => {
    for (const lang of ["en", "ru"] as const) {
      for (const game of GAMES) {
        for (const theme of THEME_IDS) {
          const curated = CURATED[lang][theme]?.[game];
          for (const question of questionsFor(game, theme, lang)) {
            if (curated) expect(question.followUp?.length, question.id).toBeGreaterThan(0);
            else expect(question.followUp, question.id).toBeUndefined();
          }
        }
      }
    }
  });

  it("never repeats a prompt inside a game", () => {
    for (const game of GAMES) {
      // Dilemmas may share a lead-in ("Что хуже?"); a card is its lead-in plus its two buttons.
      const identities = buildGameQuestions(game).map((question) => `${question.prompt}|${question.options.join("|")}`);
      expect(new Set(identities).size).toBe(identities.length);
    }
  });

  it("produces non-empty, unique ids and prompts", () => {
    for (const question of buildAllQuestions()) {
      expect(question.prompt.trim().length).toBeGreaterThan(0);
      expect(question.id).toMatch(/^(en|ru):(norm|either|who):/);
    }
    const ids = buildAllQuestions().map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("tags norm and who cards with a non-empty group and varies it", () => {
    for (const game of ["norm", "who"] as const) {
      for (const question of questionsFor(game, "all")) {
        expect(question.group.length).toBeGreaterThan(0);
      }
      // A theme's deck spans many distinct seed objects, not one giant group.
      const groups = new Set(questionsFor(game, "food").map((question) => question.group));
      expect(groups.size).toBeGreaterThan(20);
    }
  });

  it("shows the fixed norm options and who placeholders", () => {
    for (const question of questionsFor("norm", "all")) {
      expect(question.options).toEqual(["Норм", "Стрём"]);
    }
    for (const question of questionsFor("who", "all")) {
      expect(question.options).toEqual(["{a}", "{b}"]);
    }
  });

  it("keeps both either options distinct and non-empty", () => {
    for (const lang of ["en", "ru"] as const) {
      for (const question of questionsFor("either", "all", lang)) {
        const [a, b] = question.options;
        expect(a.trim().length, question.id).toBeGreaterThan(0);
        expect(a).not.toBe(b);
        // Generated cards spell both options out in the prompt; curated ones
        // set the scene and let the buttons carry the choice.
        if (!question.followUp) {
          expect(question.prompt).toContain(a);
          expect(question.prompt).toContain(b);
          expect(question.prompt.trim().endsWith("?")).toBe(true);
        }
      }
    }
  });

  it("resolves who options to the partners' names", () => {
    const [question] = questionsFor("who", "all");
    expect(resolveOptions(question, ["Аня", "Марк"])).toEqual(["Аня", "Марк"]);
  });

  it("is deterministic across builds", () => {
    const first = buildGameQuestions("either").map((question) => question.prompt);
    const second = buildGameQuestions("either").map((question) => question.prompt);
    expect(second).toEqual(first);
  });

  it("mixes several themes when asked for all", () => {
    const themes = new Set(questionsFor("norm", "all").map((question) => question.theme));
    expect(themes.size).toBe(THEME_IDS.length);
  });
});