import { describe, expect, it } from 'vitest'
import { createCareerPersistence } from '@/lib/tycoon/career-persistence'
import { createCareerSave, serializeCareerSave, deserializeCareerSave } from '@/lib/tycoon/career-save'
import { saveStoredCareer, importStoredCareer, resetStoredCareer, CAREER_SAVE_LOCK } from '@/lib/tycoon/career-transactions'
import { SAVE_KEY, LEGACY_SAVE_KEY, BACKUP_KEY } from '@/lib/tycoon/save'
import { createInitialState, serialize } from '@/lib/tycoon/sim/state'
import { financeSummary } from '@/lib/tycoon/sim/founder-finance'
import { quoteConsulting } from '@/lib/tycoon/consulting'
import { quoteFounding } from '@/lib/tycoon/paid-founding'
import { charterFixture } from './charter-fixtures'
import { paidFoundingSource } from './paid-founding-fixtures'
import { deferred, HeldLock, identity, MemoryStorage, SerialLock, setup, unwrap } from './career-persistence-fixtures'

const read = (storage: MemoryStorage) => unwrap(deserializeCareerSave(storage.getItem(SAVE_KEY)!))
const nextIdentity = { careerId: 'fresh-career', companyId: 'fresh-company' }

describe('prepared complete career writer boundary (not live v11 writers)', () => {
  it('initializes once under the shared lock and rejects a second empty-key initializer', async () => {
    const storage = new MemoryStorage(), lock = new SerialLock()
    const a = createCareerPersistence(storage, lock, null), b = createCareerPersistence(storage, lock, null)
    const results = await Promise.all([a.reset(createInitialState(1), identity), b.reset(createInitialState(2), nextIdentity)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(storage.writes).toBe(1)
    expect(lock.names).toEqual([CAREER_SAVE_LOCK, CAREER_SAVE_LOCK])
    expect(b.status).toBe('conflict')
  })

  it('saves ordinary progress and advances only the persisted token, without mutating the draft', async () => {
    const { owner, save, storage, token } = setup()
    save.game.day = 7
    const before = structuredClone(save)
    const result = unwrap(await owner.save(save))
    expect(owner.token).toBe(result.token)
    expect(owner.token).not.toBe(token)
    expect(read(storage).game.day).toBe(7)
    expect(save).toEqual(before)
    expect((await owner.save(save)).ok).toBe(true)
    expect(storage.writes).toBe(1)
  })

  it('recognizes an eligible charter in the same autosave and rejects an unacknowledged old ledger afterward', async () => {
    const save = charterFixture()
    const storage = new MemoryStorage(), lock = new SerialLock()
    const token = unwrap(serializeCareerSave(save))
    storage.setItem(SAVE_KEY, token); storage.writes = 0
    const owner = createCareerPersistence(storage, lock, token)
    const recognized = unwrap(await owner.save(save))
    expect(recognized.save.charter.fulfilledDay).toBe(save.game.day)
    expect(unwrap(financeSummary(recognized.save.finance)).liquid).toBe(unwrap(financeSummary(save.finance)).liquid)
    expect((await owner.save(save)).ok).toBe(false)
    expect(storage.writes).toBe(1)
    expect((await owner.save(recognized.save)).ok).toBe(true)
  })

  it('automatically settles a native ending atomically, then forbids old-company autosave changes', async () => {
    const { save, storage, owner } = setup()
    save.game.day = 1
    save.game.money = 10000
    save.game.gameOver = true
    save.game.ending = { kind: 'retired', day: 1, worth: 10000 }
    const ended = unwrap(await owner.save(save))
    expect(unwrap(financeSummary(ended.save.finance)).liquid).toBe(5000)
    expect(storage.writes).toBe(1)
    const changed = structuredClone(ended.save)
    changed.game.employees[0].morale--
    expect((await owner.save(changed)).ok).toBe(false)
    expect((await owner.save(ended.save)).ok).toBe(true)
    expect(storage.writes).toBe(1)
  })

  it('settles a reloaded native pending ending, but never auto-adopts an ended legacy company', async () => {
    const { save, storage, lock } = setup()
    save.game.day = 500
    save.game.gameOver = true
    save.game.ending = { kind: 'ipo', day: 500, worth: 100_000_000 }
    const token = unwrap(serializeCareerSave(save))
    storage.setItem(SAVE_KEY, token)
    const owner = createCareerPersistence(storage, lock, token)
    const settled = unwrap(await owner.save(save))
    expect(unwrap(financeSummary(settled.save.finance)).liquid).toBe(5_000_000)
    const legacy = unwrap(await owner.import(serialize(save.game), nextIdentity))
    const unchanged = unwrap(await owner.save(legacy.save))
    expect(unwrap(financeSummary(unchanged.save.finance)).companies[0].closed).toBe(false)
    expect(unwrap(financeSummary(unchanged.save.finance)).liquid).toBe(0)
  })

  it('rejects rewinds, foreign finance and chapter/provenance replacement through ordinary autosave', async () => {
    const { save, storage, lock, owner } = setup()
    save.game.day = 10
    const current = unwrap(await owner.save(save))
    const old = structuredClone(current.save); old.game.day = 9
    expect((await owner.save(old)).ok).toBe(false)
    const foreign = unwrap(createCareerSave(createInitialState(5), nextIdentity))
    foreign.game.day = 10
    expect((await owner.save(foreign)).ok).toBe(false)
    const chapter = structuredClone(current.save); chapter.game.chapterStartDay = 5
    expect((await owner.save(chapter)).ok).toBe(false)
    expect((await saveStoredCareer(storage, lock, current.token, foreign)).ok).toBe(false)
    expect(storage.writes).toBe(1)
  })

  it('imports a v12 file without settlement changes, preserving its complete ledger and contract progress', async () => {
    const { owner, storage } = setup()
    const source = paidFoundingSource()
    const other = new MemoryStorage(), lock = new SerialLock(), token = unwrap(serializeCareerSave(source))
    other.setItem(SAVE_KEY, token)
    const worker = createCareerPersistence(other, lock, token)
    const quote = unwrap(quoteConsulting(source, 'partial'))
    unwrap(await worker.startConsulting(quote))
    const partial = unwrap(await worker.advanceConsulting(12))
    const imported = unwrap(await owner.import(partial.token))
    expect(imported.save).toEqual(partial.save)
    expect(read(storage)).toEqual(partial.save)
    const completed = unwrap(await owner.advanceConsulting(18))
    expect(unwrap(financeSummary(completed.save.finance)).liquid).toBe(5_000_000 + quote.payout)
  })

  it('adopts imported v11 active/ended saves without reconstructing cash or silently choosing settlement', async () => {
    for (const ended of [false, true]) {
      const { owner, save } = setup()
      save.game.day = 500
      if (ended) { save.game.gameOver = true; save.game.ending = { kind: 'ipo', day: 500, worth: 100_000_000 } }
      const imported = unwrap(await owner.import(serialize(save.game), nextIdentity))
      const summary = unwrap(financeSummary(imported.save.finance))
      expect(summary.liquid).toBe(0)
      expect(summary.companies[0].source).toBe(ended ? 'legacy-ended' : 'legacy-active')
      if (ended) {
        expect((await owner.settle()).ok).toBe(false)
        const declined = unwrap(await owner.settle('decline'))
        expect(unwrap(financeSummary(declined.save.finance)).liquid).toBe(0)
      }
    }
  })

  it('rejects invalid imports, including corrupt v12, without changing primary or backup', async () => {
    const { owner, storage, token } = setup()
    storage.setItem(BACKUP_KEY, 'prior backup'); storage.writes = 0
    for (const text of ['bad json', 'null', '{"version":999}', '{"version":12,"game":{}}'])
      expect((await owner.import(text, nextIdentity)).ok).toBe(false)
    expect(storage.getItem(SAVE_KEY)).toBe(token)
    expect(storage.getItem(BACKUP_KEY)).toBe('prior backup')
    expect(storage.writes).toBe(0)
  })

  it('resets in one write with fresh identity, never deletes, and old tabs cannot resurrect their career', async () => {
    const { owner, save, storage, lock, token } = setup()
    const stale = createCareerPersistence(storage, lock, token)
    expect((await owner.reset(createInitialState(5), identity)).ok).toBe(false)
    unwrap(await owner.reset(createInitialState(5), nextIdentity))
    expect(read(storage).finance.careerId).toBe('fresh-career')
    expect(storage.removes).toBe(0)
    expect((await stale.save(save)).ok).toBe(false)
    expect(stale.status).toBe('conflict')
    expect((await stale.import(token)).ok).toBe(false)
    expect(storage.writes).toBe(1)
  })

  it('cancels earlier queued autosaves before a reset barrier', async () => {
    const { owner, save, storage } = setup()
    save.game.day = 10
    const queued = owner.save(save)
    const reset = owner.reset(createInitialState(2), nextIdentity)
    expect((await queued).ok).toBe(false)
    expect((await reset).ok).toBe(true)
    expect(storage.writes).toBe(1)
    expect(read(storage).game.day).toBe(0)
  })

  it('checks cancellation after acquiring the lock, not just when enqueuing', async () => {
    const { save, storage, token } = setup(), lock = new HeldLock()
    const owner = createCareerPersistence(storage, lock, token)
    save.game.day = 10
    const waiting = owner.save(save)
    await lock.entered.promise
    const reset = owner.reset(createInitialState(2), nextIdentity)
    lock.gate.resolve()
    expect((await waiting).ok).toBe(false)
    expect((await reset).ok).toBe(true)
    expect(storage.writes).toBe(1)
  })

  it('uses the new token if a write already published just before a reset barrier', async () => {
    const { save, storage, token } = setup(), published = deferred(), returned = deferred()
    let first = true
    const lock = { async run<T>(_name: string, operation: () => T | Promise<T>): Promise<T> {
      const result = await operation()
      if (first) { first = false; published.resolve(); await returned.promise }
      return result
    } }
    const owner = createCareerPersistence(storage, lock, token)
    save.game.day = 2
    const prior = owner.save(save)
    await published.promise
    const reset = owner.reset(createInitialState(2), nextIdentity)
    returned.resolve()
    expect((await prior).ok).toBe(true)
    expect((await reset).ok).toBe(true)
    expect(storage.writes).toBe(2)
    expect(read(storage).finance.careerId).toBe('fresh-career')
  })

  it('stop or an abort signal cancels a lock-waiting save without stopping unrelated replacement work', async () => {
    for (const stopOwner of [true, false]) {
      const { save, storage, token } = setup(), lock = new HeldLock(), abort = new AbortController()
      const owner = createCareerPersistence(storage, lock, token)
      const pending = owner.save(save, abort.signal)
      await lock.entered.promise
      if (stopOwner) owner.stop(); else abort.abort()
      lock.gate.resolve()
      expect((await pending).ok).toBe(false)
      expect(storage.writes).toBe(0)
      expect(owner.status).toBe(stopOwner ? 'stopped' : 'ready')
    }
  })

  it('keeps the token/draft intact on quota failure and retries explicitly after storage recovers', async () => {
    const { save, storage, owner, token } = setup()
    save.game.day = 10
    storage.failWrite = true
    expect((await owner.save(save)).ok).toBe(false)
    expect(owner.token).toBe(token)
    expect(owner.status).toBe('error')
    expect(storage.getItem(SAVE_KEY)).toBe(token)
    storage.failWrite = false
    expect((await owner.save(save)).ok).toBe(true)
    expect(owner.status).toBe('ready')
    expect(owner.error).toBeNull()
  })

  it('supports identity-preserving settlement/founding through the same owner, rejecting old-company autosaves', async () => {
    const source = paidFoundingSource(), storage = new MemoryStorage(), lock = new SerialLock()
    const token = unwrap(serializeCareerSave(source)); storage.setItem(SAVE_KEY, token); storage.writes = 0
    const owner = createCareerPersistence(storage, lock, token)
    const quote = unwrap(quoteFounding(source, { companyId: 'next', companyName: 'Next Studio', ambition: 'venture', focus: 'web_app', candidateIds: [] }))
    const pending = owner.found(quote)
    quote.selection.companyName = 'Changed during wait'
    const founded = unwrap(await pending)
    expect(founded.save.game.studioName).toBe('Next Studio')
    expect((await owner.save(source)).ok).toBe(false)
    expect(storage.writes).toBe(1)
  })

  it('carries standalone saves only while both source keys still match and leaves the source as backup', async () => {
    const storage = new MemoryStorage(), lock = new SerialLock(), text = serialize(createInitialState(5))
    storage.setItem(LEGACY_SAVE_KEY, text); storage.writes = 0
    const owner = createCareerPersistence(storage, lock, null)
    expect((await owner.carryLegacy(text + ' ', identity)).ok).toBe(false)
    expect((await owner.carryLegacy(text, identity)).ok).toBe(true)
    expect(storage.getItem(LEGACY_SAVE_KEY)).toBe(text)
    expect(storage.removes).toBe(0)
    expect(storage.writes).toBe(1)
  })

  it('does not silently fall back to unlocked saving or overwrite blocked storage', async () => {
    const { save, storage, token, lock } = setup()
    const unsupported = createCareerPersistence(storage, null, token)
    expect((await unsupported.save(save)).ok).toBe(false)
    expect(unsupported.status).toBe('unsupported')
    expect((await resetStoredCareer(storage, null, token, createInitialState(2), nextIdentity)).ok).toBe(false)
    storage.failRead = true
    expect((await importStoredCareer(storage, lock, token, token)).ok).toBe(false)
    storage.failRead = false
    expect(storage.writes).toBe(0)
  })
})
