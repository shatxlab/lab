// Browser plumbing for the tycoon island, ported from the standalone app's browser.ts.
// Dropped on purpose (the lab has its own PWA layer and install flow):
//   - `installOffer` signal, `watchInstallOffer()` and `installApp()` — the beforeinstallprompt /
//     appinstalled listeners and Menu Install button are replaced by the lab's PWA handling.
//   - No service-worker registration or manifest logic lives here.
// Live career mutations are owned by career-controller/persistence, not by global browser helpers.
// These helpers only expose storage/downloads; preview reset/import/free-chapter fallbacks explicitly refuse writes.

import type { KeyValueStorage } from '@/lib/tycoon/save'
import { exportJournal } from '@/lib/tycoon/sim/journal'
import { serialize } from '@/lib/tycoon/sim/state'
import { fail, type GameState, type Result } from '@/lib/tycoon/sim/types'

/** `localStorage`, or null where the browser blocks it. */
export function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Non-persistent previews never get permission to replace the real career. Live menus use the controller. */
export function startNewGame(): Result {
  return fail('This preview cannot reset real storage. Open the normal game to start a separate career.')
}

/** The old free-seed-money chapter path is deliberately unavailable to browser callers. */
export function startNextChapter(_state: GameState): Result {
  return fail('Free restarts have been retired. Use the funded career setup or explicit consulting.')
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

/** Live file import belongs to the guarded career owner, never this preview-only fallback. */
export async function importSaveFile(_file: File): Promise<Result> {
  return fail('Import is disabled in this non-persistent preview. Open the normal game to import a career backup.')
}

/** Downloads already-validated career bytes, never an engine-only reconstruction of private finance. */
export function downloadSaveText(text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `lab-tycoon-career-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}
