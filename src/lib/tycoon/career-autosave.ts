import type { CareerSave } from './career-save'
import type { CareerPersistence } from './career-persistence'
import type { CommittedCareer } from './career-transactions'
import { AUTOSAVE_MS } from './save'
import type { Signal } from './signals'
import type { FinanceResult } from './sim/founder-finance'

export interface CareerAutosaveSource {
  version: Pick<Signal<number>, 'subscribe'>
  snapshot(): CareerSave
  /** Publish finance/charter acknowledgement without replacing newer live company progress. */
  acknowledge(committed: CommittedCareer): void
  onFailure?(reason: string): void
}

/**
 * Prepared throttled v12 autosave. At most one pending write; changes during a lock wait coalesce.
 * Failure keeps the draft dirty for explicit flush/retry, without an endless quota-error timer loop.
 * flush is asynchronous/best-effort on pagehide: financial actions must await their own durable commit.
 */
export function createCareerAutosave(owner: CareerPersistence, source: CareerAutosaveSource, delayMs = AUTOSAVE_MS) {
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new Error('Invalid autosave delay')
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: Promise<FinanceResult<CommittedCareer>> | null = null
  let dirty = false, stopped = false
  const lifetime = new AbortController()
  const canSave = () => !stopped && (owner.status === 'ready' || owner.status === 'error')
  const schedule = () => { if (canSave() && timer === null && pending === null) timer = setTimeout(() => { void write() }, delayMs) }
  function write(): Promise<FinanceResult<CommittedCareer>> | null {
    if (timer !== null) { clearTimeout(timer); timer = null }
    if (pending || !dirty || !canSave()) return pending
    let snapshot: CareerSave
    try { snapshot = source.snapshot() } catch {
      return Promise.resolve({ ok: false, reason: 'Could not capture the current career; the previous save is intact' })
    }
    dirty = false
    pending = owner.save(snapshot, lifetime.signal).then((result) => {
      if (!stopped) {
        if (result.ok) {
          try { source.acknowledge(result.value) } catch {
            // Persistence already succeeded. Do not retry an old ledger or pretend the durable write failed.
            stop()
            return { ok: false, reason: 'The career was saved, but its live view could not update; reload before continuing' } as const
          }
        } else { dirty = true; source.onFailure?.(result.reason) }
      }
      return result
    }).finally(() => {
      pending = null
      // Only subsequent real changes schedule another write; storage failures need an explicit retry or new change.
      if (dirty && canSave() && owner.status === 'ready') schedule()
    })
    return pending
  }
  const unsubscribe = source.version.subscribe(() => { if (!stopped) { dirty = true; schedule() } })
  function stop() {
    stopped = true
    lifetime.abort()
    unsubscribe()
    if (timer !== null) clearTimeout(timer)
    timer = null
    dirty = false
  }
  return { flush: write, stop, get dirty() { return dirty }, get pending() { return pending !== null } }
}
