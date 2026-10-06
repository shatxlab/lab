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
  it("plays a full match-mode game and scores 100%", () => {
    const host = mount();
    expect(host.querySelectorAll(".cp-game-card")).toHaveLength(3);

    startNorm(host);

    for (let card = 0; card < 10; card += 1) {
      click(host, ".cp-option", 0);
      expect(host.querySelector(".cp-pass")).not.toBeNull();
      click(host, ".cp-pass .cp-primary");
      click(host, ".cp-option", 0);
      expect(text(host, ".cp-verdict")).toContain("Совпали");
      click(host, ".cp-play-footer .cp-primary");
    }

    expect(host.querySelector(".cp-summary")).not.toBeNull();
    expect(host.textContent).toContain("100%");
    expect(host.textContent).toContain("10 / 10");
  });

  it("plays together mode without a handoff or reveal step", () => {
    const host = mount();
    click(host, ".cp-game-card", 0);
    // Switch the mode segmented control to «Вместе».
    click(host, ".cp-segmented:not(.cp-segmented-count) button", 1);
    click(host, ".cp-segmented-count button", 0);
    click(host, ".cp-setup-footer .cp-primary");

    expect(text(host, ".cp-counter")).toContain("1 / 10");
    // Each tap advances straight to the next card — no pass, no reveal.
    for (let card = 0; card < 9; card += 1) {
      click(host, ".cp-option", 1);
      expect(host.querySelector(".cp-pass")).toBeNull();
      expect(host.querySelector(".cp-reveal")).toBeNull();
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

    click(host, ".cp-option", 0);
    expect(host.querySelector(".cp-pass")).not.toBeNull();
    expect(host.querySelector(".cp-option")).toBeNull();

    click(host, ".cp-pass .cp-primary");
    expect(host.querySelector(".cp-option")).not.toBeNull();
  });

  it("answers with the number keys", () => {
    const host = mount();
    startNorm(host);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
    });
    expect(host.querySelector(".cp-pass")).not.toBeNull();

    click(host, ".cp-pass .cp-primary");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "2", bubbles: true }));
    });
    expect(host.querySelector(".cp-reveal")).not.toBeNull();
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