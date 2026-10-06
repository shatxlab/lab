// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import TextTools from "@/components/tools/TextTools";
import { axeViolations, click, mount, type, waitFor } from "../helpers/dom";

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

const tab = (name: string) => [...document.querySelectorAll('[role="tab"]')].find((node) => node.textContent === name) as HTMLElement;
const textareaByLabel = (label: string) =>
  [...document.querySelectorAll("label")].find((node) => node.textContent?.startsWith(label))?.querySelector("textarea") as HTMLTextAreaElement;

describe("TextTools", () => {
  it("compares two texts", async () => {
    const view = await mount(<TextTools />);
    expect(document.body.textContent).toContain("Paste two texts");
    await type(textareaByLabel("Original"), "one\ntwo\nthree");
    await type(textareaByLabel("Modified"), "one\n2\nthree");
    expect(document.body.textContent).toContain("1 added, 1 removed");
    expect(await axeViolations()).toEqual([]);

    await click([...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Swap sides")));
    expect(textareaByLabel("Original").value).toBe("one\n2\nthree");
    await click([...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Clear")));
    expect(document.body.textContent).toContain("Paste two texts");
    view.unmount();
  });

  it("counts words and characters", async () => {
    const view = await mount(<TextTools />);
    await click(tab("Count"));
    await type(textareaByLabel("Text to analyse"), "Hello world. Hello again!");
    await waitFor(() => {
      const stats = Object.fromEntries([...document.querySelectorAll("dl > div")].map((row) => [row.querySelector("dt")!.textContent, row.querySelector("dd")!.textContent]));
      expect(stats["Words"]).toBe("4");
      expect(stats["Sentences"]).toBe("2");
      expect(stats["Characters"]).toBe("25");
    });
    expect(document.body.textContent).toContain("hello");
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("converts case and reuses the result", async () => {
    const view = await mount(<TextTools />);
    await click(tab("Case"));
    await type(textareaByLabel("Text to convert"), "hello big world");
    await click([...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent === "snake_case"));
    expect(textareaByLabel("Result").value).toBe("hello_big_world");
    await click([...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Use result as input")));
    expect(textareaByLabel("Text to convert").value).toBe("hello_big_world");
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("tests a regular expression, highlights and replaces", async () => {
    const view = await mount(<TextTools />);
    await click(tab("Regex"));
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === "Try an example"));
    await waitFor(() => expect(document.body.textContent).toContain("2 matches"));
    expect(document.querySelectorAll("mark").length).toBe(2);
    expect(document.body.textContent).toContain("example.com ← bob");
    expect(document.body.textContent).toContain("Group 1");
    expect(await axeViolations()).toEqual([]);

    await type(document.querySelector<HTMLInputElement>('input[placeholder^="("]'), "(");
    await waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain("Invalid pattern"));
    view.unmount();
  });
});
