// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TowerApp from "@/components/tower/TowerApp";
import { readSave, TOWER_STORAGE_KEY } from "@/lib/tower/meta";
import { mount } from "../helpers/dom";

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

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find((element) => element.textContent?.trim() === name);
  if (!match) throw new Error(`no button "${name}"`);
  return match;
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
    await act(async () => button(view.container, "Play").click());
    expect(view.container.querySelector("canvas")).toBeTruthy();
    expect(view.container.textContent).toContain("Wave 1");
    expect(view.container.querySelector('[role="meter"]')?.getAttribute("aria-valuenow")).toBe("100");
    view.unmount();
  });

  it("arms the volley from its button", async () => {
    const view = await mount(<TowerApp />);
    await act(async () => button(view.container, "Play").click());
    const volley = button(view.container, "Volley");
    expect(volley.disabled).toBe(false);
    await act(async () => volley.click());
    expect(volley.getAttribute("aria-pressed")).toBe("true");
    expect(volley.textContent).toBe("Tap the field to drop it");
    await act(async () => volley.click());
    expect(volley.getAttribute("aria-pressed")).toBe("false");
    view.unmount();
  });

  it("opens a run with a head start on the upgrade picker", async () => {
    localStorage.setItem(TOWER_STORAGE_KEY, JSON.stringify({ gold: 0, best: 0, runs: 0, perks: { headStart: 1 } }));
    const view = await mount(<TowerApp />);
    await act(async () => button(view.container, "Play").click());
    const choices = view.container.querySelectorAll(".tower-choice");
    expect(choices).toHaveLength(3);
    await act(async () => (choices[0] as HTMLButtonElement).click());
    expect(view.container.querySelectorAll(".tower-choice")).toHaveLength(0);
    view.unmount();
  });

  it("buys perks with banked gold", async () => {
    localStorage.setItem(TOWER_STORAGE_KEY, JSON.stringify({ gold: 20, best: 1, runs: 1, perks: {} }));
    const view = await mount(<TowerApp />);
    await act(async () => button(view.container, "Perks").click());
    expect(button(view.container, "Buy · 20").disabled).toBe(false);
    expect(button(view.container, "Buy · 60").disabled).toBe(true);
    await act(async () => button(view.container, "Buy · 15").click());
    expect(readSave()).toMatchObject({ gold: 5, perks: { fortify: 1 } });
    expect(view.container.textContent).toContain("5 gold");
    view.unmount();
  });
});
