// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import KingsroadApp from "@/components/kingsroad/KingsroadApp";
import { createGame, callWave, step, STEP } from "@/lib/kingsroad/sim/game";
import { CHECKPOINT_MS, readRun, writeRun, RUN_STORAGE_KEY } from "@/lib/kingsroad/snapshot";
import { KINGSROAD_TEXT } from "@/lib/kingsroad/i18n";
import { KINGSROAD_STORAGE_KEY, readSave } from "@/lib/kingsroad/meta";
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
  vi.useRealTimers();
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

  it("checkpoints setup, builds, upgrades, sells, and wave calls immediately", async () => {
    const view = await mount(<KingsroadApp />);
    await startMeadow(view.container);
    expect(readRun()?.status).toBe("ready");
    const canvas = view.container.querySelector("canvas")!;
    await press(canvas, "ArrowRight");
    await act(async () => button(view.container, /^Archers/).click());
    await act(async () => button(view.container, "Build · 70").click());
    expect(readRun()?.towers[0]).toMatchObject({ plot: 0, kind: "archer", level: 1 });
    await act(async () => button(view.container, "Upgrade · 60").click());
    expect(readRun()?.towers[0].level).toBe(2);
    await act(async () => button(view.container, "Sell · +130").click());
    expect(readRun()?.towers).toEqual([]);
    await act(async () => button(view.container, "Start wave 1").click());
    expect(readRun()).toMatchObject({ status: "playing", wave: 1 });
    view.unmount();
  });

  it.each(["en", "ru"] as const)("offers to continue the exact saved run, paused with controls blocked in %s", async (lang) => {
    localStorage.setItem("lab:lang", lang);
    const saved = createGame("meadow", 99);
    callWave(saved);
    for (let i = 0; i < 100; i += 1) step(saved, STEP);
    writeRun(saved);
    const text = KINGSROAD_TEXT[lang];
    const view = await mount(<KingsroadApp />);
    expect(view.container.textContent).toContain(text.continueHint(text.maps.meadow.name, 1, 12));
    await act(async () => button(view.container, text.continueRun).click());
    expect(view.container.querySelector("#kr-pause-title")?.textContent).toBe(text.paused);
    expect(view.container.querySelector<HTMLButtonElement>(".kr-wave")?.disabled).toBe(true);
    expect(view.container.querySelector<HTMLButtonElement>(".kr-volley")?.disabled).toBe(true);
    expect(view.container.querySelector('[aria-pressed="true"][data-active]')).toBeNull();
    expect(readRun()).toEqual(saved);
    expect(await axeViolations(view.container)).toEqual([]);
    await act(async () => button(view.container, text.resume).click());
    expect(view.container.querySelector("#kr-pause-title")).toBeNull();
    expect(readRun()).toEqual(saved);
    view.unmount();
  });

  it("checkpoints a volley and an early wave call immediately", async () => {
    const saved = createGame("meadow", 12);
    callWave(saved);
    for (let i = 0; i < 100; i += 1) step(saved, STEP);
    saved.spawns = [];
    saved.nextWaveIn = 2;
    writeRun(saved);
    const view = await mount(<KingsroadApp />);
    await act(async () => button(view.container, "Continue run").click());
    await act(async () => button(view.container, "Resume").click());
    await press(view.container.querySelector("canvas")!, " ");
    expect(readRun()?.volleys.length).toBeGreaterThan(0);
    expect(readRun()?.volleyLeft).toBeGreaterThan(0);
    await act(async () => button(view.container, /^Next wave in/).click());
    expect(readRun()?.wave).toBe(2);
    expect(readRun()?.gold).toBeGreaterThan(saved.gold);
    view.unmount();
  });

  it("checkpoints automatically started waves rather than waiting for the interval", async () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    const saved = createGame("meadow", 12);
    callWave(saved);
    saved.spawns = [];
    saved.nextWaveIn = STEP;
    writeRun(saved);
    const view = await mount(<KingsroadApp />);
    await act(async () => button(view.container, "Continue run").click());
    await act(async () => button(view.container, "Resume").click());
    await act(async () => frame?.(performance.now() + 100));
    expect(readRun()?.wave).toBe(2);
    expect(readRun()?.spawns.length).toBeGreaterThan(0);
    view.unmount();
  });

  it("saves and pauses ready setups on hide/pagehide, then returns to the menu without surrendering", async () => {
    const view = await mount(<KingsroadApp />);
    await startMeadow(view.container);
    const before = readRun();
    localStorage.removeItem(RUN_STORAGE_KEY);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(readRun()).toEqual(before);
    expect(view.container.querySelector("#kr-pause-title")).toBeTruthy();
    await act(async () => button(view.container, "Save & menu").click());
    expect(view.container.querySelector("h1")?.textContent).toBe("Kingsroad");
    expect(button(view.container, "Continue run")).toBeTruthy();
    expect(readRun()?.status).toBe("ready");
    expect(readSave().stars.meadow).toBe(0);
    await act(async () => button(view.container, "Continue run").click());
    expect(view.container.querySelector("#kr-pause-title")).toBeTruthy();
    localStorage.removeItem(RUN_STORAGE_KEY);
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(readRun()).toEqual(before);
    view.unmount();
  });

  it("writes periodic checkpoints and cleans up the timer/listeners on unmount", async () => {
    vi.useFakeTimers();
    const view = await mount(<KingsroadApp />);
    await startMeadow(view.container);
    const before = readRun();
    localStorage.removeItem(RUN_STORAGE_KEY);
    await act(async () => vi.advanceTimersByTime(CHECKPOINT_MS));
    expect(readRun()).toEqual(before);
    view.unmount();
    localStorage.removeItem(RUN_STORAGE_KEY);
    await act(async () => {
      vi.advanceTimersByTime(CHECKPOINT_MS * 2);
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(readRun()).toBeNull();
  });

  it("does not advance a restored game, even if frames arrive after a long wall-time gap", async () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    const saved = createGame("meadow", 99);
    callWave(saved);
    writeRun(saved);
    const view = await mount(<KingsroadApp />);
    await act(async () => button(view.container, "Continue run").click());
    await act(async () => frame?.(performance.now() + 60 * 60 * 1000));
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(readRun()).toEqual(saved);
    view.unmount();
  });

  it("requires confirmation to replace/discard a saved run and keeps campaign stars", async () => {
    const saved = createGame("meadow", 99);
    writeRun(saved);
    localStorage.setItem(KINGSROAD_STORAGE_KEY, JSON.stringify({ stars: { meadow: 2 } }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = await mount(<KingsroadApp />);
    await act(async () => button(view.container, "Discard saved run").click());
    expect(readRun()).toEqual(saved);
    await startMeadow(view.container);
    expect(view.container.querySelector("h1")).toBeTruthy();
    expect(readRun()).toEqual(saved);
    confirm.mockReturnValue(true);
    await startMeadow(view.container);
    expect(view.container.querySelector("canvas")).toBeTruthy();
    expect(readRun()?.seed).not.toBe(99);
    expect(readSave().stars.meadow).toBe(2);
    view.unmount();
  });

  it("discards only the active-run slot and tolerates a corrupt snapshot", async () => {
    writeRun(createGame("meadow", 99));
    localStorage.setItem(KINGSROAD_STORAGE_KEY, JSON.stringify({ stars: { meadow: 2 } }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const view = await mount(<KingsroadApp />);
    await act(async () => button(view.container, "Discard saved run").click());
    expect(readRun()).toBeNull();
    expect(readSave().stars.meadow).toBe(2);
    view.unmount();
    localStorage.setItem(RUN_STORAGE_KEY, "{broken");
    const again = await mount(<KingsroadApp />);
    expect(again.container.querySelector(".kr-continue")).toBeNull();
    expect(readSave().stars.meadow).toBe(2);
    again.unmount();
  });

  it("recovers a terminal win on startup without offering to replay it", async () => {
    const won = { ...createGame("meadow", 99), status: "won" as const, wave: 12 };
    writeRun(won);
    const view = await mount(<KingsroadApp />);
    expect(view.container.querySelector(".kr-continue")).toBeNull();
    expect(readSave().stars.meadow).toBe(3);
    expect(button(view.container, /Long Ford/).disabled).toBe(false);
    expect(readRun()).toBeNull();
    view.unmount();
  });

  it("finishes once, clears the run, and cannot resurrect it through pagehide or retry", async () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    const almostWon = { ...createGame("meadow", 99), status: "playing" as const, wave: 12 };
    writeRun(almostWon);
    const view = await mount(<KingsroadApp />);
    await act(async () => button(view.container, "Continue run").click());
    await act(async () => button(view.container, "Resume").click());
    await act(async () => frame?.(performance.now() + 100));
    expect(view.container.querySelector("#kr-over-title")?.textContent).toBe(KINGSROAD_TEXT.en.won);
    expect(readSave().stars.meadow).toBe(3);
    expect(readRun()).toBeNull();
    const once = localStorage.getItem(KINGSROAD_STORAGE_KEY);
    await act(async () => { frame?.(performance.now() + 200); window.dispatchEvent(new Event("pagehide")); });
    expect(readRun()).toBeNull();
    expect(localStorage.getItem(KINGSROAD_STORAGE_KEY)).toBe(once);
    await act(async () => button(view.container, "Play again").click());
    expect(readRun()?.status).toBe("ready");
    expect(view.container.querySelector("#kr-over-title")).toBeNull();
    view.unmount();
  });

  it("keeps a new run playable when localStorage writes fail", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("quota"); });
    const view = await mount(<KingsroadApp />);
    await startMeadow(view.container);
    expect(view.container.querySelector(".kr-save-warning")?.textContent).toContain("Saving is unavailable");
    await act(async () => button(view.container, "Start wave 1").click());
    expect(view.container.textContent).toContain("Wave 1/12");
    expect(view.container.querySelector("canvas")).toBeTruthy();
    view.unmount();
  });

  it("reports storage failure without breaking play or silently replacing an unsaved win", async () => {
    const won = { ...createGame("meadow", 99), status: "won" as const, wave: 12 };
    writeRun(won);
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === KINGSROAD_STORAGE_KEY) throw Error("quota");
      original.call(this, key, value);
    });
    const view = await mount(<KingsroadApp />);
    expect(view.container.querySelector(".kr-save-warning")?.textContent).toContain("Saving is unavailable");
    await startMeadow(view.container);
    expect(view.container.querySelector("h1")).toBeTruthy();
    expect(readRun()?.status).toBe("won");
    vi.mocked(Storage.prototype.setItem).mockRestore();
    await startMeadow(view.container);
    expect(readSave().stars.meadow).toBe(3);
    expect(readRun()?.status).toBe("ready");
    view.unmount();
  });

  it("gives up from the pause menu and offers another go", async () => {
    const view = await mount(<KingsroadApp />);
    await startMeadow(view.container);
    await act(async () => button(view.container, "Start wave 1").click());
    await act(async () => (view.container.querySelector('[aria-label="Pause"]') as HTMLButtonElement).click());
    await act(async () => button(view.container, "Give up").click());
    expect(view.container.querySelector("#kr-over-title")?.textContent).toBe("The gate fell");
    expect(readRun()).toBeNull();
    expect(button(view.container, "Play again")).toBeTruthy();
    await act(async () => button(view.container, "Menu").click());
    expect(view.container.querySelector("h1")?.textContent).toBe("Kingsroad");
    view.unmount();
  });
});
