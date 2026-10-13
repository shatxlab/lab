/** "Open in Whiteboard" from the workbench: the board file waits for the Whiteboard tab (see `lib/apps/handoff.ts`). */

import { takeHandoffFrom, writeHandoffTo, type Handoff, type HandoffStorage } from "@/lib/apps/handoff";

export const BOARD_HANDOFF_KEY = "lab-handoff:board";
/** Boards are bigger than card lists, but browser storage is small: past this it is a file to open by hand. */
export const MAX_BOARD_HANDOFF_CHARS = 3 * 1024 * 1024;

export const writeBoardHandoff = (handoff: Handoff, now?: number, storage?: HandoffStorage): boolean =>
  writeHandoffTo(BOARD_HANDOFF_KEY, handoff, MAX_BOARD_HANDOFF_CHARS, now, storage);

export const takeBoardHandoff = (now?: number, storage?: HandoffStorage): Handoff | null => takeHandoffFrom(BOARD_HANDOFF_KEY, now, storage);
