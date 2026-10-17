// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BoardApp from "@/components/board/BoardApp";
import { tb } from "@/lib/board/i18n";
import { BOARD_STORAGE_KEY, readBoard, writeBoard } from "@/lib/board/storage";
import { axeViolations, click, mount, press, type, waitFor } from "../helpers/dom";

const saved = vi.hoisted(() => ({ calls: [] as { blob: Blob; name: string }[] }));
vi.mock("@/lib/apps/file-open", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/apps/file-open")>();
  return { ...actual, saveBlob: (blob: Blob, name: string) => void saved.calls.push({ blob, name }) };
});
const png = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/charts/export", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/charts/export")>();
  return { ...actual, svgToPng: async () => (png.fail ? Promise.reject(new Error("no")) : new Uint8Array([137, 80, 78, 71])) };
});

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  saved.calls = [];
  png.fail = false;
});

const text = () => document.body.textContent ?? "";
const byLabel = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const frame = () => document.querySelector<HTMLElement>('[role="group"][tabindex="0"]')!;
const canvas = () => frame().querySelector<SVGSVGElement>("svg")!;
const items = () => [...document.querySelectorAll("ul.sr-only li")].map((li) => li.textContent);

function pointer(kind: string, x: number, y: number, init: { pointerId?: number } = {}) {
  const event = new MouseEvent(kind, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 });
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

/** A view that is the identity, so a pointer at (x, y) is at the world point (x, y). */
const seed = (elements: unknown[] = []) => writeBoard({ elements: elements as never, view: { x: 0, y: 0, zoom: 1 } });

async function open() {
  if (!localStorage.getItem(BOARD_STORAGE_KEY)) seed();
  const view = await mount(<BoardApp />);
  await waitFor(() => expect(canvas()).toBeTruthy());
  return view;
}

const savedElements = async (count: number) => {
  await waitFor(() => expect(readBoard().elements).toHaveLength(count));
  return readBoard().elements;
};

describe("Whiteboard", () => {
  it("is one board with only the essentials: three tools, undo, redo, clear, one download", async () => {
    const view = await open();
    expect(text()).toContain(tb("en", "hint"));
    expect(document.querySelector("select")).toBeNull();
    expect([...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"))).toEqual(
      ["Rectangle", "Arrow", "Text", "Undo", "Redo", "Clear the board", "Download PNG"],
    );
    expect(text()).not.toMatch(/\d+%/);
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("draws a rectangle with the tool, then goes back to moving things", async () => {
    const view = await open();
    await click(byLabel("Rectangle"));
    expect(byLabel("Rectangle").getAttribute("aria-pressed")).toBe("true");
    await drag(50, 50, 200, 150);
    expect(byLabel("Rectangle").getAttribute("aria-pressed")).toBe("false");
    expect(items()).toEqual(["Rectangle"]);
    const [el] = await savedElements(1);
    expect(el).toMatchObject({ type: "rect", x: 50, y: 50, w: 150, h: 100 });
    expect(canvas().innerHTML).toContain('stroke="#ffffff"');
    view.unmount();
  });

  it("draws an arrow and leaves a stray click alone", async () => {
    const view = await open();
    await click(byLabel("Arrow"));
    await drag(10, 10, 160, 90);
    await click(byLabel("Arrow"));
    await pointer("pointerdown", 300, 300);
    await pointer("pointerup", 300, 300);
    expect(items()).toEqual(["Arrow"]);
    view.unmount();
  });

  it("drags an element to move it, and the empty canvas to move the board", async () => {
    seed([{ id: "r", type: "rect", x: 100, y: 100, w: 100, h: 60 }]);
    const view = await open();
    await drag(100, 130, 140, 150);
    await waitFor(() => expect(readBoard().elements[0]).toMatchObject({ x: 140, y: 120 }));

    await drag(600, 400, 580, 380);
    await waitFor(() => expect(readBoard().view).toMatchObject({ x: 20, y: 20, zoom: 1 }));
    expect(readBoard().elements[0]).toMatchObject({ x: 140, y: 120 });
    view.unmount();
  });

  it("adds text, edits it by clicking it, and removes it when emptied", async () => {
    const view = await open();
    await click(byLabel("Text"));
    await pointer("pointerdown", 40, 40);
    const box = () => document.querySelector<HTMLTextAreaElement>("textarea[data-board-text]")!;
    await type(box(), "hello");
    await act(async () => box().blur());
    expect(items()).toEqual(["Text: hello"]);

    await pointer("pointerdown", 45, 45);
    await pointer("pointerup", 45, 45);
    expect(box().value).toBe("hello");
    await type(box(), "");
    await act(async () => box().blur());
    expect(items()).toEqual([]);
    view.unmount();
  });

  it("undoes, redoes and clears everything in one step", async () => {
    seed([{ id: "r", type: "rect", x: 10, y: 10, w: 50, h: 50 }, { id: "a", type: "arrow", x1: 0, y1: 100, x2: 80, y2: 100 }]);
    const view = await open();
    expect(byLabel("Clear the board").disabled).toBe(false);
    await click(byLabel("Clear the board"));
    expect(items()).toEqual([]);
    expect(byLabel("Clear the board").disabled).toBe(true);
    await savedElements(0);

    await click(byLabel("Undo"));
    expect(items()).toEqual(["Rectangle", "Arrow"]);
    await click(byLabel("Redo"));
    expect(items()).toEqual([]);
    view.unmount();
  });

  it("answers the keyboard: tool keys, Escape and undo", async () => {
    const view = await open();
    await press(frame(), "r");
    expect(byLabel("Rectangle").getAttribute("aria-pressed")).toBe("true");
    await press(frame(), "Escape");
    expect(byLabel("Rectangle").getAttribute("aria-pressed")).toBe("false");
    await press(frame(), "a");
    await drag(0, 0, 100, 100);
    expect(items()).toEqual(["Arrow"]);
    await press(frame(), "z", { ctrlKey: true });
    expect(items()).toEqual([]);
    view.unmount();
  });

  it("downloads the board as a PNG, and says so when that fails", async () => {
    seed([{ id: "r", type: "rect", x: 10, y: 10, w: 50, h: 50 }]);
    const view = await open();
    await click(byLabel("Download PNG"));
    await waitFor(() => expect(saved.calls).toHaveLength(1));
    expect(saved.calls[0]!.name).toBe("whiteboard.png");
    expect(saved.calls[0]!.blob.type).toBe("image/png");

    png.fail = true;
    await click(byLabel("Download PNG"));
    await waitFor(() => expect(text()).toContain(tb("en", "exportFailed")));
    view.unmount();
  });

  it("zooms with Ctrl and the wheel, and pans with the wheel alone", async () => {
    const view = await open();
    const wheel = (init: WheelEventInit) => act(async () => void canvas().dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init })));
    await wheel({ deltaY: -100, ctrlKey: true, clientX: 100, clientY: 100 });
    await waitFor(() => expect(readBoard().view.zoom).toBeGreaterThan(1));
    const zoom = readBoard().view.zoom;
    await wheel({ deltaX: 0, deltaY: 50 });
    await waitFor(() => expect(readBoard().view.y).toBeGreaterThan(0));
    expect(readBoard().view.zoom).toBe(zoom);
    view.unmount();
  });

  it("keeps the board across a reload", async () => {
    const first = await open();
    await click(byLabel("Rectangle"));
    await drag(30, 30, 90, 90);
    await savedElements(1);
    first.unmount();
    const again = await open();
    expect(items()).toEqual(["Rectangle"]);
    again.unmount();
  });
});
