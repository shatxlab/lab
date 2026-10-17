/** Pure geometry for the whiteboard: bounds, hit-testing, moving, arrow heads. */

import { STROKE, TEXT_SIZE, type BoardElement, type TextElement } from "@/lib/board/model";

export interface Point {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A box with positive size from two opposite corners, whichever way they were dragged. */
export function boxFrom(a: Point, b: Point): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

const LINE_HEIGHT = 1.25;
const GLYPH = 0.6;

/** Text has no measured size without a canvas; this estimate is close enough to grab it. */
export function textBox(el: TextElement): Box {
  const lines = el.text.split("\n");
  const longest = Math.max(1, ...lines.map((line) => line.length));
  return { x: el.x, y: el.y, w: longest * TEXT_SIZE * GLYPH, h: lines.length * TEXT_SIZE * LINE_HEIGHT };
}

export function boundsOf(el: BoardElement): Box {
  switch (el.type) {
    case "rect":
      return boxFrom({ x: el.x, y: el.y }, { x: el.x + el.w, y: el.y + el.h });
    case "arrow":
      return boxFrom({ x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 });
    default:
      return textBox(el);
  }
}

export function unionOf(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Is `p` on the element? `tolerance` (in world units) widens the thin parts so
 * they are easy to grab. A rectangle is hit on its outline, text anywhere in its box.
 */
export function hitTest(el: BoardElement, p: Point, tolerance: number): boolean {
  const reach = tolerance + STROKE / 2;
  switch (el.type) {
    case "rect": {
      const b = boundsOf(el);
      const inside = p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
      if (inside) return Math.min(p.x - b.x, b.x + b.w - p.x, p.y - b.y, b.y + b.h - p.y) <= reach;
      return p.x >= b.x - reach && p.x <= b.x + b.w + reach && p.y >= b.y - reach && p.y <= b.y + b.h + reach;
    }
    case "arrow":
      return distanceToSegment(p, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) <= reach;
    default: {
      const b = textBox(el);
      return p.x >= b.x - tolerance && p.x <= b.x + b.w + tolerance && p.y >= b.y - tolerance && p.y <= b.y + b.h + tolerance;
    }
  }
}

/** The topmost element under `p`, or null. */
export function topmostAt(elements: readonly BoardElement[], p: Point, tolerance: number): BoardElement | null {
  for (let i = elements.length - 1; i >= 0; i -= 1) if (hitTest(elements[i]!, p, tolerance)) return elements[i]!;
  return null;
}

export function translate(el: BoardElement, dx: number, dy: number): BoardElement {
  switch (el.type) {
    case "rect":
    case "text":
      return { ...el, x: el.x + dx, y: el.y + dy };
    default:
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
  }
}

/** The two barbs of an arrow head at (x2, y2): points to draw lines to. */
export function arrowHead(el: Extract<BoardElement, { type: "arrow" }>): [Point, Point] {
  const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
  const length = 10 + STROKE * 2;
  const spread = Math.PI / 7;
  return [
    { x: el.x2 - length * Math.cos(angle - spread), y: el.y2 - length * Math.sin(angle - spread) },
    { x: el.x2 - length * Math.cos(angle + spread), y: el.y2 - length * Math.sin(angle + spread) },
  ];
}
