/**
 * The whiteboard's data: a board is a list of elements in drawing order (later
 * ones are on top). Everything is plain JSON, so a board is its own file format.
 */

export const COLOR_KEYS = ["ink", "blue", "orange", "green", "red", "violet"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

/** Stroke widths: thin, medium, thick. They also pick a text size. */
export const WIDTHS = [2, 4, 7] as const;
export const TEXT_SIZES = [16, 24, 36] as const;
export const DEFAULT_WIDTH = 4;

export interface Style {
  color: ColorKey;
  /** Shapes only: a wash of the colour inside. */
  fill: boolean;
  width: number;
}

export interface BoxShape {
  type: "rect" | "ellipse";
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
  /** Ids of the shapes the start and end are attached to. The coordinates always follow them. */
  from?: string;
  to?: string;
}
export interface PenShape {
  type: "pen";
  /** x0, y0, x1, y1, … */
  points: number[];
}
export interface TextShape {
  type: "text";
  x: number;
  y: number;
  text: string;
  size: number;
}

export type Shape = BoxShape | ArrowShape | PenShape | TextShape;
export type BoardElement = Shape & Style & { id: string };

export interface View {
  /** The world point at the top-left corner of the screen. */
  x: number;
  y: number;
  zoom: number;
}

export interface Board {
  id: string;
  name: string;
  elements: BoardElement[];
  view: View;
  updated: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const MAX_ELEMENTS = 3000;
export const MAX_PEN_POINTS = 2000;
export const MAX_TEXT = 2000;
export const MAX_BOARDS = 30;
export const COORD_LIMIT = 1_000_000;

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const defaultView = (): View => ({ x: -40, y: -40, zoom: 1 });

export function createBoard(name: string): Board {
  return { id: newId(), name, elements: [], view: defaultView(), updated: Date.now() };
}

export const textSizeFor = (width: number): number => TEXT_SIZES[Math.max(0, WIDTHS.indexOf(width as (typeof WIDTHS)[number]))] ?? TEXT_SIZES[1];
