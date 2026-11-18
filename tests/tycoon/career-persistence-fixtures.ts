import { createCareerSave, serializeCareerSave } from '@/lib/tycoon/career-save'
import { createCareerPersistence } from '@/lib/tycoon/career-persistence'
import { SAVE_KEY, type KeyValueStorage } from '@/lib/tycoon/save'
import { createInitialState } from '@/lib/tycoon/sim/state'
import type { ExclusiveSaveLock } from '@/lib/tycoon/career-transactions'
import { unwrap } from './paid-founding-fixtures'
export { unwrap }
export class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>()
  writes = 0
  removes = 0
  failRead = false
  failWrite = false
  getItem(key: string) { if (this.failRead) throw new Error('blocked'); return this.values.get(key) ?? null }
  setItem(key: string, value: string) { if (this.failWrite) throw new Error('quota'); this.writes++; this.values.set(key, value) }
  removeItem(key: string) { this.removes++; this.values.delete(key) }
}
export class SerialLock implements ExclusiveSaveLock {
  names: string[] = []
  private tail: Promise<unknown> = Promise.resolve()
  run<T>(name: string, operation: () => T | Promise<T>): Promise<T> {
    this.names.push(name)
    const job = this.tail.then(operation)
    this.tail = job.catch(() => {})
    return job
  }
}
export function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}
export class HeldLock extends SerialLock {
  entered = deferred()
  gate = deferred()
  override run<T>(name: string, operation: () => T | Promise<T>) {
    return super.run(name, async () => { this.entered.resolve(); await this.gate.promise; return operation() })
  }
}
export const identity = { careerId: 'synthetic-owner', companyId: 'first' }
export function setup() {
  const save = unwrap(createCareerSave(createInitialState(5), identity))
  const storage = new MemoryStorage(), lock = new SerialLock()
  const token = unwrap(serializeCareerSave(save))
  storage.setItem(SAVE_KEY, token)
  storage.writes = 0
  return { save, storage, lock, token, owner: createCareerPersistence(storage, lock, token) }
}
