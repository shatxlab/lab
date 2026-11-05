// Prepared session owner. Do not connect piecemeal to the live v11 controller/writers.
import type { CareerIdentity, CareerSave } from './career-save'
import {
  adoptStoredCareer, advanceStoredActiveCareer, advanceStoredConsulting, carryStoredLegacyCareer, foundStoredCompany,
  importStoredCareer, resetStoredCareer, saveStoredCareer, settleStoredCareer, startStoredConsulting,
  type CommittedCareer, type ExclusiveSaveLock,
} from './career-transactions'
import type { ConsultingQuote } from './consulting'
import type { FoundingQuote } from './paid-founding'
import { SAVE_KEY, type KeyValueStorage } from './save'
import type { FinanceResult } from './sim/founder-finance'
import type { GameState } from './sim/types'

type Outcome = FinanceResult<CommittedCareer>
export type PersistenceStatus = 'ready' | 'error' | 'conflict' | 'unsupported' | 'stopped'
const fail = (reason: string): Outcome => ({ ok: false, reason })

/**
 * Owns the persisted source token, never infers it from an in-memory draft. Serializes same-tab operations;
 * Web Locks + exact source bytes arbitrate OTHER tabs. A conflict suspends this session until a real reload.
 * Import/reset are barriers: older queued/lock-waiting work cannot resurrect the replaced company.
 */
export function createCareerPersistence(storage: KeyValueStorage, lock: ExclusiveSaveLock | null, expected: string | null) {
  let token = expected, status: PersistenceStatus = lock ? 'ready' : 'unsupported', error: string | null = null
  let epoch = 0, tail: Promise<unknown> = Promise.resolve()
  const blocked = () => status === 'stopped' || status === 'conflict' || status === 'unsupported'
  function submit(action: (lock: ExclusiveSaveLock, source: string | null) => Promise<Outcome>, barrier = false, signal?: AbortSignal): Promise<Outcome> {
    if (blocked()) return Promise.resolve(fail('This career session is suspended; reload before saving'))
    if (barrier) epoch++
    const generation = epoch
    const canceled = () => generation !== epoch || signal?.aborted || status === 'stopped'
    const job = tail.then(async (): Promise<Outcome> => {
      if (canceled()) return fail('This pending write was canceled or superseded')
      if (blocked()) return fail('This career session is suspended; reload before saving')
      const source = token
      const lease: ExclusiveSaveLock = { run: (name, operation) => lock!.run(name, () => {
        if (canceled()) throw new Error('Canceled write')
        return operation()
      }) }
      const result = await action(lease, source)
      // An already-published write cannot be undone by a later stop/barrier. The successor must use its new token.
      if (result.ok) {
        token = result.value.token
        if (!canceled()) { status = 'ready'; error = null }
      } else if (!canceled()) {
        error = result.reason
        status = 'error'
        try { if (storage.getItem(SAVE_KEY) !== source) status = 'conflict' } catch { /* Retry after storage recovers. */ }
      }
      return result
    })
    tail = job.catch(() => {})
    return job
  }
  const existing = (source: string | null, operation: (source: string) => Promise<Outcome>) => source === null
    ? Promise.resolve(fail('Initialize or adopt a saved career before continuing')) : operation(source)
  return {
    get token() { return token },
    get status(): PersistenceStatus { return status },
    get error() { return error },
    stop() { epoch++; status = 'stopped' },
    save(snapshot: CareerSave, signal?: AbortSignal) {
      const selected = structuredClone(snapshot)
      return submit((lease, source) => existing(source, (text) => saveStoredCareer(storage, lease, text, selected)), false, signal)
    },
    adopt(identity: CareerIdentity) {
      const ids = { ...identity }
      return submit((lease, source) => existing(source, (text) => adoptStoredCareer(storage, lease, text, ids)))
    },
    carryLegacy(legacyText: string, identity: CareerIdentity) {
      const ids = { ...identity }
      return submit((lease, source) => source === null ? carryStoredLegacyCareer(storage, lease, legacyText, ids)
        : Promise.resolve(fail('The lab career already exists; standalone carry-over cannot replace it')))
    },
    import(text: string, legacyIdentity?: CareerIdentity) {
      const ids = legacyIdentity ? { ...legacyIdentity } : undefined
      return submit((lease, source) => importStoredCareer(storage, lease, source, text, ids), true)
    },
    reset(game: GameState, identity: CareerIdentity) {
      const selected = structuredClone(game), ids = { ...identity }
      return submit((lease, source) => resetStoredCareer(storage, lease, source, selected, ids), true)
    },
    settle(decision?: 'apply' | 'decline') {
      return submit((lease, source) => existing(source, (text) => settleStoredCareer(storage, lease, text, decision)))
    },
    found(quote: FoundingQuote) {
      const selected = structuredClone(quote)
      return submit((lease, source) => existing(source, (text) => foundStoredCompany(storage, lease, text, selected)))
    },
    startConsulting(quote: ConsultingQuote) {
      const selected = structuredClone(quote)
      return submit((lease, source) => existing(source, (text) => startStoredConsulting(storage, lease, text, selected)))
    },
    advanceConsulting(days = 1) {
      return submit((lease, source) => existing(source, (text) => advanceStoredConsulting(storage, lease, text, days)))
    },
    advanceActive(days = 1) {
      return submit((lease, source) => existing(source, (text) => advanceStoredActiveCareer(storage, lease, text, days)))
    },
  }
}
export type CareerPersistence = ReturnType<typeof createCareerPersistence>
