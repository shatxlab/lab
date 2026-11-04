import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  adoptCareerSave, createCareerSave, deserializeCareerSave, serializeCareerSave,
  type CareerSave,
} from '@/lib/tycoon/career-save'
import {
  adoptStoredCareer, browserCareerLock, CAREER_SAVE_LOCK, foundStoredCompany, settleStoredCareer,
  type ExclusiveSaveLock,
} from '@/lib/tycoon/career-transactions'
import { SAVE_KEY, BACKUP_KEY, type KeyValueStorage } from '@/lib/tycoon/save'
import { financeSummary, type FinanceResult } from '@/lib/tycoon/sim/founder-finance'
import { createInitialState, serialize } from '@/lib/tycoon/sim/state'
import { quoteFounding, type FoundingSelection } from '@/lib/tycoon/paid-founding'
import { paidFoundingSource } from './paid-founding-fixtures'

function unwrap<T>(r: FinanceResult<T>): T {
  if (!r.ok) throw new Error(r.reason)
  return r.value
}
const identity = { careerId: 'career:synthetic', companyId: 'company:synthetic' }
function ending(): CareerSave {
  const save = unwrap(createCareerSave(createInitialState(5), identity))
  save.game.day = 500
  save.game.gameOver = true
  save.game.money = 2_000_000
  save.game.ending = { kind: 'ipo', day: 500, worth: 100_000_000 }
  return save
}
class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>()
  writes = 0
  failRead = false
  failWrite = false
  getItem(key: string): string | null {
    if (this.failRead) throw new Error('blocked')
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    if (this.failWrite) throw new Error('quota')
    this.writes++
    this.values.set(key, value)
  }
  removeItem(key: string): void { this.values.delete(key) }
}
/** Same contract as Web Locks: operations for the same storage key cannot overlap. */
class SerialLock implements ExclusiveSaveLock {
  names: string[] = []
  private tail: Promise<unknown> = Promise.resolve()
  run<T>(name: string, operation: () => T | Promise<T>): Promise<T> {
    this.names.push(name)
    const next = this.tail.then(operation)
    this.tail = next.catch(() => {})
    return next
  }
}
function setup(save = ending()) {
  const storage = new MemoryStorage()
  const token = unwrap(serializeCareerSave(save))
  storage.setItem(SAVE_KEY, token)
  storage.writes = 0
  return { save, storage, token, lock: new SerialLock() }
}
const balance = (text: string) => unwrap(financeSummary(unwrap(deserializeCareerSave(text)).finance)).liquid

afterEach(() => vi.unstubAllGlobals())

describe('prepared guarded career persistence (not wired to v11 autosave)', () => {
  it('publishes game, charter and settlement with one write, no independent balance key', async () => {
    const { save, storage, token, lock } = setup()
    const before = JSON.stringify(save)
    const result = unwrap(await settleStoredCareer(storage, lock, token))
    expect(storage.writes).toBe(1)
    expect(storage.getItem(SAVE_KEY)).toBe(result.token)
    expect(storage.values.size).toBe(1)
    expect(balance(result.token)).toBe(5_000_000)
    expect(result.save.game).toEqual(save.game)
    expect(JSON.stringify(save)).toBe(before)
    expect(lock.names).toEqual([CAREER_SAVE_LOCK])
    expect(storage.getItem(BACKUP_KEY)).toBeNull()
  })

  it('retries a persisted settlement without another write or credit', async () => {
    const { storage, token, lock } = setup()
    const first = unwrap(await settleStoredCareer(storage, lock, token))
    const second = unwrap(await settleStoredCareer(storage, lock, first.token))
    expect(second.token).toBe(first.token)
    expect(balance(second.token)).toBe(5_000_000)
    expect(storage.writes).toBe(1)
  })

  it('recovers after quota failure without mutating the ended source or persisted save', async () => {
    const { save, storage, token, lock } = setup()
    const before = JSON.stringify(save)
    storage.failWrite = true
    expect((await settleStoredCareer(storage, lock, token)).ok).toBe(false)
    expect(storage.getItem(SAVE_KEY)).toBe(token)
    expect(balance(token)).toBe(0)
    expect(JSON.stringify(save)).toBe(before)
    expect(storage.writes).toBe(0)
    storage.failWrite = false
    const retry = unwrap(await settleStoredCareer(storage, lock, token))
    expect(balance(retry.token)).toBe(5_000_000)
    expect(storage.writes).toBe(1)
  })

  it('rejects two concurrent confirmations from the same snapshot instead of duplicating a credit', async () => {
    const { storage, token, lock } = setup()
    const results = await Promise.all([
      settleStoredCareer(storage, lock, token), settleStoredCareer(storage, lock, token),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(storage.writes).toBe(1)
    expect(balance(storage.getItem(SAVE_KEY)!)).toBe(5_000_000)
  })

  it('rejects a stale tab after another career replaced the slot, even for the same seed/day', async () => {
    const { storage, token, lock } = setup()
    const other = ending()
    other.finance.careerId = 'different-career'
    const replacement = unwrap(serializeCareerSave(other))
    storage.setItem(SAVE_KEY, replacement)
    storage.writes = 0
    const result = await settleStoredCareer(storage, lock, token)
    expect(result.ok).toBe(false)
    expect(storage.getItem(SAVE_KEY)).toBe(replacement)
    expect(storage.writes).toBe(0)
  })

  it('checks the source inside the lock, not before waiting', async () => {
    const { storage, token, lock } = setup()
    let release!: () => void
    const blocker = lock.run(CAREER_SAVE_LOCK, () => new Promise<void>((resolve) => { release = resolve }))
    await Promise.resolve()
    const pending = settleStoredCareer(storage, lock, token)
    const other = ending()
    other.finance.careerId = 'successor'
    const nextToken = unwrap(serializeCareerSave(other))
    storage.setItem(SAVE_KEY, nextToken)
    storage.writes = 0
    release()
    await blocker
    expect((await pending).ok).toBe(false)
    expect(storage.getItem(SAVE_KEY)).toBe(nextToken)
    expect(storage.writes).toBe(0)
  })

  it('requires safe locking and handles denied locks/storage reads without writing', async () => {
    const { storage, token, lock } = setup()
    expect((await settleStoredCareer(storage, null, token)).ok).toBe(false)
    const denied: ExclusiveSaveLock = { run: async () => { throw new Error('lock unavailable') } }
    expect((await settleStoredCareer(storage, denied, token)).ok).toBe(false)
    storage.failRead = true
    expect((await settleStoredCareer(storage, lock, token)).ok).toBe(false)
    storage.failRead = false
    expect(storage.getItem(SAVE_KEY)).toBe(token)
    expect(storage.writes).toBe(0)
  })

  it('does not replace malformed finance or an active company with a repaired settlement', async () => {
    const { storage, lock } = setup()
    for (const text of ['broken json', serialize(createInitialState(5)), unwrap(serializeCareerSave(unwrap(createCareerSave(createInitialState(5), identity))))]) {
      storage.setItem(SAVE_KEY, text)
      storage.writes = 0
      expect((await settleStoredCareer(storage, lock, text)).ok).toBe(false)
      expect(storage.getItem(SAVE_KEY)).toBe(text)
      expect(storage.writes).toBe(0)
    }
  })

  it('atomically migrates a legacy ending without credit and persists explicit adoption afterward', async () => {
    const storage = new MemoryStorage()
    const lock = new SerialLock()
    const legacy = serialize(ending().game)
    storage.setItem(SAVE_KEY, legacy)
    storage.writes = 0
    const migrated = unwrap(await adoptStoredCareer(storage, lock, legacy, identity))
    expect(storage.writes).toBe(1)
    expect(balance(migrated.token)).toBe(0)
    expect(migrated.save.game.ending?.kind).toBe('ipo')
    expect((await settleStoredCareer(storage, lock, migrated.token)).ok).toBe(false)
    expect(storage.writes).toBe(1)
    const applied = unwrap(await settleStoredCareer(storage, lock, migrated.token, 'apply'))
    expect(balance(applied.token)).toBe(5_000_000)
    expect(storage.writes).toBe(2)
    expect(unwrap(await settleStoredCareer(storage, lock, applied.token, 'apply')).token).toBe(applied.token)
    expect((await settleStoredCareer(storage, lock, applied.token, 'decline')).ok).toBe(false)
    expect(storage.writes).toBe(2)
  })

  it('persists decline without credit and rejects later adoption', async () => {
    const legacy = unwrap(adoptCareerSave(serialize(ending().game), identity))
    const { storage, token, lock } = setup(legacy)
    const declined = unwrap(await settleStoredCareer(storage, lock, token, 'decline'))
    expect(balance(declined.token)).toBe(0)
    expect(unwrap(await settleStoredCareer(storage, lock, declined.token, 'decline')).token).toBe(declined.token)
    expect((await settleStoredCareer(storage, lock, declined.token, 'apply')).ok).toBe(false)
    expect(storage.writes).toBe(1)
  })

  it('leaves the original legacy save recoverable after failed migration', async () => {
    const storage = new MemoryStorage()
    const lock = new SerialLock()
    const original = serialize(ending().game)
    storage.setItem(SAVE_KEY, original)
    storage.writes = 0
    storage.failWrite = true
    expect((await adoptStoredCareer(storage, lock, original, identity)).ok).toBe(false)
    expect(storage.getItem(SAVE_KEY)).toBe(original)
    storage.failWrite = false
    expect((await adoptStoredCareer(storage, lock, original, { ...identity, careerId: '' })).ok).toBe(false)
    expect(storage.getItem(SAVE_KEY)).toBe(original)
    expect(storage.writes).toBe(0)
  })

  it('publishes at most one migration identity across competing tabs', async () => {
    const storage = new MemoryStorage()
    const lock = new SerialLock()
    const original = serialize(ending().game)
    storage.setItem(SAVE_KEY, original)
    storage.writes = 0
    const results = await Promise.all([
      adoptStoredCareer(storage, lock, original, identity),
      adoptStoredCareer(storage, lock, original, { ...identity, careerId: 'other-tab' }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(storage.writes).toBe(1)
    expect((await adoptStoredCareer(storage, lock, storage.getItem(SAVE_KEY)!, identity)).ok).toBe(false)
  })

  it('snapshots the selected identity before waiting for the lock', async () => {
    const storage = new MemoryStorage()
    const lock = new SerialLock()
    const original = serialize(ending().game)
    storage.setItem(SAVE_KEY, original)
    const selected = { ...identity }
    const pending = adoptStoredCareer(storage, lock, original, selected)
    selected.careerId = 'mutated'
    expect(unwrap(await pending).save.finance.careerId).toBe(identity.careerId)
  })

  it('publishes the paid successor and private debit together; quota failure leaves the ended save recoverable', async () => {
    const source = paidFoundingSource()
    const { storage, token, lock } = setup(source)
    const choice: FoundingSelection = { companyId: 'successor', companyName: 'Copper', ambition: 'venture', focus: 'web_app', candidateIds: [] }
    const quote = unwrap(quoteFounding(source, choice))
    const original = JSON.stringify(source)
    storage.failWrite = true
    expect((await foundStoredCompany(storage, lock, token, quote)).ok).toBe(false)
    expect(storage.getItem(SAVE_KEY)).toBe(token)
    expect(balance(token)).toBe(5_000_000)
    expect(storage.writes).toBe(0)
    expect(JSON.stringify(source)).toBe(original)
    storage.failWrite = false
    const founded = unwrap(await foundStoredCompany(storage, lock, token, quote))
    expect(storage.writes).toBe(1)
    expect(founded.save.game.gameOver).toBe(false)
    expect(founded.save.game.money).toBe(quote.companyCash)
    expect(balance(founded.token)).toBe(4_000_000)
    expect(founded.save.charter.companyId).toBe('successor')
    expect((await foundStoredCompany(storage, lock, token, quote)).ok).toBe(false)
    expect((await foundStoredCompany(storage, lock, founded.token, quote)).ok).toBe(false)
    expect(storage.getItem(SAVE_KEY)).toBe(founded.token)
    expect(storage.writes).toBe(1)
  })

  it('publishes only one successor across concurrent founding confirmations', async () => {
    const source = paidFoundingSource()
    const { storage, token, lock } = setup(source)
    const choice: FoundingSelection = { companyId: 'successor', companyName: 'Copper', ambition: 'modest', focus: 'web_app', candidateIds: [] }
    const quote = unwrap(quoteFounding(source, choice))
    const results = await Promise.all([foundStoredCompany(storage, lock, token, quote), foundStoredCompany(storage, lock, token, quote)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(storage.writes).toBe(1)
    expect(balance(storage.getItem(SAVE_KEY)!)).toBe(4_985_000)
  })

  it('rejects altered founding costs without a write and snapshots quotes before waiting', async () => {
    const source = paidFoundingSource()
    const { storage, token, lock } = setup(source)
    const choice: FoundingSelection = { companyId: 'successor', companyName: 'Copper', ambition: 'modest', focus: 'web_app', candidateIds: [] }
    const quote = unwrap(quoteFounding(source, choice))
    const invalid = structuredClone(quote)
    invalid.companyCash += 10000
    expect((await foundStoredCompany(storage, lock, token, invalid)).ok).toBe(false)
    expect(storage.writes).toBe(0)
    const pending = foundStoredCompany(storage, lock, token, quote)
    quote.selection.companyName = 'Mutated after confirmation'
    quote.costs.setup = 99999
    const result = unwrap(await pending)
    expect(result.save.game.studioName).toBe('Copper')
    expect(storage.writes).toBe(1)
  })

  it('exposes a real browser lock only where supported, using an exclusive shared lock name', async () => {
    vi.stubGlobal('navigator', {})
    expect(browserCareerLock()).toBeNull()
    const request = vi.fn(async (_name: string, _options: unknown, fn: () => unknown) => fn())
    vi.stubGlobal('navigator', { locks: { request } })
    const lock = browserCareerLock()!
    expect(await lock.run(CAREER_SAVE_LOCK, () => 42)).toBe(42)
    expect(request.mock.calls[0].slice(0, 2)).toEqual([CAREER_SAVE_LOCK, { mode: 'exclusive' }])
  })
})
