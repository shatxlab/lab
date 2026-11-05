import {
  adoptCareerSave, deserializeCareerSave, serializeCareerSave, settleCareerSave,
  type CareerIdentity, type CareerSave,
} from './career-save'
import { advanceActiveCareer } from './career-progress'
import { advanceConsulting, startConsulting, type ConsultingQuote } from './consulting'
import { foundPaidCompany, type FoundingQuote } from './paid-founding'
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

/** Revalidates the source, actual world quote and cash before publishing debit + successor together. */
export function foundStoredCompany(storage: KeyValueStorage, lock: ExclusiveSaveLock | null, expected: string, quote: FoundingQuote): Promise<FinanceResult<CommittedCareer>> {
  const selected = structuredClone(quote)
  return commit(storage, lock, expected, (text) => {
    const current = deserializeCareerSave(text)
    return current.ok ? foundPaidCompany(current.value, selected) : current
  })
}

/** No payment at start; source check and contract publication share the same guarded write. */
export function startStoredConsulting(storage: KeyValueStorage, lock: ExclusiveSaveLock | null, expected: string, quote: ConsultingQuote): Promise<FinanceResult<CommittedCareer>> {
  const selected = structuredClone(quote)
  return commit(storage, lock, expected, (text) => {
    const current = deserializeCareerSave(text)
    return current.ok ? startConsulting(current.value, selected) : current
  })
}

/** Partial world progress and any once-only completion credit are committed together. */
export function advanceStoredConsulting(storage: KeyValueStorage, lock: ExclusiveSaveLock | null, expected: string, days = 1): Promise<FinanceResult<CommittedCareer>> {
  return commit(storage, lock, expected, (text) => {
    const current = deserializeCareerSave(text)
    return current.ok ? advanceConsulting(current.value, days) : current
  })
}

/** Prepared clock boundary: company day, sticky recognition and any automatic exit settlement are one save. */
export function advanceStoredActiveCareer(storage: KeyValueStorage, lock: ExclusiveSaveLock | null, expected: string, days = 1): Promise<FinanceResult<CommittedCareer>> {
  return commit(storage, lock, expected, (text) => {
    const current = deserializeCareerSave(text)
    return current.ok ? advanceActiveCareer(current.value, days) : current
  })
}
