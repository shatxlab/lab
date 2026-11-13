// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TowerApp from "@/components/tower/TowerApp";
import { createCheckpoint, readRun, RUN_STORAGE_KEY, writeRun, CHECKPOINT_MS } from "@/lib/tower/snapshot";
import { createRun, giveUp, step, STEP } from "@/lib/tower/sim/run";
import { emptyPerks } from "@/lib/tower/sim/upgrades";
import { TOWER_TEXT } from "@/lib/tower/i18n";
import { richRun } from "./fixtures";
import { readSave, writeSave, defaultSave, TOWER_STORAGE_KEY } from "@/lib/tower/meta";
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

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find((element) => element.textContent?.trim() === name);
  if (!match) throw new Error(`no button "${name}"`);
  return match;
}

async function startRun(view: { container: HTMLElement }, skill = "catapult", start = "Play") {
  await act(async () => button(view.container, start).click());
  await act(async () => (view.container.querySelector(`[data-skill="${skill}"]`) as HTMLButtonElement | null)?.click());
}

describe("TowerApp", () => {
  it("opens on the menu with the saved best and gold", async () => {
    localStorage.setItem(TOWER_STORAGE_KEY, JSON.stringify({ gold: 42, best: 7, runs: 3, perks: {} }));
    const view = await mount(<TowerApp />);
    expect(view.container.querySelector("h1")?.textContent).toBe("Lone Tower");
    expect(view.container.textContent).toContain("Best: wave 7");
    expect(view.container.textContent).toContain("42 gold");
    view.unmount();
  });

  it("speaks Russian when the site does", async () => {
    localStorage.setItem("lab:lang", "ru");
    const view = await mount(<TowerApp />);
    expect(view.container.querySelector("h1")?.textContent).toBe("Одинокая башня");
    view.unmount();
  });

  it("starts a run on the field", async () => {
    const view = await mount(<TowerApp />);
    await startRun(view);
    expect(view.container.querySelector("canvas")).toBeTruthy();
    expect(view.container.textContent).toContain("Wave 1");
    expect(view.container.querySelector('[role="meter"]')?.getAttribute("aria-valuenow")).toBe("100");
    view.unmount();
  });

  it("casts through the visible skill button, with cancel and no double-tap shortcut", async () => {
    const view = await mount(<TowerApp />);
    await startRun(view);
    const skill = view.container.querySelector(".tower-skill") as HTMLButtonElement;
    expect(skill.textContent).toBe("CatapultReady");
    const canvas = view.container.querySelector("canvas")!;
    const pointer = (type: string, id = 1) =>
      canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, clientX: 50, clientY: 50 }));
    await act(async () => { pointer("pointerdown"); pointer("pointerup"); pointer("pointerdown"); pointer("pointerup"); });
    expect(readRun()?.run.skillCasts).toHaveLength(0);
    await act(async () => skill.click());
    expect(skill.getAttribute("data-targeting")).toBe("true");
    await act(async () => skill.click());
    expect(skill.getAttribute("data-targeting")).toBe("false");
    await act(async () => skill.click());
    await act(async () => { pointer("pointerdown", 2); pointer("pointermove", 2); pointer("pointerup", 2); });
    expect(readRun()?.run.skill).toBe("catapult");
    expect(readRun()?.run.skillCasts).toHaveLength(1);
    expect(readRun()?.run.skillLeft).toBeGreaterThan(0);
    expect(skill.getAttribute("data-targeting")).toBe("false");
    view.unmount();
  });

  it("cancels touch/keyboard targeting without casting or leaving stuck input", async () => {
    const view = await mount(<TowerApp />);
    await startRun(view);
    const skill = view.container.querySelector(".tower-skill") as HTMLButtonElement;
    const canvas = view.container.querySelector("canvas")!;
    await act(async () => skill.click());
    await act(async () => canvas.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 4, clientX: 50, clientY: 50 })));
    await act(async () => canvas.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 4, clientX: 50, clientY: 50 })));
    expect(skill.getAttribute("data-targeting")).toBe("false");
    expect(readRun()?.run.skillCasts).toHaveLength(0);
    await act(async () => canvas.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "1" })));
    expect(skill.getAttribute("data-targeting")).toBe("true");
    await act(async () => canvas.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })));
    expect(skill.getAttribute("data-targeting")).toBe("false");
    await act(async () => canvas.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "1" })));
    await act(async () => (view.container.querySelector(".tower-icon-button") as HTMLButtonElement).click());
    expect(skill.getAttribute("data-targeting")).toBe("false");
    expect(view.container.querySelector("#tower-pause-title")).toBeTruthy();
    await act(async () => button(view.container, "Resume").click());
    await act(async () => canvas.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " })));
    expect(readRun()?.run.firing).toBe(true);
    await act(async () => canvas.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " " })));
    expect(readRun()?.run.firing).toBe(false);
    expect(readRun()?.run.skillCasts).toHaveLength(0);
    view.unmount();
  });

  it("offers Frost Field as an equally available starting skill", async () => {
    const view = await mount(<TowerApp />);
    await startRun(view, "frostField");
    expect(readRun()?.run.skill).toBe("frostField");
    expect(view.container.querySelector(".tower-skill")?.textContent).toBe("Frost FieldReady");
    view.unmount();
  });

  it("opens a run with a head start on the upgrade picker", async () => {
    localStorage.setItem(TOWER_STORAGE_KEY, JSON.stringify({ gold: 0, best: 0, runs: 0, perks: { headStart: 1 } }));
    const view = await mount(<TowerApp />);
    await startRun(view);
    const choices = view.container.querySelectorAll(".tower-choice");
    expect(choices).toHaveLength(3);
    await act(async () => (choices[0] as HTMLButtonElement).click());
    expect(view.container.querySelectorAll(".tower-choice")).toHaveLength(0);
    view.unmount();
  });

  it("buys perks with banked gold", async () => {
    localStorage.setItem(TOWER_STORAGE_KEY, JSON.stringify({ gold: 25, best: 1, runs: 1, perks: {} }));
    const view = await mount(<TowerApp />);
    await act(async () => button(view.container, "Perks").click());
    expect(button(view.container, "Buy · 20").disabled).toBe(false);
    expect(button(view.container, "Buy · 30").disabled).toBe(true);
    expect(view.container.textContent).toContain("Wall +15 HP");
    await act(async () => button(view.container, "Buy · 20").click());
    expect(readSave()).toMatchObject({ gold: 5, perks: { fortify: 1 } });
    expect(view.container.textContent).toContain("5 gold");
    expect(view.container.textContent).toContain("Wall +15 HP → +30 HP");
    view.unmount();
  });
  it.each(["en", "ru"] as const)("continues paused with no wall-time jump or ghost firing in %s", async (lang) => {
    localStorage.setItem("lab:lang", lang);
    const checkpoint = createCheckpoint(richRun());
    writeRun(checkpoint);
    const text = TOWER_TEXT[lang];
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    const view = await mount(<TowerApp />);
    expect(view.container.textContent).toContain(text.continueHint(checkpoint.run.wave, checkpoint.run.gold));
    await act(async () => button(view.container, text.continueRun).click());
    expect(view.container.querySelector("#tower-pause-title")?.textContent).toBe(text.paused);
    await act(async () => frame?.(performance.now() + 60 * 60 * 1000));
    await press(view.container.querySelector("canvas")!, " ");
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(readRun()).toEqual({ ...checkpoint, run: { ...checkpoint.run, firing: false } });
    expect(await axeViolations(view.container)).toEqual([]);
    await act(async () => button(view.container, text.resume).click());
    await act(async () => frame?.(performance.now() + 60 * 60 * 1000 + 100));
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(readRun()?.run.waveTime).toBeGreaterThan(checkpoint.run.waveTime);
    expect(readRun()?.run.firing).toBe(false);
    view.unmount();
  });

  it("restores head-start choices paused, preserves offers and saves every pick/wave transition", async () => {
    const checkpoint = createCheckpoint(createRun(19, { ...emptyPerks(), headStart: 2 }));
    writeRun(checkpoint);
    const view = await mount(<TowerApp />);
    await act(async () => button(view.container, "Continue run").click());
    expect(view.container.querySelectorAll(".tower-choice")).toHaveLength(0);
    expect(readRun()?.run.choices).toEqual(checkpoint.run.choices);
    await act(async () => button(view.container, "Resume").click());
    expect(view.container.querySelectorAll(".tower-choice")).toHaveLength(3);
    const first = checkpoint.run.choices[0];
    await act(async () => (view.container.querySelector(".tower-choice") as HTMLButtonElement).click());
    expect(readRun()?.run).toMatchObject({ picksLeft: 1, wave: 0, phase: "choosing", upgrades: { [first]: 1 } });
    await act(async () => (view.container.querySelector(".tower-choice") as HTMLButtonElement).click());
    expect(readRun()?.run).toMatchObject({ picksLeft: 0, wave: 1, phase: "playing", choices: [] });
    view.unmount();
  });

  it("can pause and save the upgrade picker without giving up or banking rewards", async () => {
    const checkpoint = createCheckpoint(createRun(19, { ...emptyPerks(), headStart: 2 }));
    writeRun(checkpoint);
    const view = await mount(<TowerApp />);
    await act(async () => button(view.container, "Continue run").click());
    await act(async () => button(view.container, "Resume").click());
    await act(async () => (view.container.querySelector(".tower-icon-button") as HTMLButtonElement).click());
    await act(async () => button(view.container, "Save & menu").click());
    expect(view.container.querySelector("h1")?.textContent).toBe("Lone Tower");
    expect(readRun()).toEqual(checkpoint);
    expect(readSave().runs).toBe(0);
    await act(async () => button(view.container, "Continue run").click());
    expect(view.container.querySelector("#tower-pause-title")).toBeTruthy();
    view.unmount();
  });

  it("saves/pauses on hidden and pagehide, including during an upgrade choice", async () => {
    const checkpoint = createCheckpoint(createRun(19, { ...emptyPerks(), headStart: 2 }));
    writeRun(checkpoint);
    const view = await mount(<TowerApp />);
    await act(async () => button(view.container, "Continue run").click());
    await act(async () => button(view.container, "Resume").click());
    localStorage.removeItem(RUN_STORAGE_KEY);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(view.container.querySelector("#tower-pause-title")).toBeTruthy();
    expect(readRun()).toEqual(checkpoint);
    localStorage.removeItem(RUN_STORAGE_KEY);
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(readRun()).toEqual(checkpoint);
    view.unmount();
  });

  it("writes every five seconds and never writes stale state from unmount cleanup", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const view = await mount(<TowerApp />);
    await startRun(view);
    const checkpoint = readRun();
    expect(checkpoint?.run.phase).toBe("playing");
    localStorage.removeItem(RUN_STORAGE_KEY);
    await act(async () => vi.advanceTimersByTime(CHECKPOINT_MS));
    expect(readRun()).toEqual(checkpoint);
    view.unmount();
    localStorage.removeItem(RUN_STORAGE_KEY);
    await act(async () => { vi.advanceTimersByTime(CHECKPOINT_MS * 2); window.dispatchEvent(new Event("pagehide")); });
    expect(readRun()).toBeNull();
  });

  it("saves keyboard skill casts immediately", async () => {
    const checkpoint = createCheckpoint(createRun(19));
    for (let i = 0; i < 100; i += 1) step(checkpoint.run, STEP);
    writeRun(checkpoint);
    const view = await mount(<TowerApp />);
    await act(async () => button(view.container, "Continue run").click());
    await act(async () => button(view.container, "Resume").click());
    await press(view.container.querySelector("canvas")!, "1");
    await press(view.container.querySelector("canvas")!, "Enter");
    expect(readRun()?.run.skillCasts.length).toBeGreaterThan(0);
    expect(readRun()?.run.skillLeft).toBeGreaterThan(0);
    view.unmount();
  });

  it("checkpoints automatic wave clearance and the newly rolled choice set", async () => {
    const checkpoint = createCheckpoint(createRun(19));
    checkpoint.run.spawns = [];
    writeRun(checkpoint);
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    const view = await mount(<TowerApp />);
    await act(async () => button(view.container, "Continue run").click());
    await act(async () => button(view.container, "Resume").click());
    await act(async () => frame?.(performance.now() + 100));
    expect(readRun()?.run).toMatchObject({ phase: "choosing", wave: 1, picksLeft: 1, gold: 2 });
    expect(readRun()?.run.choices).toHaveLength(3);
    expect(view.container.querySelectorAll(".tower-choice")).toHaveLength(3);
    view.unmount();
  });

  it("requires confirmation to replace or discard, and never banks discarded gold", async () => {
    const checkpoint = createCheckpoint(richRun());
    writeRun(checkpoint);
    writeSave({ ...defaultSave(), gold: 50, best: 8, runs: 3 });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = await mount(<TowerApp />);
    await startRun(view);
    expect(readRun()).toEqual(checkpoint);
    expect(view.container.querySelector("canvas")).toBeNull();
    await act(async () => button(view.container, "Discard saved run").click());
    expect(readRun()).toEqual(checkpoint);
    confirm.mockReturnValue(true);
    await act(async () => button(view.container, "Discard saved run").click());
    expect(readRun()).toBeNull();
    expect(readSave()).toMatchObject({ gold: 50, best: 8, runs: 3 });
    await startRun(view);
    expect(readRun()?.id).not.toBe(checkpoint.id);
    expect(readRun()?.run.wave).toBe(1);
    view.unmount();
  });

  it("allows an explicitly confirmed replacement without modifying permanent progress", async () => {
    const checkpoint = createCheckpoint(richRun());
    writeRun(checkpoint);
    const before = { ...defaultSave(), gold: 42, best: 10, runs: 4 };
    writeSave(before);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const view = await mount(<TowerApp />);
    await startRun(view);
    expect(readRun()?.id).not.toBe(checkpoint.id);
    expect(readRun()?.run.gold).toBe(0);
    expect(readSave()).toEqual(before);
    view.unmount();
  });

  it("keeps newly bought perks separate from a suspended run's combat stats", async () => {
    writeSave({ ...defaultSave(), gold: 50 });
    const checkpoint = createCheckpoint(createRun(19));
    writeRun(checkpoint);
    const view = await mount(<TowerApp />);
    await act(async () => button(view.container, "Perks").click());
    expect(view.container.textContent).toContain("New perks apply to new runs");
    await act(async () => button(view.container, "Buy · 20").click());
    expect(readSave().perks.fortify).toBe(1);
    await act(async () => button(view.container, "Back").click());
    await act(async () => button(view.container, "Continue run").click());
    expect(readRun()?.run.perks.fortify).toBe(0);
    expect(view.container.querySelector('[role="meter"]')?.getAttribute("aria-valuemax")).toBe("100");
    view.unmount();
  });

  it("settles a retreat once and doesn't resurrect a terminal run on pagehide or replay", async () => {
    const checkpoint = createCheckpoint(richRun());
    writeRun(checkpoint);
    const view = await mount(<TowerApp />);
    await act(async () => button(view.container, "Continue run").click());
    await act(async () => button(view.container, "Give up").click());
    expect(view.container.querySelector("#tower-over-title")?.textContent).toBe("You left the tower");
    const paid = readSave();
    expect(paid).toMatchObject({ gold: checkpoint.run.gold, best: 20, runs: 1, settledRunIds: [checkpoint.id] });
    expect(readRun()).toBeNull();
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(readRun()).toBeNull();
    expect(readSave()).toEqual(paid);
    await startRun(view, "catapult", "Play again");
    expect(readRun()?.id).not.toBe(checkpoint.id);
    expect(view.container.querySelector("#tower-over-title")).toBeNull();
    view.unmount();
  });

  it("settles a natural death once even when more animation callbacks arrive", async () => {
    const checkpoint = createCheckpoint(createRun(99));
    const enemy = { ...richRun().enemies[0], id: 1, x: 30, y: 560 - richRun().enemies[0].radius, attackTimer: 0 };
    Object.assign(checkpoint.run, { hp: 1, gold: 13, spawns: [], enemies: [enemy], nextId: 2 });
    writeRun(checkpoint);
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    const view = await mount(<TowerApp />);
    await act(async () => button(view.container, "Continue run").click());
    await act(async () => button(view.container, "Resume").click());
    await act(async () => frame?.(performance.now() + 100));
    expect(view.container.querySelector("#tower-over-title")?.textContent).toBe("The tower fell");
    expect(readSave()).toMatchObject({ gold: 13, runs: 1 });
    expect(readRun()).toBeNull();
    await act(async () => { frame?.(performance.now() + 200); window.dispatchEvent(new Event("pagehide")); });
    expect(readSave()).toMatchObject({ gold: 13, runs: 1 });
    expect(readRun()).toBeNull();
    view.unmount();
  });

  it("recovers terminal results at startup and suppresses an already-paid active checkpoint", async () => {
    const checkpoint = createCheckpoint(richRun());
    giveUp(checkpoint.run);
    writeRun(checkpoint);
    const view = await mount(<TowerApp />);
    expect(view.container.querySelector(".tower-continue")).toBeNull();
    expect(readSave()).toMatchObject({ gold: checkpoint.run.gold, runs: 1, settledRunIds: [checkpoint.id] });
    expect(readRun()).toBeNull();
    view.unmount();
    checkpoint.run.phase = "playing";
    writeRun(checkpoint);
    const again = await mount(<TowerApp />);
    expect(again.container.querySelector(".tower-continue")).toBeNull();
    expect(readRun()).toBeNull();
    expect(readSave().runs).toBe(1);
    again.unmount();
  });

  it("blocks new runs/perk purchases until pending rewards can be saved, then retries once", async () => {
    const checkpoint = createCheckpoint(richRun());
    giveUp(checkpoint.run);
    writeRun(checkpoint);
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === TOWER_STORAGE_KEY) throw Error("quota");
      original.call(this, key, value);
    });
    const view = await mount(<TowerApp />);
    expect(view.container.querySelector(".tower-save-warning")).toBeTruthy();
    expect(button(view.container, "Perks").disabled).toBe(true);
    await startRun(view);
    expect(view.container.querySelector("canvas")).toBeNull();
    expect(readRun()?.run.phase).toBe("over");
    vi.mocked(Storage.prototype.setItem).mockRestore();
    await act(async () => button(view.container, "Retry saving").click());
    expect(readSave()).toMatchObject({ gold: checkpoint.run.gold, runs: 1 });
    expect(readRun()).toBeNull();
    expect(button(view.container, "Perks").disabled).toBe(false);
    await startRun(view);
    expect(readRun()?.run.phase).toBe("playing");
    expect(readSave().runs).toBe(1);
    view.unmount();
  });

  it("ignores corrupt checkpoints without losing existing gold or perks", async () => {
    writeSave({ ...defaultSave(), gold: 50, perks: { ...emptyPerks(), fortify: 1 } });
    localStorage.setItem(RUN_STORAGE_KEY, "{bad");
    const view = await mount(<TowerApp />);
    expect(view.container.querySelector(".tower-continue")).toBeNull();
    expect(readRun()).toBeNull();
    expect(readSave()).toMatchObject({ gold: 50, perks: { fortify: 1 } });
    view.unmount();
  });

  it("does not silently overwrite an unreadable run and can recover it with Retry", async () => {
    const checkpoint = createCheckpoint(createRun(19));
    writeRun(checkpoint);
    const original = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      if (key === RUN_STORAGE_KEY) throw Error("blocked read");
      return original.call(this, key);
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = await mount(<TowerApp />);
    expect(view.container.querySelector(".tower-save-warning")).toBeTruthy();
    await startRun(view);
    expect(confirm).toHaveBeenCalledWith(TOWER_TEXT.en.unknownRunConfirm);
    expect(view.container.querySelector("canvas")).toBeNull();
    vi.mocked(Storage.prototype.getItem).mockRestore();
    expect(readRun()).toEqual(checkpoint);
    await act(async () => button(view.container, "Retry saving").click());
    expect(button(view.container, "Continue run")).toBeTruthy();
    expect(view.container.querySelector(".tower-save-warning")).toBeNull();
    view.unmount();
  });

  it("never overwrites unknown reward receipts with a perk purchase", async () => {
    const raw = JSON.stringify({ gold: 90, best: 9, runs: 2, settledRunIds: "broken" });
    localStorage.setItem(TOWER_STORAGE_KEY, raw);
    const view = await mount(<TowerApp />);
    await act(async () => button(view.container, "Perks").click());
    await act(async () => button(view.container, "Buy · 20").click());
    expect(localStorage.getItem(TOWER_STORAGE_KEY)).toBe(raw);
    expect(view.container.querySelector(".tower-save-warning")).toBeTruthy();
    view.unmount();
  });

  it("does not charge or apply a perk when its storage write fails", async () => {
    writeSave({ ...defaultSave(), gold: 90 });
    const view = await mount(<TowerApp />);
    await act(async () => button(view.container, "Perks").click());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("quota"); });
    await act(async () => button(view.container, "Buy · 20").click());
    expect(readSave()).toMatchObject({ gold: 90, perks: { fortify: 0 } });
    expect(view.container.textContent).toContain("90 gold");
    expect(button(view.container, "Buy · 20").disabled).toBe(false);
    view.unmount();
  });

  it("keeps ordinary play usable when checkpoint writes are blocked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("quota"); });
    const view = await mount(<TowerApp />);
    await startRun(view);
    expect(view.container.querySelector("canvas")).toBeTruthy();
    expect(view.container.querySelector(".tower-save-warning")?.textContent).toContain("Saving is unavailable");
    await act(async () => (view.container.querySelector(".tower-icon-button") as HTMLButtonElement).click());
    expect(button(view.container, "Save & menu")).toBeTruthy();
    view.unmount();
  });

});
