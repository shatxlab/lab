import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCareerController, type CareerController } from '@/lib/tycoon/career-controller'
import { createCareerPersistence } from '@/lib/tycoon/career-persistence'
import { adoptCareerSave, createCareerSave, deserializeCareerSave, serializeCareerSave, settleCareerSave, type CareerSave } from '@/lib/tycoon/career-save'
import { quoteConsulting } from '@/lib/tycoon/consulting'
import { quoteFounding } from '@/lib/tycoon/paid-founding'
import { SAVE_KEY } from '@/lib/tycoon/save'
import { createInitialState, serialize } from '@/lib/tycoon/sim/state'
import { you } from '@/lib/tycoon/sim/founding'
import { MS_PER_DAY } from '@/lib/tycoon/store'
import { charterFixture } from './charter-fixtures'
import { HeldLock, MemoryStorage, SerialLock, identity, unwrap } from './career-persistence-fixtures'
import { paidFoundingSource } from './paid-founding-fixtures'
const controllers: CareerController[] = []
afterEach(() => { for (const c of controllers.splice(0)) c.stop(); vi.useRealTimers() })
function setup(save = unwrap(createCareerSave(createInitialState(5), identity)), held = false) {
  const storage = new MemoryStorage(), lock = held ? new HeldLock() : new SerialLock()
  const token = unwrap(serializeCareerSave(save))
  storage.setItem(SAVE_KEY, token); storage.writes = 0
  const owner = createCareerPersistence(storage, lock, token)
  let n = 0
  const controller = createCareerController(owner, { id: () => `test-${++n}` })
  controllers.push(controller)
  return { controller, owner, storage, lock, token }
}
const summary = (c: CareerController) => unwrap(c.summary())
const decoded = (s: MemoryStorage) => unwrap(deserializeCareerSave(s.getItem(SAVE_KEY)!))

describe('durable career/controller boundary', () => {
  it('persists first naming before closing the dialog and retains the draft on quota failure', async () => {
    const initial = unwrap(createCareerSave(createInitialState(5), identity)); initial.game.freshChapter = true
    const { controller: c, storage, token } = setup(initial)
    storage.failWrite = true
    expect((await c.name('Alex', 'Copper')).ok).toBe(false)
    expect(storage.getItem(SAVE_KEY)).toBe(token)
    expect(c.store.state.freshChapter).toBe(true)
    storage.failWrite = false
    expect((await c.name('Alex', 'Copper')).ok).toBe(true)
    expect(decoded(storage).game.studioName).toBe('Copper')
    expect(decoded(storage).game.freshChapter).not.toBe(true)
    expect(you(decoded(storage).game)?.name).toBe('Alex')
  })
  it('keeps normal Store command logging, blocking dialogs and clock semantics', async () => {
    const { controller: c } = setup()
    expect(c.store.found('Alex', 'Copper').ok).toBe(true)
    expect(you(c.store.state)?.name).toBe('Alex')
    c.store.setSpeed(1)
    for (let t = 0; t < MS_PER_DAY; t += 250) c.store.tick(250)
    expect(c.store.state.day).toBe(1)
    const before = structuredClone(c.store.state)
    expect((await c.flush()).ok).toBe(true)
    expect(c.store.state).toEqual(before) // codec acknowledgement must not replace transient state/work/events.
  })

  it('commits manual retirement before publishing the ending and personal proceeds', async () => {
    const { controller: c, storage, lock } = setup(undefined, true)
    const pending = c.end('retired')
    await (lock as HeldLock).entered.promise
    expect(c.busy.value).toBe(true)
    expect(c.store.state.gameOver).toBe(false)
    expect(summary(c).liquid).toBe(0)
    expect(c.store.found('Lost', 'Lost').ok).toBe(false)
    ;(lock as HeldLock).gate.resolve()
    expect((await pending).ok).toBe(true)
    expect(c.store.state.ending?.kind).toBe('retired')
    expect(summary(c).liquid).toBeGreaterThan(0)
    expect(decoded(storage).finance).toEqual(c.snapshot().finance)
  })

  it('does not publish a failed manual ending, and an explicit retry cannot double-credit', async () => {
    const { controller: c, storage, token } = setup()
    const before = structuredClone(c.store.state)
    storage.failWrite = true
    expect((await c.end('retired')).ok).toBe(false)
    expect(c.store.state).toEqual(before)
    expect(summary(c).liquid).toBe(0)
    expect(storage.getItem(SAVE_KEY)).toBe(token)
    storage.failWrite = false
    expect((await c.end('retired')).ok).toBe(true)
    const cash = summary(c).liquid
    expect((await c.end('retired')).ok).toBe(false)
    expect(summary(c).liquid).toBe(cash)
  })

  it('routes IPO through live charter readiness and an atomic closing ledger', async () => {
    const { controller: c, storage } = setup(charterFixture())
    expect(c.store.goPublic().ok).toBe(false) // no synchronous bypass.
    expect((await c.end('ipo')).ok).toBe(true)
    expect(c.store.state.ending?.kind).toBe('ipo')
    expect(summary(c).companies.at(-1)?.closed).toBe(true)
    expect(decoded(storage).charter.fulfilledDay).toBe(c.store.state.day)
  })

  it('refuses an unhealthy charter even after earlier fulfilment', async () => {
    const { controller: c } = setup(charterFixture())
    expect((await c.flush()).ok).toBe(true)
    c.store.state.products[0].fit = 0
    expect((await c.end('ipo')).ok).toBe(false)
    expect(c.store.state.gameOver).toBe(false)
  })

  it('freezes all ended-company mutation paths, including naming, research, hiring and raw endings', () => {
    const { controller: c } = setup(paidFoundingSource())
    const before = JSON.stringify(c.snapshot())
    for (const result of [c.store.found('Other', 'Other'), c.store.startResearch('ci_pipeline'), c.store.hire(-1), c.store.retire(), c.store.acceptBuyout()]) expect(result.ok).toBe(false)
    c.store.setSpeed(2); c.store.tick(1e9)
    expect(c.store.running()).toBe(false)
    expect(JSON.stringify(c.snapshot())).toBe(before)
  })

  it('requires durable explicit legacy adoption and never adds historical valuations to cash', async () => {
    const game = paidFoundingSource().game
    game.legacy = [{ studio: 'Old giant', ending: 'ipo', worth: 1e12, years: 5 }]
    const save = unwrap(adoptCareerSave(serialize(game), identity))
    const { controller: c } = setup(save)
    expect((await c.flush()).ok).toBe(true)
    expect(summary(c).liquid).toBe(0)
    expect(summary(c).companies[0].closed).toBe(false)
    expect((await c.decideLegacy('decline')).ok).toBe(true)
    expect(summary(c).liquid).toBe(0)
    expect((await c.decideLegacy('apply')).ok).toBe(false)
  })

  it('resumes a partial consulting contract and credits exactly once while preserving old-company work', async () => {
    const failed = unwrap(createCareerSave(createInitialState(2), identity))
    failed.game.day = 500; failed.game.gameOver = true; failed.game.ending = { kind: 'bankrupt', day: 500, worth: 0 }
    const { controller: c, owner, storage, lock } = setup(unwrap(settleCareerSave(failed)))
    const people = structuredClone(c.store.state.employees)
    const quote = unwrap(quoteConsulting(c.snapshot(), c.newId('contract')))
    expect((await c.startConsulting(quote)).ok).toBe(true)
    expect((await c.advanceConsulting(7)).ok).toBe(true)
    expect(summary(c).liquid).toBe(0)
    const nextOwner = createCareerPersistence(storage, lock, owner.token)
    const resumed = createCareerController(nextOwner); controllers.push(resumed)
    c.stop()
    expect((await resumed.advanceConsulting(23)).ok).toBe(true)
    expect(summary(resumed).liquid).toBe(quote.payout)
    expect(resumed.store.state.employees).toEqual(people)
    expect((await resumed.advanceConsulting(30)).ok).toBe(false)
    expect(summary(resumed).liquid).toBe(quote.payout)
  })

  it('does not publish a failed paid founding, then carries identity on the once-only retry', async () => {
    const { controller: c, storage, token } = setup(paidFoundingSource())
    const oldStore = c.store, founder = structuredClone(you(oldStore.state))
    const quote = unwrap(quoteFounding(c.snapshot(), { companyId: c.newId('company'), companyName: 'New Copper', ambition: 'venture', focus: 'web_app', candidateIds: [] }))
    storage.failWrite = true
    expect((await c.found(quote)).ok).toBe(false)
    expect(c.store).toBe(oldStore)
    expect(storage.getItem(SAVE_KEY)).toBe(token)
    storage.failWrite = false
    expect((await c.found(quote)).ok).toBe(true)
    expect(c.store.state.studioName).toBe('New Copper')
    expect(you(c.store.state)?.name).toBe(founder?.name)
    expect(you(c.store.state)?.skills).toEqual(founder?.skills)
    expect(summary(c).liquid).toBe(quote.privateReserve)
    expect(c.store.state.money).toBe(quote.companyCash)
    expect(oldStore.found('Stale', 'Stale').ok).toBe(false)
  })

  it('round-trips complete v12 finance on export/import and disables obsolete store references', async () => {
    const { controller: c } = setup(paidFoundingSource())
    const text = unwrap(c.exportSnapshot()), old = c.store
    expect((await c.import(text)).ok).toBe(true)
    expect(unwrap(c.exportSnapshot())).toBe(text)
    expect(c.store).not.toBe(old)
    expect(old.running()).toBe(false)
  })

  it('resets explicitly to a new zero-reserve career and restores the first naming screen', async () => {
    const { controller: c } = setup(paidFoundingSource())
    expect((await c.reset(8)).ok).toBe(true)
    expect(c.store.state.day).toBe(0)
    expect(summary(c).liquid).toBe(0)
    expect(c.store.dialog.value?.kind).toBe('founding')
    expect(c.store.state.employees).toHaveLength(2)
  })

  it('suspends commands after a stale-tab save failure rather than overwriting or silently refreshing its token', async () => {
    const { controller: c, storage } = setup()
    const foreign = c.snapshot(); foreign.game.day = 7
    storage.setItem(SAVE_KEY, unwrap(serializeCareerSave(foreign)))
    expect((await c.flush()).ok).toBe(false)
    const before = JSON.stringify(c.store.state)
    expect(c.store.found('Lost', 'Lost').ok).toBe(false)
    c.store.tick(1e9)
    expect(JSON.stringify(c.store.state)).toBe(before)
    expect(decoded(storage).game.day).toBe(7)
  })

  it('disposal cancels lock-waiting work without late state publication', async () => {
    const { controller: c, lock, storage, token } = setup(undefined, true)
    const pending = c.end('retired')
    await (lock as HeldLock).entered.promise
    c.stop(); (lock as HeldLock).gate.resolve()
    expect((await pending).ok).toBe(false)
    expect(storage.getItem(SAVE_KEY)).toBe(token)
    expect(c.store.state.gameOver).toBe(false)
  })
})
