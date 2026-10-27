// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FootballApp from "@/components/football/FootballApp";
import { FOOTBALL_STORAGE_KEY } from "@/lib/football/meta";
import { axeViolations, mount } from "../helpers/dom";

/** A screen of the given orientation; `matchMedia` is what the match asks. */
function stubOrientation(portrait: boolean) {
  const listeners = new Set<() => void>();
  let isPortrait = portrait;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      // Live, like the real thing.
      get matches() {
        return query.includes("portrait") ? isPortrait : false;
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })),
  );
  return {
    turn(to: boolean) {
      isPortrait = to;
      listeners.forEach((listener) => listener());
    },
  };
}

beforeEach(() => {
  // No frames: the loop is started but never ticks, so the screen stays put.
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 0));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function button(container: HTMLElement, name: string | RegExp): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find((element) => {
    const text = element.textContent?.trim() ?? "";
    const label = element.getAttribute("aria-label") ?? "";
    return typeof name === "string" ? text === name || label === name : name.test(text) || name.test(label);
  });
  if (!match) throw new Error(`no button "${name}"`);
  return match;
}

describe("FootballApp", () => {
  it("opens on the menu with a kit and an opponent picked", async () => {
    const view = await mount(<FootballApp />);
    expect(view.container.querySelector("h1")?.textContent).toBe("Sunday League");
    expect(button(view.container, "Reds").getAttribute("aria-checked")).toBe("true");
    expect(button(view.container, /League side/).getAttribute("aria-checked")).toBe("true");
    expect(await axeViolations(view.container)).toEqual([]);
    view.unmount();
  });

  it("remembers the colours picked and shows the record against each side", async () => {
    localStorage.setItem(FOOTBALL_STORAGE_KEY, JSON.stringify({ kit: 2, records: { derby: { played: 3, won: 2, drawn: 1, lost: 0 } } }));
    const view = await mount(<FootballApp />);
    expect(button(view.container, "Greens").getAttribute("aria-checked")).toBe("true");
    expect(view.container.textContent).toContain("W2 D1 L0");
    await act(async () => button(view.container, "Blues").click());
    expect(JSON.parse(localStorage.getItem(FOOTBALL_STORAGE_KEY)!).kit).toBe(1);
    view.unmount();
  });

  it("speaks Russian when the site does", async () => {
    localStorage.setItem("lab:lang", "ru");
    const view = await mount(<FootballApp />);
    expect(view.container.querySelector("h1")?.textContent).toBe("Воскресная лига");
    expect(view.container.textContent).toContain("Начать матч");
    view.unmount();
  });

  it("kicks off a match: a pitch, a scoreboard at nil-nil, and a pause that stops it", async () => {
    const view = await mount(<FootballApp />);
    await act(async () => button(view.container, "Kick off").click());
    expect(view.container.querySelector("canvas")).toBeTruthy();
    expect(view.container.querySelector(".fb-goals")?.textContent).toBe("0 – 0");
    expect(view.container.textContent).toContain("Lab Rovers");
    await act(async () => button(view.container, "Pause").click());
    expect(view.container.querySelector('[role="dialog"]')?.textContent).toContain("Paused");
    await act(async () => button(view.container, "Leave the match").click());
    expect(view.container.querySelector("h1")?.textContent).toBe("Sunday League");
    view.unmount();
  });

  it("says matches are played sideways on the menu", async () => {
    const view = await mount(<FootballApp />);
    expect(view.container.textContent).toContain("Matches are played with the screen turned sideways.");
    view.unmount();
  });

  it("plays in landscape without a rotate screen", async () => {
    stubOrientation(false);
    const view = await mount(<FootballApp />);
    await act(async () => button(view.container, "Kick off").click());
    expect(view.container.querySelector(".fb-rotate")).toBeNull();
    expect(view.container.querySelector(".fb-main .fb-field canvas")).toBeTruthy();
    expect(view.container.querySelector(".fb-main .fb-panel")).toBeTruthy();
    view.unmount();
  });

  it("asks for the phone to be turned when it's upright, and lets go once it is", async () => {
    const screen = stubOrientation(true);
    const view = await mount(<FootballApp />);
    await act(async () => button(view.container, "Kick off").click());
    expect(view.container.querySelector(".fb-rotate")?.textContent).toContain("Turn your phone sideways");
    await act(async () => screen.turn(false));
    expect(view.container.querySelector(".fb-rotate")).toBeNull();
    await act(async () => screen.turn(true));
    expect(view.container.querySelector(".fb-rotate")).toBeTruthy();
    await act(async () => button(view.container, "Leave the match").click());
    expect(view.container.querySelector("h1")?.textContent).toBe("Sunday League");
    view.unmount();
  });

  it("tells a Russian player to turn the phone in Russian", async () => {
    localStorage.setItem("lab:lang", "ru");
    stubOrientation(true);
    const view = await mount(<FootballApp />);
    await act(async () => button(view.container, "Начать матч").click());
    expect(view.container.querySelector(".fb-rotate")?.textContent).toContain("Поверните телефон");
    view.unmount();
  });
});
