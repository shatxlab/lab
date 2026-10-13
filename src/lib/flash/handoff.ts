/**
 * "Send to Flashcards" from the workbench: the text waits in localStorage while
 * Flashcards opens in a new tab, which picks it up once (see `lib/apps/handoff.ts`).
 */

import { HANDOFF_TTL_MS as TTL, takeHandoffFrom, writeHandoffTo, type Handoff, type HandoffStorage } from "@/lib/apps/handoff";

export const FLASH_HANDOFF_KEY = "lab-handoff:flash";
export const HANDOFF_TTL_MS = TTL;
export const MAX_HANDOFF_CHARS = 2 * 1024 * 1024;

export type FlashHandoff = Handoff;

/** Leave text for Flashcards; false when it is too big or storage refuses it. */
export const writeHandoff = (handoff: FlashHandoff, now?: number, storage?: HandoffStorage): boolean =>
  writeHandoffTo(FLASH_HANDOFF_KEY, handoff, MAX_HANDOFF_CHARS, now, storage);

/** Collect the waiting handoff, removing it so it is only ever offered once. */
export const takeHandoff = (now?: number, storage?: HandoffStorage): FlashHandoff | null => takeHandoffFrom(FLASH_HANDOFF_KEY, now, storage);

/** A deck name from a file name: no extension, separators turned into spaces. */
export function deckNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, "").replace(/[_]+/g, " ").trim().slice(0, 80);
}
