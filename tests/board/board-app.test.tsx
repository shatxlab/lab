// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BoardApp from "@/components/board/BoardApp";
import { tb } from "@/lib/board/i18n";
import { createBoard } from "@/lib/board/model";
import { BOARD_FILE_FORMAT, BOARD_STORAGE_KEY, readBoardStore, serializeBoard, writeBoardStore } from "@/lib/board/storage";
import { axeViolations, click, mount, press, type, waitFor } from "../helpers/dom";

const saved = vi.hoisted(() => ({ calls: [] as { blob: Blob; name: string }[] }));
vi.mock("@/lib/apps/file-open", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/apps/file-open")>();
  return { ...actual, saveBlob: (blob: Blob, name: string) => void saved.calls.push({ blob, name }) };
});

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  saved.calls = [];
});

const text = () => document.body.textContent ?? "";
const byLabel = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const canvas = () => document.querySelector<SVGSVGElement>('[role="group"][tabindex="0"] svg')!;
const frame = () => document.querySelector<HTMLElement>('[role="group"][tabindex="0"]')!;
const items = () => [...document.querySelectorAll("ul.sr-only li")].map((li) => li.textContent);
const store = () => readBoardStore();

function pointer(type: string, x: number, y: number, init: { pointerId?: number; button?: number; shiftKey?: boolean; pointerType?: string } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: init.button ?? 0, shiftKey: init.shiftKey });
  Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 });
  Object.defineProperty(event, "pointerType", { value: init.pointerType ?? "mouse" });
  return act(async () => {
    canvas().dispatchEvent(event);
  });
}

async function drag(x1: number, y1: number, x2: number, y2: number, init: Parameters<typeof pointer>[3] = {}) {
  await pointer("pointerdown", x1, y1, init);
  await pointer("pointermove", (x1 + x2) / 2, (y1 + y2) / 2, init);
  await pointer("pointermove", x2, y2, init);
  await pointer("pointerup", x2, y2, init);
}

/** A board whose view is the identity, so a pointer at (x, y) is at the world point (x, y). */
const seedBoard = () => writeBoardStore({ boards: [{ ...createBoard("Board 1"), view: { x: 0, y: 0, zoom: 1 } }], current: null, grid: true, snap: false });

async function open({ seed = true }: { seed?: boolean } = {}) {
  if (seed && !localStorage.getItem(BOARD_STORAGE_KEY)) seedBoard();
  const view = await mount(<BoardApp />);
  await waitFor(() => expect(canvas()).toBeTruthy());
  return view;
}

/** The first board's elements as last saved (saving is debounced). */
const savedElements = async (count: number) => {
  await waitFor(() => expect(store().boards[0]!.elements).toHaveLength(count));
  return store().boards[0]!.elements;
};

describe("Whiteboard — basics", () => {
  it("starts with one empty board, a hint and an accessible toolbar", async () => {
    const view = await open({ seed: false });
    expect(text()).toContain(tb("en", "hint"));
    expect(document.querySelector("select")!.textContent).toContain("Board 1");
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("draws a rectangle, an ellipse and an arrow by dragging", async () => {
    const view = await open();
    await click(byLabel("Rectangle"));
    await drag(10, 10, 110, 60);
    await click(byLabel("Ellipse"));
    await drag(150, 10, 250, 90);
    await click(byLabel("Arrow"));
    await drag(10, 150, 200, 150);
    expect(items()).toEqual(["Rectangle", "Ellipse", "Arrow"]);
    const [rect, ellipse, arrow] = await savedElements(3);
    expect(rect).toMatchObject({ type: "rect", x: 10, y: 10, w: 100, h: 50 });
    expect(ellipse).toMatchObject({ type: "ellipse", w: 100, h: 80 });
    expect(arrow).toMatchObject({ type: "arrow", x1: 10, y1: 150, x2: 200, y2: 150 });
    expect(text()).not.toContain(tb("en", "hint"));
    view.unmount();
  });

  it("draws freehand with the pen", async () => {
    const view = await open();
    await click(byLabel("Pen"));
    await pointer("pointerdown", 20, 20);
    for (let i = 1; i <= 6; i += 1) await pointer("pointermove", 20 + i * 10, 20 + (i % 2) * 12);
    await pointer("pointerup", 80, 20);
    const [stroke] = await savedElements(1);
    expect(stroke!.type).toBe("pen");
    expect((stroke as { points: number[] }).points.length).toBeGreaterThanOrEqual(8);
    view.unmount();
  });

  it("ignores a stray click with a shape tool", async () => {
    const view = await open();
    await click(byLabel("Rectangle"));
    await drag(50, 50, 51, 51);
    expect(items()).toEqual([]);
    view.unmount();
  });

  it("switches tools from the keyboard", async () => {
    const view = await open();
    await press(frame(), "r");
    expect(byLabel("Rectangle").getAttribute("aria-pressed")).toBe("true");
    await press(frame(), "o");
    expect(byLabel("Ellipse").getAttribute("aria-pressed")).toBe("true");
    await press(frame(), "v");
    expect(byLabel("Select").getAttribute("aria-pressed")).toBe("true");
    view.unmount();
  });
});

describe("Whiteboard — colours, selecting, moving", () => {
  it("draws in the chosen colour, fill and width", async () => {
    const view = await open();
    await click(byLabel("Rectangle"));
    await click(byLabel(tb("en", "colorOrange")));
    await click(byLabel(tb("en", "widthThick")));
    await click(byLabel(tb("en", "fill")));
    await drag(10, 10, 100, 100);
    const [rect] = await savedElements(1);
    expect(rect).toMatchObject({ color: "orange", width: 7, fill: true });
    view.unmount();
  });

  it("selects a shape by clicking it, moves it by dragging, and restyles it", async () => {
    const view = await open();
    await click(byLabel("Rectangle"));
    await drag(10, 10, 110, 110);
    await click(byLabel("Select"));
    await pointer("pointerdown", 40, 10); // on the outline, away from the handles
    await pointer("pointerup", 40, 10);
    expect(byLabel(tb("en", "delete")).disabled).toBe(false);
    await drag(40, 10, 90, 40);
    let [rect] = await savedElements(1);
    await waitFor(() => expect(store().boards[0]!.elements[0]).toMatchObject({ x: 60, y: 40 }));
    [rect] = store().boards[0]!.elements;
    expect(rect).toMatchObject({ x: 60, y: 40, w: 100, h: 100 });
    await click(byLabel(tb("en", "colorGreen")));
    await waitFor(() => expect(store().boards[0]!.elements[0]).toMatchObject({ color: "green" }));
    view.unmount();
  });

  it("lets go of the selection when a drawing tool is picked, so colours apply to the next shape", async () => {
    const view = await open();
    await click(byLabel("Rectangle"));
    await drag(10, 10, 110, 110);
    expect(byLabel(tb("en", "delete")).disabled).toBe(false); // the new shape is selected
    await click(byLabel("Ellipse"));
    expect(byLabel(tb("en", "delete")).disabled).toBe(true);
    await click(byLabel(tb("en", "colorRed")));
    await waitFor(() => expect(store().boards[0]?.elements[0]).toMatchObject({ type: "rect", color: "ink" }));
    view.unmount();
  });

  it("resizes a shape by its handle", async () => {
    const view = await open();
    await click(byLabel("Rectangle"));
    await drag(100, 100, 200, 200);
    await click(byLabel("Select"));
    await pointer("pointerdown", 100, 100);
    await pointer("pointerup", 100, 100);
    // The south-east handle sits on the corner.
    await drag(200, 200, 300, 260);
    await waitFor(() => expect(store().boards[0]!.elements[0]).toMatchObject({ x: 100, y: 100, w: 200, h: 160 }));
    view.unmount();
  });

  it("selects several shapes with a marquee and deletes them together", async () => {
    const view = await open();
    await click(byLabel("Rectangle"));
    await drag(20, 20, 60, 60);
    await drag(100, 20, 140, 60);
    await click(byLabel("Select"));
    await drag(5, 5, 200, 100);
    await click(byLabel(tb("en", "delete")));
    expect(items()).toEqual([]);
    view.unmount();
  });

  it("deletes with the keyboard and duplicates with Ctrl+D", async () => {
    const view = await open();
    await click(byLabel("Rectangle"));
    await drag(10, 10, 110, 110);
    await press(frame(), "d", { ctrlKey: true });
    expect(items()).toEqual(["Rectangle", "Rectangle"]);
    await press(frame(), "Delete");
    expect(items()).toEqual(["Rectangle"]);
    await press(frame(), "a", { ctrlKey: true });
    await press(frame(), "Backspace");
    expect(items()).toEqual([]);
    view.unmount();
  });
});

describe("Whiteboard — undo and redo", () => {
  it("undoes and redoes each gesture with the buttons and the keyboard", async () => {
    const view = await open();
    expect(byLabel(tb("en", "undo")).disabled).toBe(true);
    await click(byLabel("Rectangle"));
    await drag(10, 10, 110, 110);
    await click(byLabel("Ellipse"));
    await drag(150, 10, 250, 110);
    expect(items()).toHaveLength(2);
    await click(byLabel(tb("en", "undo")));
    expect(items()).toEqual(["Rectangle"]);
    await press(frame(), "z", { ctrlKey: true });
    expect(items()).toEqual([]);
    expect(byLabel(tb("en", "undo")).disabled).toBe(true);
    await click(byLabel(tb("en", "redo")));
    await press(frame(), "z", { ctrlKey: true, shiftKey: true });
    expect(items()).toEqual(["Rectangle", "Ellipse"]);
    expect(byLabel(tb("en", "redo")).disabled).toBe(true);
    view.unmount();
  });

  it("makes a move one undo step", async () => {
    const view = await open();
    await click(byLabel("Rectangle"));
    await drag(10, 10, 110, 110);
    await click(byLabel("Select"));
    await drag(40, 10, 90, 40);
    await waitFor(() => expect(store().boards[0]!.elements[0]).toMatchObject({ x: 60 }));
    await click(byLabel(tb("en", "undo")));
    await waitFor(() => expect(store().boards[0]!.elements[0]).toMatchObject({ x: 10, y: 10 }));
    view.unmount();
  });
});

describe("Whiteboard — text", () => {
  it("adds text with the text tool and finishes with Ctrl+Enter", async () => {
    const view = await open();
    await click(byLabel("Text"));
    await pointer("pointerdown", 40, 50);
    await pointer("pointerup", 40, 50);
    const box = document.querySelector<HTMLTextAreaElement>("textarea[data-board-text]")!;
    expect(box).toBeTruthy();
    await type(box, "Hello\nthere");
    await press(box, "Enter", { ctrlKey: true });
    expect(document.querySelector("textarea[data-board-text]")).toBeNull();
    expect(items()).toEqual(["Text: Hello\nthere"]);
    const [element] = await savedElements(1);
    expect(element).toMatchObject({ type: "text", text: "Hello\nthere", x: 40, y: 50 });
    view.unmount();
  });

  it("adds nothing for empty text, and Escape cancels", async () => {
    const view = await open();
    await click(byLabel("Text"));
    await pointer("pointerdown", 40, 50);
    await pointer("pointerup", 40, 50);
    await press(document.querySelector("textarea[data-board-text]")!, "Escape");
    expect(items()).toEqual([]);
    view.unmount();
  });

  it("edits existing text by double-clicking it, and removes it when emptied", async () => {
    writeBoardStore({
      boards: [{ ...createBoard("B"), view: { x: 0, y: 0, zoom: 1 }, elements: [{ id: "t", type: "text", x: 40, y: 50, text: "old", size: 24, color: "ink", fill: false, width: 4 }] }],
      current: null,
      grid: true,
      snap: false,
    });
    const view = await open();
    const el = canvas();
    await act(async () => {
      el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 50, clientY: 60 }));
    });
    const box = document.querySelector<HTMLTextAreaElement>("textarea[data-board-text]")!;
    expect(box.value).toBe("old");
    await type(box, "new words");
    await press(box, "Enter", { ctrlKey: true });
    await waitFor(() => expect(store().boards[0]!.elements[0]).toMatchObject({ text: "new words" }));
    await act(async () => {
      el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 50, clientY: 60 }));
    });
    const again = document.querySelector<HTMLTextAreaElement>("textarea[data-board-text]")!;
    await type(again, "");
    await press(again, "Enter", { ctrlKey: true });
    expect(items()).toEqual([]);
    view.unmount();
  });
});

describe("Whiteboard — view", () => {
  it("zooms with the buttons and Ctrl+wheel, and fits to the content", async () => {
    const view = await open();
    const zoom = () => document.querySelector("span[aria-label^='Zoom ']")!.textContent;
    expect(zoom()).toBe("100%");
    await click(byLabel(tb("en", "zoomIn")));
    expect(zoom()).toBe("125%");
    await click(byLabel(tb("en", "zoomOut")));
    await click(byLabel(tb("en", "zoomOut")));
    expect(zoom()).toBe("80%");
    await act(async () => {
      canvas().dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100, clientX: 100, clientY: 100 }));
    });
    expect(Number.parseInt(zoom()!, 10)).toBeGreaterThan(80);
    await click(byLabel("Rectangle"));
    await drag(10, 10, 60, 40);
    await click(byLabel(tb("en", "zoomFit")));
    expect(zoom()).toBe("100%"); // a small drawing is not blown up
    view.unmount();
  });

  it("pans with the plain wheel, and with the hand tool", async () => {
    const view = await open();
    await click(byLabel("Rectangle"));
    await drag(100, 100, 200, 200);
    await click(byLabel("Select"));
    await act(async () => {
      canvas().dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 30, deltaY: 50 }));
    });
    await waitFor(() => expect(store().boards[0]!.view).toMatchObject({ x: 30, y: 50, zoom: 1 }));
    await click(byLabel(tb("en", "hand")));
    await drag(300, 300, 340, 330);
    await waitFor(() => expect(store().boards[0]!.view).toMatchObject({ x: -10, y: 20 }));
    // Moving the canvas moved no element.
    expect(store().boards[0]!.elements[0]).toMatchObject({ x: 100, y: 100 });
    view.unmount();
  });

  it("pinches with two fingers instead of drawing", async () => {
    const view = await open();
    await click(byLabel("Rectangle"));
    await pointer("pointerdown", 100, 100, { pointerId: 1, pointerType: "touch" });
    await pointer("pointerdown", 200, 100, { pointerId: 2, pointerType: "touch" });
    await pointer("pointermove", 50, 100, { pointerId: 1, pointerType: "touch" });
    await pointer("pointermove", 250, 100, { pointerId: 2, pointerType: "touch" });
    await pointer("pointerup", 250, 100, { pointerId: 2, pointerType: "touch" });
    await pointer("pointerup", 50, 100, { pointerId: 1, pointerType: "touch" });
    expect(document.querySelector("span[aria-label^='Zoom ']")!.textContent).toBe("200%");
    expect(items()).toEqual([]);
    view.unmount();
  });

  it("toggles the grid and remembers it", async () => {
    const view = await open();
    expect(canvas().querySelector("pattern")).toBeTruthy();
    await click(byLabel(tb("en", "grid")));
    expect(canvas().querySelector("pattern")).toBeNull();
    await waitFor(() => expect(store().grid).toBe(false));
    view.unmount();
  });
});

describe("Whiteboard — boards and files", () => {
  it("keeps several boards, switches between them, renames and deletes with confirmation", async () => {
    const view = await open();
    await click(byLabel("Rectangle"));
    await drag(10, 10, 100, 100);
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === tb("en", "newBoard")));
    await waitFor(() => expect(store().boards).toHaveLength(2));
    expect(items()).toEqual([]);
    // Back to the first board: its rectangle is still there.
    const select = document.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, store().boards[0]!.id);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(() => expect(items()).toEqual(["Rectangle"]));

    await click([...document.querySelectorAll("button")].find((b) => b.textContent === tb("en", "rename")));
    await type(document.querySelector<HTMLInputElement>('input[maxlength="60"]'), "Sprint plan");
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === tb("en", "save")));
    await waitFor(() => expect(store().boards[0]!.name).toBe("Sprint plan"));

    await click([...document.querySelectorAll("button")].find((b) => b.textContent === tb("en", "deleteBoard")));
    expect(text()).toContain(tb("en", "deleteAsk", { name: "Sprint plan" }));
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === tb("en", "keep")));
    expect(store().boards).toHaveLength(2);
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === tb("en", "deleteBoard")));
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === tb("en", "deleteYes")));
    await waitFor(() => expect(store().boards).toHaveLength(1));
    view.unmount();
  });

  it("starts a fresh board when the last one is deleted", async () => {
    const view = await open();
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === tb("en", "deleteBoard")));
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === tb("en", "deleteYes")));
    await waitFor(() => expect(store().boards).toHaveLength(1));
    expect(document.querySelector("select")!.textContent).toContain("Board 1");
    view.unmount();
  });

  it("downloads the board as a JSON file that reads back, and as SVG", async () => {
    const view = await open();
    await click(byLabel("Ellipse"));
    await drag(10, 10, 100, 80);
    await click(byLabel(tb("en", "exportJson")));
    expect(saved.calls[0]!.name).toBe("Board-1.json");
    const parsed = JSON.parse(await saved.calls[0]!.blob.text());
    expect(parsed).toMatchObject({ format: BOARD_FILE_FORMAT, version: 1, name: "Board 1" });
    expect(parsed.elements[0]).toMatchObject({ type: "ellipse", w: 90, h: 70 });

    await click([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "SVG"));
    expect(saved.calls[1]!.name).toBe("Board-1.svg");
    const svg = await saved.calls[1]!.blob.text();
    expect(svg).toContain("<ellipse");
    expect(new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror")).toBeNull();
    view.unmount();
  });

  it("opens a board file as a new board, and refuses anything else", async () => {
    const view = await open();
    const give = async (contents: string, name = "plan.json") => {
      // Opening a board swaps the workspace, so look the input up each time.
      const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, "files", { value: [new File([contents], name, { type: "application/json" })], configurable: true });
      await act(async () => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    const board = { ...createBoard("From a file"), elements: [{ id: "x", type: "rect" as const, x: 5, y: 5, w: 50, h: 40, color: "blue" as const, fill: false, width: 4 }] };
    await give(serializeBoard(board));
    await waitFor(() => expect(store().boards).toHaveLength(2));
    expect(store().current).toBe(store().boards[1]!.id);
    expect(store().boards[1]!.name).toBe("From a file");
    expect(items()).toEqual(["Rectangle"]);
    expect(text()).toContain(tb("en", "imported", { name: "From a file" }));

    await give("not a board");
    await waitFor(() => expect(text()).toContain(tb("en", "importFailed")));
    expect(store().boards).toHaveLength(2);
    view.unmount();
  });

  it("comes back as it was after a reload", async () => {
    const first = await open();
    await click(byLabel("Rectangle"));
    await drag(10, 10, 100, 100);
    await click(byLabel(tb("en", "zoomIn")));
    await waitFor(() => expect(store().boards[0]!.view.zoom).toBe(1.25));
    first.unmount();
    document.body.innerHTML = "";

    const second = await open();
    expect(items()).toEqual(["Rectangle"]);
    expect(document.querySelector("span[aria-label^='Zoom ']")!.textContent).toBe("125%");
    second.unmount();
  });

  it("uses the lab: key so the settings backup covers it", async () => {
    const view = await open({ seed: false });
    expect(localStorage.getItem(BOARD_STORAGE_KEY)).toBeNull(); // nothing to save yet
    await click(byLabel("Rectangle"));
    await drag(10, 10, 100, 100);
    await waitFor(() => expect(localStorage.getItem(BOARD_STORAGE_KEY)).toContain('"rect"'));
    view.unmount();
  });
});

describe("Whiteboard — language", () => {
  it("speaks Russian", async () => {
    localStorage.setItem("lab:lang", "ru");
    const view = await open();
    expect(text()).toContain(tb("ru", "hint"));
    expect(byLabel(tb("ru", "rect"))).toBeTruthy();
    view.unmount();
  });
});
