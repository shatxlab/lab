// Browser plumbing for the tycoon island, ported from the standalone app's browser.ts.
// Dropped on purpose (the lab has its own PWA layer and install flow):
//   - `installOffer` signal, `watchInstallOffer()` and `installApp()` — the beforeinstallprompt /
//     appinstalled listeners and Menu Install button are replaced by the lab's PWA handling.
//   - No service-worker registration or manifest logic lives here.
// Kept: storage access, autosave registration, new-game reset, save export/import (UI stage wires these).

import { clearSave, importSave, migrateLegacySave, saveGame, type Autosave, type KeyValueStorage } from '@/lib/tycoon/save'
import { nextChapter } from '@/lib/tycoon/sim/chapters'
import { exportJournal } from '@/lib/tycoon/sim/journal'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { fail, type GameState, type Result } from '@/lib/tycoon/sim/types'

let autosave: Autosave | null = null

/** `localStorage`, or null where the browser blocks it. */
export function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** One-time carry-over from the standalone app's save keys; call from the island bootstrap. */
export function migrateLegacyTycoonSave(storage: KeyValueStorage | null): void {
  if (storage) migrateLegacySave(storage)
}

/** Registers the running autosave so actions that replace the save can silence it first. */
export function setAutosave(next: Autosave): void {
  autosave = next
}

/** Deletes the save and restarts. The autosave is stopped first, or it would rewrite the old game. */
export function startNewGame(): void {
  autosave?.stop()
  const storage = browserStorage()
  if (storage) clearSave(storage)
  location.reload()
}

/** Saves the next chapter of the career (see `sim/chapters.ts`) over the ended run and reloads into it. */
export function startNextChapter(state: GameState): void {
  const next = nextChapter(state)
  const storage = browserStorage()
  if (!next || !storage) return
  autosave?.stop()
  if (saveGame(next, storage)) location.reload()
}

export function downloadSave(state: GameState): void {
  const blob = new Blob([serialize(state)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `lab-tycoon-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/** Downloads the run's log: every decision and what came of it, to share and go through afterwards. */
export function downloadJournal(state: GameState): void {
  const blob = new Blob([exportJournal(state)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `lab-tycoon-run-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/** Replaces the current save with an exported file and reloads into it. */
export async function importSaveFile(file: File): Promise<Result> {
  const storage = browserStorage()
  if (!storage) return fail('This browser blocks local storage.')
  const text = await file.text()
  if (deserialize(text) === null) return importSave(text, storage)
  autosave?.stop()
  const result = importSave(text, storage)
  if (result.ok) location.reload()
  return result
}
