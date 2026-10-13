import {
  COLOR_KEYS,
  COORD_LIMIT,
  MAX_BOARDS,
  MAX_ELEMENTS,
  MAX_PEN_POINTS,
  MAX_TEXT,
  MAX_ZOOM,
  MIN_ZOOM,
  createBoard,
  defaultView,
  newId,
  type Board,
  type BoardElement,
  type ColorKey,
  type View,
} from "@/lib/board/model";

/** Persisted key; the `lab:` prefix puts it in the settings backup automatically. */
export const BOARD_STORAGE_KEY = "lab:board:v1";
export const BOARD_FILE_FORMAT = "lab-board";
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export interface BoardStore {
  boards: Board[];
  current: string | null;
  grid: boolean;
}

export interface BoardStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const emptyStore = (): BoardStore => ({ boards: [], current: null, grid: true });

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

/** One element, or null if it is not a well-formed one; style fields fall back to sensible defaults. */
export function cleanElement(raw: unknown, seen: Set<string>): BoardElement | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  let id = typeof input.id === "string" && input.id !== "" ? input.id.slice(0, 40) : newId();
  if (seen.has(id)) id = newId();
  const color: ColorKey = COLOR_KEYS.includes(input.color as ColorKey) ? (input.color as ColorKey) : "ink";
  const width = Math.min(20, Math.max(1, finite(input.width) ?? 4));
  const style = { id, color, fill: input.fill === true, width };

  let element: BoardElement | null = null;
  switch (input.type) {
    case "rect":
    case "ellipse": {
      const [x, y, w, h] = [coord(input.x), coord(input.y), coord(input.w), coord(input.h)];
      if (x !== null && y !== null && w !== null && h !== null) element = { type: input.type, x, y, w: Math.abs(w), h: Math.abs(h), ...style };
      break;
    }
    case "arrow": {
      const [x1, y1, x2, y2] = [coord(input.x1), coord(input.y1), coord(input.x2), coord(input.y2)];
      if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) element = { type: "arrow", x1, y1, x2, y2, ...style };
      break;
    }
    case "pen": {
      if (!Array.isArray(input.points)) break;
      const numbers = input.points.slice(0, MAX_PEN_POINTS * 2).map(coord);
      if (numbers.length >= 2 && numbers.every((n): n is number => n !== null)) {
        element = { type: "pen", points: numbers.length % 2 === 0 ? numbers : numbers.slice(0, -1), ...style };
      }
      break;
    }
    case "text": {
      const [x, y] = [coord(input.x), coord(input.y)];
      if (x !== null && y !== null && typeof input.text === "string" && input.text !== "") {
        element = { type: "text", x, y, text: input.text.slice(0, MAX_TEXT), size: Math.min(200, Math.max(8, finite(input.size) ?? 24)), ...style };
      }
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

function cleanBoard(raw: unknown, seen: Set<string>): Board | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  let id = typeof input.id === "string" && input.id !== "" ? input.id.slice(0, 40) : newId();
  if (seen.has(id)) id = newId();
  seen.add(id);
  const name = typeof input.name === "string" && input.name.trim() !== "" ? input.name.trim().slice(0, 60) : "Board";
  return { id, name, elements: cleanElements(input.elements), view: cleanView(input.view), updated: Math.max(0, Math.floor(finite(input.updated) ?? 0)) };
}

export function readBoardStore(storage: BoardStorage | undefined = storageOrUndefined()): BoardStore {
  const store = emptyStore();
  if (!storage) return store;
  try {
    const raw = JSON.parse(storage.getItem(BOARD_STORAGE_KEY) ?? "null") as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") return store;
    const seen = new Set<string>();
    if (Array.isArray(raw.boards)) store.boards = raw.boards.slice(0, MAX_BOARDS).flatMap((board) => cleanBoard(board, seen) ?? []);
    store.grid = raw.grid !== false;
    store.current = store.boards.some((board) => board.id === raw.current) ? (raw.current as string) : (store.boards[0]?.id ?? null);
  } catch {
    // Corrupt data: start fresh.
  }
  return store;
}

export function writeBoardStore(store: BoardStore, storage: BoardStorage | undefined = storageOrUndefined()): void {
  if (!storage) return;
  try {
    storage.setItem(BOARD_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // A board is worth more than a crash, but a full disk cannot be helped.
  }
}

/** The board as a file: plain JSON that any text tool (or the workbench) can open. */
export function serializeBoard(board: Board): string {
  return JSON.stringify({ format: BOARD_FILE_FORMAT, version: 1, name: board.name, elements: board.elements }, null, 2);
}

/** A board from a file's text, or null when it is not one. The elements go through the same cleaning as stored ones. */
export function parseBoardFile(text: string): Board | null {
  if (text.length > MAX_FILE_BYTES) return null;
  try {
    const raw = JSON.parse(text) as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || raw.format !== BOARD_FILE_FORMAT || !Array.isArray(raw.elements)) return null;
    const board = createBoard(typeof raw.name === "string" && raw.name.trim() !== "" ? raw.name.trim().slice(0, 60) : "Imported board");
    board.elements = cleanElements(raw.elements);
    return board;
  } catch {
    return null;
  }
}
