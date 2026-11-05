import { describe, expect, it } from 'vitest'
import { ERAS } from '@/lib/tycoon/data/eras'
import { advanceConsulting, quoteConsulting, startConsulting, type ConsultingQuote } from '@/lib/tycoon/consulting'
import { adoptCareerSave, createCareerSave, deserializeCareerSave, serializeCareerSave, settleCareerSave, validateCareerSave } from '@/lib/tycoon/career-save'
import { beginConsulting, completeConsulting, financeSummary } from '@/lib/tycoon/sim/founder-finance'
import { consultingPay, consultingPayBasis } from '@/lib/tycoon/sim/consulting-pay'
import { salaryOf } from '@/lib/tycoon/sim/hiring'
import { you } from '@/lib/tycoon/sim/founding'
import { createInitialState, serialize } from '@/lib/tycoon/sim/state'
import { startProject } from '@/lib/tycoon/sim/project'
import { foundingOffers, quoteFounding, foundPaidCompany } from '@/lib/tycoon/paid-founding'
import { makeProduct } from './helpers'
import { unwrap } from './paid-founding-fixtures'

function bankrupt(day = 500, seed = 5) {
  const save = unwrap(createCareerSave(createInitialState(seed), { careerId: `synthetic-${seed}`, companyId: 'first' }))
  save.game.money = 100_000
  expect(startProject(save.game, 'web_app', ['accounts']).ok).toBe(true)
  save.game.day = day
  save.game.money = -100
  save.game.gameOver = true
  save.game.ending = { kind: 'bankrupt', day, worth: 0 }
  return unwrap(settleCareerSave(save))
}
const summary = (save: ReturnType<typeof bankrupt>) => unwrap(financeSummary(save.finance))
const reload = (save: ReturnType<typeof bankrupt>) => unwrap(deserializeCareerSave(unwrap(serializeCareerSave(save))))

describe('explicit consulting recovery between companies', () => {
  it('quotes 30 days and half the full market salary, never the discounted founder salary or old company modifiers', () => {
    const save = bankrupt()
    save.game.modifiers = [{ id: 9999, source: 'investor', stat: 'wage', mult: 0.1, expiresDay: 9999 }]
    const before = JSON.stringify(save)
    const founder = you(save.game)!
    const quote = unwrap(quoteConsulting(save, 'contract-1'))
    expect(quote.marketSalary).toBe(salaryOf({ ...founder, founder: false }, save.game.day))
    expect(quote.payout).toBe(Math.floor(quote.marketSalary / 2))
    expect(quote.marketSalary).toBeGreaterThan(founder.salary)
    expect(quote.completeDay - quote.startDay).toBe(30)
    expect(unwrap(quoteConsulting(save, 'contract-1'))).toEqual(quote)
    expect(JSON.stringify(save)).toBe(before)
    const started = unwrap(startConsulting(save, quote))
    expect(summary(started).liquid).toBe(0)
    expect(started.game.day).toBe(save.game.day)
    expect(started.game.money).toBe(-100)
  })

  it('saves/resumes partial work and credits once on day 30, without automatically accepting a new contract', () => {
    const source = bankrupt()
    const quote = unwrap(quoteConsulting(source, 'contract-1'))
    const started = unwrap(startConsulting(source, quote))
    const partial = unwrap(advanceConsulting(started, 7))
    expect(partial.game.day).toBe(source.game.day + 7)
    expect(summary(partial).liquid).toBe(0)
    expect(summary(partial).consulting?.contractId).toBe('contract-1')
    expect(quoteConsulting(partial, 'contract-2').ok).toBe(false)
    expect(foundingOffers(partial).ok).toBe(false)
    const completed = unwrap(advanceConsulting(reload(partial), 23))
    expect(summary(completed).liquid).toBe(quote.payout)
    expect(summary(completed).consulting).toBeNull()
    expect(completed.game.day).toBe(quote.completeDay)
    expect(advanceConsulting(completed, 30).ok).toBe(false)
    expect(quoteConsulting(completed, 'contract-1').ok).toBe(false)
    expect(unwrap(completeConsulting(completed.finance, 'first', 'contract-1', quote.completeDay))).toEqual(completed.finance)
    expect(completeConsulting(completed.finance, 'first', 'contract-1', quote.completeDay + 1).ok).toBe(false)
    expect(summary(reload(completed)).liquid).toBe(quote.payout)
    expect(completed).toEqual(unwrap(advanceConsulting(started, 30)))
    const noExtraDays = unwrap(advanceConsulting(started, 1000))
    expect(noExtraDays).toEqual(completed) // Only the explicitly selected contract can elapse.
  })

  it('advances only world day, era, rivals and market, never the ended company or founder skills/work', () => {
    const source = bankrupt()
    source.game.products = [makeProduct({ id: source.game.nextId++, hit: true, fit: 90 })]
    source.game.signatureId = source.game.products[0].id
    source.game.lifetimeRevenue = 12345
    source.game.incomeAverage = 100000
    source.game.profitDays = 200
    source.game.employees[0].training = { discipline: 'qa', finishDay: source.game.day + 2 }
    source.game.rivals[0].ratio = 2
    const before = structuredClone(source.game)
    const quote = unwrap(quoteConsulting(source, 'contract-1'))
    const started = unwrap(startConsulting(source, quote))
    expect(started.game.rivals[0].ratio).toBeUndefined()
    const finished = unwrap(advanceConsulting(started, 30))
    expect(finished.game.day).toBe(before.day + 30)
    expect(finished.game.rng).not.toBe(before.rng)
    expect(finished.game.market).not.toEqual(before.market)
    expect(finished.game.rivals).not.toEqual(before.rivals)
    const worldKeys = new Set(['day', 'rng', 'nextId', 'market', 'marketNews', 'rivals', 'rivalProducts', 'journal', 'events', 'dayWork'])
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      if (!worldKeys.has(key)) expect(finished.game[key], `Frozen company field: ${key}`).toEqual(before[key])
    }
    expect(finished.game.money).toBe(before.money)
    expect(finished.game.employees).toEqual(before.employees)
    expect(finished.game.history).toEqual(before.history)
    expect(finished.charter).toEqual(source.charter)
    expect(JSON.stringify(source.game)).toBe(JSON.stringify(before))
  })

  it('freezes start-day pay over an era change, then uses the new world date for the next quote', () => {
    const eraDay = (ERAS[1].startYear - 1) * 360
    const source = bankrupt(eraDay - 15)
    const first = unwrap(quoteConsulting(source, 'before-era'))
    const completed = unwrap(advanceConsulting(unwrap(startConsulting(source, first)), 30))
    expect(summary(completed).liquid).toBe(first.payout)
    const second = unwrap(quoteConsulting(completed, 'after-era'))
    expect(second.marketSalary).toBeGreaterThan(first.marketSalary)
    expect(second.payout).toBeGreaterThan(first.payout)
    expect(completed.game.rivals.some((r) => !source.game.rivals.some((old) => old.id === r.id))).toBe(true)
    expect(second.basis).toEqual(first.basis)
  })

  it('removes corporate appointment premiums while retaining actual specialist grade/guaranteed pay floor', () => {
    const save = bankrupt()
    const me = you(save.game)!
    me.career = { grade: 4, gradeDay: 0, management: 80, ambition: 'leadership', payFloor: 1.2,
      appointment: { scope: 'company' } }
    const quote = unwrap(quoteConsulting(save, 'contract'))
    const plain = structuredClone(me)
    delete plain.career!.appointment
    plain.founder = false
    expect(quote.marketSalary).toBe(salaryOf(plain, save.game.day))
    expect(quote.marketSalary).toBeLessThan(salaryOf({ ...me, founder: false }, save.game.day))
  })

  it('requires durable legacy adoption/decline before work and never converts earlier valuations to cash', () => {
    const game = bankrupt().game
    game.legacy = [{ studio: 'Historical IPO', ending: 'ipo', worth: 1e12, years: 5 }]
    const adopted = unwrap(adoptCareerSave(serialize(game), { careerId: 'legacy', companyId: 'last' }))
    expect(quoteConsulting(adopted, 'contract').ok).toBe(false)
    const declined = unwrap(settleCareerSave(adopted, 'decline'))
    const quote = unwrap(quoteConsulting(declined, 'contract'))
    const completed = unwrap(advanceConsulting(unwrap(startConsulting(declined, quote)), 30))
    expect(summary(completed).liquid).toBe(quote.payout)
    expect(unwrap(settleCareerSave(completed, 'decline'))).toEqual(completed)
    expect(settleCareerSave(completed, 'apply').ok).toBe(false)
    expect(completed.game.legacy).toEqual(game.legacy)
  })

  it('rejects early/duplicate/foreign credits and founding during active work at ledger level too', () => {
    const save = bankrupt()
    const quote = unwrap(quoteConsulting(save, 'contract'))
    const started = unwrap(startConsulting(save, quote))
    expect(completeConsulting(started.finance, 'first', 'contract', quote.completeDay - 1).ok).toBe(false)
    expect(completeConsulting(started.finance, 'other', 'contract', quote.completeDay).ok).toBe(false)
    expect(beginConsulting(started.finance, 'first', 'overlap', quote.startDay, quote.basis).ok).toBe(false)
    expect(beginConsulting(save.finance, 'other', 'foreign', quote.startDay, quote.basis).ok).toBe(false)
    expect(startConsulting(started, quote).ok).toBe(false)
    const forged = structuredClone(started)
    forged.game.day = quote.completeDay
    expect(validateCareerSave(forged).ok).toBe(false) // Day and credit must be persisted together.
  })

  it('rejects stale/altered quotes and malformed replay credits, not just stored balances', () => {
    const source = bankrupt()
    const quote = unwrap(quoteConsulting(source, 'contract'))
    for (const mutate of [
      (q: ConsultingQuote) => { q.payout++ }, (q: ConsultingQuote) => { q.marketSalary++ },
      (q: ConsultingQuote) => { q.completeDay-- }, (q: ConsultingQuote) => { q.basis.analysis++ },
    ]) {
      const changed = structuredClone(quote)
      mutate(changed)
      expect(startConsulting(source, changed).ok).toBe(false)
    }
    const started = unwrap(startConsulting(source, quote))
    const corrupt = (mutate: (s: any) => void) => {
      const raw = JSON.parse(JSON.stringify(started))
      mutate(raw)
      expect(deserializeCareerSave(JSON.stringify(raw)).ok).toBe(false)
    }
    corrupt((s) => { s.finance.records.at(-1).contract.payout++ })
    corrupt((s) => { s.finance.records.at(-1).contract.completeDay-- })
    corrupt((s) => { s.finance.records.at(-1).contract.basis.skills.design = 101 })
    corrupt((s) => { s.game.employees[0].analysis++ })
    corrupt((s) => { const c = s.finance.records.at(-1).contract; c.basis.analysis++; Object.assign(c, consultingPay(c.basis, c.startDay)) })
    corrupt((s) => { s.finance.records.push(s.finance.records.at(-1)) })
    source.game.market.web_app += 0.01
    expect(startConsulting(source, quote).ok).toBe(false)
  })

  it.each([-1, 0.5, NaN, Infinity])('rejects invalid elapsed days %s without advancing time', (days) => {
    const save = bankrupt()
    const started = unwrap(startConsulting(save, unwrap(quoteConsulting(save, 'contract'))))
    expect(advanceConsulting(started, days).ok).toBe(false)
    expect(unwrap(advanceConsulting(started, 0))).toEqual(started)
  })

  it('rejects unsupported inputs and active-company work without mutating finance', () => {
    const save = bankrupt()
    expect(quoteConsulting(save, '').ok).toBe(false)
    expect(consultingPay({ ...consultingPayBasis(you(save.game)!), grade: 999 }, save.game.day)).toBeNull()
    const active = unwrap(createCareerSave(createInitialState(1), { careerId: 'active', companyId: 'first' }))
    expect(quoteConsulting(active, 'contract').ok).toBe(false)
    expect(advanceConsulting(save, 1).ok).toBe(false)
  })

  it.each([1, 2, 8])('provides an actual paid recovery path for bankrupt seed %s without training or inheritance', (seed) => {
    let save = bankrupt(500, seed)
    const skills = structuredClone(you(save.game)!.skills)
    let contracts = 0
    while (contracts < 60) {
      const dev = unwrap(foundingOffers(save)).offers.find((p) => p.role === 'developer')!
      const choice = { companyId: 'recovered', companyName: 'Recovered Studio', ambition: 'modest' as const, focus: 'web_app', candidateIds: [dev.id] }
      const defaultQuote = unwrap(quoteFounding(save, choice))
      if (defaultQuote.available >= defaultQuote.minimum) {
        const quote = unwrap(quoteFounding(save, { ...choice, investment: defaultQuote.minimum }))
        const founded = unwrap(foundPaidCompany(save, quote))
        expect(contracts).toBeGreaterThan(0)
        expect(founded.game.employees).toHaveLength(2)
        expect(founded.game.employees.filter((p) => p.founder)).toHaveLength(1)
        expect(you(founded.game)!.skills).toEqual(skills)
        expect(founded.game.money).toBe(quote.companyCash)
        expect(summary(founded).liquid).toBe(summary(save).liquid - quote.selection.investment)
        expect(summary(founded).companies.at(-1)?.shareBps).toBe(10000)
        return
      }
      const contract = unwrap(quoteConsulting(save, `work-${contracts}`))
      save = reload(unwrap(advanceConsulting(unwrap(startConsulting(save, contract)), 30)))
      contracts++
    }
    throw new Error('Synthetic founder did not earn an affordable modest start within 60 explicit contracts')
  })
})
