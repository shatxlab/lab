// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import KingsroadApp from "@/components/kingsroad/KingsroadApp";
import { KINGSROAD_STORAGE_KEY } from "@/lib/kingsroad/meta";
import { mapById } from "@/lib/kingsroad/sim/maps";
import { TOWERS } from "@/lib/kingsroad/sim/balance";
import { axeViolations, mount, press } from "../helpers/dom";

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
    return typeof name === "string" ? text === name : name.test(text);
  });
  if (!match) throw new Error(`no button "${name}"`);
  return match;
}

async function startMeadow(container: HTMLElement) {
  await act(async () => button(container, /The Meadow/).click());
}

describe("KingsroadApp", () => {
  it("opens on the road picker with only the first road open", async () => {
    const view = await mount(<KingsroadApp />);
    expect(view.container.querySelector("h1")?.textContent).toBe("Kingsroad");
    expect(button(view.container, /The Meadow/).disabled).toBe(false);
    expect(button(view.container, /Long Ford/).disabled).toBe(true);
    expect(view.container.textContent).toContain("Win the road before to open this one");
    expect(await axeViolations(view.container)).toEqual([]);
    view.unmount();
  });

  it("shows the stars won and opens the roads they unlock", async () => {
    localStorage.setItem(KINGSROAD_STORAGE_KEY, JSON.stringify({ stars: { meadow: 2 } }));
    const view = await mount(<KingsroadApp />);
    expect(view.container.querySelector('[aria-label="2 of 3 stars"]')).toBeTruthy();
    expect(button(view.container, /Long Ford/).disabled).toBe(false);
    expect(button(view.container, /Crossroads/).disabled).toBe(true);
    view.unmount();
  });

  it("speaks Russian when the site does", async () => {
    localStorage.setItem("lab:lang", "ru");
    const view = await mount(<KingsroadApp />);
    expect(view.container.querySelector("h1")?.textContent).toBe("Королевский тракт");
    expect(view.container.textContent).toContain("12 волн");
    view.unmount();
  });

  it("starts a road waiting for the first wave", async () => {
    const view = await mount(<KingsroadApp />);
    await startMeadow(view.container);
    expect(view.container.querySelector("canvas")).toBeTruthy();
    expect(view.container.textContent).toContain("Wave 0/12");
    expect(view.container.querySelector(`[aria-label="${mapById("meadow").startGold} gold"]`)).toBeTruthy();
    await act(async () => button(view.container, "Start wave 1").click());
    expect(view.container.textContent).toContain("Wave 1/12");
    expect(button(view.container, "The wave is marching").disabled).toBe(true);
    view.unmount();
  });

  it("builds, upgrades and sells a tower on a plot picked from the keyboard", async () => {
    const view = await mount(<KingsroadApp />);
    await startMeadow(view.container);
    const canvas = view.container.querySelector("canvas")!;
    await press(canvas, "ArrowRight");
    expect(view.container.querySelector(".kr-sheet")?.textContent).toContain("Build here");
    expect(await axeViolations(view.container)).toEqual([]);

    // A first tap weighs the tower up; Build builds it.
    await act(async () => button(view.container, /^Archers/).click());
    expect(view.container.textContent).toContain("Quick arrows at one enemy at a time.");
    await act(async () => button(view.container, "Build · 70").click());
    const start = mapById("meadow").startGold;
    expect(view.container.querySelector(`[aria-label="${start - 70} gold"]`)).toBeTruthy();
    expect(view.container.querySelector(".kr-sheet")?.textContent).toContain("Lv 1");
    expect(view.container.textContent).toContain("Damage 6 → 10");

    await act(async () => button(view.container, `Upgrade · ${TOWERS.archer.levels[1].cost}`).click());
    expect(view.container.querySelector(".kr-sheet")?.textContent).toContain("Lv 2");
    // Sold before the first wave, a tower gives everything back.
    await act(async () => button(view.container, "Sell · +130").click());
    expect(view.container.querySelector(`[aria-label="${start} gold"]`)).toBeTruthy();
    expect(view.container.querySelector(".kr-sheet")).toBeNull();
    view.unmount();
  });

  it("can't afford what the gold doesn't cover", async () => {
    const view = await mount(<KingsroadApp />);
    await startMeadow(view.container);
    const canvas = view.container.querySelector("canvas")!;
    await press(canvas, "ArrowRight");
    await act(async () => button(view.container, /^Ballista/).click());
    expect(button(view.container, "Build · 120").disabled).toBe(false);
    await act(async () => button(view.container, "Build · 120").click());
    await press(canvas, "ArrowRight");
    await act(async () => button(view.container, /^Ballista/).click());
    expect(button(view.container, "Build · 120").disabled).toBe(false);
    await act(async () => button(view.container, "Build · 120").click());
    await press(canvas, "ArrowRight");
    await act(async () => button(view.container, /^Ballista/).click());
    expect(button(view.container, "Build · 120").disabled).toBe(true);
    view.unmount();
  });

  it("gives up from the pause menu and offers another go", async () => {
    const view = await mount(<KingsroadApp />);
    await startMeadow(view.container);
    await act(async () => button(view.container, "Start wave 1").click());
    await act(async () => (view.container.querySelector('[aria-label="Pause"]') as HTMLButtonElement).click());
    await act(async () => button(view.container, "Give up").click());
    expect(view.container.querySelector("#kr-over-title")?.textContent).toBe("The gate fell");
    expect(button(view.container, "Play again")).toBeTruthy();
    await act(async () => button(view.container, "Menu").click());
    expect(view.container.querySelector("h1")?.textContent).toBe("Kingsroad");
    view.unmount();
  });
});
