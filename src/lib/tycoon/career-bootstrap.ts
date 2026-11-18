import { createCareerPersistence, type CareerPersistence } from './career-persistence'
import { deserializeCareerSave } from './career-save'
import type { ExclusiveSaveLock } from './career-transactions'
import { SAVE_KEY, LEGACY_SAVE_KEY, type KeyValueStorage } from './save'
import { createInitialState } from './sim/state'
import { financeSummary } from './sim/founder-finance'

export type CareerBoot = { ok: true; owner: CareerPersistence } | { ok: false; reason: string; raw: string | null; readable: boolean }
/** No unknown/blocked save is ever replaced by an automatically created game. */
export async function bootCareer(storage: KeyValueStorage | null, lock: ExclusiveSaveLock | null,
  options: { signal?: AbortSignal; id?: () => string; seed?: number } = {}): Promise<CareerBoot> {
  let raw: string | null = null
  if (!storage) return { ok: false, reason: 'This browser blocks local storage. Enable it and reload; no new career was started.', raw, readable: false }
  try { raw = storage.getItem(SAVE_KEY) } catch { return { ok: false, reason: 'The saved career could not be read. Nothing was replaced.', raw, readable: false } }
  const fail = (reason: string): CareerBoot => ({ ok: false, reason, raw, readable: true })
  if (!lock) return fail('This browser cannot coordinate saves safely (Web Locks unavailable). Use a supported secure browser; your file is untouched.')
  const owner = createCareerPersistence(storage, lock, raw)
  const cancel = () => owner.stop()
  options.signal?.addEventListener('abort', cancel, { once: true })
  const ids = () => ({ careerId: `career:${(options.id ?? (() => crypto.randomUUID()))()}`, companyId: `company:${(options.id ?? (() => crypto.randomUUID()))()}` })
  try {
    if (options.signal?.aborted) { cancel(); return fail('Career loading was canceled') }
    if (raw === null) {
      const standalone = storage.getItem(LEGACY_SAVE_KEY)
      if (standalone !== null) {
        const result = await owner.carryLegacy(standalone, ids())
        if (!result.ok) return fail(result.reason)
      } else {
        const game = createInitialState(options.seed ?? Date.now())
        game.freshChapter = true
        const result = await owner.reset(game, ids())
        if (!result.ok) return fail(result.reason)
      }
    } else {
      let parsed: { version?: unknown }
      try { parsed = JSON.parse(raw) } catch { return fail('The saved file is malformed. Export the original before choosing import or reset.') }
      if (parsed?.version === 12) {
        const checked = deserializeCareerSave(raw)
        if (!checked.ok) return fail(checked.reason)
        const summary = financeSummary(checked.value.finance)
        if (!summary.ok) return fail(summary.reason)
        const current = summary.value.companies.at(-1)!
        if (checked.value.game.gameOver && !current.closed && current.source !== 'legacy-ended') {
          const settled = await owner.save(checked.value)
          if (!settled.ok) return fail(settled.reason)
        }
      } else {
        const adopted = await owner.adopt(ids())
        if (!adopted.ok) return fail('This file cannot be adopted: ' + adopted.reason)
      }
    }
    if (options.signal?.aborted) { cancel(); return fail('Career loading was canceled') }
    return { ok: true, owner }
  } catch { return fail('Career loading or storage failed. The previous file has not been replaced automatically.') }
  finally { options.signal?.removeEventListener('abort', cancel) }
}
