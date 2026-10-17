import {
  COORD_LIMIT,
  MAX_ELEMENTS,
  MAX_TEXT,
  MAX_ZOOM,
  MIN_ZOOM,
  defaultView,
  newId,
  type BoardElement,
  type View,
} from "@/lib/board/model";

/** Persisted key; the `lab:` prefix puts it in the settings backup automatically. */
export const BOARD_STORAGE_KEY = "lab:board:v2";

export interface BoardState {
  elements: BoardElement[];
  view: View;
}

export interface BoardStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const emptyBoard = (): BoardState => ({ elements: [], view: defaultView() });

function storageOrUndefined(): BoardStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const coord = (value: unknown): number | null => {
  const n = finite(value);
  return n === null ? null : Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, n));
};

/** One element, or null if it is not a well-formed one. */
export function cleanElement(raw: unknown, seen: Set<string>): BoardElement | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  let id = typeof input.id === "string" && input.id !== "" ? input.id.slice(0, 40) : newId();
  if (seen.has(id)) id = newId();

  let element: BoardElement | null = null;
  switch (input.type) {
    case "rect": {
      const [x, y, w, h] = [coord(input.x), coord(input.y), coord(input.w), coord(input.h)];
      if (x !== null && y !== null && w !== null && h !== null) element = { id, type: "rect", x, y, w: Math.abs(w), h: Math.abs(h) };
      break;
    }
    case "arrow": {
      const [x1, y1, x2, y2] = [coord(input.x1), coord(input.y1), coord(input.x2), coord(input.y2)];
      if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) element = { id, type: "arrow", x1, y1, x2, y2 };
      break;
    }
    case "text": {
      const [x, y] = [coord(input.x), coord(input.y)];
      if (x !== null && y !== null && typeof input.text === "string" && input.text !== "") element = { id, type: "text", x, y, text: input.text.slice(0, MAX_TEXT) };
      break;
    }
  }
  if (element) seen.add(element.id);
  return element;
}

export function cleanElements(raw: unknown): BoardElement[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BoardElement[] = [];
  for (const item of raw.slice(0, MAX_ELEMENTS)) {
    const element = cleanElement(item, seen);
    if (element) out.push(element);
  }
  return out;
}

function cleanView(raw: unknown): View {
  const input = (raw ?? {}) as Partial<Record<keyof View, unknown>>;
  const [x, y, zoom] = [coord(input.x), coord(input.y), finite(input.zoom)];
  return x === null || y === null || zoom === null ? defaultView() : { x, y, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) };
}

export function readBoard(storage: BoardStorage | undefined = storageOrUndefined()): BoardState {
  if (!storage) return emptyBoard();
  try {
    const raw = JSON.parse(storage.getItem(BOARD_STORAGE_KEY) ?? "null") as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") return emptyBoard();
    return { elements: cleanElements(raw.elements), view: cleanView(raw.view) };
  } catch {
    // Corrupt data: start fresh.
    return emptyBoard();
  }
}

export function writeBoard(state: BoardState, storage: BoardStorage | undefined = storageOrUndefined()): void {
  if (!storage) return;
  try {
    storage.setItem(BOARD_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A full disk cannot be helped.
  }
}
