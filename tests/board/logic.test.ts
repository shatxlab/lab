import { describe, expect, it } from "vitest";

import { boundsOf, connect, fitLabel, hitTest, remove, snap, topmostAt, translate } from "@/lib/board/geometry";
import { begin, boxBeside, drawn, finish, newText, panView, panning, pinchView, preview, textBeside, update } from "@/lib/board/gesture";
import { canRedo, canUndo, commit, createHistory, redo, undo } from "@/lib/board/history";
import { BOX_H, BOX_W, INK, SURFACE, type BoardElement, type RectElement } from "@/lib/board/model";
import { BOARD_STORAGE_KEY, cleanElements, emptyBoard, readBoard, writeBoard, type BoardStorage } from "@/lib/board/storage";
import { boardSvg, describeElement, serializeNode } from "@/lib/board/svg";
import { clampZoom, toScreen, toWorld, zoomAt } from "@/lib/board/viewport";

const view = { x: 0, y: 0, zoom: 1 };
const rect: BoardElement = { id: "r", type: "rect", x: 10, y: 10, w: 100, h: 60, text: "" };
const arrow: BoardElement = { id: "a", type: "arrow", x1: 0, y1: 200, x2: 100, y2: 200 };
const note: BoardElement = { id: "t", type: "text", x: 300, y: 300, text: "hello" };

const memory = (): BoardStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
};

describe("geometry", () => {
  it("hits a box anywhere inside it, so its label is easy to click", () => {
    expect(hitTest(rect, { x: 10, y: 40 }, 2)).toBe(true);
    expect(hitTest(rect, { x: 60, y: 40 }, 2)).toBe(true);
    expect(hitTest(rect, { x: 300, y: 40 }, 2)).toBe(false);
  });

  it("grows a box to fit its label, about its centre", () => {
    const grown = fitLabel({ ...rect, text: "a fairly long label" } as RectElement);
    expect(grown.w).toBeGreaterThan(100);
    expect(grown.x + grown.w / 2).toBeCloseTo(60);
    const roomy = { ...rect, h: 200, text: "a" } as RectElement;
    expect(fitLabel(roomy)).toBe(roomy);
  });

  it("keeps a linked arrow on the edges of its boxes, and drops it with a box", () => {
    const right: BoardElement = { id: "r2", type: "rect", x: 300, y: 10, w: 100, h: 60, text: "" };
    const link: BoardElement = { id: "l", type: "arrow", x1: 0, y1: 0, x2: 0, y2: 0, from: "r", to: "r2" };
    const [, , joined] = connect([rect, right, link]);
    expect(joined).toMatchObject({ y1: 40, y2: 40 });
    expect((joined as { x1: number }).x1).toBeGreaterThan(110);
    expect((joined as { x2: number }).x2).toBeLessThan(300);

    const moved = connect([rect, translate(right, 0, 200), joined!]);
    expect(moved[2]).toMatchObject({ from: "r", to: "r2" });
    expect((moved[2] as { y2: number }).y2).toBeGreaterThan(200);
    expect(remove(moved, "r2").map((el) => el.id)).toEqual(["r"]);
    expect(translate(joined!, 1, 1)).not.toHaveProperty("from");
  });

  it("snaps boxes by their centres and text by its corner", () => {
    const near = { ...rect, id: "n", x: 200, y: 14 };
    expect(snap(near, [rect], 10)).toMatchObject({ x: 200, y: 10 });
    expect(snap({ ...near, y: 40 }, [rect], 10)).toMatchObject({ y: 40 });
    expect(snap({ ...note, id: "n", x: 600, y: 306 }, [note], 10)).toMatchObject({ x: 600, y: 300 });
  });

  it("hits an arrow along its length and text anywhere in its box", () => {
    expect(hitTest(arrow, { x: 50, y: 202 }, 2)).toBe(true);
    expect(hitTest(arrow, { x: 50, y: 230 }, 2)).toBe(false);
    expect(hitTest(note, { x: 310, y: 310 }, 2)).toBe(true);
  });

  it("picks the topmost element and moves each kind", () => {
    const stacked: BoardElement[] = [rect, { ...rect, id: "r2" }];
    expect(topmostAt(stacked, { x: 10, y: 40 }, 2)?.id).toBe("r2");
    expect(boundsOf(translate(rect, 5, 7))).toMatchObject({ x: 15, y: 17 });
    expect(translate(arrow, 1, 2)).toMatchObject({ x1: 1, y1: 202, x2: 101, y2: 202 });
    expect(translate(note, 1, 2)).toMatchObject({ x: 301, y: 302 });
  });
});

describe("gestures", () => {
  const input = { elements: [rect, arrow], view, reach: 6 };

  it("draws when a tool is picked, whatever is under the pointer", () => {
    const g = begin({ ...input, tool: "rect", world: { x: 10, y: 40 }, screen: { x: 10, y: 40 } });
    expect(g.kind).toBe("draw");
  });

  it("moves the element under the pointer and pans on empty canvas", () => {
    expect(begin({ ...input, tool: null, world: { x: 10, y: 40 }, screen: { x: 10, y: 40 } }).kind).toBe("move");
    const pan = begin({ ...input, tool: null, world: { x: 500, y: 500 }, screen: { x: 500, y: 500 } });
    expect(pan.kind).toBe("pan");
    if (pan.kind === "pan") expect(panView(pan, { x: 520, y: 490 })).toMatchObject({ x: -20, y: 10 });
  });

  it("only moves the canvas once a drag goes past a click's wobble", () => {
    const pan = begin({ ...input, tool: null, world: { x: 500, y: 500 }, screen: { x: 500, y: 500 } });
    if (pan.kind !== "pan") throw new Error("not a pan");
    expect(panning(pan, { x: 503, y: 502 }).moved).toBe(false);
    const dragged = panning(pan, { x: 510, y: 500 });
    expect(dragged.moved).toBe(true);
    expect(panning(dragged, { x: 501, y: 500 }).moved).toBe(true);
  });

  it("leaves an arrow on its boxes when it is dragged", () => {
    let g = begin({ ...input, tool: null, world: { x: 50, y: 200 }, screen: { x: 50, y: 200 } });
    expect(g).toMatchObject({ kind: "move", id: "a" });
    g = update(g, { x: 150, y: 300 }, view);
    expect(finish(g, input.elements, view).elements.find((el) => el.id === "a")).toEqual(arrow);
  });

  it("keeps a drawn rectangle", () => {
    const start = begin({ ...input, tool: "rect", world: { x: 0, y: 0 }, screen: { x: 0, y: 0 } });
    const dragged = update(start, { x: 80, y: 40 }, view);
    expect(drawn(dragged as never)).toMatchObject({ type: "rect", w: 80, h: 40 });
    expect(finish(dragged, [], view)).toMatchObject({ elements: [{ type: "rect" }], edit: (dragged as { id: string }).id });

  });

  it("drops a box of the usual size where the box tool clicks", () => {
    const click = begin({ ...input, tool: "rect", world: { x: 500, y: 500 }, screen: { x: 500, y: 500 } });
    const done = finish(click, [], view);
    expect(done.elements[0]).toMatchObject({ type: "rect", x: 500 - BOX_W / 2, y: 500 - BOX_H / 2, w: BOX_W, h: BOX_H, text: "" });
    expect(done.edit).toBe(done.elements[0]!.id);
  });

  it("adds the next box beside one, past what is there, with an arrow to it", () => {
    const below = boxBeside([rect], rect as RectElement, "below");
    expect(below.box).toMatchObject({ x: 10, w: 100, h: 60, text: "" });
    expect(below.box.y).toBeGreaterThan(70);
    expect(below.elements.at(-1)).toMatchObject({ type: "arrow", from: "r", to: below.box.id });
    const again = boxBeside(below.elements, rect as RectElement, "below");
    expect(again.box.y).toBeGreaterThan(below.box.y + 60);
    expect(textBeside(note as never)).toMatchObject({ type: "text", y: 300, text: "" });
  });

  it("adds the next box to the left and diagonally down, and text below in its column", () => {
    const at = (side: Parameters<typeof boxBeside>[2]) => boxBeside([rect], rect as RectElement, side).box;
    expect(at("left")).toMatchObject({ y: 10 });
    expect(at("left").x).toBeLessThan(10 - 100);
    expect(at("below-left").x).toBe(at("left").x);
    expect(at("below-left").y).toBe(at("below").y);
    expect(at("below-right").x).toBe(at("right").x);
    expect(at("below-right").y).toBe(at("below").y);
    const next = textBeside(note as never, "below");
    expect(next).toMatchObject({ type: "text", x: 300, text: "" });
    expect(next.y).toBeGreaterThan(300);
  });

  it("previews and commits a move, and treats a click on text as an edit", () => {
    let g = begin({ ...input, tool: null, world: { x: 10, y: 40 }, screen: { x: 10, y: 40 } });
    g = update(g, { x: 30, y: 60 }, view);
    expect(preview(g, input.elements).find((el) => el.id === "r")).toMatchObject({ x: 30, y: 30 });
    expect(finish(g, input.elements, view).elements.find((el) => el.id === "r")).toMatchObject({ x: 30, y: 30 });

    const onText = begin({ elements: [note], view, reach: 6, tool: null, world: { x: 305, y: 305 }, screen: { x: 305, y: 305 } });
    expect(finish(onText, [note], view)).toMatchObject({ edit: "t" });
    const onBox = begin({ ...input, tool: null, world: { x: 10, y: 40 }, screen: { x: 10, y: 40 } });
    expect(finish(onBox, input.elements, view).edit).toBe("r");
    const onArrow = begin({ ...input, tool: null, world: { x: 50, y: 200 }, screen: { x: 50, y: 200 } });
    expect(finish(onArrow, input.elements, view).edit).toBeUndefined();
  });

  it("zooms about the midpoint of a pinch", () => {
    const pinched = pinchView(view, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 50, y: 100 }, { x: 250, y: 100 }, clampZoom);
    expect(pinched.zoom).toBe(2);
    expect(toScreen(pinched, toWorld(view, 150, 100))).toEqual({ x: 150, y: 100 });
  });

  it("creates empty text for the editor", () => {
    expect(newText({ x: 1, y: 2 })).toMatchObject({ type: "text", x: 1, y: 2, text: "" });
  });
});

describe("viewport", () => {
  it("keeps the point under the cursor fixed while zooming, within limits", () => {
    const zoomed = zoomAt(view, 200, 100, 2);
    expect(toWorld(zoomed, 200, 100)).toEqual({ x: 200, y: 100 });
    expect(zoomAt(view, 0, 0, 1000).zoom).toBe(8);
  });
});

describe("history", () => {
  it("undoes, redoes and drops redo after a new change", () => {
    let h = createHistory<number[]>([]);
    h = commit(h, [1]);
    h = commit(h, [1, 2]);
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(h.present).toEqual([1]);
    expect(canRedo(h)).toBe(true);
    expect(redo(h).present).toEqual([1, 2]);
    h = commit(h, [9]);
    expect(canRedo(h)).toBe(false);
  });
});

describe("svg", () => {
  it("draws everything in white at one weight on the board's own background", () => {
    for (const el of [rect, arrow, note]) {
      const markup = serializeNode(describeElement(el));
      expect(markup).toContain(INK);
      expect(markup).toMatch(/stroke-width="7"|font-size="36"/);
    }
    const { svg, width, height } = boardSvg([rect, arrow, note]);
    expect(svg).toContain(`fill="${SURFACE}"`);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(width).toBeGreaterThan(300);
    expect(height).toBeGreaterThan(300);
  });

  it("centres a box's label inside it", () => {
    const markup = serializeNode(describeElement({ ...rect, text: "API" } as RectElement));
    expect(markup).toContain('text-anchor="middle"');
    expect(markup).toContain(">API</tspan>");
  });

  it("escapes text and still exports an empty board", () => {
    expect(serializeNode(describeElement({ ...note, text: "<b>&" }))).toContain("&lt;b&gt;&amp;");
    expect(boardSvg([]).svg).toContain("<svg");
  });
});

describe("storage", () => {
  it("round-trips a board", () => {
    const storage = memory();
    writeBoard({ elements: [rect, arrow, note], view: { x: 5, y: 6, zoom: 2 } }, storage);
    expect(readBoard(storage)).toEqual({ elements: [rect, arrow, note], view: { x: 5, y: 6, zoom: 2 } });
  });

  it("starts fresh from missing or corrupt data", () => {
    expect(readBoard(memory())).toEqual(emptyBoard());
    const storage = memory();
    storage.setItem(BOARD_STORAGE_KEY, "{nope");
    expect(readBoard(storage)).toEqual(emptyBoard());
  });

  it("drops malformed and removed kinds, repairs ids and bounds the numbers", () => {
    const cleaned = cleanElements([
      { type: "rect", id: "x", x: 0, y: 0, w: -50, h: 10 },
      { type: "rect", id: "x", x: 1, y: 1, w: 5, h: 5 },
      { type: "ellipse", x: 0, y: 0, w: 1, h: 1 },
      { type: "pen", points: [0, 0, 1, 1] },
      { type: "text", x: 0, y: 0, text: "" },
      { type: "arrow", x1: 0, y1: 0, x2: 1e12, y2: "bad" },
      "junk",
    ]);
    expect(cleaned).toHaveLength(2);
    expect(cleaned[0]).toMatchObject({ type: "rect", w: 50 });
    expect(new Set(cleaned.map((el) => el.id)).size).toBe(2);
    expect(cleanElements("nope")).toEqual([]);
  });
});
