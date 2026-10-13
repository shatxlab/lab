import { describe, expect, it } from "vitest";

import {
  arrowHead,
  boundsOf,
  boxFrom,
  distanceToSegment,
  elementsInBox,
  handlesOf,
  hitTest,
  resizeElement,
  textBox,
  topmostAt,
  translate,
  unionOf,
} from "@/lib/board/geometry";
import type { BoardElement } from "@/lib/board/model";

const style = { color: "ink" as const, fill: false, width: 4 };
const rect = (x: number, y: number, w: number, h: number, over: Partial<BoardElement> = {}): BoardElement => ({ id: "r", type: "rect", x, y, w, h, ...style, ...over }) as BoardElement;
const ellipse = (x: number, y: number, w: number, h: number, over: Partial<BoardElement> = {}): BoardElement => ({ id: "e", type: "ellipse", x, y, w, h, ...style, ...over }) as BoardElement;
const arrow = (x1: number, y1: number, x2: number, y2: number): BoardElement => ({ id: "a", type: "arrow", x1, y1, x2, y2, ...style });
const pen = (points: number[]): BoardElement => ({ id: "p", type: "pen", points, ...style });
const text = (x: number, y: number, t: string, size = 20): BoardElement => ({ id: "t", type: "text", x, y, text: t, size, ...style });

describe("boxes", () => {
  it("builds a positive box whichever way it was dragged", () => {
    expect(boxFrom({ x: 10, y: 20 }, { x: 4, y: 50 })).toEqual({ x: 4, y: 20, w: 6, h: 30 });
  });

  it("unions boxes", () => {
    expect(unionOf([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: -5, w: 5, h: 5 }])).toEqual({ x: 0, y: -5, w: 25, h: 15 });
    expect(unionOf([])).toBeNull();
  });

  it("measures each kind of element", () => {
    expect(boundsOf(rect(10, 10, -4, 6))).toEqual({ x: 6, y: 10, w: 4, h: 6 });
    expect(boundsOf(arrow(30, 5, 10, 25))).toEqual({ x: 10, y: 5, w: 20, h: 20 });
    expect(boundsOf(pen([0, 10, 5, 0, 8, 4]))).toEqual({ x: 0, y: 0, w: 8, h: 10 });
    expect(boundsOf(pen([]))).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    const t = text(5, 5, "ab\nabcd", 10) as Extract<BoardElement, { type: "text" }>;
    expect(textBox(t)).toEqual({ x: 5, y: 5, w: 24, h: 25 });
  });
});

describe("distanceToSegment", () => {
  it("measures to the nearest point, including the ends", () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe("hitTest", () => {
  it("hits an unfilled rectangle on its outline only, and a filled one inside too", () => {
    const open = rect(0, 0, 100, 100);
    expect(hitTest(open, { x: 50, y: 50 }, 4)).toBe(false);
    expect(hitTest(open, { x: 1, y: 50 }, 4)).toBe(true);
    expect(hitTest(open, { x: 50, y: 101 }, 4)).toBe(true);
    expect(hitTest(open, { x: 120, y: 50 }, 4)).toBe(false);
    expect(hitTest(rect(0, 0, 100, 100, { fill: true }), { x: 50, y: 50 }, 4)).toBe(true);
  });

  it("hits an ellipse on its outline, and inside when filled", () => {
    const e = ellipse(0, 0, 100, 60);
    expect(hitTest(e, { x: 50, y: 30 }, 3)).toBe(false);
    expect(hitTest(e, { x: 100, y: 30 }, 3)).toBe(true);
    expect(hitTest(e, { x: 50, y: 0 }, 3)).toBe(true);
    expect(hitTest(e, { x: 4, y: 4 }, 3)).toBe(false); // the corner of its box is empty
    expect(hitTest(ellipse(0, 0, 100, 60, { fill: true }), { x: 50, y: 30 }, 3)).toBe(true);
  });

  it("hits an arrow and a pen stroke near the line, with the tolerance widening it", () => {
    // Reach is the tolerance plus half the stroke width (2): 4 here, 8 with a tolerance of 6.
    expect(hitTest(arrow(0, 0, 100, 0), { x: 50, y: 7 }, 2)).toBe(false);
    expect(hitTest(arrow(0, 0, 100, 0), { x: 50, y: 7 }, 6)).toBe(true);
    const stroke = pen([0, 0, 50, 0, 50, 50]);
    expect(hitTest(stroke, { x: 25, y: 1 }, 2)).toBe(true);
    expect(hitTest(stroke, { x: 50, y: 25 }, 2)).toBe(true);
    expect(hitTest(stroke, { x: 10, y: 30 }, 2)).toBe(false);
    expect(hitTest(pen([5, 5]), { x: 6, y: 5 }, 2)).toBe(true);
  });

  it("hits text anywhere in its box", () => {
    expect(hitTest(text(10, 10, "hello"), { x: 30, y: 20 }, 2)).toBe(true);
    expect(hitTest(text(10, 10, "hello"), { x: 300, y: 20 }, 2)).toBe(false);
  });

  it("finds the topmost element", () => {
    const below = rect(0, 0, 100, 100, { id: "below", fill: true });
    const above = rect(20, 20, 60, 60, { id: "above", fill: true });
    expect(topmostAt([below, above], { x: 50, y: 50 }, 3)?.id).toBe("above");
    expect(topmostAt([below, above], { x: 5, y: 5 }, 3)?.id).toBe("below");
    expect(topmostAt([below, above], { x: 500, y: 500 }, 3)).toBeNull();
  });

  it("selects what a marquee touches", () => {
    const els = [rect(0, 0, 10, 10, { id: "in" }), rect(100, 100, 10, 10, { id: "out" })];
    expect(elementsInBox(els, { x: -5, y: -5, w: 20, h: 20 }).map((e) => e.id)).toEqual(["in"]);
  });
});

describe("translate", () => {
  it("moves every kind of element", () => {
    expect(translate(rect(1, 2, 3, 4), 10, 20)).toMatchObject({ x: 11, y: 22, w: 3, h: 4 });
    expect(translate(arrow(0, 0, 5, 5), 1, 2)).toMatchObject({ x1: 1, y1: 2, x2: 6, y2: 7 });
    expect((translate(pen([0, 0, 2, 2]), 5, 7) as Extract<BoardElement, { type: "pen" }>).points).toEqual([5, 7, 7, 9]);
    expect(translate(text(1, 1, "x"), 2, 3)).toMatchObject({ x: 3, y: 4 });
  });
});

describe("handles and resizing", () => {
  it("offers eight handles on a box, the two ends on an arrow, corners on text and pens", () => {
    expect(handlesOf(rect(0, 0, 10, 10)).map((h) => h.id)).toEqual(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);
    expect(handlesOf(arrow(0, 0, 5, 5)).map((h) => h.id)).toEqual(["start", "end"]);
    expect(handlesOf(text(0, 0, "x")).map((h) => h.id)).toEqual(["nw", "ne", "se", "sw"]);
    expect(handlesOf(pen([0, 0, 4, 4])).map((h) => h.id)).toEqual(["nw", "ne", "se", "sw"]);
    const se = handlesOf(rect(10, 20, 30, 40)).find((h) => h.id === "se")!;
    expect([se.x, se.y]).toEqual([40, 60]);
  });

  it("stretches a rectangle from a handle, keeping the opposite side put", () => {
    const grown = resizeElement(rect(10, 10, 20, 20), "se", { x: 50, y: 60 });
    expect(grown).toMatchObject({ x: 10, y: 10, w: 40, h: 50 });
    const west = resizeElement(rect(10, 10, 20, 20), "w", { x: 0, y: 99 });
    expect(west).toMatchObject({ x: 0, y: 10, w: 30, h: 20 });
    const north = resizeElement(rect(10, 10, 20, 20), "n", { x: 99, y: 4 });
    expect(north).toMatchObject({ x: 10, y: 4, w: 20, h: 26 });
  });

  it("flips when dragged past the opposite side, and never collapses below a minimum", () => {
    expect(resizeElement(rect(10, 10, 20, 20), "se", { x: 0, y: 0 })).toMatchObject({ x: 0, y: 0, w: 10, h: 10 });
    expect(resizeElement(rect(10, 10, 20, 20), "e", { x: 10, y: 0 })).toMatchObject({ w: 4 });
  });

  it("moves one end of an arrow", () => {
    expect(resizeElement(arrow(0, 0, 10, 10), "end", { x: 30, y: 5 })).toMatchObject({ x1: 0, y1: 0, x2: 30, y2: 5 });
    expect(resizeElement(arrow(0, 0, 10, 10), "start", { x: -3, y: -3 })).toMatchObject({ x1: -3, y1: -3, x2: 10, y2: 10 });
  });

  it("scales a pen stroke with its box", () => {
    const scaled = resizeElement(pen([0, 0, 10, 10]), "se", { x: 20, y: 40 }) as Extract<BoardElement, { type: "pen" }>;
    expect(scaled.points).toEqual([0, 0, 20, 40]);
  });

  it("scales text by its corner, keeping the far corner fixed and the size in range", () => {
    const original = text(0, 0, "abcd", 20) as Extract<BoardElement, { type: "text" }>;
    const bigger = resizeElement(original, "se", { x: 96, y: 0 }) as typeof original;
    expect(bigger.size).toBe(40);
    expect([bigger.x, bigger.y]).toEqual([0, 0]);
    const fromNw = resizeElement(original, "nw", { x: -48, y: 0 }) as typeof original;
    expect(fromNw.size).toBe(40);
    // The south-east corner did not move.
    const before = textBox(original);
    const after = textBox(fromNw);
    expect(after.x + after.w).toBeCloseTo(before.x + before.w, 5);
    expect(resizeElement(original, "se", { x: 100000, y: 0 })).toMatchObject({ size: 200 });
    expect(resizeElement(original, "se", { x: 1, y: 0 })).toMatchObject({ size: 8 });
  });
});

describe("arrowHead", () => {
  it("puts two barbs behind the tip, at equal distance and mirrored about the shaft", () => {
    const a = arrow(0, 0, 100, 0) as Extract<BoardElement, { type: "arrow" }>;
    const [one, two] = arrowHead(a);
    expect(one.x).toBeLessThan(100);
    expect(two.x).toBeCloseTo(one.x, 6);
    expect(one.y).toBeCloseTo(-two.y, 6);
    expect(Math.hypot(100 - one.x, one.y)).toBeCloseTo(10 + 4 * 2, 6);
  });

  it("follows the direction of the arrow", () => {
    const [one, two] = arrowHead(arrow(0, 0, 0, 100) as Extract<BoardElement, { type: "arrow" }>);
    expect(one.y).toBeLessThan(100);
    expect(two.y).toBeCloseTo(one.y, 6);
  });
});
