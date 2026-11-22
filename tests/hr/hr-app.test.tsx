// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HrApp from "@/components/hr/HrApp";
import { createRun } from "@/lib/hr/sim/run";
import { CAREER_STORAGE_KEY, defaultCareer, readCareer } from "@/lib/hr/career";
import { HR_TEXT } from "@/lib/hr/i18n";
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
  it("starts new players with the Intern automatically and persists that career", async () => {
    const view = await mount(<HrApp />);
    expect(view.container.querySelector("h1")?.textContent).toBe("HR Department");
    expect(buttons(view.container, "Start career")).toHaveLength(0);
    const names = [...view.container.querySelectorAll(".hr-card-name")].map((element) => element.textContent);
    expect(names).toEqual([starters()[0].name]);
    expect(readCareer()).toEqual({ ...defaultCareer(), focusId: 1, owned: [1] });
    expect(view.container.textContent).toContain("Day 1");
    expect(view.container.textContent).toContain("Trainee · Level 1");
    expect(localStorage.getItem(ROSTER_STORAGE_KEY)).not.toBeNull();
    view.unmount();
  });

  it("keeps an existing non-Intern career, savings, and roster unchanged, dropping legacy pack fields", async () => {
    const career = { focusId: 2, owned: [2, 3], sealed: [], stage: "kitchen", gold: 1234, kit: [] };
    const roster = readSave();
    roster.day = 12;
    roster.coworkers[1].level = 8;
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(roster));
    localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify(career));
    const view = await mount(<HrApp />);
    expect(readCareer()).toEqual({ ...defaultCareer(), focusId: 2, owned: [2, 3], gold: 1234 });
    expect(readSave()).toEqual(roster);
    expect(view.container.textContent).toContain("Day 13");
    expect(view.container.querySelector(".hr-card-name")?.textContent).toBe(starters()[1].name);
    view.unmount();
  });

  it("speaks Russian when the site does", async () => {
    localStorage.setItem("lab:lang", "ru");
    const view = await mount(<HrApp />);
    expect(view.container.querySelector("h1")?.textContent).toBe("Отдел кадров");
    view.unmount();
  });

  it.each(["en", "ru"] as const)("shows one hero, no packs, no stage choice, and a top-left way home in %s", async (lang) => {
    localStorage.setItem("lab:lang", lang);
    const view = await mount(<HrApp />);
    expect(view.container.querySelector(".hr-pack")).toBeNull();
    expect(view.container.querySelector(".hr-stages")).toBeNull();
    expect(buttons(view.container, "Make focus")).toHaveLength(0);
    expect(buttons(view.container, "Interview")).toHaveLength(0);
    const home = view.container.querySelector("a.tower-home");
    expect(home).toBeTruthy();
    expect(home?.textContent).toBe(HR_TEXT[lang].home);
    view.unmount();
  });

  it.each(["en", "ru"] as const)("explains inactive HR effects on cards and in expandable help in %s", async (lang) => {
    localStorage.setItem("lab:lang", lang);
    const roster = readSave();
    roster.coworkers[0].quirks = ["loyal", "unionRep"];
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(roster));
    const view = await mount(<HrApp />);
    const text = HR_TEXT[lang];
    const lines = [...view.container.querySelectorAll(".hr-card-quirk")].map((element) => element.textContent);
    expect(lines[0]).toContain(text.inactiveEffects(text.effects.quitChance));
    expect(lines[0]).toContain(lang === "en" ? "−10% speed" : "−10% скорости");
    expect(lines[0]).not.toContain("50%");
    expect(lines[1]).toContain(text.noActiveQuirk);
    expect(lines[1]).not.toMatch(/10%|15%/);
    const help = view.container.querySelector(".hr-trait-help");
    expect(help?.querySelector("summary")?.textContent).toBe(text.traitHelpTitle);
    expect(help?.querySelector("p")?.textContent).toBe(text.traitHelp);
    expect(readSave().coworkers[0].quirks).toEqual(["loyal", "unionRep"]);
    view.unmount();
  });

  it.each(["en", "ru"] as const)("explains duck contact on an Engineering card in %s", async (lang) => {
    localStorage.setItem("lab:lang", lang);
    const roster = readSave();
    roster.coworkers[0].department = "engineering";
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(roster));
    const view = await mount(<HrApp />);
    expect(view.container.querySelector(".hr-card-body")?.textContent).toContain(HR_TEXT[lang].weapons.rubberDuck.description);
    // The card's stat block is the meal, not the recipe: derived lines, not raw stat numbers.
    const card = view.container.querySelector(".hr-card-stats")?.textContent ?? "";
    expect(card).toContain(HR_TEXT[lang].cardStats({ hp: 100, damage: 0, speed: 0, rate: 0, gold: 0, loot: 0 })[0].label);
    expect(card).not.toContain(HR_TEXT[lang].stats.grit);
    view.unmount();
  });

  it("sends the hero in, and a walk-out still moves the day on and preserves the class and archived gear", async () => {
    localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify({ focusId: 2, owned: [2], gold: 7, classId: "fieldRep", build: { weapons: { serverRack: 4 } } }));
    const view = await mount(<HrApp />);
    await act(async () => buttons(view.container, "Go to work")[0].click());
    expect(view.container.querySelector("canvas.tower-canvas")).toBeTruthy();
    expect(view.container.textContent).toContain("Middle Manager in 0:16");
    expect(readRun()?.coworkerId).toBe(2);
    expect(readRun()?.level).toBe(1);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    await act(async () => buttons(view.container, "Walk out")[0].click());
    expect(view.container.textContent).toContain("Walked out");
    expect(localStorage.getItem(RUN_STORAGE_KEY)).toBeNull();
    expect(readSave().day).toBe(1);
    expect(readCareer()).toEqual({ ...defaultCareer(), focusId: 2, owned: [2], gold: 7, classId: "fieldRep", build: { weapons: { serverRack: 4, spreadsheet: 1 }, passives: {} }, slump: 1 });
    view.unmount();
  });

  it("sends the hero in at the starting screen's level, and the day's loot lands on the desk", async () => {
    const roster = readSave();
    roster.coworkers[0] = { ...roster.coworkers[0], level: 6 };
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(roster));
    localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify({ focusId: 1, owned: [1], gold: 0, classId: "systems", kit: [{ id: "redPen", level: 1, floor: 20 }] }));
    const view = await mount(<HrApp />);
    await act(async () => buttons(view.container, "Go to work")[0].click());
    expect(readRun()?.level).toBe(6);
    expect(readRun()?.kit).toEqual([{ id: "redPen", level: 1, floor: 20 }]);
    view.unmount();
  });

  it("offers a perk after a promotion, keeps the same offer, and records the choice", async () => {
    const save = readSave();
    save.coworkers[0] = { ...save.coworkers[0], level: 6 };
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(save));
    localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify({ focusId: 1, owned: [1], gold: 0, kit: [] }));
    const view = await mount(<HrApp />);
    expect(view.container.querySelector(".hr-perks")?.textContent).toContain("Promotion!");
    const offered = [...view.container.querySelectorAll(".hr-perks button strong")].map((element) => element.textContent);
    expect(offered).toHaveLength(3);
    await act(async () => (view.container.querySelector(".hr-perks button") as HTMLButtonElement).click());
    expect(readSave().coworkers[0].perks).toHaveLength(1);
    expect(view.container.querySelector(".hr-perks")).toBeNull();
    expect(view.container.textContent).toContain(`Perks: ${offered[0]}`);
    view.unmount();
  });

  it("starts a new career after confirming", async () => {
    localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify({ focusId: 1, owned: [1], gold: 40 }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const view = await mount(<HrApp />);
    await act(async () => buttons(view.container, "Start a new career")[0].click());
    expect(readCareer()).toEqual({ ...defaultCareer(), focusId: 1, owned: [1] });
    view.unmount();
  });

  it("preserves a legacy non-Intern suspended run without an established career", async () => {
    const run = createRun(starters()[2], 5);
    run.time = 95;
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify({ ...run, version: 12, classId: undefined }));
    const view = await mount(<HrApp />);
    expect(readCareer().focusId).toBe(3);
    expect(view.container.querySelector(".hr-class-picker")).toBeNull();
    expect(readRun()).toEqual(run);
    await act(async () => buttons(view.container, "Continue the run")[0].click());
    expect(view.container.textContent).toContain("1:35");
    view.unmount();
  });

  it.each(["en", "ru"] as const)("selects a class and previews the migrated build before committing in %s", async (lang) => {
    localStorage.setItem("lab:lang", lang);
    localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify({ build: { weapons: { serverRack: 4, policyBinder: 2 } } }));
    const text = HR_TEXT[lang];
    const view = await mount(<HrApp />);
    const start = buttons(view.container, text.goToWork)[0];
    expect(start.disabled).toBe(true);
    expect(view.container.querySelectorAll('input[type="radio"]')).toHaveLength(3);
    await act(async () => view.container.querySelector<HTMLInputElement>('input[value="systems"]')?.click());
    expect(view.container.querySelector(".hr-class-picker")?.textContent).toContain(`${text.classArchived}: ${text.weapons.policyBinder.name}`);
    expect(readCareer().classId).toBeNull();
    expect(start.disabled).toBe(false);
    await act(async () => start.click());
    expect(readCareer().classId).toBe("systems");
    expect(readRun()?.classId).toBe("systems");
    expect(readRun()?.weapons.map((weapon) => weapon.id)).toEqual(["stickyNotes", "serverRack"]);
    expect(view.container.querySelector(".hr-skill-button")).toBeNull();
    view.unmount();
  });

  it.each([false, true])("uses the hero card's single run button (saved run: %s)", async (hasSave) => {
    const run = createRun(starters()[0], 5);
    run.time = 95;
    if (hasSave) localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(run));
    else localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify({ classId: "fieldRep" }));
    const view = await mount(<HrApp />);
    const label = hasSave ? "Continue the run" : "Go to work";
    const other = hasSave ? "Go to work" : "Continue the run";
    const actions = buttons(view.container, label);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toBe(view.container.querySelector(".hr-hero .hr-card-send"));
    expect(buttons(view.container, other)).toHaveLength(0);
    if (hasSave) expect(view.container.textContent).toContain("Kenji Dubois, at 1:35");
    await act(async () => actions[0].click());
    expect(view.container.querySelector("canvas.tower-canvas")).toBeTruthy();
    if (hasSave) {
      expect(view.container.textContent).toContain("1:35");
      expect(readRun()).toEqual(run);
    } else {
      expect(readRun()?.time).toBe(0);
    }
    view.unmount();
  });
});
