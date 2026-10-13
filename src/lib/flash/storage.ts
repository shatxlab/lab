import {
  DEFAULT_SETTINGS,
  LOG_DAYS,
  MAX_CARDS_PER_DECK,
  MAX_DECKS,
  MAX_FIELD_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TAGS,
  emptyStore,
  newId,
  type Card,
  type Deck,
  type FlashStore,
} from "@/lib/flash/model";

/** Persisted key; the `lab:` prefix puts it in the settings backup automatically. */
export const FLASH_STORAGE_KEY = "lab:flash:v1";

export interface FlashStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageOrUndefined(): FlashStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");
const number = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const whole = (value: unknown): number => Math.max(0, Math.floor(number(value)));

function cleanCard(raw: unknown, seen: Set<string>): Card | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Partial<Record<keyof Card, unknown>>;
  const front = text(input.front, MAX_FIELD_LENGTH);
  const back = text(input.back, MAX_FIELD_LENGTH);
  if (!front || !back) return undefined;
  let id = text(input.id, 40);
  if (!id || seen.has(id)) id = newId();
  seen.add(id);
  const reps = whole(input.reps);
  const stability = number(input.stability);
  // A reviewed card needs a usable memory; otherwise it starts over as new.
  const usable = reps > 0 && stability > 0;
  return {
    id,
    front,
    back,
    tags: Array.isArray(input.tags) ? input.tags.filter((t): t is string => typeof t === "string" && t !== "").slice(0, MAX_TAGS) : [],
    reps: usable ? reps : 0,
    lapses: usable ? whole(input.lapses) : 0,
    stability: usable ? stability : 0,
    difficulty: usable ? Math.min(10, Math.max(1, number(input.difficulty, 5))) : 0,
    due: usable ? whole(input.due) : 0,
    last: usable ? whole(input.last) : 0,
  };
}

function cleanDeck(raw: unknown, seenDecks: Set<string>): Deck | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as { id?: unknown; name?: unknown; cards?: unknown; created?: unknown };
  let id = text(input.id, 40);
  if (!id || seenDecks.has(id)) id = newId();
  seenDecks.add(id);
  const seenCards = new Set<string>();
  const cards = Array.isArray(input.cards)
    ? input.cards.slice(0, MAX_CARDS_PER_DECK).flatMap((card) => cleanCard(card, seenCards) ?? [])
    : [];
  return { id, name: text(input.name, MAX_NAME_LENGTH) || "Deck", cards, created: whole(input.created) };
}

export function readFlashStore(storage: FlashStorage | undefined = storageOrUndefined()): FlashStore {
  const store = emptyStore();
  if (!storage) return store;
  try {
    const raw = JSON.parse(storage.getItem(FLASH_STORAGE_KEY) ?? "null") as Partial<FlashStore> | null;
    if (!raw || typeof raw !== "object") return store;

    const seenDecks = new Set<string>();
    if (Array.isArray(raw.decks)) store.decks = raw.decks.slice(0, MAX_DECKS).flatMap((deck) => cleanDeck(deck, seenDecks) ?? []);

    if (raw.log && typeof raw.log === "object") {
      for (const [key, value] of Object.entries(raw.log)) {
        const day = Number(key);
        if (Number.isInteger(day) && whole(value) > 0) store.log[key] = whole(value);
      }
      const latest = Math.max(0, ...Object.keys(store.log).map(Number));
      for (const key of Object.keys(store.log)) if (Number(key) < latest - LOG_DAYS) delete store.log[key];
    }

    const introduced = raw.introduced;
    if (introduced && typeof introduced === "object" && introduced.byDeck && typeof introduced.byDeck === "object") {
      const byDeck: Record<string, number> = {};
      for (const [key, value] of Object.entries(introduced.byDeck)) byDeck[key] = whole(value);
      store.introduced = { day: whole(introduced.day), byDeck };
    }

    const settings = raw.settings;
    store.settings = {
      newPerDay: Math.min(500, whole(settings?.newPerDay ?? DEFAULT_SETTINGS.newPerDay)),
      retention: Math.min(0.97, Math.max(0.7, number(settings?.retention, DEFAULT_SETTINGS.retention))),
      sound: settings?.sound !== false,
    };
  } catch {
    // Corrupt data: start fresh.
  }
  return store;
}

export function writeFlashStore(store: FlashStore, storage: FlashStorage | undefined = storageOrUndefined()): void {
  if (!storage) return;
  try {
    storage.setItem(FLASH_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Progress is a convenience; never break studying over storage.
  }
}
