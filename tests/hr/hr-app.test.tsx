// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HrApp from "@/components/hr/HrApp";
import { createRun } from "@/lib/hr/sim/run";
import { readRun, RUN_STORAGE_KEY } from "@/lib/hr/snapshot";
import { starters } from "@/lib/roster/generate";
import { ROSTER_STORAGE_KEY } from "@/lib/roster/save";
import { mount } from "../helpers/dom";

beforeEach(() => {
  // No frames: the loop is started but never ticks, so the screen stays put.
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 0));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  // No sprite sheet: the hero is drawn as a plain figure.
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function buttons(container: HTMLElement, name: string): HTMLButtonElement[] {
  return [...container.querySelectorAll("button")].filter((element) => element.textContent?.trim() === name);
}

describe("HrApp", () => {
  it("opens on the menu with the three starters, and keeps the roster it dealt", async () => {
    const view = await mount(<HrApp />);
    expect(view.container.querySelector("h1")?.textContent).toBe("HR Department");
    const names = [...view.container.querySelectorAll(".hr-card-name")].map((element) => element.textContent);
    expect(names).toEqual(starters().map((coworker) => coworker.name));
    expect(view.container.textContent).toContain("Steals lunches");
    expect(localStorage.getItem(ROSTER_STORAGE_KEY)).not.toBeNull();
    view.unmount();
  });

  it("speaks Russian when the site does", async () => {
    localStorage.setItem("lab:lang", "ru");
    const view = await mount(<HrApp />);
    expect(view.container.querySelector("h1")?.textContent).toBe("Отдел кадров");
    view.unmount();
  });

  it("sends a coworker in, saving the run, and ends it on walking out", async () => {
    const view = await mount(<HrApp />);
    await act(async () => buttons(view.container, "Send in")[1].click());
    expect(view.container.querySelector("canvas.tower-canvas")).toBeTruthy();
    expect(view.container.textContent).toContain("Middle Manager in 2:30");
    expect(readRun()?.coworkerId).toBe(2);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    await act(async () => buttons(view.container, "Walk out")[0].click());
    expect(view.container.textContent).toContain("Walked out");
    expect(localStorage.getItem(RUN_STORAGE_KEY)).toBeNull();
    view.unmount();
  });

  it("offers to continue a saved run", async () => {
    const run = createRun(starters()[0], 5);
    run.time = 95;
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(run));
    const view = await mount(<HrApp />);
    expect(view.container.textContent).toContain("Kenji Dubois, at 1:35");
    await act(async () => buttons(view.container, "Continue the run")[0].click());
    expect(view.container.textContent).toContain("1:35");
    view.unmount();
  });
});
