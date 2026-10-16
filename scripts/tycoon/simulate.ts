// Headless balance check: `node scripts/simulate.ts [years] [seeds] [only]`
// `only` keeps just the policies whose name contains it, e.g. `all-round`, and adds when each stage was reached.
// Plays bot strategies against the sim and prints how each one fares.

import process from 'node:process'

import { expectedFeatures } from '../../src/lib/tycoon/data/eras.ts'
import { FEATURES } from '../../src/lib/tycoon/data/features.ts'
import { getProductType } from '../../src/lib/tycoon/data/productTypes.ts'
import { RESEARCH } from '../../src/lib/tycoon/data/research.ts'
import { getStage } from '../../src/lib/tycoon/data/stages.ts'
import { DAYS_PER_MONTH, MOVE_OUT_COST } from '../../src/lib/tycoon/sim/balance.ts'
import { promote, promotionBlocker as careerBlocker } from '../../src/lib/tycoon/sim/careers.ts'
import { acceptContract, contractBlocker } from '../../src/lib/tycoon/sim/contracts.ts'
import { dailyIncome, monthlyBurn } from '../../src/lib/tycoon/sim/economy.ts'
import { describePendingEvent, resolveRandomEvent } from '../../src/lib/tycoon/sim/events.ts'
import { availableFixers, onCallUnlocked, setOnCall, startFix } from '../../src/lib/tycoon/sim/fixes.ts'
import { hire, hireCost, ROLE_DISCIPLINE } from '../../src/lib/tycoon/sim/hiring.ts'
import { campaignCost, promoteProduct, promotionBlocker, promotionCost, updateBlocker } from '../../src/lib/tycoon/sim/lifecycle.ts'
import { marketDemand } from '../../src/lib/tycoon/sim/market.ts'
import { freeDesks, moveOut, moveOutBlocker, newOfficeCost, openOffice, openOfficeBlocker, staffOf } from '../../src/lib/tycoon/sim/offices.ts'
import { bugFactor, interest, marketWeights, missingFeatures, productRevenue } from '../../src/lib/tycoon/sim/products.ts'
import { projectQuality, projectTarget, shipProject, startProject, startUpdate, unlockedProductTypes } from '../../src/lib/tycoon/sim/project.ts'
import { researchBlocker, startResearch } from '../../src/lib/tycoon/sim/research.ts'
import { acquire, acquisitionBlocker, acquisitionPrice, playerRank } from '../../src/lib/tycoon/sim/rivals.ts'
import { createInitialState } from '../../src/lib/tycoon/sim/state.ts'
import { advanceDay, drainEvents } from '../../src/lib/tycoon/sim/tick.ts'
import { featureLock, sizeLock } from '../../src/lib/tycoon/sim/unlocks.ts'
import { estimateDays } from '../../src/lib/tycoon/sim/work.ts'
import { DISCIPLINES, PROJECT_SIZE_IDS, type GameState, type Office, type ProjectSize, type Tier } from '../../src/lib/tycoon/sim/types.ts'

interface Policy {
  name: string
  /** Features per project; null means the bot never starts anything. */
  featureCount: number | null
  /** Hire, move out of the garage and open offices when it can afford to. */
  expand: boolean
  /** Which available choice to take in random events; default is the first (usually the paid fix). */
  events?: 'first' | 'last'
  /** Spend spare cash on the cheapest available research. */
  research?: boolean
  /** Use promotions and launch campaigns. */
  lifecycle?: boolean
  /** Look after live products: fix bugs and update stale ones before starting anything new. */
  maintain?: boolean
  /** Take client work while cash is short. */
  contracts?: boolean
  /** Pick rich, uncrowded markets and the features users expect, instead of the newest type. */
  smart?: boolean
  /** Promote people as soon as they are ready (on by default). */
  careers?: boolean
  /** Buy rival studios with spare money once it can. */
  buyout?: boolean
  /** Always build this size; by default the biggest one whose wages the bank covers comfortably. */
  size?: ProjectSize
}

const POLICIES: Policy[] = [
  { name: 'idle', featureCount: null, expand: false },
  { name: 'two-features', featureCount: 2, expand: true },
  { name: 'small-only', featureCount: 2, expand: true, size: 'small' },
  { name: 'maintainer', featureCount: 2, expand: true, maintain: true },
  { name: 'contractor', featureCount: 2, expand: true, maintain: true, contracts: true },
  { name: 'smart', featureCount: 2, expand: true, maintain: true, contracts: true, smart: true },
  { name: 'all-round', featureCount: 2, expand: true, research: true, lifecycle: true, maintain: true, contracts: true, smart: true },
  { name: 'tycoon', featureCount: 2, expand: true, research: true, lifecycle: true, maintain: true, contracts: true, smart: true, buyout: true },
  { name: 'no-careers', featureCount: 2, expand: true, research: true, lifecycle: true, maintain: true, contracts: true, smart: true, careers: false },
  { name: 'decline-events', featureCount: 2, expand: true, maintain: true, contracts: true, smart: true, events: 'last' },
]

const valuePerCost = (f: (typeof FEATURES)[number]) => f.value / (f.cost.engineering + f.cost.design + f.cost.qa)

function chooseFeatures(state: GameState, typeId: string, count: number, smart: boolean): string[] {
  const open = FEATURES.filter((f) => f.suits.includes(typeId) && featureLock(state, f) === null)
  const expected = smart ? expectedFeatures(typeId, state.day).filter((id) => open.some((f) => f.id === id)) : []
  const rest = open.filter((f) => !expected.includes(f.id)).sort((a, b) => valuePerCost(b) - valuePerCost(a))
  return [...expected, ...rest.map((f) => f.id)].slice(0, Math.max(count, expected.length))
}

/** The newest type, or for a smart bot the market with the most money in it for a newcomer. */
function chooseType(state: GameState, smart: boolean): string {
  const types = unlockedProductTypes(state)
  if (!smart) return types[types.length - 1].id
  const weights = marketWeights(state)
  const score = (id: string) => {
    const type = getProductType(id)
    return (type.audience * type.revenuePerUser * marketDemand(state, id)) / (1 + (weights.get(id) ?? 0))
  }
  return types.map((t) => t.id).sort((a, b) => score(b) - score(a))[0]
}

function officeWeakness(state: GameState, office: Office) {
  const totals = { design: 0, engineering: 0, qa: 0 }
  for (const e of staffOf(state, office)) for (const d of DISCIPLINES) totals[d] += e.skills[d]
  return DISCIPLINES.reduce((weakest, d) => (totals[d] < totals[weakest] ? d : weakest))
}

function answerEvent(state: GameState, policy: Policy): void {
  const view = describePendingEvent(state)
  if (!view) return
  const open = view.choices.map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0)
  if (open.length === 0) return
  resolveRandomEvent(state, policy.events === 'last' ? open[open.length - 1] : open[0])
}

/** The biggest open size whose wage bill until launch is at most this share of the bank balance. */
const SIZE_BUDGET = 0.4

function chooseSize(state: GameState, office: Office, typeId: string, features: string[], policy: Policy): ProjectSize {
  if (policy.size) return policy.size
  const perDay = monthlyBurn(state) / DAYS_PER_MONTH
  const open = PROJECT_SIZE_IDS.filter(
    (size) =>
      sizeLock(state, size, office) === null &&
      estimateDays(state, projectTarget(typeId, features, 'new', size), office) * perDay <= state.money * SIZE_BUDGET,
  )
  return open[open.length - 1] ?? 'small'
}

/** The biggest launch campaign whose price is a small part of the bank balance, if any. */
function chooseCampaign(state: GameState, office: Office): Tier | undefined {
  const project = office.project
  if (!project || project.kind !== 'new') return undefined
  const quality = projectQuality(state, project)
  const options: Tier[] = ['large', 'medium', 'small']
  return options.find((tier) => campaignCost(state, project, quality, tier) * 8 < state.money)
}

/** Products worth looking after: they earn a fair share of the income. */
const worthKeeping = (state: GameState) => {
  const income = dailyIncome(state)
  return state.products.filter((p) => productRevenue(p) > 20 && productRevenue(p) > income * 0.04).sort((a, b) => productRevenue(b) - productRevenue(a))
}

/** Sends a developer and a tester after the bugs of products worth keeping; once Incident management is done, keeps a pair on call. */
function dispatchFixers(state: GameState): void {
  const best = (role: 'developer' | 'tester') => availableFixers(state, role).sort((a, b) => b.skills[role === 'developer' ? 'engineering' : 'qa'] - a.skills[role === 'developer' ? 'engineering' : 'qa'])[0]
  if (onCallUnlocked(state) && !state.onCall) {
    const [developer, tester] = [best('developer'), best('tester')]
    if (developer && tester) setOnCall(state, developer.id, tester.id)
  }
  for (const product of worthKeeping(state)) {
    if (bugFactor(product) >= 0.8) continue
    const [developer, tester] = [best('developer'), best('tester')]
    if (developer && tester) startFix(state, product.id, developer.id, tester.id)
  }
}

/** Updates a product that needs it, otherwise returns false so something new is started. Fixing goes on beside it. */
function tryMaintain(state: GameState, office: Office, smart: boolean): boolean {
  dispatchFixers(state)
  for (const product of worthKeeping(state)) {
    const missing = missingFeatures(product, state.day).filter((id) => featureLock(state, FEATURES.find((f) => f.id === id)!) === null)
    const behind = smart && missing.length > 0
    if ((interest(product, state.day) < 0.8 || behind) && updateBlocker(state, office, product) === null) {
      const extra = FEATURES.filter((f) => f.suits.includes(product.productTypeId) && featureLock(state, f) === null && !product.featureIds.includes(f.id))
        .sort((a, b) => valuePerCost(b) - valuePerCost(a))
        .map((f) => f.id)
        .filter((id) => !missing.includes(id))
      if (startUpdate(state, product.id, [...missing, ...extra].slice(0, 2), office.id).ok) return true
    }
  }
  return false
}

/** The best-paying job this office can finish in time, while money is short. */
function tryContract(state: GameState, office: Office): boolean {
  if (state.money > 4 * monthlyBurn(state) || contractBlocker(state, office)) return false
  const doable = state.contracts
    .map((offer) => ({ offer, days: estimateDays(state, offer.target, office) }))
    .filter(({ offer, days }) => days <= offer.days)
    .sort((a, b) => b.offer.pay / b.days - a.offer.pay / a.days)[0]
  return doable ? acceptContract(state, doable.offer.id, office.id).ok : false
}

/** Promotes the best earner at a tier that is cheap next to the bank balance. */
function promoteBest(state: GameState): void {
  const best = [...state.products].sort((a, b) => productRevenue(b) - productRevenue(a))[0]
  if (!best || productRevenue(best) < 80) return
  const tiers: Tier[] = ['large', 'medium', 'small']
  const tier = tiers.find((t) => promotionBlocker(state, best, t) === null && promotionCost(best, t) * 6 < state.money)
  if (tier) promoteProduct(state, best.id, tier)
}

function botStep(state: GameState, policy: Policy, firstHit: { day: number | null }): void {
  if (state.pendingEvent) answerEvent(state, policy)
  for (const event of drainEvents(state)) {
    if (event.type === 'projectReady') {
      const office = state.offices.find((o) => o.id === event.officeId)
      if (office) shipProject(state, policy.lifecycle ? chooseCampaign(state, office) : undefined, office.id)
    }
  }
  if (firstHit.day === null && state.signatureId !== null) firstHit.day = state.day
  if (policy.lifecycle) promoteBest(state)
  if (policy.careers !== false) for (const e of state.employees) if (careerBlocker(state, e) === null) promote(state, e.id)

  for (const office of state.offices) {
    if (policy.featureCount === null || office.project || staffOf(state, office).length === 0) continue
    if (policy.contracts && tryContract(state, office)) continue
    if (policy.maintain && tryMaintain(state, office, policy.smart ?? false)) continue
    const type = chooseType(state, policy.smart ?? false)
    const features = chooseFeatures(state, type, policy.featureCount, policy.smart ?? false)
    startProject(state, type, features, chooseSize(state, office, type, features, policy), office.id)
  }

  if (policy.research && !state.research.active) {
    const reserve = 6 * monthlyBurn(state)
    const next = RESEARCH.filter((n) => researchBlocker(state, n) === null && state.money > n.cost + reserve).sort((a, b) => a.cost - b.cost)[0]
    if (next) startResearch(state, next.id)
  }
  if (!policy.expand) return

  const reserve = 4 * monthlyBurn(state)
  if (policy.buyout) {
    const target = state.rivals.find((r) => acquisitionBlocker(state, r) === null && state.money > acquisitionPrice(state, r) + reserve * 3)
    if (target) acquire(state, target.id)
  }
  if (moveOutBlocker(state) === null && state.money > MOVE_OUT_COST + reserve) moveOut(state)
  const nearlyFull = state.offices.every((o) => o.kind === 'office' && freeDesks(state, o) <= 2)
  if (nearlyFull && openOfficeBlocker(state) === null && state.money > newOfficeCost(state) + reserve) openOffice(state)
  for (const office of state.offices) {
    if (freeDesks(state, office) <= 0) continue
    const weakest = officeWeakness(state, office)
    const pick = state.candidates.find((c) => ROLE_DISCIPLINE[c.role] === weakest)
    if (pick && state.money > hireCost(pick) + reserve) hire(state, pick.id, office.id)
  }
}

interface Outcome {
  bankrupt: boolean
  money: number
  reputation: number
  stage: number
  rank: number
  offices: number
  staff: number
  income: number
  shipped: number
  /** The day of the first breakout hit, if there was one. */
  firstHit: number | null
  /** The day each stage was reached. */
  stageDays: number[]
}

function play(policy: Policy, seed: number, years: number): Outcome {
  const state = createInitialState(seed)
  const days = years * 12 * DAYS_PER_MONTH
  const firstHit = { day: null as number | null }
  const stageDays: number[] = [0]
  for (let i = 0; i < days && !state.gameOver; i++) {
    botStep(state, policy, firstHit)
    const stage = state.stage
    advanceDay(state)
    if (state.stage > stage) stageDays[state.stage] = state.day
  }
  return {
    bankrupt: state.gameOver,
    money: state.money,
    reputation: state.reputation,
    stage: state.stage,
    rank: playerRank(state),
    offices: state.offices.length,
    staff: state.employees.length,
    income: dailyIncome(state),
    shipped: state.shippedCount,
    firstHit: firstHit.day,
    stageDays,
  }
}

const years = Number(process.argv[2] ?? 5)
const seedCount = Number(process.argv[3] ?? 20)
const only = process.argv[4]
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN
}
const yearsOf = (day: number) => (day / (12 * DAYS_PER_MONTH)).toFixed(1)

console.log(`${seedCount} seeds × ${years} years\n`)
console.log(
  'policy'.padEnd(16),
  'bankrupt'.padStart(9),
  'med money'.padStart(11),
  'rep'.padStart(5),
  'stage'.padStart(22),
  'rank'.padStart(5),
  'offices'.padStart(8),
  'staff'.padStart(6),
  'income/day'.padStart(11),
  'shipped'.padStart(8),
  '1st hit (y)'.padStart(12),
)
for (const policy of POLICIES.filter((p) => !only || p.name.includes(only))) {
  const outcomes = Array.from({ length: seedCount }, (_, i) => play(policy, i + 1, years))
  const hits = outcomes.map((o) => o.firstHit).filter((d): d is number => d !== null)
  console.log(
    policy.name.padEnd(16),
    `${outcomes.filter((o) => o.bankrupt).length}/${seedCount}`.padStart(9),
    fmt(median(outcomes.map((o) => o.money))).padStart(11),
    fmt(median(outcomes.map((o) => o.reputation))).padStart(5),
    getStage(median(outcomes.map((o) => o.stage))).name.padStart(22),
    `#${median(outcomes.map((o) => o.rank))}`.padStart(5),
    fmt(median(outcomes.map((o) => o.offices))).padStart(8),
    fmt(median(outcomes.map((o) => o.staff))).padStart(6),
    fmt(median(outcomes.map((o) => o.income))).padStart(11),
    fmt(median(outcomes.map((o) => o.shipped))).padStart(8),
    `${hits.length ? yearsOf(median(hits)) : '-'} (${hits.length})`.padStart(12),
  )
  if (only) {
    // Detail for the chosen policies: when each stage was reached, across the seeds.
    for (let s = 1; s < 6; s++) {
      const reached = outcomes.map((o) => o.stageDays[s]).filter((d) => d !== undefined)
      if (reached.length) console.log(`  ${getStage(s).name.padEnd(22)} reached by ${reached.length}/${seedCount}, median year ${yearsOf(median(reached))}`)
    }
  }
}
