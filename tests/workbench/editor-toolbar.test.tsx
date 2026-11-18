// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorToolbar, type EditorToolbarProps } from "@/components/workbench/EditorToolbar";
import type { EditFormat } from "@/lib/workbench/editor";
import { wb } from "@/lib/workbench/i18n";
import { click, mount, waitFor } from "../helpers/dom";

const FORMATS: readonly EditFormat[] = [
  { id: "txt", extension: "txt", mime: "text/plain" },
  { id: "md", extension: "md", mime: "text/markdown", label: { en: "Markdown", ru: "Markdown" } },
];

function makeProps(overrides: Partial<EditorToolbarProps> = {}): EditorToolbarProps {
  return {
    lang: "en",
    dirty: false,
    canUndo: false,
    canRedo: false,
    formats: FORMATS.slice(0, 1),
    activeFormat: "txt",
    onSave: vi.fn(),
    onRevert: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  };
}

function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (node) => node.textContent?.trim() === text,
  );
  if (!found) throw new Error(`button "${text}" not found`);
  return found as HTMLButtonElement;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("EditorToolbar", () => {
  it("renders the Save, Revert, Undo and Redo controls", async () => {
    const view = await mount(<EditorToolbar {...makeProps()} />);
    expect(button("Save")).toBeTruthy();
    expect(button("Revert")).toBeTruthy();
    expect(button("Undo")).toBeTruthy();
    expect(button("Redo")).toBeTruthy();
    view.unmount();
  });

  it("disables Save while clean and calls onSave once dirty", async () => {
    const clean = await mount(<EditorToolbar {...makeProps()} />);
    expect(button("Save").disabled).toBe(true);
    clean.unmount();

    const onSave = vi.fn();
    const dirty = await mount(<EditorToolbar {...makeProps({ dirty: true, onSave })} />);
    expect(button("Save").disabled).toBe(false);
    await click(button("Save"));
    expect(onSave).toHaveBeenCalledTimes(1);
    dirty.unmount();
  });

  it("disables Save while a save is in flight", async () => {
    const view = await mount(<EditorToolbar {...makeProps({ dirty: true, saving: true })} />);
    expect(button("Save").disabled).toBe(true);
    view.unmount();
  });

  it("gates Revert on the dirty state and calls onRevert", async () => {
    const clean = await mount(<EditorToolbar {...makeProps()} />);
    expect(button("Revert").disabled).toBe(true);
    clean.unmount();

    const onRevert = vi.fn();
    const dirty = await mount(<EditorToolbar {...makeProps({ dirty: true, onRevert })} />);
    expect(button("Revert").disabled).toBe(false);
    await click(button("Revert"));
    expect(onRevert).toHaveBeenCalledTimes(1);
    dirty.unmount();
  });

  it("gates Undo and Redo on canUndo and canRedo", async () => {
    const view = await mount(
      <EditorToolbar {...makeProps({ canUndo: true, canRedo: false })} />,
    );
    expect(button("Undo").disabled).toBe(false);
    expect(button("Redo").disabled).toBe(true);
    view.unmount();

    const redo = await mount(
      <EditorToolbar {...makeProps({ canUndo: false, canRedo: true })} />,
    );
    expect(button("Undo").disabled).toBe(true);
    expect(button("Redo").disabled).toBe(false);
    redo.unmount();
  });

  it("announces the dirty state with the dedicated key", async () => {
    const view = await mount(<EditorToolbar {...makeProps({ dirty: true })} />);
    const status = document.querySelector('[role="status"]');
    expect(status?.textContent).toContain(wb("en", "unsavedChanges"));
    view.unmount();
  });

  it("hides the Save as menu with a single format", async () => {
    const view = await mount(<EditorToolbar {...makeProps()} />);
    expect(document.querySelector('[aria-haspopup="menu"]')).toBeNull();
    view.unmount();
  });

  it("reveals Save as items and calls onSaveAs with the format id", async () => {
    const onSaveAs = vi.fn();
    const view = await mount(<EditorToolbar {...makeProps({ formats: FORMATS, onSaveAs })} />);

    expect(document.querySelector('[role="menu"]')).toBeNull();
    await click(button("Save as"));
    await waitFor(() => expect(document.querySelectorAll('[role="menuitem"]').length).toBe(2));

    const markdown = [...document.querySelectorAll('[role="menuitem"]')].find(
      (node) => node.textContent?.trim() === "Markdown",
    );
    expect(markdown).toBeTruthy();
    await click(markdown);
    expect(onSaveAs).toHaveBeenCalledWith("md");
    view.unmount();
  });
});
