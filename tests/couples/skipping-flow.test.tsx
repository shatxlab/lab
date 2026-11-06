// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CouplesGame from "@/components/couples/CouplesGame";
import { cardKey, HISTORY_KEY } from "@/lib/couples/history";
import { stringsFor } from "@/lib/couples/i18n";
import { questionsFor } from "@/lib/couples/questions";
import { COUPLES_STORAGE_KEY, defaultSettings } from "@/lib/couples/storage";
import type { GameId, Lang, Mode } from "@/lib/couples/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("AudioContext", undefined);
});
afterEach(() => { unmount(); vi.unstubAllGlobals(); });
function unmount() {
  act(() => root?.unmount()); root = null;
  document.body.innerHTML = "";
}
function mount() {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<CouplesGame />));
  return host;
}
function click(host: HTMLElement, selector: string, position = 0) {
  const target = host.querySelectorAll<HTMLButtonElement>(selector)[position];
  expect(target, selector).toBeDefined();
  act(() => target.click());
}
function text(host: HTMLElement, selector: string) { return host.querySelector(selector)?.textContent ?? ""; }
function stats() { return JSON.parse(localStorage.getItem(COUPLES_STORAGE_KEY)!).stats; }
function history() { return JSON.parse(localStorage.getItem(HISTORY_KEY)!); }

/** Leave exactly three real cards available: no random replacement can mask a skip. */
function configure(lang: Lang, game: GameId, mode: Mode) {
  const pool = questionsFor(game, "home", lang);
  const hidden = pool.slice(3).map(cardKey);
  localStorage.setItem("lab:lang", lang);
  localStorage.setItem(COUPLES_STORAGE_KEY, JSON.stringify({
    settings: { ...defaultSettings(lang), game, mode, theme: "home", count: 10, sound: false },
    stats: { games: 4, cards: 10, matches: 6 },
  }));
  localStorage.setItem(HISTORY_KEY, JSON.stringify({ seq: 0, seen: {}, hidden }));
  return { hidden, available: pool.slice(0, 3).map((q) => q.prompt) };
}
function start(host: HTMLElement, game: GameId = "norm") {
  click(host, ".cp-game-card", ["norm", "either", "who"].indexOf(game));
  click(host, ".cp-setup-footer .cp-primary");
}

for (const lang of ["en", "ru"] as const) {
  for (const game of ["norm", "either", "who"] as const) {
    describe(`${lang} / ${game}: temporary skipping`, () => {
      it("supports declines in both private passes and reveals only the mutual answer", () => {
        const { hidden } = configure(lang, game, "match");
        const host = mount(); start(host, game);
        expect(text(host, ".cp-skip")).toBe(stringsFor(lang).skipCard);
        expect(text(host, ".cp-hide")).toBe(stringsFor(lang).hideCard);
        const declinedA = text(host, ".cp-prompt");
        click(host, ".cp-skip");
        expect(text(host, ".cp-counter")).toBe("2 / 3");
        const declinedB = text(host, ".cp-prompt");
        click(host, ".cp-option", 1);
        const mutual = text(host, ".cp-prompt");
        click(host, ".cp-option", 0);
        expect(host.querySelector(".cp-pass")).not.toBeNull();
        expect(host.querySelector(".cp-skip")).toBeNull();
        expect(host.querySelector(".cp-hide")).toBeNull();
        expect(host.querySelector(".cp-prompt")).toBeNull();
        click(host, ".cp-pass .cp-primary");
        expect(text(host, ".cp-prompt")).toBe(declinedB);
        expect(host.querySelector(".cp-result-picks")).toBeNull();
        click(host, ".cp-skip");
        expect(text(host, ".cp-prompt")).toBe(mutual);
        click(host, ".cp-option", 0);
        expect(host.querySelectorAll(".cp-result")).toHaveLength(1);
        expect(text(host, ".cp-result-prompt")).toBe(mutual);
        expect(host.querySelector(".cp-summary")?.textContent).not.toContain(declinedA);
        if (declinedB !== mutual) expect(host.querySelector(".cp-summary")?.textContent).not.toContain(declinedB);
        expect(text(host, ".cp-score-value")).toBe("100%");
        expect(text(host, ".cp-score-sub")).toBe("1 / 1");
        expect(text(host, ".cp-skipped-count")).toContain("2");
        expect(history().hidden).toEqual(hidden);
        expect(stats()).toEqual({ games: 5, cards: 11, matches: 7 });
      });

      it("allows either person to decline in Together without adding skipped picks to the tally", () => {
        const { hidden } = configure(lang, game, "together");
        const host = mount(); start(host, game);
        click(host, ".cp-skip");
        const mutual = text(host, ".cp-prompt");
        click(host, ".cp-option", 1);
        click(host, ".cp-skip");
        expect(host.querySelector(".cp-pass")).toBeNull();
        expect(host.querySelectorAll(".cp-result")).toHaveLength(1);
        expect(text(host, ".cp-result-prompt")).toBe(mutual);
        expect(text(host, ".cp-score-value")).toBe("1");
        expect(text(host, ".cp-tally")).toContain("1×");
        expect(text(host, ".cp-skipped-count")).toContain("2");
        expect(history().hidden).toEqual(hidden);
        // Together mode still does not contribute to lifetime agreement statistics.
        expect(stats()).toEqual({ games: 5, cards: 10, matches: 6 });
      });
    });
  }

  for (const mode of ["match", "together"] as const) {
    it(`${lang} / ${mode}: finishes all-skipped neutrally and makes the cards available next time`, () => {
      const { hidden, available } = configure(lang, "norm", mode);
      localStorage.setItem(COUPLES_STORAGE_KEY, JSON.stringify({
        ...JSON.parse(localStorage.getItem(COUPLES_STORAGE_KEY)!), stats: { games: 0, cards: 0, matches: 0 },
      }));
      const host = mount(); start(host);
      for (let i = 0; i < 3; i++) click(host, ".cp-skip");
      expect(host.querySelector(".cp-summary")).not.toBeNull();
      expect(host.querySelector(".cp-pass")).toBeNull();
      expect(host.querySelector(".cp-score")).toBeNull();
      expect(host.querySelector(".cp-verdict")).toBeNull();
      expect(host.querySelector(".cp-discuss")).toBeNull();
      expect(host.querySelector(".cp-tally")).toBeNull();
      expect(host.querySelectorAll(".cp-result")).toHaveLength(0);
      expect(text(host, ".cp-empty-summary")).toBe(stringsFor(lang).summaryNoAnswers);
      expect(text(host, ".cp-skipped-count")).toContain("3");
      expect(host.textContent).not.toMatch(/NaN|0%/);
      expect(stats()).toEqual({ games: 1, cards: 0, matches: 0 });
      expect(history().hidden).toEqual(hidden);
      expect(Object.keys(history().seen)).toHaveLength(3);
      click(host, ".cp-summary-row button", 1);
      expect(text(host, ".cp-stats-line")).not.toContain("%");
      expect(text(host, ".cp-stats-line")).toContain("1");
      unmount();
      const next = mount(); start(next);
      const shown: string[] = [];
      for (let i = 0; i < 3; i++) { shown.push(text(next, ".cp-prompt")); click(next, ".cp-skip"); }
      expect(shown.sort()).toEqual(available.sort());
      click(next, ".cp-summary-actions > .cp-primary");
      expect(next.querySelector(".cp-play")).not.toBeNull();
      expect(text(next, ".cp-counter")).toBe("1 / 3");
    });
  }

  it(`${lang}: the second partner can decline every answered card without exposing answers or altering lifetime agreement`, () => {
    configure(lang, "norm", "match");
    const host = mount(); start(host);
    for (let i = 0; i < 3; i++) click(host, ".cp-option", i % 2);
    click(host, ".cp-pass .cp-primary");
    for (let i = 0; i < 3; i++) click(host, ".cp-skip");
    expect(host.querySelector(".cp-empty-summary")).not.toBeNull();
    expect(host.querySelector(".cp-result-picks")).toBeNull();
    expect(host.querySelector(".cp-score")).toBeNull();
    expect(text(host, ".cp-skipped-count")).toContain("3");
    expect(stats()).toEqual({ games: 5, cards: 10, matches: 6 });
  });
}

it("keeps agreement and mismatch counts correct when declines are interleaved", () => {
  configure("en", "norm", "match");
  const host = mount(); start(host);
  for (let i = 0; i < 3; i++) click(host, ".cp-option", 1);
  click(host, ".cp-pass .cp-primary");
  click(host, ".cp-option", 1);
  click(host, ".cp-skip");
  click(host, ".cp-option", 0);
  expect(text(host, ".cp-score-value")).toBe("50%");
  expect(text(host, ".cp-score-sub")).toBe("1 / 2");
  expect(stats()).toEqual({ games: 5, cards: 12, matches: 7 });
});

it("preserves permanent hiding and lets the second partner skip an already hidden card", () => {
  const { hidden } = configure("en", "norm", "match");
  const host = mount(); start(host);
  for (let i = 0; i < 3; i++) click(host, ".cp-option", 0);
  click(host, ".cp-pass .cp-primary");
  click(host, ".cp-hide");
  expect(host.querySelector<HTMLButtonElement>(".cp-hide")?.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>(".cp-skip")?.disabled).toBe(false);
  expect(history().hidden).toHaveLength(hidden.length + 1);
  click(host, ".cp-skip");
  click(host, ".cp-option", 0); click(host, ".cp-option", 0);
  expect(text(host, ".cp-score-sub")).toBe("2 / 2");
  expect(text(host, ".cp-skipped-count")).toContain("1");
});

it("hands over the first eligible card after permanent-hide exhaustion and earlier skips", () => {
  configure("en", "norm", "match");
  const host = mount(); start(host);
  click(host, ".cp-skip");
  const mutual = text(host, ".cp-prompt");
  click(host, ".cp-option", 1);
  click(host, ".cp-hide"); // No replacement: remove the last unanswered card.
  click(host, ".cp-pass .cp-primary");
  expect(text(host, ".cp-prompt")).toBe(mutual);
  click(host, ".cp-option", 1);
  expect(text(host, ".cp-score-sub")).toBe("1 / 1");
  expect(text(host, ".cp-skipped-count")).toContain("1");
});

it("keeps keyboard answers from changing cards behind the exit dialog", () => {
  configure("en", "norm", "match");
  const host = mount(); start(host);
  const before = text(host, ".cp-prompt");
  click(host, ".cp-play-bar .cp-icon");
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true })));
  click(host, ".cp-modal .cp-secondary");
  expect(text(host, ".cp-prompt")).toBe(before);
  expect(text(host, ".cp-counter")).toBe("1 / 3");
});
