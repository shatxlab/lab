/**
 * Arrows that stay attached to shapes. An arrow may name the shape its start
 * (`from`) and its end (`to`) belong to; the arrow's coordinates are then the
 * points where the line between the two shapes' centres leaves them, so moving
 * or resizing a shape drags its arrows along. The coordinates are always stored
 * in sync (`resolveBindings` runs on every change), which keeps the saved file
 * and the SVG export free of any knowledge of bindings.
 */

import { boundsOf, type Point } from "@/lib/board/geometry";
import type { BoardElement } from "@/lib/board/model";

type Arrow = Extract<BoardElement, { type: "arrow" }>;
type Connectable = Extract<BoardElement, { type: "rect" | "ellipse" | "text" }>;

export const isConnectable = (el: BoardElement): el is Connectable => el.type === "rect" || el.type === "ellipse" || el.type === "text";

const centerOf = (el: BoardElement): Point => {
  const b = boundsOf(el);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
};

/** The topmost shape an arrow end dropped at `p` would attach to: the shape's area, widened by `tolerance`. */
export function shapeAt(elements: readonly BoardElement[], p: Point, tolerance: number, exclude: readonly string[] = []): Connectable | null {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i]!;
    if (!isConnectable(el) || exclude.includes(el.id)) continue;
    const b = boundsOf(el);
    if (el.type === "ellipse") {
      const rx = b.w / 2 + tolerance;
      const ry = b.h / 2 + tolerance;
      const nx = (p.x - (b.x + b.w / 2)) / Math.max(1e-6, rx);
      const ny = (p.y - (b.y + b.h / 2)) / Math.max(1e-6, ry);
      if (nx * nx + ny * ny <= 1) return el;
    } else if (p.x >= b.x - tolerance && p.x <= b.x + b.w + tolerance && p.y >= b.y - tolerance && p.y <= b.y + b.h + tolerance) {
      return el;
    }
  }
  return null;
}

/** Where a line from the shape's centre toward `toward` leaves the shape. */
export function edgePoint(el: BoardElement, toward: Point): Point {
  const b = boundsOf(el);
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = b.w / 2;
  const hh = b.h / 2;
  let scale: number;
  if (el.type === "ellipse") {
    scale = hw === 0 || hh === 0 ? 0 : 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  } else {
    const sx = dx === 0 ? Infinity : hw / Math.abs(dx);
    const sy = dy === 0 ? Infinity : hh / Math.abs(dy);
    scale = Math.min(sx, sy);
  }
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

const same = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

/** The arrow with its bound ends moved onto their shapes, or the arrow itself when nothing needs to move. */
function resolveArrow(arrow: Arrow, byId: ReadonlyMap<string, BoardElement>): Arrow {
  let from = arrow.from !== undefined ? byId.get(arrow.from) : undefined;
  let to = arrow.to !== undefined ? byId.get(arrow.to) : undefined;
  if (from && !isConnectable(from)) from = undefined;
  if (to && !isConnectable(to)) to = undefined;
  // An arrow from a shape to itself has no direction to draw.
  if (from && to && from.id === to.id) to = undefined;

  let { x1, y1, x2, y2 } = arrow;
  if (from) {
    const target = to ? centerOf(to) : { x: x2, y: y2 };
    ({ x: x1, y: y1 } = edgePoint(from, target));
  }
  if (to) {
    const target = from ? centerOf(from) : { x: x1, y: y1 };
    ({ x: x2, y: y2 } = edgePoint(to, target));
  }

  const nextFrom = from?.id;
  const nextTo = to?.id;
  if (same(x1, arrow.x1) && same(y1, arrow.y1) && same(x2, arrow.x2) && same(y2, arrow.y2) && nextFrom === arrow.from && nextTo === arrow.to) return arrow;
  const next: Arrow = { ...arrow, x1, y1, x2, y2 };
  if (nextFrom === undefined) delete next.from;
  else next.from = nextFrom;
  if (nextTo === undefined) delete next.to;
  else next.to = nextTo;
  return next;
}

/** Make every bound arrow agree with its shapes, and let go of shapes that no longer exist. Returns the same array when nothing changed. */
export function resolveBindings(elements: readonly BoardElement[]): BoardElement[] {
  if (!elements.some((el) => el.type === "arrow" && (el.from !== undefined || el.to !== undefined))) return elements as BoardElement[];
  const byId = new Map(elements.map((el) => [el.id, el] as const));
  let changed = false;
  const next = elements.map((el) => {
    if (el.type !== "arrow") return el;
    const resolved = resolveArrow(el, byId);
    if (resolved !== el) changed = true;
    return resolved;
  });
  return changed ? next : (elements as BoardElement[]);
}

/** Attach one end of an arrow to whatever shape lies at `p` (or detach it over empty space). */
export function bindEnd(arrow: Arrow, end: "start" | "end", elements: readonly BoardElement[], p: Point, tolerance: number): Arrow {
  const other = end === "start" ? arrow.to : arrow.from;
  const target = shapeAt(elements, p, tolerance, [arrow.id]);
  // Both ends on one shape would leave the arrow with nothing to point at.
  const usable = target && target.id !== other ? target : null;
  const next: Arrow = { ...arrow };
  const key = end === "start" ? "from" : "to";
  if (usable) next[key] = usable.id;
  else delete next[key];
  return next;
}

/** Detach an arrow end from shapes that are not moving with it. */
export function detachFrom(arrow: Arrow, moving: ReadonlySet<string>): Arrow {
  const next: Arrow = { ...arrow };
  if (next.from !== undefined && !moving.has(next.from)) delete next.from;
  if (next.to !== undefined && !moving.has(next.to)) delete next.to;
  return next;
}
