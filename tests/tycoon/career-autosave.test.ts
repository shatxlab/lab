import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCareerAutosave } from '@/lib/tycoon/career-autosave'
import { createCareerPersistence } from '@/lib/tycoon/career-persistence'
import { deserializeCareerSave, serializeCareerSave } from '@/lib/tycoon/career-save'
import { SAVE_KEY } from '@/lib/tycoon/save'
import { signal } from '@/lib/tycoon/signals'
import { createInitialState } from '@/lib/tycoon/sim/state'
import type { CommittedCareer } from '@/lib/tycoon/career-transactions'
import { HeldLock, setup, unwrap } from './career-persistence-fixtures'

function fixture(held = false) {
  const base = setup(), lock = held ? new HeldLock() : base.lock
  const owner = createCareerPersistence(base.storage, lock, base.token)
  const version = signal(0), live = base.save
  const acknowledge = vi.fn((committed: CommittedCareer) => {
    // Do NOT replace the company state: it may have advanced since the save snapshot was taken.
    live.finance = structuredClone(committed.save.finance)
    live.charter = structuredClone(committed.save.charter)
  })
  const source = { version, snapshot: () => structuredClone(live), acknowledge }
  const autosave = createCareerAutosave(owner, source)
  return { ...base, lock, owner, version, live, source, acknowledge, autosave }
}
const storedDay = (f: ReturnType<typeof fixture>) => unwrap(deserializeCareerSave(f.storage.getItem(SAVE_KEY)!)).game.day

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('prepared async guarded career autosave', () => {
  it('throttles many changes into one snapshot and does not rewrite identical bytes', async () => {
    const f = fixture()
    for (let day = 1; day <= 20; day++) { f.live.game.day = day; f.version.value++ }
    await vi.advanceTimersByTimeAsync(1999)
    expect(f.storage.writes).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.storage.writes).toBe(1)
    expect(storedDay(f)).toBe(20)
    expect(f.acknowledge).toHaveBeenCalledTimes(1)
    f.version.value++
    await vi.advanceTimersByTimeAsync(2000)
    expect(f.storage.writes).toBe(1)
    f.autosave.stop()
  })

  it('flushes now, awaits the actual commit, and clears the pending throttle', async () => {
    const f = fixture()
    f.live.game.day = 3; f.version.value++
    expect(unwrap((await f.autosave.flush())!).save.game.day).toBe(3)
    expect(f.autosave.dirty).toBe(false)
    expect(f.autosave.pending).toBe(false)
    expect(f.autosave.flush()).toBeNull()
    await vi.advanceTimersByTimeAsync(10000)
    expect(f.storage.writes).toBe(1)
    f.autosave.stop()
  })

  it('coalesces changes during lock waits without losing newer live progress during acknowledgement', async () => {
    const f = fixture(true), lock = f.lock as HeldLock
    f.live.game.day = 1; f.version.value++
    const first = f.autosave.flush()!
    await lock.entered.promise
    expect(f.autosave.flush()).toBe(first)
    f.live.game.day = 10; f.version.value++
    await vi.advanceTimersByTimeAsync(10000)
    expect(f.storage.writes).toBe(0)
    expect(f.autosave.pending).toBe(true)
    lock.gate.resolve()
    expect((await first).ok).toBe(true)
    expect(storedDay(f)).toBe(1)
    expect(f.live.game.day).toBe(10)
    await vi.advanceTimersByTimeAsync(2000)
    expect(f.storage.writes).toBe(2)
    expect(storedDay(f)).toBe(10)
    f.autosave.stop()
  })

  it('keeps quota-failed changes dirty for explicit retry, with no autonomous retry loop', async () => {
    const f = fixture()
    f.live.game.day = 7; f.version.value++
    f.storage.failWrite = true
    expect((await f.autosave.flush())?.ok).toBe(false)
    expect(f.autosave.dirty).toBe(true)
    expect(f.owner.token).toBe(f.token)
    expect(f.acknowledge).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(20000)
    expect(f.storage.writes).toBe(0)
    f.storage.failWrite = false
    expect((await f.autosave.flush())?.ok).toBe(true)
    expect(storedDay(f)).toBe(7)
    expect(f.autosave.dirty).toBe(false)
    f.autosave.stop()
  })

  it('suspends after a foreign tab changes the source instead of re-reading and overwriting it', async () => {
    const f = fixture(true), lock = f.lock as HeldLock
    f.live.game.day = 1; f.version.value++
    const pending = f.autosave.flush()!
    await lock.entered.promise
    const other = structuredClone(f.save); other.game.day = 50
    const replacement = unwrap(serializeCareerSave(other))
    f.storage.setItem(SAVE_KEY, replacement)
    lock.gate.resolve()
    expect((await pending).ok).toBe(false)
    expect(f.owner.status).toBe('conflict')
    f.live.game.day = 2; f.version.value++
    await vi.advanceTimersByTimeAsync(10000)
    expect(f.autosave.flush()).toBeNull()
    expect(f.storage.getItem(SAVE_KEY)).toBe(replacement)
    f.autosave.stop()
  })

  it('stop cancels both timers and lock-waiting writes without touching the saved source', async () => {
    const f = fixture(true), lock = f.lock as HeldLock
    f.live.game.day = 1; f.version.value++
    const pending = f.autosave.flush()!
    await lock.entered.promise
    f.autosave.stop()
    lock.gate.resolve()
    expect((await pending).ok).toBe(false)
    expect(f.owner.status).toBe('ready')
    f.version.value++
    await vi.advanceTimersByTimeAsync(10000)
    expect(f.storage.writes).toBe(0)
    expect(f.acknowledge).not.toHaveBeenCalled()
  })

  it('a reset barrier prevents a pending autosave from resurrecting the old company', async () => {
    const f = fixture(true), lock = f.lock as HeldLock
    f.live.game.day = 10; f.version.value++
    const pending = f.autosave.flush()!
    await lock.entered.promise
    f.autosave.stop()
    const reset = f.owner.reset(createInitialState(9), { careerId: 'new', companyId: 'new-first' })
    lock.gate.resolve()
    expect((await pending).ok).toBe(false)
    expect((await reset).ok).toBe(true)
    expect(f.storage.writes).toBe(1)
    expect(storedDay(f)).toBe(0)
  })

  it('does not arm timers or fall back to unlocked saving when Web Locks are unavailable', async () => {
    const f = setup(), version = signal(0)
    const owner = createCareerPersistence(f.storage, null, f.token)
    const autosave = createCareerAutosave(owner, { version, snapshot: () => f.save, acknowledge: vi.fn() })
    expect(autosave.flush()).toBeNull()
    await vi.advanceTimersByTimeAsync(10000)
    expect(f.storage.writes).toBe(0)
    expect(owner.status).toBe('unsupported')
    autosave.stop()
  })

  it('does not erase dirty state if snapshot capture fails', async () => {
    const f = setup(), version = signal(0)
    const snapshot = vi.fn(() => { throw new Error('capture') })
    const autosave = createCareerAutosave(f.owner, { version, snapshot, acknowledge: vi.fn() })
    expect((await autosave.flush())?.ok).toBe(false)
    expect(autosave.dirty).toBe(true)
    expect(f.storage.writes).toBe(0)
    autosave.stop()
  })

  it('reports a durable save separately from a failed live acknowledgement and requires reload', async () => {
    const f = setup(), version = signal(0)
    f.save.game.day = 9
    const autosave = createCareerAutosave(f.owner, { version, snapshot: () => f.save, acknowledge: () => { throw new Error('view') } })
    const result = await autosave.flush()
    expect(result?.ok).toBe(false)
    if (result && !result.ok) expect(result.reason).toContain('was saved')
    expect(f.storage.writes).toBe(1)
    version.value++
    await vi.advanceTimersByTimeAsync(10000)
    expect(f.storage.writes).toBe(1)
    expect(autosave.flush()).toBeNull()
    autosave.stop()
  })

  it.each([-1, NaN, Infinity])('rejects invalid throttle delay %s', (delay) => {
    const f = setup()
    expect(() => createCareerAutosave(f.owner, { version: signal(0), snapshot: () => f.save, acknowledge: vi.fn() }, delay)).toThrow('Invalid autosave delay')
  })
})
