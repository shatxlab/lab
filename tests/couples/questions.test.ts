import { describe, expect, it } from "vitest";

import {
  PER_THEME,
  QUESTIONS_PER_GAME,
  buildAllQuestions,
  buildGameQuestions,
  questionsFor,
  resolveOptions,
} from "@/lib/couples/questions";
import { THEME_IDS } from "@/lib/couples/themes";
import type { GameId } from "@/lib/couples/types";

const GAMES: GameId[] = ["norm", "either", "who"];

describe("couples question builder", () => {
  it("seeds exactly 3000 prompts per game", () => {
    for (const game of GAMES) {
      expect(buildGameQuestions(game)).toHaveLength(QUESTIONS_PER_GAME);
      expect(QUESTIONS_PER_GAME).toBe(3000);
    }
  });

  it("splits every game into 300 prompts per theme", () => {
    for (const game of GAMES) {
      for (const theme of THEME_IDS) {
        expect(questionsFor(game, theme), `${game}/${theme}`).toHaveLength(PER_THEME);
      }
    }
  });

  it("never repeats a prompt inside a game", () => {
    for (const game of GAMES) {
      const prompts = buildGameQuestions(game).map((question) => question.prompt);
      expect(new Set(prompts).size).toBe(prompts.length);
    }
  });

  it("produces non-empty, unique ids and prompts", () => {
    for (const question of buildAllQuestions()) {
      expect(question.prompt.trim().length).toBeGreaterThan(0);
      expect(question.id).toMatch(/^(norm|either|who):/);
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

  it("keeps both either options distinct and present in the prompt", () => {
    for (const question of questionsFor("either", "all")) {
      const [a, b] = question.options;
      expect(a).not.toBe(b);
      expect(question.prompt).toContain(a);
      expect(question.prompt).toContain(b);
      expect(question.prompt.trim().endsWith("?")).toBe(true);
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