import { describe, expect, it } from "vitest";

import { begin, drawn, finish, marqueeBox, newText, panView, pinchView, preview, update, type Gesture, type Tool } from "@/lib/board/gesture";
import type { BoardElement, Style, View } from "@/lib/board/model";
import { clampZoom, toWorld } from "@/lib/board/viewport";

const style: Style = { color: "blue", fill: false, width: 4 };
const view: View = { x: 0, y: 0, zoom: 1 };
const pt = (x: number, y: number) => ({ x, y });
const rect = (id: string, x: number, y: number, w: number, h: number, fill = true): BoardElement => ({ id, type: "rect", x, y, w, h, color: "ink", fill, width: 4 });

function start(tool: Tool, over: Partial<Parameters<typeof begin>[0]> = {}) {
  return begin({ tool, style, elements: [], selection: [], world: pt(10, 10), screen: pt(10, 10), view, reach: 6, ...over });
}

describe("drawing", () => {
  it("draws a rectangle from drag corners, whichever way, and selects it", () => {
    const { gesture, selection } = start("rect");
    expect(selection).toEqual([]);
    const moved = update(gesture!, pt(4, 2), view);
    const done = finish(moved, [], view);
    expect(done.elements).toHaveLength(1);
    expect(done.elements[0]).toMatchObject({ type: "rect", x: 4, y: 2, w: 6, h: 8, color: "blue", width: 4 });
    expect(done.selection).toEqual([done.elements[0]!.id]);
  });

  it("makes a square or a circle with Shift, and an arrow in 45° steps", () => {
    const g = update(start("rect").gesture!, pt(50, 20), view, true);
    expect(drawn(g as Extract<Gesture, { kind: "draw" }>)).toMatchObject({ w: 40, h: 40 });
    const circle = update(start("ellipse").gesture!, pt(30, 100), view, true);
    expect(drawn(circle as Extract<Gesture, { kind: "draw" }>)).toMatchObject({ w: 90, h: 90 });
    const snapped = update(start("arrow").gesture!, pt(110, 22), view, true);
    const a = drawn(snapped as Extract<Gesture, { kind: "draw" }>) as Extract<BoardElement, { type: "arrow" }>;
    expect(a.y2).toBeCloseTo(a.y1, 6); // nearly horizontal snaps to exactly horizontal
    const diagonal = update(start("arrow").gesture!, pt(60, 52), view, true);
    const d = drawn(diagonal as Extract<Gesture, { kind: "draw" }>) as Extract<BoardElement, { type: "arrow" }>;
    expect(d.x2 - d.x1).toBeCloseTo(d.y2 - d.y1, 6);
  });

  it("draws an arrow from where it started to where it ended", () => {
    const done = finish(update(start("arrow").gesture!, pt(80, 40), view), [], view);
    expect(done.elements[0]).toMatchObject({ type: "arrow", x1: 10, y1: 10, x2: 80, y2: 40 });
  });

  it("keeps a freehand stroke's points, spaced out", () => {
    let g = start("pen").gesture!;
    for (const [x, y] of [[10.5, 10], [12, 10], [14, 11], [14.5, 11], [20, 15]]) g = update(g, pt(x!, y!), view);
    const stroke = finish(g, [], view).elements[0] as Extract<BoardElement, { type: "pen" }>;
    expect(stroke.type).toBe("pen");
    // The two points closer than 2px were skipped.
    expect(stroke.points).toEqual([10, 10, 12, 10, 14, 11, 20, 15]);
  });

  it("makes a dot from a click with the pen, but throws away a stray rectangle or arrow", () => {
    const dot = finish(start("pen").gesture!, [], view).elements;
    expect(dot).toHaveLength(1);
    expect((dot[0] as Extract<BoardElement, { type: "pen" }>).points.length).toBeGreaterThanOrEqual(4);
    expect(finish(start("rect").gesture!, [], view).elements).toEqual([]);
    expect(finish(update(start("arrow").gesture!, pt(11, 10), view), [], view).elements).toEqual([]);
  });

  it("previews the new shape while dragging", () => {
    const g = update(start("rect").gesture!, pt(60, 40), view);
    expect(preview(g, [rect("a", 0, 0, 5, 5)])).toHaveLength(2);
  });

  it("measures 'too small' in screen pixels, so it is the same at any zoom", () => {
    const zoomed: View = { x: 0, y: 0, zoom: 4 };
    const g = update(start("rect", { view: zoomed }).gesture!, pt(10.5, 10.5), zoomed);
    expect(finish(g, [], zoomed).elements).toHaveLength(0);
    const g2 = update(start("rect", { view: zoomed }).gesture!, pt(12, 12), zoomed);
    expect(finish(g2, [], zoomed).elements).toHaveLength(1);
  });
});

describe("selecting and moving", () => {
  const a = rect("a", 0, 0, 100, 100);
  const b = rect("b", 200, 0, 100, 100);

  it("selects what is clicked, and starts a move that only counts past a few pixels", () => {
    const { gesture, selection } = start("select", { elements: [a, b], world: pt(50, 50) });
    expect(selection).toEqual(["a"]);
    expect(gesture).toMatchObject({ kind: "move", ids: ["a"], moved: false });
    const click = finish(update(gesture!, pt(51, 50), view), [a, b], view);
    expect(click.elements).toEqual([a, b]);
    const dragged = finish(update(gesture!, pt(80, 70), view), [a, b], view);
    expect(dragged.elements[0]).toMatchObject({ x: 30, y: 20 });
    expect(dragged.elements[1]).toBe(b);
  });

  it("moves the whole selection when dragging one of its members", () => {
    const { gesture } = start("select", { elements: [a, b], selection: ["a", "b"], world: pt(250, 50) });
    expect(gesture).toMatchObject({ kind: "move", ids: ["a", "b"] });
    const done = finish(update(gesture!, pt(260, 60), view), [a, b], view);
    expect(done.elements.map((e) => [e.id, (e as typeof a & { x: number; y: number }).x, (e as typeof a & { x: number; y: number }).y])).toEqual([
      ["a", 10, 10],
      ["b", 210, 10],
    ]);
  });

  it("toggles an element in the selection with Shift, without starting a move on removal", () => {
    const added = start("select", { elements: [a, b], selection: ["a"], world: pt(250, 50), shift: true });
    expect(added.selection).toEqual(["a", "b"]);
    const removed = start("select", { elements: [a, b], selection: ["a", "b"], world: pt(250, 50), shift: true });
    expect(removed.selection).toEqual(["a"]);
    expect(removed.gesture).toBeNull();
  });

  it("selects by marquee, adding to the selection with Shift, and clears it on an empty click", () => {
    const g = update(start("select", { elements: [a, b], world: pt(-10, -10) }).gesture!, pt(110, 110), view);
    expect(marqueeBox(g as Extract<Gesture, { kind: "marquee" }>)).toEqual({ x: -10, y: -10, w: 120, h: 120 });
    expect(finish(g, [a, b], view).selection).toEqual(["a"]);
    const more = update(start("select", { elements: [a, b], selection: ["b"], world: pt(-10, -10), shift: true }).gesture!, pt(110, 110), view);
    expect(finish(more, [a, b], view).selection).toEqual(["b", "a"]);
    const click = start("select", { elements: [a, b], selection: ["a"], world: pt(500, 500) });
    expect(click.selection).toEqual([]);
    expect(finish(click.gesture!, [a, b], view).selection).toEqual([]);
  });

  it("grabs a handle of the single selected element before anything underneath", () => {
    const covered = rect("under", 90, 90, 100, 100);
    const { gesture } = start("select", { elements: [covered, a], selection: ["a"], world: pt(100, 100) });
    expect(gesture).toMatchObject({ kind: "resize", handle: "se" });
    const done = finish(update(gesture!, pt(150, 130), view), [covered, a], view);
    expect(done.elements[1]).toMatchObject({ id: "a", w: 150, h: 130 });
    expect(preview(update(gesture!, pt(150, 130), view), [covered, a])[1]).toMatchObject({ w: 150 });
  });

  it("leaves the elements untouched when a resize does not change anything", () => {
    const { gesture } = start("select", { elements: [a], selection: ["a"], world: pt(100, 100) });
    const done = finish(gesture!, [a], view);
    expect(done.elements[0]).toBe(a);
  });

  it("reaches thin lines more easily when zoomed out (reach is in screen pixels)", () => {
    const line: BoardElement = { id: "l", type: "arrow", x1: 0, y1: 0, x2: 200, y2: 0, color: "ink", fill: false, width: 2 };
    const out: View = { x: 0, y: 0, zoom: 0.25 };
    expect(begin({ tool: "select", style, elements: [line], selection: [], world: pt(100, 20), screen: pt(25, 5), view: out, reach: 6 }).selection).toEqual(["l"]);
    expect(begin({ tool: "select", style, elements: [line], selection: [], world: pt(100, 20), screen: pt(100, 20), view, reach: 6 }).selection).toEqual([]);
  });
});

describe("panning and pinching", () => {
  it("pans with the hand tool, the space bar, or the middle button, whatever the tool", () => {
    expect(start("hand").gesture?.kind).toBe("pan");
    expect(start("rect", { pan: true }).gesture?.kind).toBe("pan");
    const g = start("hand", { screen: pt(100, 100), view: { x: 10, y: 10, zoom: 2 } }).gesture as Extract<Gesture, { kind: "pan" }>;
    expect(panView(g, pt(140, 80))).toEqual({ x: -10, y: 20, zoom: 2 });
  });

  it("pinches: zoom follows the spread and the midpoint stays under the fingers", () => {
    const a0 = pt(100, 100);
    const b0 = pt(200, 100);
    const start0: View = { x: 0, y: 0, zoom: 1 };
    const next = pinchView(start0, a0, b0, pt(50, 100), pt(250, 100), clampZoom);
    expect(next.zoom).toBe(2);
    // The world point that was between the fingers is still between them.
    const under = toWorld(start0, 150, 100);
    const after = toWorld(next, 150, 100);
    expect(after.x).toBeCloseTo(under.x, 9);
    expect(after.y).toBeCloseTo(under.y, 9);
    expect(pinchView(start0, a0, b0, pt(0, 0), pt(100000, 0), clampZoom).zoom).toBe(8);
  });

  it("drags the canvas with two fingers moving together without zooming", () => {
    const moved = pinchView({ x: 0, y: 0, zoom: 1 }, pt(100, 100), pt(200, 100), pt(120, 130), pt(220, 130), clampZoom);
    expect(moved.zoom).toBe(1);
    expect(moved.x).toBeCloseTo(-20, 9);
    expect(moved.y).toBeCloseTo(-30, 9);
  });
});

describe("text", () => {
  it("starts empty at the click, sized by the stroke width", () => {
    expect(newText(pt(5, 6), { ...style, width: 7 })).toMatchObject({ type: "text", x: 5, y: 6, text: "", size: 36 });
    expect(newText(pt(5, 6), { ...style, width: 2 }).type).toBe("text");
  });

  it("is not a gesture of its own", () => {
    expect(start("text").gesture).toBeNull();
  });
});
