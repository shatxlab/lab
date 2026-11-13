// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CouplesGame from "@/components/couples/CouplesGame";
import { changeAppLang } from "@/lib/apps/lang";
import { neverStrings } from "@/lib/couples/never/i18n";
import { COUPLES_STORAGE_KEY, defaultSettings } from "@/lib/couples/storage";
import type { Lang } from "@/lib/couples/types";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
const stats = { games: 5, cards: 22, matches: 10 };
const history = { seq: 2, seen: { "norm:old": 2 }, hidden: ["who:hidden"] };
beforeEach(() => { localStorage.clear(); vi.stubGlobal("AudioContext", undefined); });
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.unstubAllGlobals(); });
function mount(lang: Lang = "en") {
  localStorage.setItem("lab:lang", lang);
  localStorage.setItem(COUPLES_STORAGE_KEY, JSON.stringify({ settings: { ...defaultSettings(lang), names: ["Alex", "Sam"] }, stats }));
  localStorage.setItem("lab:couples:history:v1", JSON.stringify(history));
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host); act(() => root?.render(<CouplesGame />)); return host;
}
function click(host: HTMLElement, selector: string) {
  const button = host.querySelector<HTMLButtonElement>(selector); expect(button, selector).not.toBeNull(); act(() => button!.click());
}
function action(host: HTMLElement, name: string) { click(host, `[data-action="${name}"]`); }
function open(host: HTMLElement) { click(host, ".cp-game-card:nth-child(5)"); }
function answer(host: HTMLElement, player: number, value: "have" | "never") { click(host, `[data-never-player="${player}"][data-answer="${value}"]`); }
function phase(host: HTMLElement) { return host.querySelector("[data-never-phase]")?.getAttribute("data-never-phase"); }
function noPersistence() {
  expect(JSON.parse(localStorage.getItem(COUPLES_STORAGE_KEY)!).stats).toEqual(stats);
  expect(JSON.parse(localStorage.getItem("lab:couples:history:v1")!)).toEqual(history);
  expect(Object.keys(localStorage).sort()).toEqual(["lab:lang", COUPLES_STORAGE_KEY, "lab:couples:history:v1"].sort());
  expect(localStorage.getItem(COUPLES_STORAGE_KEY)).not.toMatch(/answers|never-|followUp|explored/);
}
describe.each(["en", "ru"] as const)("Never Have I Ever flow (%s)", lang => {
  it("defaults to the non-personal mix and completes a 15-card round with no score/history", () => {
    const host = mount(lang); const T = neverStrings(lang); open(host);
    expect(host.querySelector<HTMLInputElement>('input[value="mix"]')?.checked).toBe(true);
    expect(host.querySelector<HTMLInputElement>('input[value="closer"]')?.checked).toBe(false);
    expect(host.textContent).toContain(T.consent);
    action(host, "start");
    const seen = new Set<string>();
    for (let i = 0; i < 15; i++) {
      expect(phase(host)).toBe("answer");
      expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
      expect(host.querySelector(".cp-never-story")).toBeNull();
      seen.add(host.querySelector(".cp-never-prompt h2")!.textContent!);
      answer(host, 0, "have"); expect(phase(host)).toBe("answer");
      expect(host.querySelector('[data-action="never-next"]')).toBeNull();
      answer(host, 1, "never"); expect(phase(host)).toBe("story");
      expect(host.querySelector(".cp-never-story")).not.toBeNull();
      answer(host, 0, "never"); expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(2);
      noPersistence(); action(host, "never-next");
    }
    expect(seen.size).toBe(15); expect(phase(host)).toBe("summary");
    expect(host.textContent).toContain(`${T.explored}: 15`);
    expect(host.textContent).not.toContain("%");
    expect(host.querySelector(".cp-never-players")).toBeNull();
    expect(host.querySelector(".cp-never-prompt")).toBeNull();
    noPersistence(); action(host, "replay"); expect(phase(host)).toBe("answer");
    expect(host.querySelector(".cp-counter")?.textContent).toContain("1 / 15");
    expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
  });
  it("does not focus questions on start, next, skip or replay", () => {
    const host = mount(lang); open(host); action(host, "start");
    const checkPrompt = () => {
      const prompt = host.querySelector(".cp-never-prompt h2")!;
      expect(prompt.hasAttribute("tabindex")).toBe(false);
      expect(document.activeElement).not.toBe(prompt);
      expect(host.querySelector(".cp-never-prompt")?.getAttribute("aria-live")).toBe("polite");
    };
    checkPrompt();
    answer(host, 0, "have"); answer(host, 1, "never");
    action(host, "never-next"); checkPrompt();
    action(host, "never-skip"); checkPrompt();
    for (let i = 2; i < 15; i++) action(host, "never-skip");
    expect(phase(host)).toBe("summary");
    expect(document.activeElement).toBe(host.querySelector(".cp-mini-panel h2"));
    action(host, "replay"); checkPrompt();
  });
  it("allows opting into closer and 10 cards, skips before/after either answer, and shows only aggregate counts", () => {
    const host = mount(lang); const T = neverStrings(lang); open(host);
    click(host, 'input[value="closer"]');
    const select = host.querySelector("select")!;
    act(() => { select.value = "10"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    action(host, "start");
    const declined: string[] = [];
    for (let i = 0; i < 10; i++) {
      expect(host.querySelector(".cp-counter")?.textContent).toContain(T.closer);
      declined.push(host.querySelector(".cp-never-prompt h2")!.textContent!);
      if (i % 3) answer(host, 0, "have");
      if (i % 3 === 2) answer(host, 1, "never");
      action(host, "never-skip");
      expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
    }
    expect(phase(host)).toBe("summary");
    expect(host.textContent).toContain(`${T.explored}: 0`);
    expect(host.textContent).toContain(`${T.skipped}: 10`);
    for (const text of declined) expect(host.textContent).not.toContain(text);
    expect(host.textContent).not.toContain("%"); noPersistence();
    action(host, "menu"); expect(host.querySelectorAll(".cp-game-card")).toHaveLength(5);
  });
  it("supports exit cancel/confirm and reload without saving answers", () => {
    const host = mount(lang); open(host); action(host, "start"); answer(host, 0, "have");
    click(host, ".cp-mini-exit");
    expect(host.querySelector(".cp-mini-layout")?.hasAttribute("inert")).toBe(true);
    click(host, '[role="dialog"] .cp-secondary');
    expect(host.querySelector('[data-answer="have"]')?.getAttribute("aria-pressed")).toBe("true");
    click(host, ".cp-mini-exit"); click(host, '[role="dialog"] .cp-danger');
    open(host); action(host, "start"); expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
    act(() => root?.unmount()); root = null; document.body.innerHTML = "";
    const reload = mount(lang); expect(reload.querySelector("[data-never-phase]")).toBeNull(); noPersistence();
  });
});
it("does not silently replace an independently authored card when UI language changes mid-round", () => {
  const host = mount(); open(host); action(host, "start"); answer(host, 0, "have");
  const prompt = host.querySelector(".cp-never-prompt h2")?.textContent;
  act(() => changeAppLang("ru"));
  expect(host.querySelector(".cp-never-prompt h2")?.textContent).toBe(prompt);
  expect(host.querySelector(".cp-never-prompt")?.getAttribute("lang")).toBe("en");
  expect(host.textContent).toContain(neverStrings("ru").cardLanguage);
  expect(host.querySelector('[data-answer="have"]')?.getAttribute("aria-pressed")).toBe("true");
  for (let i = 0; i < 15; i++) action(host, "never-skip");
  action(host, "replay");
  expect(host.querySelector(".cp-never-prompt")?.getAttribute("lang")).toBe("ru");
  expect(host.querySelector(".cp-never-prompt h2")?.textContent).toMatch(/^Я никогда не /);
});
it("works if localStorage writes fail", () => {
  const host = mount(); open(host);
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  action(host, "start"); answer(host, 0, "never"); answer(host, 1, "have"); action(host, "never-next");
  expect(phase(host)).toBe("answer"); spy.mockRestore();
});
