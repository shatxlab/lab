import { PRODUCT_TYPES } from './data/productTypes'
import { MILESTONES } from './data/milestones'
import { serializeCareerSave, validateCareerSave, type CareerSave } from './career-save'
import { GARAGE_DEPOSIT, MOVE_OUT_COST, OFFICE_KINDS, DAYS_PER_MONTH } from './sim/balance'
import { chapterKind } from './sim/chapters'
import { monthlyBurn } from './sim/economy'
import { NAME_MAX, you } from './sim/founding'
import { financeSummary, investInCompany, quoteFunding, type FinanceResult, type FundingCosts, type VentureAmbition } from './sim/founder-finance'
import { hire, hireCost, refreshCandidates, salaryOf } from './sim/hiring'
import { sampleNow } from './sim/history'
import { logEntry } from './sim/journal'
import { initialisePeopleManagement } from './sim/people-management'
import { projectBudget, projectTarget } from './sim/project'
import { researchTransferPreview } from './sim/research-knowledge'
import { rivalRevenue } from './sim/rivals'
import { createCompanyState } from './sim/state'
import { hostingCost } from './sim/scale'
import { toolUpkeep } from './sim/tools'
import { refreshContracts } from './sim/contracts'
import type { Employee, GameState, Office } from './sim/types'

export interface FoundingSelection {
  /** A new externally allocated identity, never a world object id or a reused company key. */
  companyId: string
  companyName: string
  ambition: VentureAmbition
  /** Planning only: never starts a project or bypasses research. */
  focus: string
  candidateIds: number[]
  investment?: number
}
export interface FoundingQuote {
  /** Full normalized source snapshot: confirmation cannot overwrite even a subtle world/staff change. */
  sourceToken: string
  selection: FoundingSelection & { investment: number }
  costs: FundingCosts
  minimum: number
  recommended: number
  available: number
  affordable: boolean
  blocker: string | null
  companyCash: number
  privateReserve: number
  /** Build allowance is not spent, but is excluded from runway. Null means no recurring burn. */
  runwayMonths: number | null
  desks: number
  vacancies: number
  staff: Employee[]
  offers: Employee[]
  buildSize: 'small' | 'medium'
}
const fail = (reason: string): FinanceResult<never> => ({ ok: false, reason })
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(id)

function carry(person: Employee, officeId: number, id: number, day: number): Employee {
  const { teamId: _teamId, title: _title, ...rest } = structuredClone(person)
  if (rest.career) {
    delete rest.career.appointment
    delete rest.career.blockedSince
    delete rest.career.concern
  }
  const result = { ...rest, id, officeId, appearanceSeed: person.appearanceSeed ?? person.id,
    training: null, readySince: null, morale: Math.max(person.morale, 75) }
  result.salary = salaryOf(result, day)
  return result
}

/** Rebuilds only company-local state. No throwaway first-run people, candidates or rivals are generated. */
function companyShell(save: CareerSave): FinanceResult<GameState> {
  const checked = validateCareerSave(save)
  if (!checked.ok) return checked
  const source = checked.value
  const state = source.game
  const summary = financeSummary(source.finance)
  if (!summary.ok) return summary
  const current = summary.value.companies[summary.value.companies.length - 1]
  if (summary.value.consulting) return fail('Finish the active consulting contract before founding a company')
  const kind = chapterKind(state)
  const me = you(state)
  if (!state.gameOver || !state.ending || !kind || !me || !current.closed) return fail('Settle the ended company before planning its successor')
  const friend = kind === 'continue' ? state.employees.find((e) => e.founder && e !== me) : undefined
  const founders = [me, ...(friend ? [friend] : [])]
  if (founders.some((p) => (p.region ?? 'us') !== 'us')) return fail('These starting footprints require US founders; no automatic relocation is included')
  const next = createCompanyState(state.rng)
  if (!Number.isSafeInteger(state.nextId) || state.nextId < 1 || state.nextId > Number.MAX_SAFE_INTEGER - 100) return fail('Invalid next world identity')
  next.nextId = state.nextId
  const cafe: Office = { id: next.nextId++, kind: 'cafe', theme: 0, region: 'us', project: null }
  next.offices = [cafe]
  next.employees = founders.map((person) => carry(person, cafe.id, next.nextId++, state.day))
  next.day = state.day
  next.lastEventDay = state.day
  next.lastOutingDay = state.day - 1000
  next.rivals = state.rivals.map((r) => {
    if (r.ratio === undefined) return structuredClone(r)
    const { ratio: _ratio, ...rest } = structuredClone(r)
    const business = Math.round(rivalRevenue(state, r))
    return { ...rest, business, businessCap: business * 2, growth: 0.2 }
  })
  next.rivalProducts = structuredClone(state.rivalProducts)
  next.absorbedNames = structuredClone(state.absorbedNames)
  next.market = structuredClone(state.market)
  // Temporary company deals do not become the successor's wages/revenue/candidate subsidies.
  next.modifiers = []
  next.milestones = [...state.milestones]
  next.journal = structuredClone(state.journal)
  next.history = structuredClone(state.history)
  next.recentEvents = structuredClone(state.recentEvents)
  const transfer = researchTransferPreview(state)
  next.research = { known: transfer.known, done: transfer.knowledge.filter((n) => n.carry === 'knowledge').map((n) => n.id), active: null }
  next.surveyed = [...transfer.audiences]
  next.reputation = Math.round(state.reputation * (kind === 'continue' ? 0.6 : 0.25))
  next.money = 0
  next.chapter = (state.chapter ?? 1) + 1
  next.chapterStartDay = state.day
  next.freshChapter = false
  next.legacy = [...structuredClone(state.legacy ?? []), {
    studio: state.studioName ?? 'Your studio', ending: state.ending.kind, worth: state.ending.worth,
    years: Math.round(((state.ending!.day - (state.chapterStartDay ?? 0)) / 360) * 10) / 10,
  }]
  // Exactly one normal local pool, shared by all presets/focus/amount previews of this source.
  refreshCandidates(next)
  return { ok: true, value: next }
}

export function foundingOffers(save: CareerSave): FinanceResult<{ founders: Employee[]; offers: Employee[] }> {
  const shell = companyShell(save)
  return shell.ok ? { ok: true, value: { founders: shell.value.employees, offers: shell.value.candidates } } : shell
}

function prepare(save: CareerSave, input: FoundingSelection): FinanceResult<{ game: GameState; selection: FoundingSelection; costs: FundingCosts }> {
  if (!input || !validId(input.companyId) || typeof input.companyName !== 'string' ||
    !input.companyName.trim() || input.companyName.trim().length > NAME_MAX ||
    !['modest', 'studio', 'venture'].includes(input.ambition) || !PRODUCT_TYPES.some((t) => t.id === input.focus) ||
    !Array.isArray(input.candidateIds) || input.candidateIds.some((id) => !Number.isSafeInteger(id) || id < 0) ||
    new Set(input.candidateIds).size !== input.candidateIds.length) return fail('Invalid founding selection')
  const summary = financeSummary(save.finance)
  if (!summary.ok) return summary
  if (summary.value.companies.some((c) => c.companyId === input.companyId)) return fail('That company identity has already been used')
  const prepared = companyShell(save)
  if (!prepared.ok) return prepared
  const game = prepared.value
  const selection: FoundingSelection = { companyId: input.companyId, companyName: input.companyName.trim(), ambition: input.ambition,
    focus: input.focus, candidateIds: [...input.candidateIds].sort((a, b) => a - b), ...(input.investment === undefined ? {} : { investment: input.investment }) }
  const office = game.offices[0]
  office.kind = selection.ambition === 'modest' ? 'cafe' : selection.ambition === 'studio' ? 'garage' : 'office'
  game.stage = selection.ambition === 'modest' ? 0 : 1 // Still needs a real signature hit; no free product-market fit.
  game.studioName = selection.companyName
  game.founding = { ambition: selection.ambition, focus: selection.focus, excludedMilestones: [] }
  if (office.kind === 'office') {
    // Pre-hit product discovery must remain usable; floor Operations only begin after a real hit.
    initialisePeopleManagement(game)
    for (const person of game.employees) person.salary = salaryOf(person, game.day)
  }
  const candidates = selection.candidateIds.map((id) => game.candidates.find((c) => c.id === id))
  if (candidates.some((c) => !c || (c.region ?? 'us') !== 'us')) return fail('Select actual current US offers; missing or foreign candidates cannot be hired')
  if (game.employees.length + candidates.length > OFFICE_KINDS[office.kind].desks) return fail('The selected footprint has no desk for every selected person')
  const signing = candidates.reduce((sum, c) => sum + hireCost(c!), 0)
  // Temporary cost-only staging balance, replaced by the actual investment before a state can be returned/saved.
  game.money = signing
  for (const id of selection.candidateIds) {
    const hired = hire(game, id, office.id)
    if (!hired.ok) return hired
  }
  if (selection.ambition === 'modest' && !game.employees.some((e) => e.role === 'developer')) return fail('A modest start needs the returning developer or an ordinary paid developer offer')
  if (selection.ambition === 'studio' && !['designer', 'developer', 'tester'].every((role) => game.employees.some((e) => e.role === role))) return fail('A studio start needs selected local design, engineering and QA staff')
  const setup = office.kind === 'cafe' ? 0 : GARAGE_DEPOSIT + (office.kind === 'office' ? MOVE_OUT_COST : 0)
  const buildAllowance = projectBudget(projectTarget(selection.focus, [], 'new', selection.ambition === 'venture' ? 'medium' : 'small'))
  const costs = { setup, signing, buildAllowance, monthlyBurn: monthlyBurn(game) + DAYS_PER_MONTH * (hostingCost(game) + toolUpkeep(game)) }
  return { ok: true, value: { game, selection, costs } }
}

/** No mutations, live RNG use, purchases or rerolls. An unaffordable choice still returns its exact blocker/quote. */
export function quoteFounding(save: CareerSave, selection: FoundingSelection): FinanceResult<FoundingQuote> {
  const checked = validateCareerSave(save)
  if (!checked.ok) return checked
  const source = checked.value
  const prepared = prepare(source, selection)
  if (!prepared.ok) return prepared
  const { game, costs } = prepared.value
  const funding = quoteFunding(selection.ambition, costs)
  if (!funding.ok) return funding
  const summary = financeSummary(source.finance)
  if (!summary.ok) return summary
  const available = summary.value.liquid
  const amount = selection.investment ?? funding.value.recommended
  if (!Number.isSafeInteger(amount) || amount <= 0) return fail('Investment must be a positive whole-dollar amount')
  const blocker = amount < funding.value.minimum ? 'Investment is below the minimum setup, build and three-month reserve'
    : amount > available ? 'Investment exceeds available personal cash; choose an affordable custom amount or consulting' : null
  const sourceToken = serializeCareerSave(source)
  if (!sourceToken.ok) return sourceToken
  const companyCash = amount - costs.setup - costs.signing
  return { ok: true, value: {
    sourceToken: sourceToken.value, selection: { ...prepared.value.selection, investment: amount }, costs,
    ...funding.value, available, affordable: blocker === null, blocker, companyCash, privateReserve: available - amount,
    runwayMonths: costs.monthlyBurn === 0 ? null : Math.max(0, companyCash - costs.buildAllowance) / costs.monthlyBurn,
    desks: OFFICE_KINDS[game.offices[0].kind].desks, vacancies: OFFICE_KINDS[game.offices[0].kind].desks - game.employees.length,
    staff: structuredClone(game.employees), offers: structuredClone(game.candidates),
    buildSize: selection.ambition === 'venture' ? 'medium' : 'small',
  } }
}

/** Recompute every quote component; no trusted cost, candidate or cash values are accepted from a preview. */
export function foundPaidCompany(save: CareerSave, quote: FoundingQuote): FinanceResult<CareerSave> {
  const fresh = quoteFounding(save, quote.selection)
  if (!fresh.ok) return fresh
  if (JSON.stringify(fresh.value) !== JSON.stringify(quote)) return fail('This founding quote changed; review a fresh preview')
  if (!fresh.value.affordable) return fail(fresh.value.blocker!)
  const prepared = prepare(save, quote.selection)
  if (!prepared.ok) return prepared
  const { game } = prepared.value
  const founders = game.employees.filter((e) => e.founder).length
  if (founders !== 1 && founders !== 2) return fail('Founding requires one or two actual returning founders')
  const finance = investInCompany(save.finance, quote.selection.companyId, game.day, founders, quote.selection.ambition, quote.selection.investment, fresh.value.costs)
  if (!finance.ok) return finance
  game.money = fresh.value.companyCash
  game.founding = { ambition: quote.selection.ambition, focus: quote.selection.focus, excludedMilestones: [] }
  // Buying a footprint, paying hires or transferring cash does not earn milestone bonuses.
  game.founding.excludedMilestones = MILESTONES.filter((m) => !game.milestones.includes(m.id) && m.check(game)).map((m) => m.id)
  refreshContracts(game)
  game.history.push(sampleNow(game))
  logEntry(game, 'chapter.founded', `Founded ${game.studioName} with personal investment`, {
    companyId: quote.selection.companyId, ambition: quote.selection.ambition, investment: quote.selection.investment,
    setup: quote.costs.setup, signing: quote.costs.signing, focus: quote.selection.focus,
  })
  return validateCareerSave({ version: save.version, game, finance: finance.value,
    charter: { companyId: quote.selection.companyId, ambition: quote.selection.ambition, fulfilledDay: null } })
}
