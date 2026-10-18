/** Pure geometry for the whiteboard: bounds, hit-testing, moving, linking, snapping, arrow heads. */

import { LABEL_PAD, STROKE, TEXT_SIZE, type ArrowElement, type BoardElement, type RectElement, type TextElement } from "@/lib/board/model";

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

/** Text has no measured size without a canvas; this estimate is close enough to grab and fit it. */
export function textSize(text: string): { w: number; h: number } {
  const lines = text.split("\n");
  const longest = Math.max(1, ...lines.map((line) => line.length));
  return { w: longest * TEXT_SIZE * GLYPH, h: lines.length * TEXT_SIZE * LINE_HEIGHT };
}

export const textBox = (el: TextElement): Box => ({ x: el.x, y: el.y, ...textSize(el.text) });

export const centerOf = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** The box grown (about its centre) so its label fits inside; never shrunk. */
export function fitLabel(el: RectElement): RectElement {
  if (el.text === "") return el;
  const size = textSize(el.text);
  const w = Math.max(el.w, size.w + LABEL_PAD * 2);
  const h = Math.max(el.h, size.h + LABEL_PAD * 2);
  if (w === el.w && h === el.h) return el;
  return { ...el, x: el.x - (w - el.w) / 2, y: el.y - (h - el.h) / 2, w, h };
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

const within = (b: Box, p: Point, reach: number): boolean => p.x >= b.x - reach && p.x <= b.x + b.w + reach && p.y >= b.y - reach && p.y <= b.y + b.h + reach;

/**
 * Is `p` on the element? `tolerance` (in world units) widens the thin parts so
 * they are easy to grab. A box is hit anywhere inside, text anywhere in its box.
 */
export function hitTest(el: BoardElement, p: Point, tolerance: number): boolean {
  const reach = tolerance + STROKE / 2;
  switch (el.type) {
    case "rect":
      return within(boundsOf(el), p, reach);
    case "arrow":
      return distanceToSegment(p, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) <= reach;
    default:
      return within(textBox(el), p, tolerance);
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
      // An arrow moved on its own lets go of its boxes.
      return { id: el.id, type: "arrow", x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
  }
}

/** The topmost box with `p` inside it (or within `reach` of it), or null. */
export function boxAt(elements: readonly BoardElement[], p: Point, reach = 0): RectElement | null {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i]!;
    if (el.type === "rect" && within(boundsOf(el), p, reach)) return el;
  }
  return null;
}

/** Where the line from the box's centre towards `p` leaves the box, `gap` further out. */
export function edgePoint(b: Box, p: Point, gap = 0): Point {
  const c = centerOf(b);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return c;
  const t = Math.min(dx === 0 ? Infinity : b.w / 2 / Math.abs(dx), dy === 0 ? Infinity : b.h / 2 / Math.abs(dy));
  return { x: c.x + dx * t + (dx / length) * gap, y: c.y + dy * t + (dy / length) * gap };
}

/** Room between a box's outline and the end of an arrow attached to it. */
const ARROW_GAP = STROKE + 4;

/**
 * Puts the attached ends of every arrow on the edge of their boxes, facing each
 * other, and lets go of boxes that are gone. Returns the same array if nothing moved.
 */
export function connect(elements: readonly BoardElement[]): BoardElement[] {
  const boxes = new Map<string, RectElement>();
  for (const el of elements) if (el.type === "rect") boxes.set(el.id, el);
  let changed = false;
  const out = elements.map((el) => {
    if (el.type !== "arrow" || (!el.from && !el.to)) return el;
    const from = el.from ? boxes.get(el.from) : undefined;
    const to = el.to ? boxes.get(el.to) : undefined;
    const a = from ? edgePoint(from, to ? centerOf(to) : { x: el.x2, y: el.y2 }, ARROW_GAP) : { x: el.x1, y: el.y1 };
    const b = to ? edgePoint(to, from ? centerOf(from) : { x: el.x1, y: el.y1 }, ARROW_GAP) : { x: el.x2, y: el.y2 };
    const next: ArrowElement = { id: el.id, type: "arrow", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    if (from) next.from = from.id;
    if (to) next.to = to.id;
    if (next.x1 === el.x1 && next.y1 === el.y1 && next.x2 === el.x2 && next.y2 === el.y2 && next.from === el.from && next.to === el.to) return el;
    changed = true;
    return next;
  });
  return changed ? out : (elements as BoardElement[]);
}

/** Removes an element; a box takes the arrows attached to it along. */
export function remove(elements: readonly BoardElement[], id: string): BoardElement[] {
  return elements.filter((el) => el.id !== id && !(el.type === "arrow" && (el.from === id || el.to === id)));
}

/**
 * Nudges a box or text into line with its neighbours when it is within
 * `tolerance`: boxes by their centres, so a row or a column of them lines up;
 * text by its top-left corner, so columns of notes line up.
 */
export function snap(el: BoardElement, elements: readonly BoardElement[], tolerance: number): BoardElement {
  if (el.type === "arrow") return el;
  const anchor = (e: RectElement | TextElement): Point => (e.type === "rect" ? centerOf(e) : { x: e.x, y: e.y });
  const own = anchor(el);
  let dx: number | null = null;
  let dy: number | null = null;
  for (const other of elements) {
    if (other.id === el.id || other.type !== el.type) continue;
    const p = anchor(other);
    if (Math.abs(p.x - own.x) <= tolerance && (dx === null || Math.abs(p.x - own.x) < Math.abs(dx))) dx = p.x - own.x;
    if (Math.abs(p.y - own.y) <= tolerance && (dy === null || Math.abs(p.y - own.y) < Math.abs(dy))) dy = p.y - own.y;
  }
  return dx === null && dy === null ? el : translate(el, dx ?? 0, dy ?? 0);
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
