/**
 * Pointer gestures as pure functions: begin one at a pointer-down, update it on
 * moves, preview what the board looks like meanwhile, and finish it into new
 * elements. The component only forwards events.
 *
 * With no tool picked, a drag on an element moves it and a drag on empty
 * canvas moves the canvas. With a tool picked, a drag draws.
 */

import { boxFrom, topmostAt, translate, type Point } from "@/lib/board/geometry";
import { newId, type BoardElement, type View } from "@/lib/board/model";
import { toWorld } from "@/lib/board/viewport";

export type DrawTool = "rect" | "arrow";
export type Tool = DrawTool | "text";

export type Gesture =
  | { kind: "draw"; tool: DrawTool; start: Point; current: Point; id: string }
  | { kind: "move"; id: string; origin: Point; current: Point; moved: boolean }
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

export function begin(input: BeginInput): Gesture {
  const { tool, elements, world, screen, view, reach } = input;
  if (tool) return { kind: "draw", tool, start: world, current: world, id: newId() };
  const hit = topmostAt(elements, world, reach / view.zoom);
  if (hit) return { kind: "move", id: hit.id, origin: world, current: world, moved: false };
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

/** The element a drawing gesture would create right now. */
export function drawn(gesture: Extract<Gesture, { kind: "draw" }>): BoardElement {
  const { tool, start, current, id } = gesture;
  if (tool === "rect") return { id, type: "rect", ...boxFrom(start, current) };
  return { id, type: "arrow", x1: start.x, y1: start.y, x2: current.x, y2: current.y };
}

/** The board as it should be drawn while the gesture is in progress. */
export function preview(gesture: Gesture | null, elements: readonly BoardElement[]): BoardElement[] {
  if (!gesture) return elements as BoardElement[];
  if (gesture.kind === "draw") return [...elements, drawn(gesture)];
  if (gesture.kind === "move" && gesture.moved) {
    const dx = gesture.current.x - gesture.origin.x;
    const dy = gesture.current.y - gesture.origin.y;
    return elements.map((el) => (el.id === gesture.id ? translate(el, dx, dy) : el));
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
  /** A click (no drag) on a text element: the id to edit. */
  edit?: string;
}

export function finish(gesture: Gesture, elements: readonly BoardElement[], view: View): Finished {
  switch (gesture.kind) {
    case "draw": {
      const made = drawn(gesture);
      return { elements: worthKeeping(made, view.zoom) ? [...elements, made] : (elements as BoardElement[]) };
    }
    case "move": {
      if (gesture.moved) return { elements: preview(gesture, elements) };
      const clicked = elements.find((el) => el.id === gesture.id);
      return { elements: elements as BoardElement[], edit: clicked?.type === "text" ? clicked.id : undefined };
    }
    default:
      return { elements: elements as BoardElement[] };
  }
}

/** A new, empty text element at a point, ready for editing. */
export function newText(at: Point): Extract<BoardElement, { type: "text" }> {
  return { id: newId(), type: "text", x: at.x, y: at.y, text: "" };
}
