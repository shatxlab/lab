/**
 * "Send to Flashcards" from the workbench: the text waits in localStorage while
 * Flashcards opens in a new tab, which picks it up once. The key deliberately
 * lacks the `lab:` prefix so the settings backup never carries a stale handoff.
 */

export const FLASH_HANDOFF_KEY = "lab-handoff:flash";
/** A handoff nobody collected within this long is ignored. */
export const HANDOFF_TTL_MS = 10 * 60 * 1000;
export const MAX_HANDOFF_CHARS = 2 * 1024 * 1024;

export interface FlashHandoff {
  /** The file the text came from; becomes the deck's name. */
  name: string;
  text: string;
}

interface Stored extends FlashHandoff {
  at: number;
}

interface HandoffStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storageOrUndefined(): HandoffStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Leave text for Flashcards; false when it is too big or storage refuses it. */
export function writeHandoff(handoff: FlashHandoff, now = Date.now(), storage: HandoffStorage | undefined = storageOrUndefined()): boolean {
  if (!storage || handoff.text.length > MAX_HANDOFF_CHARS) return false;
  try {
    storage.setItem(FLASH_HANDOFF_KEY, JSON.stringify({ name: handoff.name, text: handoff.text, at: now } satisfies Stored));
    return true;
  } catch {
    return false;
  }
}

/** Collect the waiting handoff, removing it so it is only ever offered once. */
export function takeHandoff(now = Date.now(), storage: HandoffStorage | undefined = storageOrUndefined()): FlashHandoff | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(FLASH_HANDOFF_KEY);
    storage.removeItem(FLASH_HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<Stored>;
    if (typeof data.text !== "string" || typeof data.at !== "number" || now - data.at > HANDOFF_TTL_MS || data.at - now > HANDOFF_TTL_MS) return null;
    return { name: typeof data.name === "string" ? data.name : "", text: data.text };
  } catch {
    return null;
  }
}

/** A deck name from a file name: no extension, separators turned into spaces. */
export function deckNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, "").replace(/[_]+/g, " ").trim().slice(0, 80);
}
