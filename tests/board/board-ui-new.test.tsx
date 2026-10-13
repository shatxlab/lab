// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import BoardApp from "@/components/board/BoardApp";
import { BOARD_CLIP_KEY } from "@/lib/board/clipboard";
import { writeBoardHandoff } from "@/lib/board/handoff";
import { tb } from "@/lib/board/i18n";
import { createBoard } from "@/lib/board/model";
import { BOARD_STORAGE_KEY, readBoardStore, serializeBoard, writeBoardStore } from "@/lib/board/storage";
import { axeViolations, click, mount, press, waitFor } from "../helpers/dom";

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

const text = () => document.body.textContent ?? "";
const byLabel = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const canvas = () => document.querySelector<SVGSVGElement>('[role="group"][tabindex="0"] svg')!;
const frame = () => document.querySelector<HTMLElement>('[role="group"][tabindex="0"]')!;
const items = () => [...document.querySelectorAll("ul.sr-only li")].map((li) => li.textContent);
const store = () => readBoardStore();
const current = () => store().boards.find((b) => b.id === store().current)!;

function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  return act(async () => {
    canvas().dispatchEvent(event);
  });
}
async function drag(x1: number, y1: number, x2: number, y2: number) {
  await pointer("pointerdown", x1, y1);
  await pointer("pointermove", (x1 + x2) / 2, (y1 + y2) / 2);
  await pointer("pointermove", x2, y2);
  await pointer("pointerup", x2, y2);
}
const seed = () => writeBoardStore({ boards: [{ ...createBoard("Board 1"), view: { x: 0, y: 0, zoom: 1 } }], current: null, grid: true, snap: false });
async function open() {
  if (!localStorage.getItem(BOARD_STORAGE_KEY)) seed();
  const view = await mount(<BoardApp />);
  await waitFor(() => expect(canvas()).toBeTruthy());
  return view;
}
const saved = async (count: number) => {
  await waitFor(() => expect(current().elements).toHaveLength(count));
  return current().elements;
};
const rectAt = async (x: number, y: number, w = 100, h = 60) => {
  await click(byLabel("Rectangle"));
  await drag(x, y, x + w, y + h);
};

describe("Whiteboard — snap to grid", () => {
  it("is off to begin with, remembered when switched on, and makes drawings land on the grid", async () => {
    const view = await open();
    expect(byLabel(tb("en", "snap")).getAttribute("aria-pressed")).toBe("false");
    await click(byLabel(tb("en", "snap")));
    expect(byLabel(tb("en", "snap")).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(store().snap).toBe(true));
    await rectAt(31, 17, 69, 73);
    const [rect] = await saved(1);
    expect(rect).toMatchObject({ type: "rect", x: 24, y: 24, w: 72, h: 72 });
    view.unmount();
  });

  it("does not snap when off", async () => {
    const view = await open();
    await rectAt(31, 17, 69, 73);
    const [rect] = await saved(1);
    expect(rect).toMatchObject({ x: 31, y: 17, w: 69, h: 73 });
    view.unmount();
  });
});

describe("Whiteboard — stacking order", () => {
  it("brings a shape to the front and sends it to the back", async () => {
    const view = await open();
    await rectAt(10, 10);
    await rectAt(40, 30);
    await rectAt(70, 50);
    const [first, second, third] = (await saved(3)).map((el) => el.id);
    await click(byLabel("Select"));
    await pointer("pointerdown", 10, 40); // the first rectangle's left edge
    await pointer("pointerup", 10, 40);
    await click(byLabel(tb("en", "toFront")));
    await waitFor(() => expect(current().elements.map((el) => el.id)).toEqual([second, third, first]));
    await click(byLabel(tb("en", "toBack")));
    await waitFor(() => expect(current().elements.map((el) => el.id)).toEqual([first, second, third]));
    view.unmount();
  });

  it("disables the order buttons with nothing selected, and has keyboard shortcuts", async () => {
    const view = await open();
    expect(byLabel(tb("en", "toFront")).disabled).toBe(true);
    await rectAt(10, 10);
    await rectAt(40, 30);
    const [a, b] = (await saved(2)).map((el) => el.id);
    // The second rectangle is selected after drawing it; Ctrl+[ steps it back.
    await press(frame(), "[", { ctrlKey: true });
    await waitFor(() => expect(current().elements.map((el) => el.id)).toEqual([b, a]));
    await press(frame(), "]", { ctrlKey: true });
    await waitFor(() => expect(current().elements.map((el) => el.id)).toEqual([a, b]));
    await press(frame(), "[", { ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(current().elements.map((el) => el.id)).toEqual([b, a]));
    view.unmount();
  });
});

describe("Whiteboard — copy and paste", () => {
  it("copies a selection, and pastes it on the same board a step aside", async () => {
    const view = await open();
    expect(byLabel(tb("en", "paste")).disabled).toBe(true);
    await rectAt(10, 10);
    await click(byLabel(tb("en", "copy")));
    expect(text()).toContain(tb("en", "copied", { n: 1 }));
    expect(localStorage.getItem(BOARD_CLIP_KEY)).toBeTruthy();
    expect(byLabel(tb("en", "paste")).disabled).toBe(false);
    await click(byLabel(tb("en", "paste")));
    const elements = await saved(2);
    expect(elements[1]).toMatchObject({ type: "rect", x: 26, y: 26 });
    expect(elements[1]!.id).not.toBe(elements[0]!.id);
    await click(byLabel(tb("en", "paste")));
    expect((await saved(3))[2]).toMatchObject({ x: 42 });
    view.unmount();
  });

  it("pastes onto another board, where it was", async () => {
    const view = await open();
    await rectAt(50, 60);
    await press(frame(), "c", { ctrlKey: true });
    await click([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === tb("en", "newBoard"))!);
    await waitFor(() => expect(store().boards).toHaveLength(2));
    await waitFor(() => expect(items()).toEqual([]));
    await press(frame(), "v", { ctrlKey: true });
    await waitFor(() => expect(current().elements).toHaveLength(1));
    expect(current().elements[0]).toMatchObject({ type: "rect", x: 50, y: 60 });
    expect(store().boards[0]!.elements).toHaveLength(1);
    view.unmount();
  });

  it("cuts: removes the selection and keeps it to paste", async () => {
    const view = await open();
    await rectAt(10, 10);
    await press(frame(), "x", { ctrlKey: true });
    await waitFor(() => expect(current().elements).toHaveLength(0));
    await press(frame(), "v", { ctrlKey: true });
    await waitFor(() => expect(current().elements).toHaveLength(1));
    view.unmount();
  });

  it("is still there after reloading", async () => {
    const first = await open();
    await rectAt(10, 10);
    await click(byLabel(tb("en", "copy")));
    first.unmount();
    document.body.innerHTML = "";
    const second = await open();
    await waitFor(() => expect(byLabel(tb("en", "paste")).disabled).toBe(false));
    second.unmount();
  });

  it("keeps an arrow attached to the shapes it was copied with", async () => {
    const view = await open();
    await rectAt(10, 10);
    await rectAt(300, 10);
    await click(byLabel("Arrow"));
    await drag(60, 40, 350, 40);
    const [a, b, arrow] = await saved(3);
    expect(arrow).toMatchObject({ from: a!.id, to: b!.id });
    await click(byLabel("Select"));
    await press(frame(), "a", { ctrlKey: true });
    await press(frame(), "c", { ctrlKey: true });
    await press(frame(), "v", { ctrlKey: true });
    const all = await saved(6);
    const copies = all.slice(3) as typeof all;
    const copiedArrow = copies.find((el) => el.type === "arrow") as Extract<(typeof all)[number], { type: "arrow" }>;
    const copiedIds = copies.filter((el) => el.type === "rect").map((el) => el.id);
    expect(copiedIds).toContain(copiedArrow.from);
    expect(copiedIds).toContain(copiedArrow.to);
    expect([a!.id, b!.id]).not.toContain(copiedArrow.from);
    view.unmount();
  });
});

describe("Whiteboard — connectors", () => {
  it("attaches an arrow drawn between two shapes, and the arrow follows when a shape moves", async () => {
    const view = await open();
    await rectAt(10, 10);
    await rectAt(300, 10);
    await click(byLabel("Arrow"));
    await drag(60, 40, 350, 40);
    const [a, b, arrow] = await saved(3);
    expect(arrow).toMatchObject({ type: "arrow", from: a!.id, to: b!.id, x1: 110, x2: 300 });

    // Move the second rectangle down: the arrow's end goes with it.
    await click(byLabel("Select"));
    // The rectangle is unfilled, so it is grabbed by its outline: the top edge.
    await pointer("pointerdown", 350, 10);
    await pointer("pointermove", 350, 80);
    await pointer("pointermove", 350, 140);
    await pointer("pointerup", 350, 140);
    await waitFor(() => expect(current().elements[1]).toMatchObject({ y: 140 }));
    const after = current().elements[2] as Extract<ReturnType<typeof current>["elements"][number], { type: "arrow" }>;
    expect(after).toMatchObject({ from: a!.id, to: b!.id });
    expect(after.y2).toBeGreaterThan(40);
    view.unmount();
  });

  it("lets go of a deleted shape and keeps the arrow where it was", async () => {
    const view = await open();
    await rectAt(10, 10);
    await rectAt(300, 10);
    await click(byLabel("Arrow"));
    await drag(60, 40, 350, 40);
    await saved(3);
    await click(byLabel("Select"));
    await pointer("pointerdown", 350, 10);
    await pointer("pointerup", 350, 10);
    await click(byLabel(tb("en", "delete")));
    const left = await saved(2);
    const arrow = left[1] as Extract<(typeof left)[number], { type: "arrow" }>;
    expect(arrow.to).toBeUndefined();
    expect(arrow.from).toBe(left[0]!.id);
    view.unmount();
  });
});

describe("Whiteboard — a board sent from the workbench", () => {
  it("arrives as a new board, named after the file, and is opened", async () => {
    const sent = { ...createBoard("Inside"), elements: [{ id: "r", type: "rect" as const, x: 1, y: 2, w: 30, h: 40, color: "ink" as const, fill: false, width: 4 }] };
    expect(writeBoardHandoff({ name: "sprint-plan.json", text: serializeBoard(sent) })).toBe(true);
    const view = await open();
    await waitFor(() => expect(store().boards).toHaveLength(2));
    expect(current().name).toBe("sprint-plan");
    expect(current().elements).toHaveLength(1);
    expect(text()).toContain(tb("en", "imported", { name: "sprint-plan" }));
    expect(localStorage.getItem("lab-handoff:board")).toBeNull();
    view.unmount();
  });

  it("ignores something that is not a board", async () => {
    expect(writeBoardHandoff({ name: "other.json", text: '{"hello":1}' })).toBe(true);
    const view = await open();
    expect(store().boards).toHaveLength(1);
    expect(text()).not.toContain(tb("en", "imported", { name: "other" }));
    view.unmount();
  });

  it("keeps the toolbar accessible with the new buttons", async () => {
    const view = await open();
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });
});
