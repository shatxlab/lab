import { describe, expect, it } from 'vitest'
import { foundingOffers, quoteFounding, foundPaidCompany, type FoundingSelection, type FoundingQuote } from '@/lib/tycoon/paid-founding'
import { createCareerSave, serializeCareerSave, deserializeCareerSave, settleCareerSave, validateCareerSave } from '@/lib/tycoon/career-save'
import { createInitialState } from '@/lib/tycoon/sim/state'
import { financeSummary } from '@/lib/tycoon/sim/founder-finance'
import { hireCost, salaryOf } from '@/lib/tycoon/sim/hiring'
import { monthlyBurn } from '@/lib/tycoon/sim/economy'
import { projectBudget, projectTarget, startProject } from '@/lib/tycoon/sim/project'
import { researchTransferPreview } from '@/lib/tycoon/sim/research-knowledge'
import { stageComplete, stageProgress, skippedStageGoals } from '@/lib/tycoon/sim/stages'
import { checkMilestones } from '@/lib/tycoon/sim/milestones'
import { you } from '@/lib/tycoon/sim/founding'
import { advance } from '@/lib/tycoon/sim/tick'
import { takeOff } from '@/lib/tycoon/sim/fit'
import { makeProduct } from './helpers'
import { paidFoundingSource, unwrap } from './paid-founding-fixtures'

const selection = (ambition: FoundingSelection['ambition'] = 'modest'): FoundingSelection => ({
  companyId: 'synthetic-second', companyName: 'Copper Studio', ambition, focus: 'web_app', candidateIds: [],
})
const liquid = (save: Parameters<typeof financeSummary>[0]) => unwrap(financeSummary(save)).liquid

function studioSelection(): FoundingSelection {
  const source = paidFoundingSource()
  const offers = unwrap(foundingOffers(source)).offers
  return { ...selection('studio'), candidateIds: offers.filter((p) => p.role === 'designer' || p.role === 'tester').map((p) => p.id) }
}
function quoted(ambition: FoundingSelection['ambition'] = 'modest'): FoundingQuote {
  const source = paidFoundingSource()
  return unwrap(quoteFounding(source, ambition === 'studio' ? studioSelection() : selection(ambition)))
}

describe('paid next-company adapter (not yet connected to browser flow)', () => {
  it('does not consume the source RNG/ids or change any ended state when previewed repeatedly', () => {
    const source = paidFoundingSource()
    const before = JSON.stringify(source)
    const offers = unwrap(foundingOffers(source))
    const first = unwrap(quoteFounding(source, selection()))
    for (let i = 0; i < 4; i++) {
      expect(unwrap(quoteFounding(source, selection()))).toEqual(first)
      expect(unwrap(foundingOffers(source))).toEqual(offers)
    }
    expect(JSON.stringify(source)).toBe(before)
    expect(offers.offers).toHaveLength(4)
  })

  it('uses the same ordinary local offers across footprint, family, name and investment previews', () => {
    const source = paidFoundingSource()
    const modest = unwrap(quoteFounding(source, selection()))
    const venture = unwrap(quoteFounding(source, { ...selection('venture'), focus: 'cloud_platform', companyName: 'Different', investment: 1_200_000 }))
    expect(modest.offers).toEqual(venture.offers)
    // An office activates ordinary management profiles, but never rerolls the carried people or their pay.
    const people = (q: FoundingQuote) => q.staff.map(({ career: _career, ...person }) => person)
    expect(people(modest)).toEqual(people(venture))
    expect(modest.offers.every((p) => !p.founder && (p.region ?? 'us') === 'us')).toBe(true)
  })

  it.each([
    ['modest', 'cafe', 0, 2, 0, 'small'],
    ['studio', 'garage', 1000, 4, 1, 'small'],
    ['venture', 'office', 41000, 12, 1, 'medium'],
  ] as const)('quotes and pays the actual %s footprint without free products or achievements', (ambition, footprint, setup, desks, stage, size) => {
    const source = paidFoundingSource()
    const quote = quoted(ambition)
    expect(quote.costs.setup).toBe(setup)
    expect(quote.desks).toBe(desks)
    expect(quote.buildSize).toBe(size)
    expect(quote.costs.buildAllowance).toBe(projectBudget(projectTarget('web_app', [], 'new', size)))
    expect(quote.minimum).toBe(Math.ceil(setup + quote.costs.signing + quote.costs.buildAllowance + 3 * quote.costs.monthlyBurn))
    expect(quote.recommended).toBeGreaterThanOrEqual(Math.ceil(setup + quote.costs.signing + quote.costs.buildAllowance + 6 * quote.costs.monthlyBurn))
    const next = unwrap(foundPaidCompany(source, quote))
    expect(next.game.offices).toHaveLength(1)
    expect(next.game.offices[0]).toMatchObject({ kind: footprint, region: 'us', project: null })
    expect(next.game.stage).toBe(stage)
    expect(next.game.money).toBe(quote.selection.investment - setup - quote.costs.signing)
    expect(liquid(next.finance)).toBe(liquid(source.finance) - quote.selection.investment)
    expect(next.game.lifetimeRevenue).toBe(0)
    expect(next.game.products).toEqual([])
    expect(next.game.shippedCount).toBe(0)
    expect(next.game.signatureId).toBeNull()
    expect(next.game.contractsDone).toBe(0)
    expect(next.game.money).toBe(quote.companyCash) // allowance is reserved, never prepaid
    expect(next.charter).toEqual({ companyId: 'synthetic-second', ambition, fulfilledDay: null })
    expect(quote.costs.monthlyBurn).toBe(monthlyBurn(next.game))
    expect(next.game.employees).toHaveLength(ambition === 'studio' ? 4 : 2)
    expect(next.game.freshChapter).toBe(false) // only one company name was requested
    expect(next.game.studioName).toBe('Copper Studio')
    expect(next.game.research.active).toBeNull()
    expect(next.game.research.done).not.toContain('ci_pipeline')
    expect(next.game.research.known).toEqual(researchTransferPreview(source.game).known)
    expect(next.game.surveyed).toEqual(source.game.surveyed)
    expect(next.game.day).toBe(source.game.day)
    expect(unwrap(deserializeCareerSave(unwrap(serializeCareerSave(next))))).toEqual(next)
  })

  it('charges signing fees for the actual selected local offers, using current-world salaries and desks', () => {
    const source = paidFoundingSource()
    const original = unwrap(foundingOffers(source))
    const choice = studioSelection()
    const selected = original.offers.filter((p) => choice.candidateIds.includes(p.id))
    const quote = unwrap(quoteFounding(source, choice))
    expect(quote.costs.signing).toBe(selected.reduce((sum, p) => sum + hireCost(p), 0))
    const next = unwrap(foundPaidCompany(source, quote))
    expect(next.game.candidates.map((p) => p.id)).toEqual(original.offers.filter((p) => !choice.candidateIds.includes(p.id)).map((p) => p.id))
    for (const old of selected) {
      const hired = next.game.employees.find((p) => p.id === old.id)!
      expect(hired).toMatchObject({ name: old.name, skills: old.skills, trait: old.trait, salary: old.salary,
        officeId: next.game.offices[0].id, hiredDay: source.game.day, levelDay: source.game.day })
      expect(hired.founder).toBeUndefined()
    }
    expect(quote.vacancies).toBe(0)
  })

  it('keeps founder identity/appearance/skills and re-rates pay without stale company appointments', () => {
    const source = paidFoundingSource()
    const me = you(source.game)!
    me.appearanceSeed = 777
    const quote = unwrap(quoteFounding(source, selection('venture')))
    const next = unwrap(foundPaidCompany(source, quote))
    const carried = you(next.game)!
    expect(carried).toMatchObject({ name: me.name, appearanceSeed: 777, skills: me.skills, founder: true })
    expect(carried.id).toBeGreaterThanOrEqual(source.game.nextId)
    expect(carried.salary).toBe(salaryOf(carried, next.game.day))
    expect(carried.career?.appointment).toBeUndefined()
    expect(next.game.employees.every((p) => p.officeId === next.game.offices[0].id)).toBe(true)
    expect(unwrap(financeSummary(next.finance)).companies[1].shareBps).toBe(5000)
  })

  it('does not carry old corporate wage/revenue/candidate modifiers into founding prices', () => {
    const source = paidFoundingSource()
    const baseline = unwrap(quoteFounding(source, selection('venture')))
    source.game.modifiers = [
      { id: 10001, source: 'investor', stat: 'wage', mult: 0.1, expiresDay: 9000 },
      { id: 10002, source: 'investor', stat: 'revenue', mult: 10, expiresDay: 9000 },
      { id: 10003, source: 'old-company', stat: 'candidateSkill', mult: 2, expiresDay: 9000 },
    ]
    const quote = unwrap(quoteFounding(source, selection('venture')))
    expect(quote.costs).toEqual(baseline.costs)
    expect(quote.staff).toEqual(baseline.staff)
    expect(quote.offers).toEqual(baseline.offers)
    expect(unwrap(foundPaidCompany(source, quote)).game.modifiers).toEqual([])
  })

  it('offers an exact custom three-month minimum below the recommended default', () => {
    const source = paidFoundingSource()
    const full = quoted('studio')
    const custom = unwrap(quoteFounding(source, { ...studioSelection(), investment: full.minimum }))
    expect(custom.affordable).toBe(true)
    expect(custom.selection.investment).toBeLessThan(custom.recommended)
    expect(custom.runwayMonths).toBeGreaterThanOrEqual(3)
    expect(custom.runwayMonths).toBeLessThan(3.001)
    expect(custom.privateReserve).toBe(liquid(source.finance) - full.minimum)
    expect(unwrap(foundPaidCompany(source, custom)).game.money).toBe(custom.companyCash)
  })

  it('disables unaffordable/below-minimum quotes instead of providing a subsidy', () => {
    const source = paidFoundingSource()
    for (const amount of [1, liquid(source.finance) + 1]) {
      const quote = unwrap(quoteFounding(source, { ...selection(), investment: amount }))
      expect(quote.affordable).toBe(false)
      expect(quote.blocker).not.toBeNull()
      expect(foundPaidCompany(source, quote).ok).toBe(false)
    }
    const failed = createInitialState(7)
    failed.day = 200
    failed.gameOver = true
    failed.ending = { kind: 'bankrupt', day: 200, worth: 0 }
    // Make a genuinely native failed career, not an already-ended legacy adoption.
    const native = unwrap(createCareerSave(createInitialState(7), { careerId: 'failure', companyId: 'first' }))
    native.game = failed
    const ended = unwrap(settleCareerSave(native))
    const offers = unwrap(foundingOffers(ended))
    const developer = offers.offers.find((p) => p.role === 'developer')!
    const quote = unwrap(quoteFounding(ended, { ...selection(), candidateIds: [developer.id] }))
    expect(quote.available).toBe(0)
    expect(quote.affordable).toBe(false)
    expect(foundPaidCompany(ended, quote).ok).toBe(false)
    expect(liquid(ended.finance)).toBe(0)
  })

  it('after a later failure, uses prior private wealth but only one founder plus a paid developer', () => {
    const source = paidFoundingSource()
    let second = unwrap(foundPaidCompany(source, quoted()))
    second.game.day += 100
    second.game.gameOver = true
    second.game.money = -100
    second.game.ending = { kind: 'bankrupt', day: second.game.day, worth: 0 }
    second = unwrap(settleCareerSave(second))
    const offers = unwrap(foundingOffers(second))
    expect(offers.founders).toHaveLength(1)
    const dev = offers.offers.find((p) => p.role === 'developer')!
    expect(quoteFounding(second, { ...selection(), companyId: 'third' }).ok).toBe(false)
    const quote = unwrap(quoteFounding(second, { ...selection(), companyId: 'third', candidateIds: [dev.id] }))
    const next = unwrap(foundPaidCompany(second, quote))
    expect(next.game.employees).toHaveLength(2)
    expect(next.game.employees.filter((p) => p.founder)).toHaveLength(1)
    expect(quote.costs.signing).toBe(dev.salary)
    expect(quote.costs.monthlyBurn).toBe(dev.salary + 300)
    expect(unwrap(financeSummary(next.finance)).companies[2].shareBps).toBe(10000)
    expect(liquid(next.finance)).toBe(liquid(second.finance) - quote.selection.investment)
  })

  it('requires a closed ending, fresh company identity, real local offers, staff coverage and real desks', () => {
    const source = paidFoundingSource()
    const pool = unwrap(foundingOffers(source))
    expect(quoteFounding(source, { ...selection(), companyId: 'synthetic-first' }).ok).toBe(false)
    expect(quoteFounding(source, { ...selection(), candidateIds: [99999] }).ok).toBe(false)
    expect(quoteFounding(source, { ...selection(), candidateIds: [pool.offers[0].id] }).ok).toBe(false)
    expect(quoteFounding(source, selection('studio')).ok).toBe(false)
    expect(quoteFounding(source, { ...selection('studio'), candidateIds: pool.offers.map((p) => p.id) }).ok).toBe(false)
    expect(quoteFounding(source, { ...selection('venture'), candidateIds: [pool.offers[0].id, pool.offers[0].id] }).ok).toBe(false)
    const unsettled = structuredClone(source)
    unsettled.finance.records.pop()
    expect(foundingOffers(unsettled).ok).toBe(false)
    const active = unwrap(createCareerSave(createInitialState(5), { careerId: 'active', companyId: 'first' }))
    expect(quoteFounding(active, selection()).ok).toBe(false)
    source.game.employees[0].region = 'eu'
    expect(foundingOffers(source).ok).toBe(false)
  })

  it.each([NaN, Infinity, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid investment %s', (investment) => {
    expect(quoteFounding(paidFoundingSource(), { ...selection(), investment }).ok).toBe(false)
  })

  it('rejects invalid names and focus, and treats future focus only as a planning choice', () => {
    const source = paidFoundingSource()
    for (const change of [{ companyName: '' }, { companyName: ' ' }, { companyName: 'x'.repeat(33) }, { focus: 'missing' }, { ambition: 'standard' }]) {
      expect(quoteFounding(source, { ...selection(), ...change } as FoundingSelection).ok).toBe(false)
    }
    const quote = unwrap(quoteFounding(source, { ...selection('venture'), focus: 'cloud_platform', companyName: '  Copper  ' }))
    expect(quote.selection.companyName).toBe('Copper')
    const next = unwrap(foundPaidCompany(source, quote))
    expect(next.game.founding?.focus).toBe('cloud_platform')
    expect(next.game.products).toEqual([])
    expect(next.game.offices[0].project).toBeNull()
  })

  it('rejects stale/tampered quotes, including unchanged prices with changed world facts', () => {
    const source = paidFoundingSource()
    const quote = quoted('venture')
    for (const tamper of [
      (q: FoundingQuote) => { q.costs.setup = 0 },
      (q: FoundingQuote) => { q.companyCash++ },
      (q: FoundingQuote) => { q.staff[0].skills.engineering++ },
      (q: FoundingQuote) => { q.available++ },
      (q: FoundingQuote) => { q.selection.investment-- },
    ]) {
      const changed = structuredClone(quote)
      tamper(changed)
      expect(foundPaidCompany(source, changed).ok).toBe(false)
    }
    source.game.market.web_app += 0.01
    expect(foundPaidCompany(source, quote).ok).toBe(false)
    const next = unwrap(foundPaidCompany(paidFoundingSource(), quote))
    expect(foundPaidCompany(next, quote).ok).toBe(false)
  })

  it('does not reward transferred cash, paid hires or inherited knowledge as earned milestones', () => {
    const source = paidFoundingSource()
    const quote = unwrap(quoteFounding(source, { ...studioSelection(), investment: 1_200_000 }))
    const next = unwrap(foundPaidCompany(source, quote))
    expect(next.game.founding?.excludedMilestones).toContain('team_4')
    expect(next.game.founding?.excludedMilestones).toContain('cash_1m')
    expect(next.game.milestones).not.toContain('cash_1m')
    const money = next.game.money
    const reputation = next.game.reputation
    checkMilestones(next.game)
    expect(next.game.money).toBe(money)
    expect(next.game.reputation).toBe(reputation)
    expect(next.game.milestones).toEqual(source.game.milestones)
  })

  it.each(['studio', 'venture'] as const)('skips introductory chores for %s without pretending they were earned or waiving fit', (ambition) => {
    const next = unwrap(foundPaidCompany(paidFoundingSource(), quoted(ambition)))
    expect(stageProgress(next.game, 0)).toEqual([])
    expect(skippedStageGoals(next.game, 0).map((g) => g.id)).toEqual(['cafe_jobs', 'to_garage'])
    expect(stageProgress(next.game, 1).map((g) => g.id)).toEqual(['hit'])
    expect(stageComplete(next.game)).toBe(false)
    expect(next.game.shippedCount).toBe(0)
    expect(next.game.contractsDone).toBe(0)
    expect(next.game.milestones).toEqual([])
  })

  it('keeps real office-start product discovery usable and activates Operations only after an actual hit', () => {
    const next = unwrap(foundPaidCompany(paidFoundingSource(), quoted('venture')))
    const office = next.game.offices[0]
    expect(office.assignment).toBeUndefined()
    expect(startProject(next.game, 'web_app', [], 'medium').ok).toBe(true)
    expect(office.project?.size).toBe('medium')
    expect(next.game.signatureId).toBeNull()
    expect(stageComplete(next.game)).toBe(false)
    // Synthetic release-boundary fixture: cash still paid by the normal startProject path above.
    office.project = null
    const product = makeProduct({ id: next.game.nextId++, fit: 80, size: 'medium', releaseDay: next.game.day })
    next.game.products.push(product)
    takeOff(next.game, product)
    expect(next.game.signatureId).toBe(product.id)
    expect(office.assignment).toEqual({ kind: 'idle' })
    expect(stageComplete(next.game)).toBe(true)
    expect(next.game.shippedCount).toBe(0) // no fabricated intro shipping count
  })

  it('leaves default first-run gates/economics unchanged and validates founding provenance on import', () => {
    const first = createInitialState(5)
    expect(first.money).toBe(2500)
    expect(first.founding).toBeUndefined()
    expect(stageProgress(first, 0).map((g) => g.id)).toEqual(['cafe_jobs', 'to_garage'])
    const next = unwrap(foundPaidCompany(paidFoundingSource(), quoted('venture')))
    delete next.game.founding
    expect(validateCareerSave(next).ok).toBe(false)
    const original = paidFoundingSource()
    original.game.founding = { ambition: 'venture', focus: 'web_app', excludedMilestones: [] }
    expect(validateCareerSave(original).ok).toBe(false)
  })

  it('can advance the paid company without secretly introducing products or extra cash on its first day', () => {
    const next = unwrap(foundPaidCompany(paidFoundingSource(), quoted('studio')))
    const before = next.game.money
    const burn = monthlyBurn(next.game) / 30
    advance(next.game, 1)
    expect(next.game.products).toEqual([])
    expect(next.game.money).toBeCloseTo(before - burn)
    expect(next.game.stage).toBe(1)
    expect(liquid(next.finance)).toBe(4_850_000)
  })
})
