/**
 * Pointer gestures as pure functions: begin one at a pointer-down, update it on
 * moves, preview what the board looks like meanwhile, and finish it into new
 * elements and a new selection. The component only forwards events.
 */

import {
  boundsOf,
  boxFrom,
  elementsInBox,
  handlesOf,
  resizeElement,
  topmostAt,
  translate,
  unionOf,
  type Box,
  type HandleId,
  type Point,
} from "@/lib/board/geometry";
import { bindEnd, detachFrom, resolveBindings } from "@/lib/board/connect";
import { newId, textSizeFor, type BoardElement, type Style, type View } from "@/lib/board/model";
import { snapTo } from "@/lib/board/ops";
import { toWorld } from "@/lib/board/viewport";

export type Tool = "select" | "rect" | "ellipse" | "arrow" | "text" | "pen" | "hand";
export type DrawTool = "rect" | "ellipse" | "arrow" | "pen";

export const DRAW_TOOLS: readonly Tool[] = ["rect", "ellipse", "arrow", "pen"];

export type Gesture =
  | { kind: "draw"; tool: DrawTool; start: Point; current: Point; points: number[]; style: Style; id: string; constrain: boolean; snap: number }
  | { kind: "move"; origin: Point; current: Point; ids: string[]; originals: BoardElement[]; moved: boolean; snap: number; anchor: Point }
  | { kind: "resize"; original: BoardElement; handle: HandleId; current: Point; snap: number }
  | { kind: "marquee"; start: Point; current: Point; base: string[] }
  | { kind: "pan"; startScreen: Point; startView: View };

export interface BeginInput {
  tool: Tool;
  style: Style;
  elements: readonly BoardElement[];
  selection: readonly string[];
  /** The pointer in world and screen coordinates. */
  world: Point;
  screen: Point;
  view: View;
  /** Screen pixels a pointer may miss a thin line by. */
  reach: number;
  shift?: boolean;
  /** Space held, or the middle button: drag the canvas whatever the tool. */
  pan?: boolean;
  /** Grid step in world units to land on; 0 or absent for free placement. */
  snap?: number;
}

export interface Begun {
  gesture: Gesture | null;
  selection: string[];
}

/** How near an arrow end must be to a shape to attach to it, in screen pixels. */
export const ATTACH_REACH = 10;

const snapPoint = (p: Point, step: number): Point => (step > 0 ? { x: snapTo(p.x, step), y: snapTo(p.y, step) } : p);

/** How far a drag must go before it counts as a move rather than a click, in screen pixels. */
export const DRAG_THRESHOLD = 3;
/** The closest two points of a pen stroke are kept, in screen pixels. */
const PEN_SPACING = 2;

export function begin(input: BeginInput): Begun {
  const { tool, style, elements, selection, world, screen, view, reach, shift, pan } = input;
  const snap = input.snap ?? 0;
  const worldReach = reach / view.zoom;

  if (pan || tool === "hand") return { gesture: { kind: "pan", startScreen: screen, startView: view }, selection: [...selection] };

  if (tool === "rect" || tool === "ellipse" || tool === "arrow" || tool === "pen") {
    // A pen follows the hand; the other tools start on the grid when snapping is on.
    const start = tool === "pen" ? world : snapPoint(world, snap);
    return {
      gesture: { kind: "draw", tool, start, current: start, points: [start.x, start.y], style, id: newId(), constrain: Boolean(shift), snap },
      selection: [],
    };
  }
  if (tool !== "select") return { gesture: null, selection: [...selection] };

  // A selected element's handles come first, so they can sit on top of its neighbours.
  if (selection.length === 1) {
    const only = elements.find((el) => el.id === selection[0]);
    const handle = only && handlesOf(only).find((h) => Math.hypot(h.x - world.x, h.y - world.y) <= worldReach * 1.6);
    if (only && handle) return { gesture: { kind: "resize", original: only, handle: handle.id, current: world, snap }, selection: [only.id] };
  }

  const hit = topmostAt(elements, world, worldReach);
  if (hit) {
    let next = [...selection];
    if (shift) {
      next = next.includes(hit.id) ? next.filter((id) => id !== hit.id) : [...next, hit.id];
      if (!next.includes(hit.id)) return { gesture: null, selection: next };
    } else if (!next.includes(hit.id)) next = [hit.id];
    const originals = elements.filter((el) => next.includes(el.id));
    const anchorBox = unionOf(originals.map(boundsOf));
    const anchor = anchorBox ? { x: anchorBox.x, y: anchorBox.y } : world;
    return { gesture: { kind: "move", origin: world, current: world, ids: next, originals, moved: false, snap, anchor }, selection: next };
  }
  const base = shift ? [...selection] : [];
  return { gesture: { kind: "marquee", start: world, current: world, base }, selection: base };
}

export function update(gesture: Gesture, world: Point, view: View, shift = false): Gesture {
  switch (gesture.kind) {
    case "draw": {
      let points = gesture.points;
      if (gesture.tool === "pen") {
        const last = { x: points[points.length - 2]!, y: points[points.length - 1]! };
        if (Math.hypot(world.x - last.x, world.y - last.y) * view.zoom >= PEN_SPACING) points = [...points, world.x, world.y];
      }
      return { ...gesture, current: gesture.tool === "pen" ? world : snapPoint(world, gesture.snap), points, constrain: shift };
    }
    case "move": {
      const moved = gesture.moved || Math.hypot(world.x - gesture.origin.x, world.y - gesture.origin.y) * view.zoom >= DRAG_THRESHOLD;
      return { ...gesture, moved, current: world };
    }
    case "resize":
      return { ...gesture, current: snapPoint(world, gesture.snap) };
    case "marquee":
      return { ...gesture, current: world };
    default:
      return gesture;
  }
}

/** How far a move has taken its elements: free, or so that the group's top-left corner lands on the grid. */
export function moveDelta(gesture: Extract<Gesture, { kind: "move" }>): Point {
  const dx = gesture.current.x - gesture.origin.x;
  const dy = gesture.current.y - gesture.origin.y;
  if (gesture.snap <= 0) return { x: dx, y: dy };
  return { x: snapTo(gesture.anchor.x + dx, gesture.snap) - gesture.anchor.x, y: snapTo(gesture.anchor.y + dy, gesture.snap) - gesture.anchor.y };
}

/** The elements after a move: arrows that travel without their shapes let go of them, and the rest follow their shapes. */
function moved(gesture: Extract<Gesture, { kind: "move" }>, elements: readonly BoardElement[]): BoardElement[] {
  const { x: dx, y: dy } = moveDelta(gesture);
  const moving = new Set(gesture.ids);
  const next = elements.map((el) => {
    if (!moving.has(el.id)) return el;
    const shifted = translate(el, dx, dy);
    return shifted.type === "arrow" ? detachFrom(shifted, moving) : shifted;
  });
  return resolveBindings(next);
}

/** An arrow being drawn, attached to the shapes under its two ends. */
function attachedDraw(made: BoardElement, elements: readonly BoardElement[], gesture: Extract<Gesture, { kind: "draw" }>, zoom: number): BoardElement[] {
  if (made.type !== "arrow") return [...elements, made];
  const tolerance = ATTACH_REACH / zoom;
  const started = bindEnd(made, "start", elements, gesture.start, tolerance);
  const ended = bindEnd(started, "end", elements, { x: made.x2, y: made.y2 }, tolerance);
  return resolveBindings([...elements, ended]);
}

/** An arrow end being dragged, attached to the shape it is over. */
function attachedResize(next: BoardElement, handle: HandleId, elements: readonly BoardElement[], current: Point, zoom: number): BoardElement[] {
  const replaced = elements.map((el) => (el.id === next.id ? next : el));
  if (next.type !== "arrow" || (handle !== "start" && handle !== "end")) return resolveBindings(replaced);
  const bound = bindEnd(next, handle, elements, current, ATTACH_REACH / zoom);
  return resolveBindings(elements.map((el) => (el.id === next.id ? bound : el)));
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

/** The element a drawing gesture would create right now (Shift makes squares, circles and 45° arrows). */
export function drawn(gesture: Extract<Gesture, { kind: "draw" }>): BoardElement {
  const { tool, start, style, id, constrain } = gesture;
  let end = gesture.current;
  if (constrain && tool !== "pen") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (tool === "arrow") {
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const length = Math.hypot(dx, dy);
      end = { x: start.x + length * Math.cos(angle), y: start.y + length * Math.sin(angle) };
    } else {
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      end = { x: start.x + Math.sign(dx || 1) * side, y: start.y + Math.sign(dy || 1) * side };
    }
  }
  switch (tool) {
    case "rect":
    case "ellipse": {
      const box = boxFrom(start, end);
      return { id, type: tool, ...box, ...style };
    }
    case "arrow":
      return { id, type: "arrow", x1: start.x, y1: start.y, x2: end.x, y2: end.y, ...style };
    default:
      return { id, type: "pen", points: gesture.points.length >= 4 ? gesture.points : [...gesture.points, ...gesture.points], ...style };
  }
}

/** The board as it should be drawn while the gesture is in progress. */
export function preview(gesture: Gesture | null, elements: readonly BoardElement[], zoom = 1): BoardElement[] {
  if (!gesture) return elements as BoardElement[];
  switch (gesture.kind) {
    case "draw":
      return attachedDraw(drawn(gesture), elements, gesture, zoom);
    case "move":
      return gesture.moved ? moved(gesture, elements) : (elements as BoardElement[]);
    case "resize":
      return attachedResize(resizeElement(gesture.original, gesture.handle, gesture.current), gesture.handle, elements, gesture.current, zoom);
    default:
      return elements as BoardElement[];
  }
}

export const marqueeBox = (gesture: Extract<Gesture, { kind: "marquee" }>): Box => boxFrom(gesture.start, gesture.current);

/** Is this drawing big enough to keep? A stray click is not a rectangle. */
function worthKeeping(el: BoardElement, zoom: number): boolean {
  const min = 3 / zoom;
  if (el.type === "rect" || el.type === "ellipse") return el.w >= min || el.h >= min;
  if (el.type === "arrow") return Math.hypot(el.x2 - el.x1, el.y2 - el.y1) >= min * 2;
  return true;
}

export interface Finished {
  elements: BoardElement[];
  /** The new selection; null leaves it as it was. */
  selection: string[] | null;
}

export function finish(gesture: Gesture, elements: readonly BoardElement[], view: View): Finished {
  switch (gesture.kind) {
    case "draw": {
      const made = drawn(gesture);
      return worthKeeping(made, view.zoom) ? { elements: attachedDraw(made, elements, gesture, view.zoom), selection: [made.id] } : { elements: elements as BoardElement[], selection: [] };
    }
    case "move":
      return { elements: gesture.moved ? moved(gesture, elements) : (elements as BoardElement[]), selection: null };
    case "resize": {
      const next = resizeElement(gesture.original, gesture.handle, gesture.current);
      const changed = JSON.stringify(next) !== JSON.stringify(gesture.original);
      return { elements: changed ? attachedResize(next, gesture.handle, elements, gesture.current, view.zoom) : (elements as BoardElement[]), selection: null };
    }
    case "marquee": {
      const box = marqueeBox(gesture);
      // A click on empty space (no real box) just clears the selection.
      const inside = box.w * view.zoom < DRAG_THRESHOLD && box.h * view.zoom < DRAG_THRESHOLD ? [] : elementsInBox(elements, box).map((el) => el.id);
      return { elements: elements as BoardElement[], selection: [...new Set([...gesture.base, ...inside])] };
    }
    default:
      return { elements: elements as BoardElement[], selection: null };
  }
}

/** A new text element at a point, ready for editing. */
export function newText(at: Point, style: Style): BoardElement {
  return { id: newId(), type: "text", x: at.x, y: at.y, text: "", size: textSizeFor(style.width), ...style };
}

export { boundsOf };
