import { describe, expect, it } from 'vitest'
import { charterBlocker, charterRequirements } from '@/lib/tycoon/sim/charter'
import { advanceActiveCareer, refreshCareerCharter } from '@/lib/tycoon/career-progress'
import { createCareerSave, serializeCareerSave, deserializeCareerSave, settleCareerSave } from '@/lib/tycoon/career-save'
import { ipoBlocker, goPublic, retireStudio, acceptBuyout } from '@/lib/tycoon/sim/exit'
import { stageProgress } from '@/lib/tycoon/sim/stages'
import { BANKRUPT_AFTER_DEBT_DAYS, IPO_PROFIT_DAYS, PROJECT_SIZES, FRESH_DAYS, STALE_DAYS } from '@/lib/tycoon/sim/balance'
import { financeSummary } from '@/lib/tycoon/sim/founder-finance'
import { createInitialState } from '@/lib/tycoon/sim/state'
import { foundPaidCompany, quoteFounding } from '@/lib/tycoon/paid-founding'
import { startConsulting, advanceConsulting, quoteConsulting } from '@/lib/tycoon/consulting'
import { charterFixture } from './charter-fixtures'
import { stage0Fixture } from './stage0-fixtures'
import { paidFoundingSource, unwrap } from './paid-founding-fixtures'

const req = (s: ReturnType<typeof charterFixture>, id: string) => charterRequirements(s.game).find((r) => r.id === id)!

describe('additional paid-company charter readiness', () => {
  it('does not harden first-company or Standard/legacy IPO rules', () => {
    expect(charterRequirements(createInitialState(1))).toEqual([])
    expect(charterRequirements(paidFoundingSource().game)).toEqual([])
    const legacy = stage0Fixture('ipo')
    legacy.products[0].fit = 0 // Standard still uses the existing base IPO contract.
    expect(ipoBlocker(legacy)).toBeNull()
    expect(goPublic(legacy).ok).toBe(true)
  })

  it.each(['modest', 'studio', 'venture'] as const)('shares live %s readiness with the IPO gate and Journey', (ambition) => {
    const s = charterFixture(ambition)
    expect(charterRequirements(s.game).every((r) => r.met)).toBe(true)
    expect(charterBlocker(s.game)).toBeNull()
    expect(ipoBlocker(s.game)).toBeNull()
    expect(stageProgress(s.game).filter((r) => r.id.startsWith('charter_'))).toEqual(charterRequirements(s.game))
    s.game.products[0].fit = 0
    expect(req(s, 'charter_health').met).toBe(false)
    expect(ipoBlocker(s.game)).toContain('Charter:')
    expect(goPublic(s.game).ok).toBe(false)
  })

  it.each([['modest', 'small', 'medium'], ['studio', 'medium', 'large'], ['venture', 'large', 'flagship']] as const)('requires actual scope for %s', (ambition, below, enough) => {
    const s = charterFixture(ambition)
    s.game.products[0].size = below
    expect(req(s, 'charter_size').met).toBe(false)
    s.game.products[0].size = enough
    expect(req(s, 'charter_size').met).toBe(true)
  })

  it('requires a live signature, current fit/freshness/bug health and real physical capacity', () => {
    const s = charterFixture()
    const hit = s.game.products[0]
    hit.fit = 49.99
    expect(req(s, 'charter_health').met).toBe(false)
    hit.fit = 50
    expect(req(s, 'charter_health').met).toBe(true)
    const size = PROJECT_SIZES[hit.size]
    hit.bugs = size.work * 9.99
    expect(req(s, 'charter_health').met).toBe(true)
    hit.bugs = size.work * 10
    expect(req(s, 'charter_health').met).toBe(false)
    hit.bugs = 0
    const age = FRESH_DAYS * size.life - Math.log(0.6) * STALE_DAYS * size.life
    hit.releaseDay = s.game.day - Math.floor(age)
    expect(req(s, 'charter_health').met).toBe(true)
    hit.releaseDay = s.game.day - Math.ceil(age)
    expect(req(s, 'charter_health').met).toBe(false)
    hit.releaseDay = -10000
    expect(req(s, 'charter_health').met).toBe(false)
    hit.releaseDay = s.game.day
    hit.bugs = 1e9
    expect(req(s, 'charter_health').met).toBe(false)
    hit.bugs = 0
    for (const person of s.game.employees) person.training = { discipline: 'engineering', finishDay: s.game.day + 30 }
    expect(req(s, 'charter_floors').met).toBe(false)
    expect(req(s, 'charter_europe').met).toBe(false)
    s.game.products = []
    expect(charterRequirements(s.game).map((r) => r.id)).toEqual(['charter_hit'])
    expect(ipoBlocker(s.game)).not.toBeNull()
  })

  it('does not count an empty European floor, nominal assignments or paid desks as output', () => {
    const s = charterFixture()
    s.game.employees = s.game.employees.filter((p) => (s.game.offices.find((o) => o.id === p.officeId)?.region ?? 'us') === 'us')
    expect(req(s, 'charter_europe').met).toBe(false)
    s.game.employees = []
    expect(req(s, 'charter_floors').progress).toBe('0 / 3')
    expect(req(s, 'charter_reliability').met).toBe(false)
  })

  it('uses existing shared reliability and rival-win evidence, not an investment or a fake lead counter', () => {
    const s = charterFixture()
    s.game.money = 1e12
    s.game.nemesesBeaten = 0
    expect(req(s, 'charter_rival').met).toBe(false)
    expect(req(s, 'charter_rival').progress).toContain('0 / 90')
    s.game.offices[1].assignment = { kind: 'idle' }
    expect(req(s, 'charter_reliability').met).toBe(false)
    s.game.profitDays = 179
    expect(req(s, 'charter_profit').met).toBe(false)
    s.game.profitDays = 180
    expect(req(s, 'charter_profit').met).toBe(true)
    expect(ipoBlocker(s.game)).not.toBeNull() // Base year-of-profit requirement still applies.
  })

  it('does not quietly waive existing Global stage, lifetime revenue, user or profit requirements', () => {
    const s = charterFixture('modest')
    s.game.stage--
    expect(ipoBlocker(s.game)).toBe('The company is not global yet')
    s.game.stage++
    s.game.profitDays = IPO_PROFIT_DAYS - 1
    expect(charterBlocker(s.game)).toBeNull()
    expect(ipoBlocker(s.game)).toBe('Make a profit for a year')
  })

  it('allows voluntary sale/retirement despite an unmet charter', () => {
    const s = charterFixture()
    s.game.products[0].fit = 0
    expect(retireStudio(s.game).ok).toBe(true)
    const sale = charterFixture()
    sale.game.offices = sale.game.offices.slice(0, 1)
    sale.game.products[0].fit = 0
    sale.game.exit.pending = { price: 1_000_000, bidder: 'Synthetic buyer' }
    expect(acceptBuyout(sale.game).ok).toBe(true)
  })

  it('records sticky recognition with no reward, but never substitutes it for current live IPO readiness', () => {
    const source = charterFixture()
    const before = JSON.stringify(source)
    const recognized = unwrap(refreshCareerCharter(source))
    expect(recognized.charter.fulfilledDay).toBe(source.game.day)
    expect(recognized.game).toEqual(source.game)
    expect(unwrap(financeSummary(recognized.finance)).liquid).toBe(unwrap(financeSummary(source.finance)).liquid)
    expect(recognized.finance.records.slice(0, -1)).toEqual(source.finance.records)
    expect(recognized.finance.records.at(-1)).toEqual({ kind: 'charter-fulfilled', companyId: source.charter.companyId, day: source.game.day, ambition: 'venture' })
    expect(JSON.stringify(source)).toBe(before)
    expect(unwrap(refreshCareerCharter(recognized))).toEqual(recognized)
    const lostMarker = structuredClone(recognized)
    lostMarker.charter.fulfilledDay = null
    expect(serializeCareerSave(lostMarker).ok).toBe(false)
    const duplicate = structuredClone(recognized)
    duplicate.finance.records.push(structuredClone(duplicate.finance.records.at(-1)!))
    expect(serializeCareerSave(duplicate).ok).toBe(false)
    const reloaded = unwrap(deserializeCareerSave(unwrap(serializeCareerSave(recognized))))
    reloaded.game.products[0].fit = 0
    expect(unwrap(refreshCareerCharter(reloaded)).charter.fulfilledDay).toBe(source.game.day)
    expect(goPublic(reloaded.game).ok).toBe(false)
  })

  it('recognizes eligible IPO at its ending boundary and preserves recognition after settlement/reload', () => {
    const s = charterFixture()
    expect(goPublic(s.game).ok).toBe(true)
    const settled = unwrap(settleCareerSave(s))
    expect(settled.charter.fulfilledDay).toBe(s.game.ending!.day)
    expect(unwrap(deserializeCareerSave(unwrap(serializeCareerSave(settled)))).charter).toEqual(settled.charter)
  })

  it('preserves fulfilled ambitions across consulting and founding without inflating former-company tenure', () => {
    const recognized = unwrap(refreshCareerCharter(charterFixture()))
    expect(retireStudio(recognized.game).ok).toBe(true)
    const closed = unwrap(settleCareerSave(recognized))
    const quote = unwrap(quoteConsulting(closed, 'between'))
    const completed = unwrap(advanceConsulting(unwrap(startConsulting(closed, quote)), 30))
    const next = unwrap(foundPaidCompany(completed, unwrap(quoteFounding(completed, { companyId: 'next', companyName: 'Next Studio', ambition: 'venture', focus: 'web_app', candidateIds: [] }))))
    expect(next.charter.fulfilledDay).toBeNull()
    expect(unwrap(financeSummary(next.finance)).fulfilledAmbitions).toEqual([{ companyId: recognized.charter.companyId, ambition: 'venture', day: recognized.game.day }])
    expect(next.game.legacy?.at(-1)?.years).toBe(Math.round((closed.game.ending!.day - closed.game.chapterStartDay!) / 360 * 10) / 10)
    expect(next.game.chapterStartDay).toBe(quote.completeDay)
    expect(unwrap(deserializeCareerSave(unwrap(serializeCareerSave(next))))).toEqual(next)
  })

  it('books an automatic bankruptcy and day together, without allowing an ended company to keep running', () => {
    const source = unwrap(createCareerSave(createInitialState(5), { careerId: 'clock', companyId: 'first' }))
    source.game.money = -100
    source.game.debtDays = BANKRUPT_AFTER_DEBT_DAYS - 1
    const before = JSON.stringify(source)
    const ended = unwrap(advanceActiveCareer(source))
    expect(JSON.stringify(source)).toBe(before)
    expect(ended.game.day).toBe(1)
    expect(ended.game.ending?.kind).toBe('bankrupt')
    expect(unwrap(financeSummary(ended.finance))).toMatchObject({ liquid: 0, companies: [{ closed: true }] })
    expect(advanceActiveCareer(ended).ok).toBe(false)
  })

  it.each([-1, 1.5, NaN, Infinity, 3651])('rejects invalid active-company day count %s', (days) => {
    const save = unwrap(createCareerSave(createInitialState(5), { careerId: 'clock', companyId: 'first' }))
    expect(advanceActiveCareer(save, days).ok).toBe(false)
  })
})
