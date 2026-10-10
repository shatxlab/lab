// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import WorkbenchApp from "@/components/workbench/WorkbenchApp";
import { axeViolations, mount, waitFor } from "../helpers/dom";

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

async function addTextFile(name: string, contents: string) {
  const input = fileInput();
  const file = new File([contents], name, { type: "text/plain" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe.each([["en"], ["ru"]] as const)("accessibility of the workbench shell (%s)", (lang) => {
  it("has no detectable violations on the empty screen with its starters", async () => {
    localStorage.setItem("lab:lang", lang);
    const view = await mount(<WorkbenchApp />);
    await waitFor(() => expect(document.querySelector('[aria-labelledby="wb-starters"]')).toBeTruthy());
    expect(await axeViolations(view.container)).toEqual([]);
    view.unmount();
  }, 40_000);

  it("has no detectable violations once a text file is open", async () => {
    localStorage.setItem("lab:lang", lang);
    const view = await mount(<WorkbenchApp />);
    await addTextFile("note.txt", "hello world");
    await waitFor(() => {
      expect(view.container.firstElementChild).toBeTruthy();
      expect(document.body.textContent).toContain("note.txt");
    });
    expect(await axeViolations(view.container)).toEqual([]);
    view.unmount();
  }, 40_000);
});
