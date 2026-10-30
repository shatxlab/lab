// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HrApp from "@/components/hr/HrApp";
import { createRun } from "@/lib/hr/sim/run";
import { CAREER_STORAGE_KEY, readCareer } from "@/lib/hr/career";
import { readRun, RUN_STORAGE_KEY } from "@/lib/hr/snapshot";
import { starters } from "@/lib/roster/generate";
import { readSave, ROSTER_STORAGE_KEY } from "@/lib/roster/save";
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
  it("opens on the menu asking who to grow, with the three starters, and keeps the roster it dealt", async () => {
    const view = await mount(<HrApp />);
    expect(view.container.querySelector("h1")?.textContent).toBe("HR Department");
    expect(view.container.textContent).toContain("Who will you grow?");
    const names = [...view.container.querySelectorAll(".hr-card-name")].map((element) => element.textContent);
    expect(names).toEqual(starters().map((coworker) => coworker.name));
    expect(view.container.textContent).toContain("Steals lunches");
    expect(localStorage.getItem(ROSTER_STORAGE_KEY)).not.toBeNull();
    view.unmount();
  });

  it("starts a career with one starter and shows only them, on day 1", async () => {
    const view = await mount(<HrApp />);
    await act(async () => buttons(view.container, "Start career")[1].click());
    expect(readCareer().focusId).toBe(2);
    const names = [...view.container.querySelectorAll(".hr-card-name")].map((element) => element.textContent);
    expect(names).toEqual([starters()[1].name]);
    expect(view.container.textContent).toContain("Day 1");
    expect(view.container.textContent).toContain("Trainee · Level 1");
    view.unmount();
  });

  it("speaks Russian when the site does", async () => {
    localStorage.setItem("lab:lang", "ru");
    const view = await mount(<HrApp />);
    expect(view.container.querySelector("h1")?.textContent).toBe("Отдел кадров");
    view.unmount();
  });

  it("sends the focus in, and a walk-out still moves the day on and saves the gold", async () => {
    localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify({ focusId: 2, gold: 7 }));
    const view = await mount(<HrApp />);
    await act(async () => buttons(view.container, "Go to work")[0].click());
    expect(view.container.querySelector("canvas.tower-canvas")).toBeTruthy();
    expect(view.container.textContent).toContain("Middle Manager in 2:30");
    expect(readRun()?.coworkerId).toBe(2);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    await act(async () => buttons(view.container, "Walk out")[0].click());
    expect(view.container.textContent).toContain("Walked out");
    expect(view.container.textContent).toContain("+0 review XP");
    expect(localStorage.getItem(RUN_STORAGE_KEY)).toBeNull();
    expect(readSave().day).toBe(1);
    expect(readCareer()).toEqual({ focusId: 2, gold: 7 });
    view.unmount();
  });

  it("starts a new career after confirming", async () => {
    localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify({ focusId: 1, gold: 40 }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const view = await mount(<HrApp />);
    await act(async () => buttons(view.container, "Start a new career")[0].click());
    expect(view.container.textContent).toContain("Who will you grow?");
    expect(readCareer()).toEqual({ focusId: null, gold: 0 });
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
