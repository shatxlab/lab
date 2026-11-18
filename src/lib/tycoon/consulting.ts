import { eraIndexAt } from './data/eras'
import { serializeCareerSave, validateCareerSave, type CareerSave } from './career-save'
import { DAYS_PER_MONTH } from './sim/balance'
import { consultingPay, consultingPayBasis, type ConsultingPayBasis } from './sim/consulting-pay'
import { beginConsulting, completeConsulting, CONSULTING_DAYS, financeSummary, type FinanceResult } from './sim/founder-finance'
import { you } from './sim/founding'
import { logEntry } from './sim/journal'
import { updateMarket } from './sim/market'
import { rivalArrives, rivalRevenue, rivalsDay } from './sim/rivals'
import type { GameState } from './sim/types'

export interface ConsultingQuote {
  sourceToken: string
  companyId: string
  contractId: string
  startDay: number
  completeDay: number
  basis: ConsultingPayBasis
  marketSalary: number
  payout: number
}
const fail = (reason: string): FinanceResult<never> => ({ ok: false, reason })

/** Preview is explicit, repeatable and free of live RNG/ID/time/cash changes. */
export function quoteConsulting(save: CareerSave, contractId: string): FinanceResult<ConsultingQuote> {
  const checked = validateCareerSave(save)
  if (!checked.ok) return checked
  const value = checked.value
  const summary = financeSummary(value.finance)
  if (!summary.ok) return summary
  const current = summary.value.companies[summary.value.companies.length - 1]
  const founder = you(value.game)
  if (!value.game.gameOver || !founder || !current.closed) return fail('Settle the ended company or explicitly decline legacy adoption before consulting')
  if (summary.value.consulting) return fail('Finish the current consulting contract before choosing another')
  if (typeof contractId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(contractId) ||
    value.finance.records.some((r) => r.kind === 'consulting-start' && r.contract.contractId === contractId)) return fail('Choose a new consulting contract identity')
  const basis = consultingPayBasis(founder)
  const pay = consultingPay(basis, value.game.day)
  if (!pay || !Number.isSafeInteger(value.game.day + CONSULTING_DAYS)) return fail('Unsupported consulting salary or world date')
  const token = serializeCareerSave(value)
  if (!token.ok) return token
  return { ok: true, value: { sourceToken: token.value, companyId: current.companyId, contractId,
    startDay: value.game.day, completeDay: value.game.day + CONSULTING_DAYS, basis, ...pay } }
}

/** Normalize former nemesis businesses once: they no longer track the ended company's frozen revenue. */
function detachRivalry(game: GameState): void {
  game.rivals = game.rivals.map((r) => {
    if (r.ratio === undefined) return r
    const { ratio: _ratio, ...rest } = r
    const business = Math.round(rivalRevenue(game, r))
    return { ...rest, business, businessCap: business * 2, growth: 0.2 }
  })
}

/** Starting books a contract, not a credit. No days pass until the dedicated interlude path advances it. */
export function startConsulting(save: CareerSave, quote: ConsultingQuote): FinanceResult<CareerSave> {
  const fresh = quoteConsulting(save, quote.contractId)
  if (!fresh.ok) return fresh
  if (JSON.stringify(quote) !== JSON.stringify(fresh.value)) return fail('This consulting quote changed; review its current pay and dates')
  const checked = validateCareerSave(save)
  if (!checked.ok) return checked
  const value = checked.value
  const finance = beginConsulting(value.finance, quote.companyId, quote.contractId, quote.startDay, quote.basis)
  if (!finance.ok) return finance
  value.finance = finance.value
  detachRivalry(value.game)
  logEntry(value.game, 'interlude.contract', 'Accepted a personal consulting contract', { contractId: quote.contractId,
    completeDay: quote.completeDay, payout: quote.payout, marketSalary: quote.marketSalary })
  return validateCareerSave(value)
}

/** Only this allow-listed world projection runs: the ended studio cannot earn, spend, work, train or gain rewards. */
function advanceInterludeWorld(game: GameState): void {
  const previousDay = game.day
  const world: GameState = { ...game, day: game.day + 1, products: [], signatureId: null, employees: [], offices: [],
    incomeAverage: 0, acquiredIncome: 0, lifetimeRevenue: 0, nemesis: undefined, events: [], dayWork: [] }
  rivalsDay(world)
  if (eraIndexAt(world.day) !== eraIndexAt(previousDay)) rivalArrives(world, eraIndexAt(world.day))
  if (world.day % DAYS_PER_MONTH === 0) updateMarket(world)
  game.day = world.day
  game.rng = world.rng
  game.nextId = world.nextId
  game.rivals = world.rivals
  game.rivalProducts = world.rivalProducts
  game.market = world.market
  game.marketNews = world.marketNews
}

/** Save/resume any partial contract. Completion credits exactly once and never starts the next contract automatically. */
export function advanceConsulting(save: CareerSave, days = 1): FinanceResult<CareerSave> {
  const checked = validateCareerSave(save)
  if (!checked.ok) return checked
  if (!Number.isSafeInteger(days) || days < 0) return fail('Consulting progress needs a nonnegative whole number of game days')
  const value = checked.value
  const summary = financeSummary(value.finance)
  if (!summary.ok) return summary
  const contract = summary.value.consulting
  if (!contract) return fail('Choose an explicit consulting contract before advancing between companies')
  const count = Math.min(days, contract.completeDay - value.game.day)
  for (let i = 0; i < count; i++) advanceInterludeWorld(value.game)
  if (value.game.day === contract.completeDay) {
    const finance = completeConsulting(value.finance, contract.companyId, contract.contractId, value.game.day)
    if (!finance.ok) return finance
    value.finance = finance.value
    logEntry(value.game, 'interlude.paid', 'Personal consulting contract completed', { contractId: contract.contractId,
      payout: contract.payout, creditedTo: 'personal-cash' })
  }
  return validateCareerSave(value)
}
