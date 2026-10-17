/**
 * The whiteboard's data: one board, a list of elements in drawing order (later
 * ones are on top). Everything is plain JSON.
 */

/** The only line weight and text size there is. */
export const STROKE = 7;
export const TEXT_SIZE = 36;
/** Chalk on a dark board, whatever the site theme. */
export const INK = "#ffffff";
export const SURFACE = "#1f2430";
export const MUTED = "#9aa3b5";

export interface RectShape {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface ArrowShape {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface TextShape {
  type: "text";
  x: number;
  y: number;
  text: string;
}

export type Shape = RectShape | ArrowShape | TextShape;
export type BoardElement = Shape & { id: string };
export type TextElement = Extract<BoardElement, { type: "text" }>;

export interface View {
  /** The world point at the top-left corner of the screen. */
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const MAX_ELEMENTS = 3000;
export const MAX_TEXT = 2000;
export const COORD_LIMIT = 1_000_000;

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const defaultView = (): View => ({ x: -40, y: -40, zoom: 1 });
