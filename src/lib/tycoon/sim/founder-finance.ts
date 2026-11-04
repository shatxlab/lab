import { CAFE_START_MONEY } from './balance'
import type { Ending } from './types'

/** Standalone, pure Stage 6 ledger. GameState/save/UI integration is a separate step. */
export const FINANCE_VERSION = 1
export type Ambition = 'standard' | 'modest' | 'studio' | 'venture'
export type VentureAmbition = Exclude<Ambition, 'standard'>
export type FinanceOrigin = 'initial' | 'legacy-active' | 'legacy-ended'
export type Share = 5000 | 10000

export interface FundingCosts {
  setup: number
  signing: number
  buildAllowance: number
  monthlyBurn: number
}
export interface FundingQuote {
  minimum: number
  recommended: number
}
export interface ExitFacts {
  kind: Ending['kind']
  day: number
  worth: number
  /** After the offer has already been added for a sale. Never add it again. */
  closingCash: number
}
export interface Holding {
  status: 'priced' | 'disputed' | 'written-off'
  shareBps: number
  bookValue: number | null
  valuedDay: number
}
export interface Distribution {
  liquid: number
  holding: Holding | null
}
export type FinanceRecord =
  | { kind: 'origin'; companyId: string; day: number; source: FinanceOrigin }
  | { kind: 'settlement'; companyId: string; day: number; facts: ExitFacts; distribution: Distribution; legacyOptIn: boolean }
  | { kind: 'legacy-close'; companyId: string; day: number; facts: ExitFacts }
  | { kind: 'investment'; companyId: string; day: number; founders: 1 | 2; ambition: VentureAmbition; amount: number; costs: FundingCosts }

export interface FounderFinance {
  version: typeof FINANCE_VERSION
  careerId: string
  records: FinanceRecord[]
}
export interface CompanyFinance {
  companyId: string
  shareBps: Share
  ambition: Ambition
  source: FinanceOrigin | 'personal'
  investment: number | null
  closed: boolean
}
export interface FinanceSummary {
  liquid: number
  companies: CompanyFinance[]
  holdings: (Holding & { companyId: string })[]
}
export type FinanceResult<T> = { ok: true; value: T } | { ok: false; reason: string }
const fail = (reason: string): FinanceResult<never> => ({ ok: false, reason })
const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v)
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const finiteMoney = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER
const venture = (v: unknown): v is VentureAmbition => v === 'modest' || v === 'studio' || v === 'venture'
const origin = (v: unknown): v is FinanceOrigin => v === 'initial' || v === 'legacy-active' || v === 'legacy-ended'

/** Exact whole-dollar splits, including near MAX_SAFE_INTEGER (no floating-point 10% rounding). */
function portion(dollars: number, bps: number): number {
  return Number(BigInt(Math.floor(Math.max(0, dollars))) * BigInt(bps) / 10000n)
}

/** Actual world costs must be supplied/revalidated by the founding adapter; no speculative revenue. */
export function quoteFunding(ambition: VentureAmbition, costs: FundingCosts): FinanceResult<FundingQuote> {
  if (!venture(ambition) || !obj(costs) || !['setup', 'signing', 'buildAllowance', 'monthlyBurn'].every((key) =>
    finiteMoney(costs[key]) && (costs[key] as number) >= 0)) return fail('Invalid founding costs')
  const base = costs.setup + costs.signing + costs.buildAllowance
  const minimum = Math.ceil(base + 3 * costs.monthlyBurn)
  const recommended = Math.max({ modest: 15000, studio: 150000, venture: 1000000 }[ambition], Math.ceil(base + 6 * costs.monthlyBurn))
  if (!whole(minimum) || !whole(recommended)) return fail('Founding costs exceed the supported money range')
  return { ok: true, value: { minimum, recommended } }
}

/** No credit, mutations, RNG use or legacy-ownership inference: this is only an exit quote. */
export function quoteDistribution(shareBps: Share, facts: ExitFacts): FinanceResult<Distribution> {
  if ((shareBps !== 5000 && shareBps !== 10000) || !validFacts(facts)) return fail('Invalid exit facts or ownership')
  const stake = portion(facts.worth, shareBps)
  const holding = (status: Holding['status'], bookValue: number | null, share: number = shareBps): Holding =>
    ({ status, bookValue, shareBps: share, valuedDay: facts.day })
  switch (facts.kind) {
    case 'sold': return { ok: true, value: { liquid: stake, holding: null } }
    case 'ipo': {
      const liquid = portion(stake, 1000)
      return { ok: true, value: { liquid, holding: holding('priced', stake - liquid, shareBps * 0.9) } }
    }
    case 'retired': {
      const liquid = portion(facts.closingCash, shareBps)
      return { ok: true, value: { liquid, holding: holding('priced', Math.max(0, stake - liquid)) } }
    }
    case 'bankrupt': return { ok: true, value: { liquid: 0, holding: holding('written-off', 0) } }
    case 'ousted': return { ok: true, value: { liquid: 0, holding: holding('disputed', null) } }
  }
}

function validFacts(v: unknown): v is ExitFacts {
  if (!obj(v) || !whole(v.day) || !finiteMoney(v.worth) || !Number.isSafeInteger(v.worth) || !finiteMoney(v.closingCash)) return false
  switch (v.kind) {
    // Existing acceptBuyout() records Math.round(company.money) after adding the offer.
    case 'sold': return Math.round(v.closingCash) === v.worth
    case 'ipo': case 'retired': return v.worth >= Math.floor(Math.max(0, v.closingCash))
    case 'bankrupt': case 'ousted': return v.worth >= 0
    default: return false
  }
}

function sameDistribution(raw: unknown, expected: Distribution): boolean {
  if (!obj(raw) || raw.liquid !== expected.liquid) return false
  if (expected.holding === null) return raw.holding === null
  const h = raw.holding, e = expected.holding
  return obj(h) && h.status === e.status && h.shareBps === e.shareBps && h.bookValue === e.bookValue && h.valuedDay === e.valuedDay
}

/** Replay is also import validation: never trust a stored balance, credit or duplicate company key. */
export function financeSummary(raw: unknown): FinanceResult<FinanceSummary> {
  if (!obj(raw) || raw.version !== FINANCE_VERSION || !id(raw.careerId) || !Array.isArray(raw.records) || !raw.records.length) return fail('Invalid finance ledger')
  const companies = new Map<string, CompanyFinance>()
  const holdings: FinanceSummary['holdings'] = []
  let liquid = 0, day = 0
  let current: CompanyFinance | undefined
  for (let index = 0; index < raw.records.length; index++) {
    const r = raw.records[index]
    if (!obj(r) || !id(r.companyId) || !whole(r.day) || r.day < day) return fail('Invalid finance record identity or chronology')
    day = r.day
    if (r.kind === 'origin') {
      if (index !== 0 || !origin(r.source) || (r.source === 'initial' && day !== 0)) return fail('Invalid career origin')
      current = { companyId: r.companyId, shareBps: 5000, ambition: 'standard', source: r.source,
        investment: r.source === 'initial' ? CAFE_START_MONEY : null, closed: false }
      companies.set(current.companyId, current)
    } else if (r.kind === 'investment') {
      if (!current?.closed || companies.has(r.companyId) || (r.founders !== 1 && r.founders !== 2) || !venture(r.ambition) || !whole(r.amount) || r.amount === 0 || !obj(r.costs)) return fail('Invalid company investment')
      const quote = quoteFunding(r.ambition, r.costs as unknown as FundingCosts)
      if (!quote.ok || r.amount < quote.value.minimum || r.amount > liquid) return fail('Investment is unaffordable or below the quoted minimum')
      liquid -= r.amount
      current = { companyId: r.companyId, shareBps: r.founders === 1 ? 10000 : 5000, ambition: r.ambition,
        source: 'personal', investment: r.amount, closed: false }
      companies.set(current.companyId, current)
    } else if (r.kind === 'settlement' || r.kind === 'legacy-close') {
      if (!current || current.closed || current.companyId !== r.companyId || !validFacts(r.facts) || r.facts.day !== day) return fail('Company is already closed or exit facts are invalid')
      if (r.kind === 'legacy-close') {
        if (current.source !== 'legacy-ended') return fail('Only an already-ended legacy company can decline adoption')
      } else {
        if (r.legacyOptIn !== (current.source === 'legacy-ended')) return fail('Legacy ending requires explicit prototype adoption')
        const quote = quoteDistribution(current.shareBps, r.facts)
        if (!quote.ok || !sameDistribution(r.distribution, quote.value)) return fail('Stored exit distribution does not match the model')
        liquid += quote.value.liquid
        if (!whole(liquid)) return fail('Personal cash exceeds the supported money range')
        if (quote.value.holding) holdings.push({ ...quote.value.holding, companyId: current.companyId })
      }
      current.closed = true
    } else return fail('Unknown finance record')
  }
  return { ok: true, value: { liquid, companies: [...companies.values()], holdings } }
}

export function isFounderFinance(v: unknown): v is FounderFinance {
  return financeSummary(v).ok
}

export function createFounderFinance(careerId: string, companyId: string, day = 0, source: FinanceOrigin = 'initial'): FinanceResult<FounderFinance> {
  const value: FounderFinance = { version: FINANCE_VERSION, careerId, records: [{ kind: 'origin', companyId, day, source }] }
  const checked = financeSummary(value)
  return checked.ok ? { ok: true, value } : checked
}

function append(ledger: FounderFinance, record: FinanceRecord): FinanceResult<FounderFinance> {
  const checked = financeSummary(ledger)
  if (!checked.ok) return checked
  // Copy source facts/costs too: callers cannot mutate a booked transaction via their proposal object.
  const value = structuredClone(ledger)
  value.records.push(structuredClone(record))
  const result = financeSummary(value)
  return result.ok ? { ok: true, value } : result
}

/** Repeated settlement returns the already-recorded ledger only if the source facts match exactly. */
export function settleFounderExit(ledger: FounderFinance, companyId: string, facts: ExitFacts, legacyOptIn = false): FinanceResult<FounderFinance> {
  const summary = financeSummary(ledger)
  if (!summary.ok) return summary
  const company = summary.value.companies.find((c) => c.companyId === companyId)
  if (!company || !validFacts(facts)) return fail('Unknown company or invalid exit facts')
  const previous = ledger.records.find((r) => r.kind === 'settlement' && r.companyId === companyId)
  if (previous?.kind === 'settlement') {
    const old = previous.facts
    return previous.legacyOptIn === legacyOptIn && old.kind === facts.kind && old.day === facts.day && old.worth === facts.worth && old.closingCash === facts.closingCash
      ? { ok: true, value: structuredClone(ledger) } : fail('Settlement conflicts with the recorded outcome')
  }
  const quote = quoteDistribution(company.shareBps, facts)
  if (!quote.ok) return quote
  return append(ledger, { kind: 'settlement', companyId, day: facts.day, facts, distribution: quote.value, legacyOptIn })
}

export function declineLegacySettlement(ledger: FounderFinance, companyId: string, facts: ExitFacts): FinanceResult<FounderFinance> {
  return append(ledger, { kind: 'legacy-close', companyId, day: facts.day, facts })
}

/** Financial permission only. World adapter must recheck the actual costs/staff/save identity before committing. */
export function investInCompany(ledger: FounderFinance, companyId: string, day: number, founders: 1 | 2, ambition: VentureAmbition, amount: number, costs: FundingCosts): FinanceResult<FounderFinance> {
  return append(ledger, { kind: 'investment', companyId, day, founders, ambition, amount, costs })
}
