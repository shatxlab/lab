import { describe, expect, it } from 'vitest'
import {
  createFounderFinance, declineLegacySettlement, financeSummary, investInCompany,
  isFounderFinance, quoteDistribution, quoteFunding, settleFounderExit,
  type ExitFacts, type FinanceResult, type FounderFinance, type FundingCosts,
} from '@/lib/tycoon/sim/founder-finance'
import { CAFE_START_MONEY } from '@/lib/tycoon/sim/balance'

function unwrap<T>(r: FinanceResult<T>): T {
  if (!r.ok) throw new Error(r.reason)
  return r.value
}
const costs: FundingCosts = { setup: 1000, signing: 2000, buildAllowance: 3000, monthlyBurn: 1000 }
const facts = (kind: ExitFacts['kind'], worth = 100_000_000, closingCash = 2_000_000, day = 100): ExitFacts =>
  ({ kind, worth, closingCash: kind === 'sold' ? worth : closingCash, day })
const initial = () => unwrap(createFounderFinance('career-1', 'company-1'))
const reload = (ledger: FounderFinance): FounderFinance => JSON.parse(JSON.stringify(ledger))
const settled = () => unwrap(settleFounderExit(initial(), 'company-1', facts('ipo')))

describe('standalone founder finance ledger (not yet a game/save adapter)', () => {
  it('keeps first-company economics unchanged and creates no private reserve', () => {
    expect(unwrap(financeSummary(initial()))).toEqual({ liquid: 0, consulting: null, fulfilledAmbitions: [], holdings: [], companies: [{
      companyId: 'company-1', shareBps: 5000, ambition: 'standard', source: 'initial',
      investment: CAFE_START_MONEY, closed: false,
    }] })
  })

  it.each([
    ['sold', 50_000_000, null],
    ['ipo', 5_000_000, { status: 'priced', bookValue: 45_000_000, shareBps: 4500, valuedDay: 100 }],
    ['retired', 1_000_000, { status: 'priced', bookValue: 49_000_000, shareBps: 5000, valuedDay: 100 }],
    ['bankrupt', 0, { status: 'written-off', bookValue: 0, shareBps: 5000, valuedDay: 100 }],
    ['ousted', 0, { status: 'disputed', bookValue: null, shareBps: 5000, valuedDay: 100 }],
  ] as const)('quotes %s without mutating or booking', (kind, liquid, holding) => {
    const source = facts(kind)
    const before = structuredClone(source)
    expect(unwrap(quoteDistribution(5000, source))).toEqual({ liquid, holding })
    expect(source).toEqual(before)
    expect(unwrap(financeSummary(initial())).liquid).toBe(0)
  })

  it('uses the sale closing pot exactly once, not offer plus closing pot', () => {
    expect(unwrap(quoteDistribution(5000, facts('sold', 20_000_000))).liquid).toBe(10_000_000)
    expect(quoteDistribution(5000, { ...facts('sold', 20_000_000), closingCash: 18_000_000 }).ok).toBe(false)
    // Existing acceptBuyout rounds worth while leaving company cash fractional.
    expect(unwrap(quoteDistribution(5000, { ...facts('sold', 101), closingCash: 100.6 })).liquid).toBe(50)
  })

  it.each([0, -101])('does not distribute a nonpositive sale pot (%s)', (pot) => {
    expect(unwrap(quoteDistribution(5000, facts('sold', pot)))).toEqual({ liquid: 0, holding: null })
  })

  it('floors odd-dollar splits and sells ten percent of the stake, not ten percentage points', () => {
    expect(unwrap(quoteDistribution(5000, facts('ipo', 103, 0)))).toMatchObject({
      liquid: 5, holding: { bookValue: 46, shareBps: 4500 },
    })
    expect(unwrap(quoteDistribution(10000, facts('ipo', 103, 0)))).toMatchObject({
      liquid: 10, holding: { bookValue: 93, shareBps: 9000 },
    })
    expect(unwrap(quoteDistribution(5000, facts('retired', 103, 3.9)))).toMatchObject({ liquid: 1, holding: { bookValue: 50 } })
    expect(unwrap(quoteDistribution(5000, facts('retired', 103, -3.9)))).toMatchObject({ liquid: 0, holding: { bookValue: 51 } })
  })

  it('uses exact integer splits even at the safe-integer boundary', () => {
    const stake = Number(BigInt(Number.MAX_SAFE_INTEGER) / 2n)
    const q = unwrap(quoteDistribution(5000, facts('ipo', Number.MAX_SAFE_INTEGER, 0)))
    expect(q.liquid).toBe(Number(BigInt(stake) / 10n))
    expect(q.holding?.bookValue).toBe(stake - q.liquid)
  })

  it.each([
    { ...facts('ipo'), day: -1 }, { ...facts('ipo'), day: 0.5 },
    { ...facts('ipo'), worth: NaN }, { ...facts('ipo'), worth: Infinity },
    { ...facts('ipo'), worth: Number.MAX_SAFE_INTEGER + 1 }, { ...facts('ipo'), worth: 1.5 },
    { ...facts('ipo'), worth: -1 }, { ...facts('retired'), closingCash: Infinity },
    { ...facts('retired'), worth: 1, closingCash: 10 },
    { ...facts('bankrupt'), worth: -1 }, { ...facts('ipo'), kind: 'unknown' }, null,
  ])('rejects invalid exit facts %#', (bad) => {
    expect(quoteDistribution(5000, bad as ExitFacts).ok).toBe(false)
  })

  it('rejects unsupported ownership', () => {
    expect(quoteDistribution(7500 as 5000, facts('ipo')).ok).toBe(false)
  })

  it('settles only once across retries and reloads; conflicting retries fail', () => {
    const source = initial()
    const booked = settled()
    expect(source.records).toHaveLength(1)
    const again = unwrap(settleFounderExit(reload(booked), 'company-1', facts('ipo')))
    expect(again).toEqual(booked)
    expect(unwrap(financeSummary(again)).liquid).toBe(5_000_000)
    for (const changed of [facts('sold'), facts('ipo', 100_000_001), facts('ipo', 100_000_000, 3), facts('ipo', 100_000_000, 2_000_000, 101)]) {
      expect(settleFounderExit(booked, 'company-1', changed).ok).toBe(false)
    }
    expect(settleFounderExit(booked, 'company-1', facts('ipo'), true).ok).toBe(false)
    expect(settleFounderExit(source, 'missing', facts('ipo')).ok).toBe(false)
  })

  it('does not let callers mutate booked source facts or funding costs', () => {
    const proposal = facts('ipo')
    const booked = unwrap(settleFounderExit(initial(), 'company-1', proposal))
    proposal.worth = 0
    const selectedCosts = { ...costs }
    const funded = unwrap(investInCompany(booked, 'company-2', 100, 1, 'studio', 150_000, selectedCosts))
    selectedCosts.signing = 100_000
    expect(isFounderFinance(funded)).toBe(true)
    expect(booked.records).toHaveLength(2)
    expect(funded.records).toHaveLength(3)
  })

  it('quotes setup, signing, reserved build and three/six months without speculative revenue', () => {
    expect(unwrap(quoteFunding('modest', costs))).toEqual({ minimum: 9000, recommended: 15000 })
    expect(unwrap(quoteFunding('studio', costs))).toEqual({ minimum: 9000, recommended: 150000 })
    expect(unwrap(quoteFunding('venture', costs))).toEqual({ minimum: 9000, recommended: 1000000 })
    expect(unwrap(quoteFunding('modest', { ...costs, monthlyBurn: 10000.1 }))).toEqual({ minimum: 36001, recommended: 66001 })
  })

  it.each([-1, NaN, Infinity, Number.MAX_SAFE_INTEGER])('rejects invalid/overflowing funding costs (%s)', (n) => {
    expect(quoteFunding('modest', { ...costs, monthlyBurn: n }).ok).toBe(false)
  })

  it('supports a custom amount below the recommended default but not below minimum or above private cash', () => {
    const ledger = settled()
    expect(investInCompany(ledger, 'company-2', 100, 2, 'venture', 9000, costs).ok).toBe(true)
    for (const amount of [0, -1, 8999, 9000.5, 5_000_001, Infinity, NaN]) {
      expect(investInCompany(ledger, 'company-2', 100, 2, 'venture', amount, costs).ok).toBe(false)
    }
    expect(unwrap(financeSummary(ledger)).liquid).toBe(5_000_000)
  })

  it('requires a closed predecessor, a new identity and monotonic world day', () => {
    expect(investInCompany(initial(), 'company-2', 100, 1, 'modest', 15000, costs).ok).toBe(false)
    expect(investInCompany(settled(), 'company-1', 100, 1, 'modest', 15000, costs).ok).toBe(false)
    expect(investInCompany(settled(), 'company-2', 99, 1, 'modest', 15000, costs).ok).toBe(false)
    expect(createFounderFinance('', 'company-1').ok).toBe(false)
    expect(createFounderFinance('career-1', 'company-1', 1).ok).toBe(false)
  })

  it.each(['bankrupt', 'ousted'] as const)('preserves earlier cash and holdings through %s', (kind) => {
    let ledger = unwrap(investInCompany(settled(), 'company-2', 100, 1, 'modest', 15000, costs))
    ledger = unwrap(settleFounderExit(ledger, 'company-2', facts(kind, 0, -200, 200)))
    const summary = unwrap(financeSummary(reload(ledger)))
    expect(summary.liquid).toBe(4_985_000)
    expect(summary.holdings[0]).toMatchObject({ companyId: 'company-1', bookValue: 45_000_000 })
    expect(summary.holdings[1].status).toBe(kind === 'bankrupt' ? 'written-off' : 'disputed')
  })

  it('replays IPO → venture → sale → venture → retirement with reloads and frozen ownership', () => {
    let ledger = reload(settled())
    ledger = reload(unwrap(investInCompany(ledger, 'company-2', 100, 1, 'venture', 1_000_000, costs)))
    expect(unwrap(financeSummary(ledger)).companies[1].shareBps).toBe(10000)
    ledger = reload(unwrap(settleFounderExit(ledger, 'company-2', facts('sold', 20_000_001, 0, 200))))
    ledger = reload(unwrap(investInCompany(ledger, 'company-3', 200, 2, 'venture', 1_000_000, costs)))
    ledger = reload(unwrap(settleFounderExit(ledger, 'company-3', facts('retired', 20_000_000, 2_000_000, 300))))
    const s = unwrap(financeSummary(ledger))
    expect(s.liquid).toBe(24_000_001)
    expect(s.companies.map((c) => [c.shareBps, c.closed])).toEqual([[5000, true], [10000, true], [5000, true]])
    expect(s.holdings.map((h) => h.bookValue)).toEqual([45_000_000, 9_000_000])
  })

  it('adopts legacy active companies prospectively without reconstructed reserve', () => {
    const ledger = unwrap(createFounderFinance('old-career', 'current-only', 700, 'legacy-active'))
    expect(unwrap(financeSummary(ledger))).toMatchObject({ liquid: 0, companies: [{ investment: null, shareBps: 5000 }] })
    expect(settleFounderExit(ledger, 'current-only', facts('ipo', 100_000_000, 0, 800)).ok).toBe(true)
    expect(declineLegacySettlement(ledger, 'current-only', facts('ipo', 100_000_000, 0, 800)).ok).toBe(false)
  })

  it('requires explicit adoption of an already-ended legacy company, or durable decline without credit', () => {
    const ledger = unwrap(createFounderFinance('old-career', 'current-only', 700, 'legacy-ended'))
    const ending = facts('ipo', 100_000_000, 0, 700)
    expect(settleFounderExit(ledger, 'current-only', ending).ok).toBe(false)
    const adopted = unwrap(settleFounderExit(ledger, 'current-only', ending, true))
    expect(unwrap(financeSummary(reload(adopted))).liquid).toBe(5_000_000)
    const declined = unwrap(declineLegacySettlement(ledger, 'current-only', ending))
    expect(unwrap(financeSummary(reload(declined)))).toMatchObject({ liquid: 0, holdings: [], companies: [{ closed: true }] })
    expect(settleFounderExit(declined, 'current-only', ending, true).ok).toBe(false)
    expect(declineLegacySettlement(adopted, 'current-only', ending).ok).toBe(false)
  })

  it('validates imported records by replay rather than trusting stored distributions', () => {
    const original = settled()
    const corrupt = (change: (raw: any) => void) => {
      const raw = reload(original)
      change(raw)
      expect(isFounderFinance(raw)).toBe(false)
    }
    corrupt((r) => { r.version++ })
    corrupt((r) => { r.records = [] })
    corrupt((r) => { r.records[1].distribution.liquid++ })
    corrupt((r) => { r.records[1].distribution.holding.bookValue++ })
    corrupt((r) => { r.records[1].distribution.holding.shareBps = 5000 })
    corrupt((r) => { r.records[1].distribution.holding.valuedDay++ })
    corrupt((r) => { r.records.push(r.records[1]) })
    corrupt((r) => { r.records[1].day++ })
    corrupt((r) => { r.records[1].companyId = 'other' })
    corrupt((r) => { r.records[1].kind = 'grant' })
    corrupt((r) => { r.records[1].legacyOptIn = true })
    for (const value of [null, [], {}, { version: 1, careerId: 'x', records: [null] }]) expect(isFounderFinance(value)).toBe(false)
  })
})
