/**
 * Hand some text from one tool to another: the sender leaves it in localStorage
 * and opens the receiving tool in a new tab, which collects it once. The keys
 * deliberately lack the `lab:` prefix so the settings backup never carries a
 * stale handoff, and a handoff nobody collected within ten minutes is ignored.
 */

export const HANDOFF_TTL_MS = 10 * 60 * 1000;

export interface Handoff {
  /** The file the text came from. */
  name: string;
  text: string;
}

interface Stored extends Handoff {
  at: number;
}

export interface HandoffStorage {
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

/** Leave text under `key`; false when it is too big or storage refuses it. */
export function writeHandoffTo(key: string, handoff: Handoff, maxChars: number, now = Date.now(), storage: HandoffStorage | undefined = storageOrUndefined()): boolean {
  if (!storage || handoff.text.length > maxChars) return false;
  try {
    storage.setItem(key, JSON.stringify({ name: handoff.name, text: handoff.text, at: now } satisfies Stored));
    return true;
  } catch {
    return false;
  }
}

/** Collect the waiting handoff, removing it so it is only ever offered once. */
export function takeHandoffFrom(key: string, now = Date.now(), storage: HandoffStorage | undefined = storageOrUndefined()): Handoff | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
    storage.removeItem(key);
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
