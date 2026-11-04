import {
  adoptCareerSave, deserializeCareerSave, serializeCareerSave, settleCareerSave,
  type CareerIdentity, type CareerSave,
} from './career-save'
import { SAVE_KEY, type KeyValueStorage } from './save'
import type { FinanceResult } from './sim/founder-finance'

/** All future v12 writers, including autosave/reset/import, must use this same exclusive lock. */
export const CAREER_SAVE_LOCK = 'lab:tycoon:career-save'
export interface ExclusiveSaveLock {
  run<T>(name: string, operation: () => T | Promise<T>): Promise<T>
}
export interface CommittedCareer {
  save: CareerSave
  /** Exact persisted bytes: use this token for the next guarded write. */
  token: string
}
const fail = (reason: string): FinanceResult<never> => ({ ok: false, reason })

/** Web Locks serialize cooperating same-origin tabs. No unsafe unlocked fallback. */
export function browserCareerLock(): ExclusiveSaveLock | null {
  if (typeof navigator === 'undefined' || !navigator.locks) return null
  return { async run<T>(name: string, operation: () => T | Promise<T>): Promise<T> {
    return await navigator.locks.request(name, { mode: 'exclusive' }, async () => await operation())
  } }
}

/**
 * A single atomic storage write publishes the whole game + ledger + charter, never separate money keys.
 * A rejected/quota-failed write leaves the source and persisted ending untouched. Stale callers must reload.
 * Not connected to v11 autosave: enable this only when ALL live writers have moved under the same lock.
 */
async function commit(
  storage: KeyValueStorage,
  lock: ExclusiveSaveLock | null,
  expected: string,
  proposal: (text: string) => FinanceResult<CareerSave>,
): Promise<FinanceResult<CommittedCareer>> {
  if (!lock) return fail('This browser cannot safely coordinate career saves across tabs')
  try {
    return await lock.run(CAREER_SAVE_LOCK, () => {
      if (storage.getItem(SAVE_KEY) !== expected) return fail('The saved career changed in another tab; reload before continuing')
      const next = proposal(expected)
      if (!next.ok) return next
      const encoded = serializeCareerSave(next.value)
      if (!encoded.ok) return encoded
      if (encoded.value !== expected) storage.setItem(SAVE_KEY, encoded.value)
      return { ok: true, value: { save: next.value, token: encoded.value } }
    })
  } catch {
    return fail('The browser could not store the career; the previous save has not been replaced')
  }
}

/** Migration and identity publication happen in the same guarded write. No cash is credited here. */
export function adoptStoredCareer(storage: KeyValueStorage, lock: ExclusiveSaveLock | null, expected: string, identity: CareerIdentity): Promise<FinanceResult<CommittedCareer>> {
  // Snapshot inputs before an asynchronous lock wait; callers cannot change the migration identity mid-flight.
  const selected = { ...identity }
  return commit(storage, lock, expected, (text) => adoptCareerSave(text, selected))
}

/** Normal exits settle on the next v12 persistence boundary; ended legacy saves require a durable decision. */
export function settleStoredCareer(storage: KeyValueStorage, lock: ExclusiveSaveLock | null, expected: string, legacyDecision?: 'apply' | 'decline'): Promise<FinanceResult<CommittedCareer>> {
  return commit(storage, lock, expected, (text) => {
    const current = deserializeCareerSave(text)
    return current.ok ? settleCareerSave(current.value, legacyDecision) : current
  })
}
