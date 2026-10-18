/**
 * Pointer gestures as pure functions: begin one at a pointer-down, update it on
 * moves, preview what the board looks like meanwhile, and finish it into new
 * elements. The component only forwards events.
 *
 * With no tool picked, a drag on an element moves it and a drag on empty
 * canvas moves the canvas. With a tool picked, a drag draws; a click with the
 * box tool drops a box. An arrow drawn from one box to another links them.
 */

import { boundsOf, boxAt, boxFrom, connect, snap, textBox, topmostAt, translate, type Point } from "@/lib/board/geometry";
import { BOX_GAP, BOX_H, BOX_W, newId, type ArrowElement, type BoardElement, type RectElement, type TextElement, type View } from "@/lib/board/model";
import { toWorld } from "@/lib/board/viewport";

export type DrawTool = "rect" | "arrow";
export type Tool = DrawTool | "text";

export type Gesture =
  | { kind: "draw"; tool: DrawTool; start: Point; current: Point; id: string }
  | { kind: "move"; id: string; origin: Point; current: Point; moved: boolean; tolerance: number }
  | { kind: "pan"; startScreen: Point; startView: View };

export interface BeginInput {
  /** The picked tool, or null for the automatic move/pan mode. */
  tool: DrawTool | null;
  elements: readonly BoardElement[];
  /** The pointer in world and screen coordinates. */
  world: Point;
  screen: Point;
  view: View;
  /** Screen pixels a pointer may miss a thin line by. */
  reach: number;
}

/** How far a drag must go before it counts as a move rather than a click, in screen pixels. */
export const DRAG_THRESHOLD = 3;
/** How close, in screen pixels, a moved box or text must come to a neighbour's line to snap to it. */
export const SNAP = 10;

export function begin(input: BeginInput): Gesture {
  const { tool, elements, world, screen, view, reach } = input;
  if (tool) return { kind: "draw", tool, start: world, current: world, id: newId() };
  const hit = topmostAt(elements, world, reach / view.zoom);
  if (hit) return { kind: "move", id: hit.id, origin: world, current: world, moved: false, tolerance: SNAP / view.zoom };
  return { kind: "pan", startScreen: screen, startView: view };
}

export function update(gesture: Gesture, world: Point, view: View): Gesture {
  switch (gesture.kind) {
    case "draw":
      return { ...gesture, current: world };
    case "move": {
      const moved = gesture.moved || Math.hypot(world.x - gesture.origin.x, world.y - gesture.origin.y) * view.zoom >= DRAG_THRESHOLD;
      return { ...gesture, moved, current: world };
    }
    default:
      return gesture;
  }
}

/** The view while panning: the board slides with the pointer. */
export function panView(gesture: Extract<Gesture, { kind: "pan" }>, screen: Point): View {
  const { startView, startScreen } = gesture;
  return { ...startView, x: startView.x - (screen.x - startScreen.x) / startView.zoom, y: startView.y - (screen.y - startScreen.y) / startView.zoom };
}

/** Two pointers: the zoom follows their spread, and the point between them stays under them. */
export function pinchView(startView: View, a0: Point, b0: Point, a1: Point, b1: Point, clamp: (zoom: number) => number): View {
  const d0 = Math.max(1, Math.hypot(b0.x - a0.x, b0.y - a0.y));
  const d1 = Math.max(1, Math.hypot(b1.x - a1.x, b1.y - a1.y));
  const zoom = clamp(startView.zoom * (d1 / d0));
  const mid0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const anchor = toWorld(startView, mid0.x, mid0.y);
  return { zoom, x: anchor.x - mid1.x / zoom, y: anchor.y - mid1.y / zoom };
}

/** The element a drawing gesture would create right now; an arrow's ends attach to the boxes they are in. */
export function drawn(gesture: Extract<Gesture, { kind: "draw" }>, elements: readonly BoardElement[] = []): BoardElement {
  const { tool, start, current, id } = gesture;
  if (tool === "rect") return { id, type: "rect", ...boxFrom(start, current), text: "" };
  const arrow: ArrowElement = { id, type: "arrow", x1: start.x, y1: start.y, x2: current.x, y2: current.y };
  const from = boxAt(elements, start);
  const to = boxAt(elements, current);
  if (from) arrow.from = from.id;
  if (to && to !== from) arrow.to = to.id;
  return arrow;
}

/** The board as it should be drawn while the gesture is in progress. */
export function preview(gesture: Gesture | null, elements: readonly BoardElement[]): BoardElement[] {
  if (!gesture) return elements as BoardElement[];
  if (gesture.kind === "draw") return connect([...elements, drawn(gesture, elements)]);
  if (gesture.kind === "move" && gesture.moved) {
    const dx = gesture.current.x - gesture.origin.x;
    const dy = gesture.current.y - gesture.origin.y;
    return connect(elements.map((el) => (el.id === gesture.id ? snap(translate(el, dx, dy), elements, gesture.tolerance) : el)));
  }
  return elements as BoardElement[];
}

/** Is this drawing big enough to keep? A stray click is not a rectangle. */
function worthKeeping(el: BoardElement, zoom: number): boolean {
  const min = 3 / zoom;
  if (el.type === "rect") return el.w >= min || el.h >= min;
  if (el.type === "arrow") return Math.hypot(el.x2 - el.x1, el.y2 - el.y1) >= min * 2;
  return true;
}

export interface Finished {
  elements: BoardElement[];
  /** A new box, or a click (no drag) on a box or text: the id whose text to edit. */
  edit?: string;
}

export function finish(gesture: Gesture, elements: readonly BoardElement[], view: View): Finished {
  switch (gesture.kind) {
    case "draw": {
      const made = drawn(gesture, elements);
      if (worthKeeping(made, view.zoom)) return { elements: connect([...elements, made]), edit: made.type === "rect" ? made.id : undefined };
      if (made.type !== "rect") return { elements: elements as BoardElement[] };
      // A click with the box tool drops a box of the usual size, in line with its neighbours.
      const box = snap(newBox(gesture.start, gesture.id), elements, SNAP / view.zoom);
      return { elements: [...elements, box], edit: box.id };
    }
    case "move": {
      if (gesture.moved) return { elements: preview(gesture, elements) };
      const clicked = elements.find((el) => el.id === gesture.id);
      return { elements: elements as BoardElement[], edit: clicked?.type === "text" || clicked?.type === "rect" ? clicked.id : undefined };
    }
    default:
      return { elements: elements as BoardElement[] };
  }
}

/** A new, empty text element at a point, ready for editing. */
export function newText(at: Point): TextElement {
  return { id: newId(), type: "text", x: at.x, y: at.y, text: "" };
}

/** A new, empty box of the usual size centred on a point. */
export function newBox(center: Point, id = newId()): RectElement {
  return { id, type: "rect", x: center.x - BOX_W / 2, y: center.y - BOX_H / 2, w: BOX_W, h: BOX_H, text: "" };
}

export type Side = "right" | "below";

/**
 * A new box the same size as `box`, to its right or below it, past anything
 * already there, with an arrow from `box` to it.
 */
export function boxBeside(elements: readonly BoardElement[], box: RectElement, side: Side): { elements: BoardElement[]; box: RectElement } {
  const step = side === "right" ? { x: box.w + BOX_GAP, y: 0 } : { x: 0, y: box.h + BOX_GAP };
  let next: RectElement = { ...translate(box, step.x, step.y), id: newId(), text: "" } as RectElement;
  const overlaps = (b: RectElement) =>
    elements.some((el) => {
      if (el.type !== "rect") return false;
      const o = boundsOf(el);
      return o.x < b.x + b.w && b.x < o.x + o.w && o.y < b.y + b.h && b.y < o.y + o.h;
    });
  for (let i = 0; i < 50 && overlaps(next); i += 1) next = translate(next, step.x, step.y) as RectElement;
  const arrow: ArrowElement = { id: newId(), type: "arrow", x1: 0, y1: 0, x2: 0, y2: 0, from: box.id, to: next.id };
  return { elements: connect([...elements, next, arrow]), box: next };
}

/** A new, empty text element level with `el`, to its right: the next column. */
export function textBeside(el: TextElement): TextElement {
  const b = textBox(el);
  return newText({ x: b.x + b.w + BOX_GAP / 2, y: b.y });
}
