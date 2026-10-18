/**
 * Pointer gestures as pure functions: begin one at a pointer-down, update it on
 * moves, preview what the board looks like meanwhile, and finish it into new
 * elements. The component only forwards events.
 *
 * With no tool picked, a drag on an element moves it and a drag on empty
 * canvas moves the canvas. With the box tool, a drag draws a box and a click
 * drops one. Arrows are never drawn by hand: they come with a box added
 * beside another, and stay on their two boxes.
 */

import { boundsOf, boxFrom, connect, snap, textBox, topmostAt, translate, type Point } from "@/lib/board/geometry";
import { BOX_GAP, BOX_H, BOX_W, TEXT_SIZE, newId, type ArrowElement, type BoardElement, type RectElement, type TextElement, type View } from "@/lib/board/model";
import { toWorld } from "@/lib/board/viewport";

export type DrawTool = "rect";
export type Tool = DrawTool | "text";

export type Gesture =
  | { kind: "draw"; tool: DrawTool; start: Point; current: Point; id: string }
  | { kind: "move"; id: string; origin: Point; current: Point; moved: boolean; tolerance: number }
  | { kind: "pan"; startScreen: Point; startView: View; moved: boolean; slop: number };

export interface BeginInput {
  /** The picked tool, or null for the automatic move/pan mode. */
  tool: DrawTool | null;
  elements: readonly BoardElement[];
  /** The pointer in world and screen coordinates. */
  world: Point;
  screen: Point;
  view: View;
  /** Screen pixels a pointer may miss a thin line by, and may wander on a click before it counts as a drag of the canvas. */
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
  return { kind: "pan", startScreen: screen, startView: view, moved: false, slop: reach };
}

/** Has the pointer gone far enough from where it went down to move the canvas? A click that wobbles does not. */
export function panning(gesture: Extract<Gesture, { kind: "pan" }>, screen: Point): Extract<Gesture, { kind: "pan" }> {
  if (gesture.moved) return gesture;
  const moved = Math.hypot(screen.x - gesture.startScreen.x, screen.y - gesture.startScreen.y) >= gesture.slop;
  return moved ? { ...gesture, moved } : gesture;
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

/** The box a drawing gesture would create right now. */
export function drawn(gesture: Extract<Gesture, { kind: "draw" }>): RectElement {
  const { start, current, id } = gesture;
  return { id, type: "rect", ...boxFrom(start, current), text: "" };
}

/** The board as it should be drawn while the gesture is in progress. */
export function preview(gesture: Gesture | null, elements: readonly BoardElement[]): BoardElement[] {
  if (!gesture) return elements as BoardElement[];
  if (gesture.kind === "draw") return [...elements, drawn(gesture)];
  if (gesture.kind === "move" && gesture.moved) {
    const dx = gesture.current.x - gesture.origin.x;
    const dy = gesture.current.y - gesture.origin.y;
    // An arrow stays on its boxes: a drag along it only picks it.
    return connect(elements.map((el) => (el.id === gesture.id && el.type !== "arrow" ? snap(translate(el, dx, dy), elements, gesture.tolerance) : el)));
  }
  return elements as BoardElement[];
}

/** Is this drawing big enough to keep? A stray click is not a rectangle. */
function worthKeeping(el: RectElement, zoom: number): boolean {
  const min = 3 / zoom;
  return el.w >= min || el.h >= min;
}

export interface Finished {
  elements: BoardElement[];
  /** A new box, or a click (no drag) on a box or text: the id whose text to edit. */
  edit?: string;
}

export function finish(gesture: Gesture, elements: readonly BoardElement[], view: View): Finished {
  switch (gesture.kind) {
    case "draw": {
      const made = drawn(gesture);
      if (worthKeeping(made, view.zoom)) return { elements: [...elements, made], edit: made.id };
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

/** Where the next box goes from a box: beside it, below it, or diagonally down; text only goes right or down. */
export type Side = "right" | "left" | "below" | "below-left" | "below-right";

/**
 * A new box the same size as `box`, on that side of it, past anything
 * already there, with an arrow from `box` to it.
 */
export function boxBeside(elements: readonly BoardElement[], box: RectElement, side: Side): { elements: BoardElement[]; box: RectElement } {
  const across = box.w + BOX_GAP;
  const down = side === "right" || side === "left" ? 0 : box.h + BOX_GAP;
  const step = { x: side === "right" || side === "below-right" ? across : side === "left" || side === "below-left" ? -across : 0, y: down };
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

/** A new, empty text element below `el`, the next line of its column; or level with it, to its right, the next column. */
export function textBeside(el: TextElement, side: "right" | "below" = "right"): TextElement {
  const b = textBox(el);
  return side === "below" ? newText({ x: b.x, y: b.y + b.h + TEXT_SIZE / 2 }) : newText({ x: b.x + b.w + BOX_GAP / 2, y: b.y });
}
