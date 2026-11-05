import {
  adoptCareerSave, createCareerSave, deserializeCareerSave, serializeCareerSave, settleCareerSave, validateCareerSave,
  type CareerIdentity, type CareerSave,
} from './career-save'
import { advanceActiveCareer, refreshCareerCharter } from './career-progress'
import type { GameState } from './sim/types'
import { advanceConsulting, startConsulting, type ConsultingQuote } from './consulting'
import { foundPaidCompany, type FoundingQuote } from './paid-founding'
import { SAVE_KEY, LEGACY_SAVE_KEY, type KeyValueStorage } from './save'
import { financeSummary, type FinanceResult } from './sim/founder-finance'

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
async function publish(
  storage: KeyValueStorage,
  lock: ExclusiveSaveLock | null,
  expected: string | null,
  proposal: () => FinanceResult<CareerSave>,
): Promise<FinanceResult<CommittedCareer>> {
  if (!lock) return fail('This browser cannot safely coordinate career saves across tabs')
  try {
    return await lock.run(CAREER_SAVE_LOCK, () => {
      if (storage.getItem(SAVE_KEY) !== expected) return fail('The saved career changed in another tab; reload before continuing')
      const next = proposal()
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

function commit(storage: KeyValueStorage, lock: ExclusiveSaveLock | null, expected: string,
  proposal: (text: string) => FinanceResult<CareerSave>): Promise<FinanceResult<CommittedCareer>> {
  return publish(storage, lock, expected, () => proposal(expected))
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

/** Prepared autosave: only company progress, never caller-supplied finance edits or a stale successor. */
export function saveStoredCareer(storage: KeyValueStorage, lock: ExclusiveSaveLock | null, expected: string,
  snapshot: CareerSave): Promise<FinanceResult<CommittedCareer>> {
  const selected = structuredClone(snapshot)
  return commit(storage, lock, expected, (text) => {
    const current = deserializeCareerSave(text)
    if (!current.ok) return current
    const next = validateCareerSave(selected)
    if (!next.ok) return next
    const before = current.value, after = next.value
    if (JSON.stringify(before.finance) !== JSON.stringify(after.finance) || JSON.stringify(before.charter) !== JSON.stringify(after.charter))
      return fail('Autosave cannot replace the booked finance or charter; reload the latest committed career')
    if (after.game.day < before.game.day || (after.game.chapter ?? 1) !== (before.game.chapter ?? 1) ||
      (after.game.chapterStartDay ?? 0) !== (before.game.chapterStartDay ?? 0) ||
      JSON.stringify(after.game.founding) !== JSON.stringify(before.game.founding) || JSON.stringify(after.game.legacy) !== JSON.stringify(before.game.legacy))
      return fail('Autosave cannot rewind or replace a company; use explicit import or paid founding')
    if (before.game.gameOver) {
      if (JSON.stringify(before.game) !== JSON.stringify(after.game)) return fail('An ended company cannot keep changing through autosave')
      const summary = financeSummary(before.finance)
      if (!summary.ok) return summary
      const company = summary.value.companies.at(-1)!
      return !company.closed && company.source !== 'legacy-ended' ? settleCareerSave(before) : current
    }
    return after.game.gameOver ? settleCareerSave(after) : refreshCareerCharter(after)
  })
}

/** Explicit file replacement. Legacy adoption creates no cash and leaves ended-save settlement undecided. */
export function importStoredCareer(storage: KeyValueStorage, lock: ExclusiveSaveLock | null, expected: string | null,
  text: string, legacyIdentity?: CareerIdentity): Promise<FinanceResult<CommittedCareer>> {
  const identity = legacyIdentity ? { ...legacyIdentity } : undefined
  return publish(storage, lock, expected, () => {
    let version: unknown
    try { version = JSON.parse(text)?.version } catch { return fail('Malformed imported save') }
    if (version === 12) return deserializeCareerSave(text) // Never repair a corrupt envelope as a legacy company.
    return identity ? adoptCareerSave(text, identity) : fail('Importing a legacy save needs a new career identity')
  })
}

/** Reset/first initialization atomically publishes a fresh career instead of deleting and leaving a resurrection gap. */
export function resetStoredCareer(storage: KeyValueStorage, lock: ExclusiveSaveLock | null, expected: string | null,
  game: GameState, identity: CareerIdentity): Promise<FinanceResult<CommittedCareer>> {
  const selected = structuredClone(game), ids = { ...identity }
  return publish(storage, lock, expected, () => {
    if (expected !== null) {
      const previous = deserializeCareerSave(expected)
      if (previous.ok && previous.value.finance.careerId === ids.careerId) return fail('A reset needs a fresh career identity')
    }
    return createCareerSave(selected, ids)
  })
}

/** Prepared standalone carry-over: check BOTH source keys under the common lock, retaining the old file as backup. */
export function carryStoredLegacyCareer(storage: KeyValueStorage, lock: ExclusiveSaveLock | null, legacyExpected: string,
  identity: CareerIdentity): Promise<FinanceResult<CommittedCareer>> {
  const ids = { ...identity }
  return publish(storage, lock, null, () => storage.getItem(LEGACY_SAVE_KEY) === legacyExpected
    ? adoptCareerSave(legacyExpected, ids) : fail('The standalone save changed; reload before carrying it over'))
}
