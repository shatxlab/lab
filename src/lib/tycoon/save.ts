import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { fail, OK, type GameState, type Result } from '@/lib/tycoon/sim/types'
import type { Store } from '@/lib/tycoon/store'
import { MUTE_KEY } from '@/lib/tycoon/audio'

export const SAVE_KEY = 'lab:tycoon:save'
/** Holds a save this build couldn't read, so the next autosave doesn't destroy it. */
export const BACKUP_KEY = 'lab:tycoon:save-backup'

/** Save keys from the standalone Software Tycoon app, replaced by the `lab:tycoon:` keys above. */
export const LEGACY_SAVE_KEY = 'software-tycoon:save'
export const LEGACY_MUTED_KEY = 'software-tycoon:muted'

/**
 * One-time carry-over from the standalone app: when the lab save is absent and the legacy one
 * exists, copy it across and drop the old keys so nothing lab-prefixed ever reads them again.
 * Also migrates the mute choice. Silently does nothing where storage is unavailable.
 */
export function migrateLegacySave(storage: KeyValueStorage): void {
  try {
    if (storage.getItem(SAVE_KEY) === null) {
      const legacy = storage.getItem(LEGACY_SAVE_KEY)
      if (legacy !== null) {
        storage.setItem(SAVE_KEY, legacy)
        storage.removeItem(LEGACY_SAVE_KEY)
      }
    }
    if (storage.getItem(MUTE_KEY) === null) {
      const legacy = storage.getItem(LEGACY_MUTED_KEY)
      if (legacy !== null) {
        storage.setItem(MUTE_KEY, legacy)
        storage.removeItem(LEGACY_MUTED_KEY)
      }
    }
  } catch {
    // A blocked store keeps its old contents; the game just starts fresh.
  }
}
export const AUTOSAVE_MS = 2000

/** The part of `Storage` we use, so tests and non-browser hosts can supply their own. */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Returns false if the browser refused the write (quota, private mode). */
export function saveGame(state: GameState, storage: KeyValueStorage): boolean {
  try {
    storage.setItem(SAVE_KEY, serialize(state))
    return true
  } catch {
    return false
  }
}

/** The saved game, or null when there is none, it is unreadable, or that game already ended. */
export function loadGame(storage: KeyValueStorage): GameState | null {
  let raw: string | null
  try {
    raw = storage.getItem(SAVE_KEY)
  } catch {
    return null
  }
  if (raw === null) return null

  const state = deserialize(raw)
  if (state) return state.gameOver ? null : state
  try {
    storage.setItem(BACKUP_KEY, raw)
  } catch {
    // Nothing more we can do; starting fresh is still better than crashing.
  }
  return null
}

export function clearSave(storage: KeyValueStorage): void {
  try {
    storage.removeItem(SAVE_KEY)
  } catch {
    // Ignore: nothing to clear if storage is unavailable.
  }
}

/** Validates an exported save and makes it the current one. Nothing is written if it is invalid. */
export function importSave(text: string, storage: KeyValueStorage): Result {
  const state = deserialize(text)
  if (!state) return fail('That file is not a save from this version of the game.')
  if (state.gameOver) return fail('That save is from a game that already ended.')
  if (!saveGame(state, storage)) return fail('The browser would not store the save.')
  return OK
}

export interface Autosave {
  /** Writes right now if there are unsaved changes (call when the page is being hidden). */
  flush(): void
  /** Stops saving and drops any pending write. */
  stop(): void
}

/**
 * Saves at most once per `delayMs` while the game changes. A throttle, not a debounce:
 * the store changes every frame at speed, so waiting for quiet would never save.
 * A finished game deletes its save.
 */
export function createAutosave(store: Store, storage: KeyValueStorage, delayMs = AUTOSAVE_MS): Autosave {
  let timer: ReturnType<typeof setTimeout> | null = null

  const write = () => {
    timer = null
    if (store.state.gameOver) clearSave(storage)
    else saveGame(store.state, storage)
  }
  const unsubscribe = store.version.subscribe(() => {
    if (timer === null) timer = setTimeout(write, delayMs)
  })

  return {
    flush() {
      if (timer === null) return
      clearTimeout(timer)
      write()
    },
    stop() {
      unsubscribe()
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
  }
}
