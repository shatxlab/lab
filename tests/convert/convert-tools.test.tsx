// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import ConvertTools from "@/components/tools/ConvertTools";
import { axeViolations, click, mount, type, waitFor } from "../helpers/dom";

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

const tab = (name: string) => [...document.querySelectorAll('[role="tab"]')].find((node) => node.textContent === name) as HTMLElement;
const field = (label: string, selector = "textarea") =>
  [...document.querySelectorAll("label")].find((node) => node.textContent?.trim().startsWith(label))?.querySelector(selector) as HTMLTextAreaElement & HTMLInputElement & HTMLSelectElement;
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLElement;

describe("ConvertTools", () => {
  it("converts JSON to YAML, detects the format and reports errors", async () => {
    const view = await mount(<ConvertTools />);
    await type(field("Input"), '{"name":"lab","tags":["a","b"]}');
    await waitFor(() => expect(field("Output").value).toContain("name: lab"));
    expect(document.body.textContent).toContain("Detected: JSON");
    expect(await axeViolations()).toEqual([]);

    await type(field("Input"), '{"broken": ');
    await waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain("Could not read the input"));
    expect(field("Output").value).toBe("");

    await type(field("Input"), '{"a":null}');
    await act(async () => {
      field("To", "select").value = "toml";
      field("To", "select").dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain("no null"));
    view.unmount();
  });

  it("swaps input and output", async () => {
    const view = await mount(<ConvertTools />);
    await type(field("Input"), '{"a":1}');
    await waitFor(() => expect(field("Output").value).toBe("a: 1\n"));
    await click(button("Swap"));
    await waitFor(() => expect(field("Input").value).toBe("a: 1\n"));
    await waitFor(() => expect(field("Output").value).toContain('"a": 1'));
    view.unmount();
  });

  it("encodes and decodes Base64", async () => {
    const view = await mount(<ConvertTools />);
    await click(tab("Base64 · URL"));
    await type(field("Text"), "Привет");
    await waitFor(() => expect(field("Output").value).toBe("0J/RgNC40LLQtdGC"));
    await click(button("Decode"));
    await type(field("Text"), "0J/RgNC40LLQtdGC");
    await waitFor(() => expect(field("Output").value).toBe("Привет"));
    await type(field("Text"), "!!!");
    await waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain("not valid Base64"));
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("hashes text and verifies a known hash", async () => {
    const view = await mount(<ConvertTools />);
    await click(tab("Hash"));
    await type(field("Text to hash"), "abc");
    await waitFor(() => expect(document.body.textContent).toContain("900150983cd24fb0d6963f7d28e17f72"));
    expect(document.body.textContent).toContain("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    await type(field("Compare with a known hash", "input"), "A9993E364706816ABA3E25717850C26C9CD0D89D");
    await waitFor(() => expect([...document.querySelectorAll('[role="status"]')].map((n) => n.textContent).join(" ")).toContain("Matches SHA-1"));
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("generates and inspects UUIDs", async () => {
    const view = await mount(<ConvertTools />);
    await click(tab("UUID"));
    await waitFor(() => expect(field("Generated UUIDs").value.split("\n")).toHaveLength(5));
    const first = field("Generated UUIDs").value.split("\n")[0]!;
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    await type(document.querySelector<HTMLInputElement>('input[aria-label="UUID to inspect"]'), first);
    await waitFor(() => expect(document.body.textContent).toContain("Version 4"));
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });
});

import { act } from "react";
