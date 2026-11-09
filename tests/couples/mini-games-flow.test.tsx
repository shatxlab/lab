// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeAppLang } from "@/lib/apps/lang";
import CouplesGame from "@/components/couples/CouplesGame";
import { miniStrings, miniText, type MiniGameId, type Tile } from "@/lib/couples/mini-games";
import { COUPLES_STORAGE_KEY, defaultSettings } from "@/lib/couples/storage";
import type { Lang } from "@/lib/couples/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
beforeEach(() => { localStorage.clear(); vi.stubGlobal("AudioContext", undefined); });
afterEach(() => {
  act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.unstubAllGlobals();
});
function mount(lang: Lang = "en") {
  localStorage.setItem("lab:lang", lang);
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host); act(() => root?.render(<CouplesGame />)); return host;
}
function click(host: HTMLElement, selector: string) {
  const button = host.querySelector<HTMLButtonElement>(selector);
  expect(button, selector).not.toBeNull(); act(() => button!.click());
}
function action(host: HTMLElement, name: string) { click(host, `[data-action="${name}"]`); }
function phase(host: HTMLElement) { return host.querySelector("[data-mini-phase]")?.getAttribute("data-mini-phase"); }
function ready(host: HTMLElement) { click(host, "[data-handoff] button"); }
function open(host: HTMLElement, game: MiniGameId) { click(host, `.cp-game-card:nth-child(${game === "pattern" ? 4 : 5})`); }
function start(host: HTMLElement, game: MiniGameId) { open(host, game); action(host, "start"); }
function tiles(host: HTMLElement): Tile[] {
  return [...host.querySelectorAll(".cp-pattern-board [data-cell]")].map((cell) => Number(cell.getAttribute("data-tile")) as Tile);
}
function noPrivateDOM(host: HTMLElement) {
  expect(host.querySelector(".cp-pattern-board")).toBeNull();
  expect(host.querySelector("[data-choice]")).toBeNull();
  expect(host.querySelector(".cp-split-options")).toBeNull();
}
const stats = { games: 7, cards: 20, matches: 13 };
const history = { seq: 3, seen: { "norm:old": 3 }, hidden: ["who:hidden"] };
function seedStats(lang: Lang) {
  localStorage.setItem("lab:couples:history:v1", JSON.stringify(history));
  localStorage.setItem(COUPLES_STORAGE_KEY, JSON.stringify({ settings: { ...defaultSettings(lang), names: ["Alex", "Sam"] }, stats }));
}
function unchangedStats() {
  expect(JSON.parse(localStorage.getItem(COUPLES_STORAGE_KEY)!).stats).toEqual(stats);
  expect(JSON.parse(localStorage.getItem("lab:couples:history:v1")!)).toEqual(history);
  expect(JSON.parse(localStorage.getItem(COUPLES_STORAGE_KEY)!)).toEqual({
    settings: { ...defaultSettings(localStorage.getItem("lab:lang") as Lang), names: ["Alex", "Sam"] }, stats,
  });
  expect(Object.keys(localStorage).sort()).toEqual(["lab:lang", COUPLES_STORAGE_KEY, "lab:couples:history:v1"].sort());
}

describe.each(["en", "ru"] as const)("deck-free games (%s)", (lang) => {
  it("plays five exact patterns, alternates roles, preserves edits through peeks, and resets on replay", () => {
    seedStats(lang);
    const host = mount(lang); const T = miniStrings(lang);
    start(host, "pattern");
    for (let round = 0; round < 5; round++) {
      expect(phase(host)).toBe("handoff-study"); noPrivateDOM(host);
      expect(host.textContent).toContain(miniText(T.lookAway, { name: round % 2 ? "Sam" : "Alex" }));
      ready(host);
      expect(phase(host)).toBe("study");
      const target = tiles(host);
      expect(target).toHaveLength(9);
      action(host, "pass"); noPrivateDOM(host); ready(host);
      expect(phase(host)).toBe("build");
      expect(tiles(host)).toEqual(Array(9).fill(0));
      target.forEach((tile, cell) => {
        click(host, `[data-tool="${tile}"]`); click(host, `[data-cell="${cell}"]`);
      });
      action(host, "peek"); noPrivateDOM(host); ready(host);
      expect(phase(host)).toBe("peek"); expect(tiles(host)).toEqual(target);
      action(host, "pass"); noPrivateDOM(host); ready(host);
      expect(tiles(host)).toEqual(target);
      action(host, "prepare-reveal"); noPrivateDOM(host);
      action(host, "reveal"); expect(phase(host)).toBe("result");
      expect(host.textContent).toContain(T.perfect);
      expect(host.querySelectorAll(".cp-pattern-board")).toHaveLength(2);
      action(host, "next");
    }
    expect(phase(host)).toBe("summary");
    expect(host.textContent).toContain("21 / 21");
    expect(host.textContent).toContain(`${T.perfectCount}: 5 / 5`);
    expect(host.querySelectorAll(".cp-mini-history li")).toHaveLength(5);
    noPrivateDOM(host); unchangedStats();
    action(host, "replay"); expect(phase(host)).toBe("handoff-study");
    expect(host.textContent).toContain(`${T.round} 1 / 5`);
    ready(host); action(host, "pass"); ready(host);
    expect(tiles(host)).toEqual(Array(9).fill(0));
  });

  it("plays eight private Split or Steal rounds, maps reversed player order, totals correctly, and replays fresh", () => {
    seedStats(lang);
    const host = mount(lang); const T = miniStrings(lang);
    start(host, "split");
    const expected: [number, number] = [0, 0];
    const pairs = [["split", "split"], ["steal", "split"], ["split", "steal"], ["steal", "steal"]] as const;
    for (let round = 0; round < 8; round++) {
      expect(phase(host)).toBe("negotiate");
      action(host, "begin"); noPrivateDOM(host);
      expect(host.textContent).toContain(miniText(T.lookAway, { name: round % 2 ? "Sam" : "Alex" }));
      ready(host); expect(phase(host)).toBe("choose-first");
      const pair = pairs[round % 4];
      action(host, pair[round % 2]); noPrivateDOM(host);
      expect(phase(host)).toBe("handoff-second");
      ready(host); expect(phase(host)).toBe("choose-second");
      expect(host.querySelector("[data-choice]")).toBeNull();
      expect(host.querySelector(".cp-mini-history")).toBeNull();
      action(host, pair[1 - round % 2]); noPrivateDOM(host);
      expect(phase(host)).toBe("locked");
      unchangedStats();
      action(host, "reveal"); expect(phase(host)).toBe("result");
      const coins = round % 4 === 0 ? [3, 3] : round % 4 === 1 ? [5, 0] : round % 4 === 2 ? [0, 5] : [0, 0];
      expected[0] += coins[0]; expected[1] += coins[1];
      const players = host.querySelectorAll("[data-choice]");
      expect(players[0].getAttribute("data-choice")).toBe(pair[0]);
      expect(players[1].getAttribute("data-choice")).toBe(pair[1]);
      expect(players[0].textContent).toContain(`+${coins[0]}`);
      expect(players[1].textContent).toContain(`+${coins[1]}`);
      action(host, "next");
    }
    expect(phase(host)).toBe("summary");
    expect(host.querySelectorAll(".cp-mini-history li")).toHaveLength(8);
    expect(host.textContent).toContain(`${T.combined}: ${expected[0] + expected[1]} ${T.coins}`);
    expect(host.textContent).toContain(T.tie);
    unchangedStats();
    action(host, "replay"); expect(phase(host)).toBe("negotiate");
    expect(host.querySelector(".cp-mini-history")).toBeNull();
    expect(host.textContent).toContain(`${T.round} 1 / 8`);
  });

  it.each(["pattern", "split"] as const)("supports cancel/confirm exit and discards %s state on remount", (game) => {
    const host = mount(lang); start(host, game);
    if (game === "pattern") { ready(host); action(host, "pass"); ready(host); click(host, '[data-cell="0"]'); }
    else { action(host, "begin"); ready(host); action(host, "steal"); }
    const before = phase(host);
    click(host, ".cp-mini-exit");
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.querySelector(".cp-mini-layout")?.hasAttribute("inert")).toBe(true);
    act(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(document.activeElement?.classList.contains("cp-danger")).toBe(true);
    act(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(phase(host)).toBe(before);
    expect(document.activeElement).toBe(host.querySelector(".cp-mini-exit"));
    click(host, ".cp-mini-exit"); click(host, '[role="dialog"] .cp-danger');
    expect(host.querySelectorAll(".cp-game-card")).toHaveLength(5);
    start(host, game);
    expect(phase(host)).toBe(game === "pattern" ? "handoff-study" : "negotiate");
    act(() => root?.unmount()); root = null; document.body.innerHTML = "";
    const reload = mount(lang);
    expect(reload.querySelectorAll(".cp-game-card")).toHaveLength(5);
    expect(reload.querySelector("[data-mini-game]")).toBeNull();
  });

  it("shares only names with the existing setup and supports blank-name fallbacks", () => {
    const host = mount(lang); open(host, "pattern");
    const inputs = host.querySelectorAll<HTMLInputElement>(".cp-mini input");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => { setValue.call(inputs[0], "<Alex>$&"); inputs[0].dispatchEvent(new Event("input", { bubbles: true })); });
    act(() => { setValue.call(inputs[1], "   "); inputs[1].dispatchEvent(new Event("input", { bubbles: true })); });
    action(host, "start");
    expect(host.textContent).toContain("<Alex>$&");
    expect(host.querySelector("Alex")).toBeNull();
    click(host, ".cp-mini-exit"); click(host, '[role="dialog"] .cp-danger');
    open(host, "split");
    expect(host.querySelector<HTMLInputElement>("input")?.value).toBe("<Alex>$&");
    expect(host.querySelectorAll<HTMLInputElement>("input")[1].value).toBe(lang === "en" ? "Player 2" : "Игрок 2");
  });
});

describe("mini-game edge cases", () => {
  it.each(["steal", "winner"] as const)("renders %s outcomes without invented percentages", (scenario) => {
    const host = mount(); start(host, "split");
    for (let round = 0; round < 8; round++) {
      action(host, "begin"); ready(host);
      action(host, scenario === "steal" || round % 2 === 0 ? "steal" : "split");
      ready(host); action(host, scenario === "steal" || round % 2 !== 0 ? "steal" : "split");
      action(host, "reveal"); action(host, "next");
    }
    expect(phase(host)).toBe("summary");
    expect(host.textContent).not.toContain("%");
    const scores = [...host.querySelectorAll(".cp-mini-result-number")].map((node) => node.textContent);
    expect(scores).toEqual(scenario === "steal" ? ["0", "0"] : ["40", "0"]);
    expect(host.textContent).toContain(scenario === "steal" ? "A tie!" : "Player 1 finishes ahead");
    action(host, "menu"); expect(host.querySelector(".cp-menu")).not.toBeNull();
  });
  it("scores five empty drafts honestly and permits erasing an edit", () => {
    const host = mount(); start(host, "pattern");
    for (let round = 0; round < 5; round++) {
      ready(host); action(host, "pass"); ready(host);
      click(host, '[data-cell="0"]'); expect(tiles(host)[0]).toBe(1);
      click(host, '[data-tool="0"]'); click(host, '[data-cell="0"]'); expect(tiles(host)[0]).toBe(0);
      action(host, "prepare-reveal"); action(host, "reveal");
      expect(host.textContent).not.toContain("Perfect pattern!"); action(host, "next");
    }
    expect(host.textContent).toContain("0 / 21");
    expect(host.textContent).toContain("Perfect patterns: 0 / 5");
    expect(host.textContent).not.toContain("%");
  });
  it.each(["pattern", "split"] as const)("follows live language changes without resetting %s", (game) => {
    const host = mount(); start(host, game);
    if (game === "pattern") { ready(host); action(host, "pass"); ready(host); click(host, '[data-cell="0"]'); }
    else { action(host, "begin"); ready(host); action(host, "steal"); }
    const before = phase(host);
    act(() => changeAppLang("ru"));
    expect(phase(host)).toBe(before);
    if (game === "pattern") {
      expect(host.textContent).toContain("Игрок 2 собирает"); expect(tiles(host)[0]).toBe(1);
    } else {
      expect(host.textContent).toContain("Игрок 2"); ready(host); action(host, "split"); action(host, "reveal");
      expect(host.querySelector('[data-choice="steal"]')?.textContent).toContain("Игрок 1");
    }
  });
  it.each(["pattern", "split"] as const)("still starts %s when storage is unavailable", (game) => {
    const host = mount(); open(host, game);
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
    try { action(host, "start"); expect(phase(host)).toBe(game === "pattern" ? "handoff-study" : "negotiate"); }
    finally { set.mockRestore(); }
  });
});
