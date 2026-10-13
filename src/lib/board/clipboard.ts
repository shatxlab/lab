/**
 * Copy and paste between boards. The copied elements wait in localStorage, so
 * paste works after switching boards, in another tab, and after a reload. The key
 * has no `lab:` prefix on purpose: a clipboard does not belong in a settings backup.
 * It is the whiteboard's own clipboard: it never touches the system one.
 */

import { boundsOf, translate, unionOf, type Box } from "@/lib/board/geometry";
import { newId, type BoardElement } from "@/lib/board/model";
import { resolveBindings } from "@/lib/board/connect";
import { cleanElements } from "@/lib/board/storage";

export const BOARD_CLIP_KEY = "lab-clipboard:board";
/** How far each paste lands from the last, in world units. */
export const PASTE_STEP = 16;

export interface Clip {
  elements: BoardElement[];
  /** The board it was copied from, so a paste on the same board knows to step aside. */
  source: string;
  /** How many times it has been pasted since it was copied. */
  pastes: number;
}

interface ClipStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageOrUndefined(): ClipStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Put elements on the clipboard; false when there is nothing to copy or storage refuses. */
export function writeClip(elements: readonly BoardElement[], source: string, storage: ClipStorage | undefined = storageOrUndefined()): boolean {
  if (!storage || elements.length === 0) return false;
  try {
    storage.setItem(BOARD_CLIP_KEY, JSON.stringify({ source, pastes: 0, elements }));
    return true;
  } catch {
    return false;
  }
}

export function readClip(storage: ClipStorage | undefined = storageOrUndefined()): Clip | null {
  if (!storage) return null;
  try {
    const raw = JSON.parse(storage.getItem(BOARD_CLIP_KEY) ?? "null") as Partial<Clip> | null;
    if (!raw || typeof raw !== "object") return null;
    const elements = cleanElements(raw.elements);
    if (elements.length === 0) return null;
    return { elements, source: typeof raw.source === "string" ? raw.source : "", pastes: typeof raw.pastes === "number" && raw.pastes >= 0 ? Math.min(raw.pastes, 1000) : 0 };
  } catch {
    return null;
  }
}

export function markPasted(clip: Clip, storage: ClipStorage | undefined = storageOrUndefined()): void {
  try {
    storage?.setItem(BOARD_CLIP_KEY, JSON.stringify({ ...clip, pastes: clip.pastes + 1 }));
  } catch {
    // The offset just stops growing.
  }
}

export interface Placement {
  elements: BoardElement[];
  ids: string[];
}

/**
 * The clipboard's elements as new ones (fresh ids, arrows re-attached to their
 * copied shapes only), placed on the board: where they were if that is on screen,
 * stepped aside when pasting on the board they came from, and centred in view if
 * they were somewhere else entirely (`keepPlace` always steps aside, for Duplicate).
 */
export function place(clip: Clip, board: string, visible: Box, keepPlace = false): Placement {
  const ids = new Map(clip.elements.map((el) => [el.id, newId()] as const));
  const bounds = unionOf(clip.elements.map(boundsOf))!;
  const onScreen = bounds.x < visible.x + visible.w && bounds.x + bounds.w > visible.x && bounds.y < visible.y + visible.h && bounds.y + bounds.h > visible.y;
  let dx = 0;
  let dy = 0;
  if (onScreen || keepPlace) {
    const steps = clip.source === board ? clip.pastes + 1 : clip.pastes;
    dx = dy = steps * PASTE_STEP;
  } else {
    dx = visible.x + visible.w / 2 - (bounds.x + bounds.w / 2);
    dy = visible.y + visible.h / 2 - (bounds.y + bounds.h / 2);
  }
  const made = clip.elements.map((el) => {
    const moved = translate({ ...el, id: ids.get(el.id)! } as BoardElement, dx, dy);
    if (moved.type !== "arrow") return moved;
    const next = { ...moved };
    if (next.from !== undefined) {
      const remapped = ids.get(next.from);
      if (remapped) next.from = remapped;
      else delete next.from;
    }
    if (next.to !== undefined) {
      const remapped = ids.get(next.to);
      if (remapped) next.to = remapped;
      else delete next.to;
    }
    return next;
  });
  return { elements: resolveBindings(made), ids: made.map((el) => el.id) };
}
