// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CouplesGame from "@/components/couples/CouplesGame";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  // The flow test plays the Russian deck; the shared language setting drives it.
  localStorage.setItem("lab:lang", "ru");
  // Web Audio is absent in jsdom; the engine already fails soft.
  vi.stubGlobal("AudioContext", undefined);
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function mount(): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<CouplesGame />));
  return host;
}

function click(host: HTMLElement, selector: string, index = 0) {
  const elements = host.querySelectorAll<HTMLButtonElement>(selector);
  const element = elements[index];
  expect(element, `${selector}[${index}]`).not.toBeUndefined();
  act(() => element?.click());
}

function text(host: HTMLElement, selector: string): string {
  return host.querySelector(selector)?.textContent ?? "";
}

/** Menu → pick «Норм или стрём» → 10 cards → start. */
function startNorm(host: HTMLElement) {
  click(host, ".cp-game-card", 0);
  expect(host.querySelector(".cp-setup")).not.toBeNull();
  click(host, ".cp-segmented-count button", 0);
  click(host, ".cp-setup-footer .cp-primary");
  expect(host.querySelector(".cp-play")).not.toBeNull();
}

describe("CouplesGame flow", () => {
  it("swaps a card for a fresh one when it is hidden for good, and never deals it again", () => {
    const host = mount();
    startNorm(host);
    const first = text(host, ".cp-prompt");
    expect(text(host, ".cp-counter")).toContain("1 / 10");

    click(host, ".cp-hide");
    const second = text(host, ".cp-prompt");
    expect(second).not.toBe(first);
    expect(text(host, ".cp-counter")).toContain("1 / 10");
    expect(host.querySelector(".cp-pass")).toBeNull();

    const stored = JSON.parse(localStorage.getItem("lab:couples:history:v1") ?? "{}");
    expect(stored.hidden).toHaveLength(1);

    // A new session in a fresh mount: the hidden card is gone from the pool for good.
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    const again = mount();
    click(again, ".cp-game-card", 0);
    expect(again.textContent).toContain("Скрытых карточек: 1");
    click(again, ".cp-hidden-line button");
    expect(again.textContent).not.toContain("Скрытых карточек");
    expect(JSON.parse(localStorage.getItem("lab:couples:history:v1") ?? "{}").hidden).toEqual([]);
  });

  it("remembers what was shown, so tomorrow's first cards are new ones", () => {
    const host = mount();
    startNorm(host);
    const shown: string[] = [];
    for (let card = 0; card < 10; card += 1) {
      shown.push(text(host, ".cp-prompt"));
      click(host, ".cp-option", 0);
    }
    const seen = Object.keys(JSON.parse(localStorage.getItem("lab:couples:history:v1") ?? "{}").seen);
    expect(seen).toHaveLength(10);
    expect(new Set(shown).size).toBe(10);
  });

  it("plays a full match-mode game: the first partner answers every card, then the second answers the same cards", () => {
    const host = mount();
    expect(host.querySelectorAll(".cp-game-card")).toHaveLength(3);

    startNorm(host);

    const firstRound: string[] = [];
    let firstTurn = "";
    for (let card = 0; card < 10; card += 1) {
      if (card === 0) firstTurn = text(host, ".cp-turn");
      expect(text(host, ".cp-counter")).toContain(`${card + 1} / 10`);
      firstRound.push(text(host, ".cp-prompt"));
      click(host, ".cp-option", 0);
      // No reveal between cards: the next card comes straight away.
      expect(host.querySelector(".cp-reveal")).toBeNull();
    }

    // The phone is handed over once, after the last card of the first partner.
    expect(host.querySelector(".cp-pass")).not.toBeNull();
    expect(host.querySelector(".cp-option")).toBeNull();
    click(host, ".cp-pass .cp-primary");

    const secondRound: string[] = [];
    let secondTurn = "";
    for (let card = 0; card < 10; card += 1) {
      if (card === 0) secondTurn = text(host, ".cp-turn");
      expect(text(host, ".cp-counter")).toContain(`${card + 1} / 10`);
      secondRound.push(text(host, ".cp-prompt"));
      click(host, ".cp-option", 0);
    }

    expect(firstTurn).toContain("Отвечает");
    expect(secondTurn).not.toBe(firstTurn);
    expect(secondRound).toEqual(firstRound);
    expect(host.querySelector(".cp-summary")).not.toBeNull();
    expect(host.textContent).toContain("100%");
    expect(host.textContent).toContain("10 / 10");
  });

  it("summary lists both answers for every card with the match percentage", () => {
    const host = mount();
    startNorm(host);

    for (let card = 0; card < 10; card += 1) click(host, ".cp-option", 0);
    click(host, ".cp-pass .cp-primary");
    // The second partner agrees on the even cards only.
    for (let card = 0; card < 10; card += 1) click(host, ".cp-option", card % 2);

    expect(host.querySelectorAll(".cp-result")).toHaveLength(10);
    expect(host.querySelectorAll('.cp-result[data-match="true"]')).toHaveLength(5);
    expect(host.textContent).toContain("50%");
    expect(host.textContent).toContain("5 / 10");
    expect(host.querySelector(".cp-discuss")?.textContent).toContain("Обсудите");
    expect(host.querySelector(".cp-result-picks")?.textContent).toContain("Норм");
  });

  it("keeps a card the first partner answered for the rest of the run when it is hidden in the second turn", () => {
    const host = mount();
    startNorm(host);
    for (let card = 0; card < 10; card += 1) click(host, ".cp-option", 0);
    click(host, ".cp-pass .cp-primary");

    const shown = text(host, ".cp-prompt");
    click(host, ".cp-hide");
    expect(text(host, ".cp-prompt")).toBe(shown);
    expect(JSON.parse(localStorage.getItem("lab:couples:history:v1") ?? "{}").hidden).toHaveLength(1);
  });

  it("plays together mode without a handoff step", () => {
    const host = mount();
    click(host, ".cp-game-card", 0);
    // Switch the mode segmented control to «Вместе».
    click(host, ".cp-segmented:not(.cp-segmented-count) button", 1);
    click(host, ".cp-segmented-count button", 0);
    click(host, ".cp-setup-footer .cp-primary");

    expect(text(host, ".cp-counter")).toContain("1 / 10");
    // Each tap advances straight to the next card — no pass.
    for (let card = 0; card < 9; card += 1) {
      click(host, ".cp-option", 1);
      expect(host.querySelector(".cp-pass")).toBeNull();
      expect(text(host, ".cp-counter")).toContain(`${card + 2} / 10`);
    }
    // The last tap wraps up directly into the summary.
    click(host, ".cp-option", 1);
    expect(host.querySelector(".cp-summary")).not.toBeNull();
    expect(host.textContent).toContain("Ваши итоги");
  });

  it("hides the options on the handoff screen until it is dismissed", () => {
    const host = mount();
    startNorm(host);

    for (let card = 0; card < 9; card += 1) click(host, ".cp-option", 0);
    expect(host.querySelector(".cp-pass")).toBeNull();
    click(host, ".cp-option", 0);
    expect(host.querySelector(".cp-pass")).not.toBeNull();
    expect(host.querySelector(".cp-option")).toBeNull();

    click(host, ".cp-pass .cp-primary");
    expect(host.querySelector(".cp-option")).not.toBeNull();
  });

  it("answers with the number keys and passes the phone with space", () => {
    const host = mount();
    startNorm(host);
    const press = (key: string) =>
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });

    for (let card = 0; card < 10; card += 1) press("1");
    expect(host.querySelector(".cp-pass")).not.toBeNull();

    press(" ");
    expect(host.querySelector(".cp-option")).not.toBeNull();
    expect(text(host, ".cp-counter")).toContain("1 / 10");
    for (let card = 0; card < 9; card += 1) press("2");
    expect(text(host, ".cp-counter")).toContain("10 / 10");
    press("2");
    expect(host.querySelector(".cp-summary")).not.toBeNull();
  });

  it("uses Russian partner names for a first-time Russian visitor", () => {
    const host = mount();
    startNorm(host);
    expect(text(host, ".cp-turn")).toContain("Игрок 1");
  });

  it("persists the setup between visits", () => {
    const first = mount();
    click(first, ".cp-game-card", 1); // ИлиТо
    click(first, ".cp-segmented-count button", 2); // 30 cards
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";

    const second = mount();
    click(second, ".cp-game-card", 0); // open setup via menu
    const other = second.querySelector<HTMLButtonElement>(".cp-segmented-count button.is-active");
    expect(other?.textContent).toContain("30");
  });
});