// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AliasGame from "@/components/alias/AliasGame";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

beforeEach(() => {
  // Keep the round from ticking so the flow is deterministic.
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 0));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  localStorage.clear();
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<AliasGame />));
  return host;
}

function click(host: HTMLElement, selector: string) {
  const element = host.querySelector<HTMLButtonElement>(selector);
  expect(element, selector).not.toBeNull();
  act(() => element?.click());
}

function tally(host: HTMLElement, selector: string): string {
  return host.querySelector(selector)?.textContent?.replace(/\D/g, "") ?? "";
}

describe("AliasGame flow", () => {
  it("walks setup → ready → round → results → next team", () => {
    const host = mount();

    // Setup: ten theme cards and a start button.
    expect(host.querySelectorAll(".alias-theme-card")).toHaveLength(10);
    click(host, ".alias-primary-button");

    // Ready: the first team can start its round.
    expect(host.querySelector(".alias-ready")).not.toBeNull();
    expect(host.textContent).toContain("Team 1");
    click(host, ".alias-start-round");

    // Round: guess a couple, skip one.
    expect(host.querySelector(".alias-round")).not.toBeNull();
    click(host, ".alias-action-correct");
    click(host, ".alias-action-correct");
    click(host, ".alias-action-skip");
    expect(tally(host, ".alias-tally-correct")).toBe("2");
    expect(tally(host, ".alias-tally-skipped")).toBe("1");

    // Finish the round and review the turn.
    click(host, ".alias-ghost-button");
    expect(host.querySelector(".alias-results")).not.toBeNull();
    expect(host.textContent).toContain("Next team");

    // Pass the device to the next team.
    click(host, ".alias-primary-button");
    expect(host.querySelector(".alias-ready")).not.toBeNull();
    expect(host.textContent).toContain("Team 2");
  });

  it("keeps the last word on screen after time runs out until it is marked", () => {
    let step: FrameRequestCallback | null = null;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        step = callback;
        return 1;
      }),
    );
    const now = vi.spyOn(Date, "now").mockReturnValue(0);

    const host = mount();
    click(host, ".alias-primary-button");
    click(host, ".alias-start-round");
    const lastWord = host.querySelector(".alias-word")?.textContent ?? "";
    expect(lastWord).not.toBe("");

    now.mockReturnValue(61_000);
    act(() => step?.(61_000));

    // The clock is done, but the word stays until the player resolves it.
    expect(host.querySelector(".alias-results")).toBeNull();
    expect(host.querySelector(".alias-round")).not.toBeNull();
    expect(host.querySelector(".alias-word")?.textContent).toBe(lastWord);
    expect(host.querySelector(".alias-keyboard-hint.is-time-up")).not.toBeNull();

    click(host, ".alias-action-correct");
    expect(host.querySelector(".alias-results")).not.toBeNull();
    now.mockRestore();
  });

  it("does not carry the on-screen word into the next team's turn", () => {
    const host = mount();
    click(host, ".alias-primary-button");
    click(host, ".alias-start-round");

    click(host, ".alias-action-correct");
    const unresolved = host.querySelector(".alias-word")?.textContent ?? "";
    expect(unresolved).not.toBe("");

    // Bail out early while that word is still on screen.
    click(host, ".alias-ghost-button");
    expect(host.querySelector(".alias-results")).not.toBeNull();

    click(host, ".alias-primary-button");
    click(host, ".alias-start-round");
    expect(host.querySelector(".alias-word")?.textContent).not.toBe(unresolved);
  });

  it("follows the shared header language setting", () => {
    localStorage.setItem("lab:lang", "ru");
    const host = mount();

    const firstTeam = host.querySelector<HTMLInputElement>(".alias-team-row input");
    expect(firstTeam?.value).toBe("Команда 1");

    click(host, '[data-theme-id="food"]');
    const selected = host.querySelector('[data-theme-id="food"]');
    expect(selected?.getAttribute("aria-pressed")).toBe("true");
  });

  it("picks a theme from the setup screen", () => {
    const host = mount();

    click(host, '[data-theme-id="food"]');
    const selected = host.querySelector('[data-theme-id="food"]');
    expect(selected?.getAttribute("aria-pressed")).toBe("true");
  });

  it("never repeats a word in the same game, including skipped ones", () => {
    const host = mount();
    click(host, ".alias-primary-button");
    click(host, ".alias-start-round");

    const wordOf = () => host.querySelector(".alias-word")?.textContent ?? "";
    const skipped = wordOf();
    expect(skipped).not.toBe("");

    click(host, ".alias-action-skip");
    const seen = [wordOf()];
    for (let i = 0; i < 25; i += 1) {
      click(host, ".alias-action-correct");
      seen.push(wordOf());
    }

    expect(seen).not.toContain(skipped);
    expect(new Set(seen).size).toBe(seen.length);
  });
});
