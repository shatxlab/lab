import { describe, expect, it } from "vitest";

import { ATTACH_REACH, begin, finish, moveDelta, preview, update, type Gesture, type Tool } from "@/lib/board/gesture";
import type { BoardElement, Style, View } from "@/lib/board/model";

const style: Style = { color: "blue", fill: false, width: 4 };
const view: View = { x: 0, y: 0, zoom: 1 };
const pt = (x: number, y: number) => ({ x, y });
const rect = (id: string, x: number, y: number, w = 100, h = 60): BoardElement => ({ id, type: "rect", x, y, w, h, color: "ink", fill: true, width: 4 });
const arrowEl = (id: string, over: Partial<Extract<BoardElement, { type: "arrow" }>> = {}): Extract<BoardElement, { type: "arrow" }> => ({
  id,
  type: "arrow",
  x1: 0,
  y1: 200,
  x2: 80,
  y2: 200,
  color: "ink",
  fill: false,
  width: 4,
  ...over,
});
const asArrow = (el: BoardElement | undefined) => el as Extract<BoardElement, { type: "arrow" }>;

function start(tool: Tool, world: { x: number; y: number }, over: Partial<Parameters<typeof begin>[0]> = {}) {
  return begin({ tool, style, elements: [], selection: [], world, screen: world, view, reach: 6, ...over });
}

describe("snapping to the grid", () => {
  it("starts and ends a drawing on grid points, but leaves a pen stroke free", () => {
    const g = update(start("rect", pt(31, 17), { snap: 24 }).gesture!, pt(100, 90), view);
    const done = finish(g, [], view);
    expect(done.elements[0]).toMatchObject({ type: "rect", x: 24, y: 24, w: 72, h: 72 });
    const pen = update(start("pen", pt(31, 17), { snap: 24 }).gesture!, pt(100, 90), view);
    const stroke = finish(pen, [], view).elements[0] as Extract<BoardElement, { type: "pen" }>;
    expect(stroke.points.slice(0, 2)).toEqual([31, 17]);
    expect(stroke.points.slice(-2)).toEqual([100, 90]);
  });

  it("is free without a step", () => {
    const g = update(start("rect", pt(31, 17)).gesture!, pt(100, 90), view);
    expect(finish(g, [], view).elements[0]).toMatchObject({ x: 31, y: 17, w: 69, h: 73 });
  });

  it("moves a group so its top-left corner lands on the grid, keeping the group together", () => {
    const board = [rect("a", 10, 10), rect("b", 150, 80)];
    const begun = start("select", pt(50, 40), { elements: board, selection: ["a", "b"], snap: 24 });
    const g = update(update(begun.gesture!, pt(80, 60), view), pt(90, 75), view) as Extract<Gesture, { kind: "move" }>;
    // The group's corner (10, 10) would move by (40, 35) to (50, 45): snapped to (48, 48).
    expect(moveDelta(g)).toEqual({ x: 38, y: 38 });
    const done = finish(g, board, view);
    expect(done.elements.map((el) => [(el as { x: number }).x, (el as { y: number }).y])).toEqual([[48, 48], [188, 118]]);
  });

  it("resizes with the dragged corner on the grid", () => {
    const board = [rect("a", 24, 24, 96, 48)];
    const begun = start("select", pt(120, 72), { elements: board, selection: ["a"], snap: 24 });
    expect(begun.gesture?.kind).toBe("resize");
    const g = update(begun.gesture!, pt(171, 130), view);
    expect(finish(g, board, view).elements[0]).toMatchObject({ x: 24, y: 24, w: 144, h: 96 });
  });
});

describe("attaching arrows", () => {
  const shapes = [rect("a", 0, 0), rect("b", 300, 0)];

  it("attaches a new arrow to the shapes under both of its ends, and puts the ends on their edges", () => {
    const g = update(start("arrow", pt(50, 30), { elements: shapes }).gesture!, pt(350, 30), view);
    const done = finish(g, shapes, view);
    const made = asArrow(done.elements[2]);
    expect(made).toMatchObject({ from: "a", to: "b", x1: 100, y1: 30, x2: 300, y2: 30 });
    expect(done.elements.slice(0, 2)).toEqual(shapes);
  });

  it("attaches one end only when the other is in empty space", () => {
    const g = update(start("arrow", pt(50, 30), { elements: shapes }).gesture!, pt(200, 250), view);
    const made = asArrow(finish(g, shapes, view).elements[2]);
    expect(made.from).toBe("a");
    expect(made.to).toBeUndefined();
    expect(made.x2).toBe(200);
    expect(made.y2).toBe(250);
  });

  it("reaches a little beyond a shape's edge, scaled by the zoom", () => {
    const near = update(start("arrow", pt(200, 200), { elements: shapes }).gesture!, pt(100 + ATTACH_REACH - 1, 30), view);
    expect(asArrow(finish(near, shapes, view).elements[2]).to).toBe("a");
    const far = update(start("arrow", pt(200, 200), { elements: shapes }).gesture!, pt(100 + ATTACH_REACH + 5, 30), view);
    expect(asArrow(finish(far, shapes, view).elements[2]).to).toBeUndefined();
    const zoomed: View = { x: 0, y: 0, zoom: 4 };
    const g = update(start("arrow", pt(200, 200), { elements: shapes, view: zoomed }).gesture!, pt(100 + ATTACH_REACH / 4 + 2, 30), zoomed);
    expect(asArrow(finish(g, shapes, zoomed).elements[2]).to).toBeUndefined();
  });

  it("shows the attachment while drawing", () => {
    const g = update(start("arrow", pt(50, 30), { elements: shapes }).gesture!, pt(350, 30), view);
    const shown = asArrow(preview(g, shapes, 1).at(-1));
    expect(shown).toMatchObject({ from: "a", to: "b", x1: 100, x2: 300 });
  });

  it("re-attaches or detaches an arrow end that is dragged by its handle", () => {
    const board = [...shapes, arrowEl("x", { from: "a", x1: 100, y1: 30, x2: 200, y2: 250 })];
    const begun = start("select", pt(200, 250), { elements: board, selection: ["x"] });
    expect(begun.gesture?.kind).toBe("resize");
    // Dropped on the other shape: attached to it.
    const onB = update(begun.gesture!, pt(350, 30), view);
    expect(asArrow(finish(onB, board, view).elements[2])).toMatchObject({ from: "a", to: "b", x2: 300 });
    // The start handle dropped in empty space lets go of its shape.
    const grab = start("select", pt(100, 30), { elements: board, selection: ["x"] });
    expect(grab.gesture).toMatchObject({ kind: "resize", handle: "start" });
    const freed = asArrow(finish(update(grab.gesture!, pt(500, 500), view), board, view).elements[2]);
    expect(freed.from).toBeUndefined();
    expect(freed).toMatchObject({ x1: 500, y1: 500 });
  });

  it("will not attach the end of an arrow to the shape its other end already holds", () => {
    const board = [...shapes, arrowEl("x", { from: "a", x1: 100, y1: 30, x2: 200, y2: 250 })];
    const begun = start("select", pt(200, 250), { elements: board, selection: ["x"] });
    const over = update(begun.gesture!, pt(50, 30), view);
    expect(asArrow(finish(over, board, view).elements[2]).to).toBeUndefined();
  });
});

describe("arrows follow their shapes", () => {
  const shapes = [rect("a", 0, 0), rect("b", 300, 0)];
  const joined = [...shapes, arrowEl("x", { from: "a", to: "b", x1: 100, y1: 30, x2: 300, y2: 30 })];

  it("drags an attached arrow along while a shape moves, live and when finished", () => {
    const begun = start("select", pt(350, 30), { elements: joined, selection: ["b"] });
    expect(begun.gesture?.kind).toBe("move");
    const g = update(update(begun.gesture!, pt(60, 60), view), pt(60, 150), view);
    const live = asArrow(preview(g, joined, 1)[2]);
    expect(live.from).toBe("a");
    expect(live.y2).toBeGreaterThan(30);
    const done = finish(g, joined, view);
    expect(asArrow(done.elements[2])).toMatchObject({ from: "a", to: "b" });
    expect(asArrow(done.elements[2]).y2).toBeGreaterThan(30);
    // The other shape did not move.
    expect(done.elements[0]).toEqual(joined[0]);
  });

  it("moving an arrow on its own lets go of its shapes", () => {
    const begun = start("select", pt(200, 30), { elements: joined, selection: ["x"], reach: 6 });
    const g = update(update(begun.gesture!, pt(210, 60), view), pt(210, 90), view);
    const arrowDone = asArrow(finish(g, joined, view).elements[2]);
    expect(arrowDone.from).toBeUndefined();
    expect(arrowDone.to).toBeUndefined();
    expect(arrowDone.y1).toBe(90);
  });

  it("moving an arrow together with its shapes keeps it attached", () => {
    const begun = start("select", pt(50, 30), { elements: joined, selection: ["a", "b", "x"] });
    const g = update(update(begun.gesture!, pt(60, 60), view), pt(60, 130), view);
    const done = finish(g, joined, view);
    expect(asArrow(done.elements[2])).toMatchObject({ from: "a", to: "b" });
    expect(done.elements[0]).toMatchObject({ y: 100 });
  });

  it("follows a resized shape", () => {
    const begun = start("select", pt(100, 60), { elements: joined, selection: ["a"] });
    expect(begun.gesture).toMatchObject({ kind: "resize", handle: "se" });
    const g = update(begun.gesture!, pt(200, 60), view);
    const done = finish(g, joined, view);
    expect(asArrow(done.elements[2]).x1).toBe(200);
  });
});
