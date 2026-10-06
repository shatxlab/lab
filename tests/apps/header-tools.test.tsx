// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import CommandPalette from "@/components/apps/CommandPalette";
import SettingsButton from "@/components/apps/SettingsButton";
import { axeViolations, click, mount, press, type, waitFor } from "../helpers/dom";

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  document.body.style.overflow = "";
});

describe("CommandPalette", () => {
  it("opens with Ctrl+K, filters tools and is accessible", async () => {
    const view = await mount(<CommandPalette />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await press(window, "k", { ctrlKey: true });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(document.activeElement?.getAttribute("role")).toBe("combobox");

    const input = document.querySelector<HTMLInputElement>('[role="combobox"]');
    await type(input, "pdf");
    const options = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(options.some((text) => text?.includes("PDF tools"))).toBe(true);
    expect(options.some((text) => text?.includes("EPUB reader"))).toBe(false);

    expect(await axeViolations()).toEqual([]);

    await press(input!, "Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    view.unmount();
  });

  it("finds Russian titles through English keywords", async () => {
    const view = await mount(<CommandPalette />);
    await press(window, "k", { ctrlKey: true });
    await type(document.querySelector('[role="combobox"]'), "crossword");
    expect(document.querySelector('[role="option"]')?.textContent).toContain("Crossword");
    view.unmount();
  });

  it("runs an action: switching language", async () => {
    const view = await mount(<CommandPalette />);
    await press(window, "k", { ctrlKey: true });
    await type(document.querySelector('[role="combobox"]'), "switch language");
    const input = document.querySelector('[role="combobox"]')!;
    await press(input, "Enter");
    expect(localStorage.getItem("lab:lang")).toBe("ru");
    view.unmount();
  });
});

describe("SettingsButton", () => {
  it("imports a backup with merge and reloads", async () => {
    localStorage.setItem("lab:keep", "1");
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, writable: true });

    const view = await mount(<SettingsButton />);
    await click(document.querySelector("button[aria-haspopup='dialog']"));
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(await axeViolations()).toEqual([]);

    const file = new File(
      [JSON.stringify({ format: "lab-backup", version: 1, data: { "lab:lang": "ru", "lab:crossword:v1": "{}" } })],
      "backup.json",
    );
    Object.defineProperty(file, "text", { value: async () => JSON.stringify({ format: "lab-backup", version: 1, data: { "lab:lang": "ru", "lab:crossword:v1": "{}" } }) });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await vi.waitFor(async () => {
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await waitFor(() => expect(document.body.textContent).toContain("Backup contains 2 items"));

    const apply = [...document.querySelectorAll("button")].find((b) => b.textContent === "Import");
    await click(apply);
    expect(localStorage.getItem("lab:lang")).toBe("ru");
    expect(localStorage.getItem("lab:keep")).toBe("1");
    await waitFor(() => expect(reload).toHaveBeenCalled());
    view.unmount();
  });

  it("shows an error for a foreign file", async () => {
    const view = await mount(<SettingsButton />);
    await click(document.querySelector("button[aria-haspopup='dialog']"));
    const file = new File(["{}"], "x.json");
    Object.defineProperty(file, "text", { value: async () => "{}" });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => expect(document.body.textContent).toContain("not a Local Lab backup"));
    view.unmount();
  });
});
