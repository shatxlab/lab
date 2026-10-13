/** Pure geometry for the whiteboard: bounds, hit-testing, resize handles, arrow heads. */

import { textSizeFor, type BoardElement } from "@/lib/board/model";

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

/** Text has no measured size without a canvas; this estimate is close enough to grab and frame it. */
export function textBox(el: Extract<BoardElement, { type: "text" }>): Box {
  const lines = el.text.split("\n");
  const longest = Math.max(1, ...lines.map((line) => line.length));
  return { x: el.x, y: el.y, w: longest * el.size * GLYPH, h: lines.length * el.size * LINE_HEIGHT };
}

export function boundsOf(el: BoardElement): Box {
  switch (el.type) {
    case "rect":
    case "ellipse":
      return boxFrom({ x: el.x, y: el.y }, { x: el.x + el.w, y: el.y + el.h });
    case "arrow":
      return boxFrom({ x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 });
    case "pen": {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < el.points.length; i += 2) {
        minX = Math.min(minX, el.points[i]!);
        maxX = Math.max(maxX, el.points[i]!);
        minY = Math.min(minY, el.points[i + 1]!);
        maxY = Math.max(maxY, el.points[i + 1]!);
      }
      return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : { x: 0, y: 0, w: 0, h: 0 };
    }
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

export const boxesIntersect = (a: Box, b: Box): boolean => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Is `p` on the element? `tolerance` (in world units) widens thin strokes so they
 * are easy to grab. An unfilled shape is hit on its outline; a filled one inside too.
 */
export function hitTest(el: BoardElement, p: Point, tolerance: number): boolean {
  const reach = tolerance + el.width / 2;
  switch (el.type) {
    case "rect": {
      const b = boundsOf(el);
      const inside = p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
      if (el.fill && inside) return true;
      const nearEdge = inside
        ? Math.min(p.x - b.x, b.x + b.w - p.x, p.y - b.y, b.y + b.h - p.y) <= reach
        : p.x >= b.x - reach && p.x <= b.x + b.w + reach && p.y >= b.y - reach && p.y <= b.y + b.h + reach;
      return nearEdge;
    }
    case "ellipse": {
      const b = boundsOf(el);
      const rx = b.w / 2;
      const ry = b.h / 2;
      if (rx === 0 || ry === 0) return distanceToSegment(p, { x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }) <= reach;
      const nx = (p.x - (b.x + rx)) / rx;
      const ny = (p.y - (b.y + ry)) / ry;
      const radial = Math.hypot(nx, ny);
      if (el.fill && radial <= 1) return true;
      // Distance to the outline, approximated in normalised space and scaled back by the smaller radius.
      return Math.abs(radial - 1) * Math.min(rx, ry) <= reach;
    }
    case "arrow":
      return distanceToSegment(p, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) <= reach;
    case "pen": {
      if (el.points.length < 4) return el.points.length === 2 && Math.hypot(p.x - el.points[0]!, p.y - el.points[1]!) <= reach;
      for (let i = 0; i + 3 < el.points.length; i += 2) {
        if (distanceToSegment(p, { x: el.points[i]!, y: el.points[i + 1]! }, { x: el.points[i + 2]!, y: el.points[i + 3]! }) <= reach) return true;
      }
      return false;
    }
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

/** Elements whose bounds touch the box (for a marquee). */
export const elementsInBox = (elements: readonly BoardElement[], box: Box): BoardElement[] => elements.filter((el) => boxesIntersect(boundsOf(el), box));

export function translate(el: BoardElement, dx: number, dy: number): BoardElement {
  switch (el.type) {
    case "rect":
    case "ellipse":
    case "text":
      return { ...el, x: el.x + dx, y: el.y + dy };
    case "arrow":
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    default:
      return { ...el, points: el.points.map((value, i) => value + (i % 2 === 0 ? dx : dy)) };
  }
}

/* --------------------------------------------------------------- handles */

export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "start" | "end";

export interface Handle {
  id: HandleId;
  x: number;
  y: number;
}

const CORNERS: HandleId[] = ["nw", "ne", "se", "sw"];

/** Where the grab points of a selected element are. */
export function handlesOf(el: BoardElement): Handle[] {
  if (el.type === "arrow") {
    return [
      { id: "start", x: el.x1, y: el.y1 },
      { id: "end", x: el.x2, y: el.y2 },
    ];
  }
  const b = boundsOf(el);
  const at = (id: HandleId): Handle => {
    const x = id.includes("w") ? b.x : id.includes("e") ? b.x + b.w : b.x + b.w / 2;
    const y = id.includes("n") ? b.y : id.includes("s") ? b.y + b.h : b.y + b.h / 2;
    return { id, x, y };
  };
  // Only boxes can be stretched along one axis; pens and text scale from their corners.
  const ids: HandleId[] = el.type === "rect" || el.type === "ellipse" ? ["nw", "n", "ne", "e", "se", "s", "sw", "w"] : CORNERS;
  return ids.map(at);
}

export const MIN_SIZE = 4;

/** The element as it would be with `handle` dragged to `p`. */
export function resizeElement(original: BoardElement, handle: HandleId, p: Point): BoardElement {
  if (original.type === "arrow") {
    return handle === "start" ? { ...original, x1: p.x, y1: p.y } : { ...original, x2: p.x, y2: p.y };
  }
  const b = boundsOf(original);
  // The corner or edge opposite the handle stays put.
  const anchorX = handle.includes("w") ? b.x + b.w : handle.includes("e") ? b.x : b.x;
  const anchorY = handle.includes("n") ? b.y + b.h : handle.includes("s") ? b.y : b.y;
  const movesX = handle.includes("w") || handle.includes("e");
  const movesY = handle.includes("n") || handle.includes("s");
  const x1 = movesX ? anchorX : b.x;
  const x2 = movesX ? p.x : b.x + b.w;
  const y1 = movesY ? anchorY : b.y;
  const y2 = movesY ? p.y : b.y + b.h;
  const next = boxFrom({ x: x1, y: y1 }, { x: x2, y: y2 });

  if (original.type === "rect" || original.type === "ellipse") {
    return { ...original, x: next.x, y: next.y, w: Math.max(MIN_SIZE, next.w), h: Math.max(MIN_SIZE, next.h) };
  }
  if (original.type === "pen") {
    const sx = b.w === 0 ? 1 : Math.max(MIN_SIZE, next.w) / b.w;
    const sy = b.h === 0 ? 1 : Math.max(MIN_SIZE, next.h) / b.h;
    return {
      ...original,
      points: original.points.map((value, i) => (i % 2 === 0 ? next.x + (value - b.x) * sx : next.y + (value - b.y) * sy)),
    };
  }
  // Text scales as one: the size follows how far the corner moved along the box's width.
  const text = original as Extract<BoardElement, { type: "text" }>;
  const ratio = b.w === 0 ? 1 : Math.max(MIN_SIZE, next.w) / b.w;
  const size = Math.min(200, Math.max(8, Math.round(text.size * ratio)));
  const scaled = { ...text, size };
  const box = textBox(scaled);
  // Keep the anchored corner where it was.
  const x = handle.includes("w") ? b.x + b.w - box.w : b.x;
  const y = handle.includes("n") ? b.y + b.h - box.h : b.y;
  return { ...scaled, x, y };
}

/** The two barbs of an arrow head at (x2, y2): points to draw lines to. */
export function arrowHead(el: Extract<BoardElement, { type: "arrow" }>): [Point, Point] {
  const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
  const length = 10 + el.width * 2;
  const spread = Math.PI / 7;
  return [
    { x: el.x2 - length * Math.cos(angle - spread), y: el.y2 - length * Math.sin(angle - spread) },
    { x: el.x2 - length * Math.cos(angle + spread), y: el.y2 - length * Math.sin(angle + spread) },
  ];
}

/** Resize a text element's size to a style width (used when the style changes). */
export const restyleText = (el: Extract<BoardElement, { type: "text" }>, width: number): BoardElement => ({ ...el, width, size: textSizeFor(width) });
