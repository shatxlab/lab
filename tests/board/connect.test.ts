import { describe, expect, it } from "vitest";

import { bindEnd, detachFrom, edgePoint, isConnectable, resolveBindings, shapeAt } from "@/lib/board/connect";
import type { BoardElement } from "@/lib/board/model";

const style = { color: "ink" as const, fill: false, width: 4 };
const rect = (id: string, x: number, y: number, w = 100, h = 60): BoardElement => ({ id, type: "rect", x, y, w, h, ...style });
const ellipse = (id: string, x: number, y: number, w = 100, h = 60): BoardElement => ({ id, type: "ellipse", x, y, w, h, ...style });
const text = (id: string, x: number, y: number): BoardElement => ({ id, type: "text", x, y, text: "Hi", size: 24, ...style });
const pen = (id: string): BoardElement => ({ id, type: "pen", points: [0, 0, 10, 10], ...style });
const arrow = (id: string, over: Partial<Extract<BoardElement, { type: "arrow" }>> = {}): Extract<BoardElement, { type: "arrow" }> => ({
  id,
  type: "arrow",
  x1: 0,
  y1: 0,
  x2: 10,
  y2: 10,
  ...style,
  ...over,
});
const asArrow = (el: BoardElement) => el as Extract<BoardElement, { type: "arrow" }>;

describe("edgePoint", () => {
  it("leaves a rectangle through the side the line points at", () => {
    const r = rect("r", 0, 0, 100, 60); // centre (50, 30)
    expect(edgePoint(r, { x: 300, y: 30 })).toEqual({ x: 100, y: 30 });
    expect(edgePoint(r, { x: -200, y: 30 })).toEqual({ x: 0, y: 30 });
    expect(edgePoint(r, { x: 50, y: 500 })).toEqual({ x: 50, y: 60 });
    expect(edgePoint(r, { x: 50, y: -500 })).toEqual({ x: 50, y: 0 });
  });

  it("leaves a rectangle at a corner when pointing along the diagonal, and slants across a side otherwise", () => {
    const r = rect("r", 0, 0, 100, 100);
    expect(edgePoint(r, { x: 250, y: 250 })).toEqual({ x: 100, y: 100 });
    const slanted = edgePoint(r, { x: 250, y: 100 });
    expect(slanted.x).toBe(100);
    expect(slanted.y).toBeCloseTo(50 + (50 * 50) / 200, 6);
  });

  it("leaves an ellipse on its outline", () => {
    const e = ellipse("e", 0, 0, 100, 60);
    expect(edgePoint(e, { x: 500, y: 30 })).toEqual({ x: 100, y: 30 });
    const diag = edgePoint(e, { x: 400, y: 300 });
    const nx = (diag.x - 50) / 50;
    const ny = (diag.y - 30) / 30;
    expect(nx * nx + ny * ny).toBeCloseTo(1, 9);
  });

  it("stays at the centre when pointing at it, and for a shape with no size", () => {
    expect(edgePoint(rect("r", 0, 0, 100, 60), { x: 50, y: 30 })).toEqual({ x: 50, y: 30 });
    expect(edgePoint(ellipse("e", 10, 10, 0, 0), { x: 99, y: 99 })).toEqual({ x: 10, y: 10 });
  });
});

describe("shapeAt", () => {
  const board = [rect("a", 0, 0), ellipse("b", 200, 0), pen("p"), text("t", 0, 200)];

  it("finds the shape whose area holds the point, widened by the tolerance", () => {
    expect(shapeAt(board, { x: 50, y: 30 }, 0)?.id).toBe("a");
    expect(shapeAt(board, { x: 104, y: 30 }, 6)?.id).toBe("a");
    expect(shapeAt(board, { x: 110, y: 30 }, 6)).toBeNull();
  });

  it("uses an ellipse's outline, not its box", () => {
    expect(shapeAt(board, { x: 250, y: 30 }, 0)?.id).toBe("b");
    expect(shapeAt(board, { x: 202, y: 2 }, 0)).toBeNull(); // the box corner is outside the ellipse
  });

  it("takes the topmost, skips what is not a shape, and honours exclusions", () => {
    const stacked = [rect("under", 0, 0), rect("over", 20, 10)];
    expect(shapeAt(stacked, { x: 50, y: 30 }, 0)?.id).toBe("over");
    expect(shapeAt(stacked, { x: 50, y: 30 }, 0, ["over"])?.id).toBe("under");
    expect(shapeAt([pen("p"), arrow("a")], { x: 5, y: 5 }, 10)).toBeNull();
    expect(shapeAt(board, { x: 20, y: 215 }, 0)?.id).toBe("t");
    expect(isConnectable(pen("p"))).toBe(false);
    expect(isConnectable(text("t", 0, 0))).toBe(true);
  });
});

describe("resolveBindings", () => {
  it("returns the very same array when no arrow is attached", () => {
    const board = [rect("a", 0, 0), arrow("x")];
    expect(resolveBindings(board)).toBe(board);
  });

  it("puts each attached end on the edge of its shape, facing the other shape", () => {
    const a = rect("a", 0, 0, 100, 60);
    const b = rect("b", 300, 0, 100, 60);
    const [, , line] = resolveBindings([a, b, arrow("x", { from: "a", to: "b" })]);
    expect(line).toMatchObject({ x1: 100, y1: 30, x2: 300, y2: 30, from: "a", to: "b" });
  });

  it("drags an arrow along when its shape moves, and leaves the free end alone", () => {
    const a = rect("a", 0, 0, 100, 60);
    const once = resolveBindings([a, arrow("x", { from: "a", x2: 400, y2: 30 })]);
    expect(asArrow(once[1]!)).toMatchObject({ x1: 100, y1: 30, x2: 400, y2: 30 });
    const moved = resolveBindings([{ ...a, y: 200 } as BoardElement, once[1]!]);
    // From the moved centre (50, 230) toward the free end (400, 30), the line leaves the right side on a slant.
    expect(asArrow(moved[1]!)).toMatchObject({ x1: 100, x2: 400, y2: 30 });
    expect(asArrow(moved[1]!).y1).toBeCloseTo(230 - (200 / 350) * 50, 6);
  });

  it("is stable: resolving twice changes nothing", () => {
    const board = resolveBindings([rect("a", 0, 0), ellipse("b", 300, 100), arrow("x", { from: "a", to: "b" })]);
    expect(resolveBindings(board)).toBe(board);
  });

  it("lets go of shapes that are gone or cannot be attached to, keeping the coordinates", () => {
    const [, gone] = resolveBindings([rect("a", 0, 0), arrow("x", { from: "missing", x1: 5, y1: 6, x2: 7, y2: 8 })]);
    expect(asArrow(gone!)).toMatchObject({ x1: 5, y1: 6, x2: 7, y2: 8 });
    expect(asArrow(gone!).from).toBeUndefined();
    const [, , toPen] = resolveBindings([rect("a", 0, 0), pen("p"), arrow("y", { from: "a", to: "p", x2: 50, y2: 50 })]);
    expect(asArrow(toPen!).to).toBeUndefined();
    expect(asArrow(toPen!).from).toBe("a");
  });

  it("does not attach both ends to one shape", () => {
    const [, line] = resolveBindings([rect("a", 0, 0), arrow("x", { from: "a", to: "a", x2: 300, y2: 30 })]);
    expect(asArrow(line!).from).toBe("a");
    expect(asArrow(line!).to).toBeUndefined();
  });

  it("follows a resized shape and a chain of shapes", () => {
    const board = resolveBindings([rect("a", 0, 0, 100, 60), rect("b", 200, 0, 100, 60), rect("c", 400, 0, 100, 60), arrow("x", { from: "a", to: "b" }), arrow("y", { from: "b", to: "c" })]);
    const wider = resolveBindings(board.map((el) => (el.id === "b" ? ({ ...el, w: 160 } as BoardElement) : el)));
    expect(asArrow(wider[3]!)).toMatchObject({ x2: 200 });
    expect(asArrow(wider[4]!)).toMatchObject({ x1: 360, x2: 400 });
  });
});

describe("bindEnd and detachFrom", () => {
  const shapes = [rect("a", 0, 0), rect("b", 300, 0)];

  it("attaches the end that is dropped on a shape, and detaches it over empty space", () => {
    const loose = arrow("x", { x1: 500, y1: 500, x2: 20, y2: 20 });
    const attached = bindEnd(loose, "end", shapes, { x: 20, y: 20 }, 6);
    expect(attached.to).toBe("a");
    const freed = bindEnd(attached, "end", shapes, { x: 600, y: 600 }, 6);
    expect(freed.to).toBeUndefined();
    expect("to" in freed).toBe(false);
  });

  it("will not attach both ends to the same shape", () => {
    const first = bindEnd(arrow("x", { from: "a" }), "end", shapes, { x: 20, y: 20 }, 6);
    expect(first.to).toBeUndefined();
    expect(first.from).toBe("a");
    expect(bindEnd(arrow("x", { from: "a" }), "end", shapes, { x: 320, y: 20 }, 6).to).toBe("b");
  });

  it("detaches from shapes that are not travelling with the arrow", () => {
    const line = arrow("x", { from: "a", to: "b" });
    expect(detachFrom(line, new Set(["a", "b", "x"]))).toMatchObject({ from: "a", to: "b" });
    const half = detachFrom(line, new Set(["a", "x"]));
    expect(half.from).toBe("a");
    expect(half.to).toBeUndefined();
    const none = detachFrom(line, new Set(["x"]));
    expect(none.from).toBeUndefined();
    expect(none.to).toBeUndefined();
  });
});
