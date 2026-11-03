import { businessSnapshot, recordBusinessDecision } from './business-history'
import { audienceFor } from '@/lib/tycoon/data/audiences'
import { getDeepWork } from '@/lib/tycoon/data/deepwork'
import { FEATURES, getFeature } from '@/lib/tycoon/data/features'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import { COMPLIANCE_FEATURE } from '@/lib/tycoon/data/regions'
import { ALL_ITEMS, effectText, getWorkItem } from '@/lib/tycoon/data/workstreams'
import { formatMoney } from '@/lib/tycoon/format'
import {
  CLARITY_ANALYST,
  CLARITY_BASE,
  CLARITY_EXTRA_ANALYST,
  CLARITY_NO_PM_CAP,
  CLARITY_PM,
  CLARITY_PM_PRESENT,
  NEMESIS_STRIKE_SETBACK,
  PLAN_RESEARCH_CLARITY,
  PLAN_RESEARCH_DAYS,
  POLISH_BUG_RISK,
  POLISH_FIX_SHARE,
  RELEASE_FLOOR_WORK,
  RELEASE_MIN_DAYS,
  SPEC_BUGS,
  SPEC_PROPOSALS,
  SPEC_REWORK,
} from './balance'
import { deepChanceOf, deepWorkBlocker, startDeepWork } from './deepwork'
import { isAnalyst } from './insight'
import { activeProjects, helpersOf, hitFloors, inGarage, productInWork, staffOf, teamOf } from './offices'
import { budgetBlocker, clarityReach, estimateUpdateFit, estimateUpdateReach, euGain, projectBudget, projectTarget, startLocalisation, startUpdate } from './project'
import { missingFeatures } from './products'
import { rand } from './rng'
import { LOVED_AT, SHRUGGED_AT } from './scoring'
import { nemesisRival, strikeBack, strikeBackBlocker, strikeBackCost } from './nemesis'
import { itemBlocker, stepBlocker } from './roadmap'
import { loadOf } from './scale'
import { estimateDaysAt, teamRate } from './work'
import { nextVersion } from './releases'
import { featureLock } from './unlocks'
import { DISCIPLINES, emptySkills, fail, OK, type Bump, type GameState, type Office, type Product, type Proposal, type Result, type Skills } from './types'

/**
 * The hit's release cycle, one turn at a time. The clock stops on a plan: a few cards, each saying what it does and what it
 * costs. The player picks one, the whole company builds it, and the release shows what it did. Nothing here runs on a timer,
 * and nothing is picked for the player; the analysts only research more when the player sends them back to the numbers.
 */

/** The people on a floor who read the product: its analysts and its product manager. */
export function readers(state: GameState, office: Office) {
  return staffOf(state, office).filter((e) => isAnalyst(e) && !e.training && e.title !== 'CEO')
}

/** How clear the floor's specs are, 0..100: the sharpest analyst, the product manager, and a second pair of eyes. */
export function clarityOf(state: GameState, office: Office): number {
  const people = readers(state, office)
  if (people.length === 0) return 0
  const pm = people.find((e) => e.role === 'pm')
  const best = Math.max(...people.map((e) => e.analysis ?? 0))
  const clarity =
    CLARITY_BASE + CLARITY_ANALYST * best + (pm ? CLARITY_PM_PRESENT + CLARITY_PM * (pm.analysis ?? 0) : 0) + CLARITY_EXTRA_ANALYST * Math.min(2, people.length - 1)
  return Math.round(Math.max(5, Math.min(pm ? 100 : CLARITY_NO_PM_CAP, clarity)))
}

/** How clear the company's plans are: its sharpest floor's. */
export const companyClarity = (state: GameState): number => Math.max(0, ...hitFloors(state).map((office) => clarityOf(state, office)))

/** True when somebody in the company can research a plan further. */
export const canResearch = (state: GameState): boolean => hitFloors(state).some((office) => readers(state, office).length > 0)

/** What a requirement is called, and how much of the version number it moves. */
export function describeProposal(proposal: Proposal): { title: string; bump: Bump; blurb: string } {
  switch (proposal.kind) {
    case 'feature': {
      return { title: getFeature(proposal.id).name, bump: 'minor', blurb: 'A feature users can see' }
    }
    case 'item': {
      const item = getWorkItem(proposal.id)!
      return { title: item.name, bump: item.work >= 3 || item.companionId ? 'major' : 'minor', blurb: item.blurb }
    }
    case 'polish':
      return { title: 'Stability', bump: 'patch', blurb: 'Most open bugs fixed, fewer new ones' }
    case 'compliance':
      return { title: "Europe's data rules", bump: 'minor', blurb: "Adds what Europe's data rules ask for" }
    case 'localise':
      return { title: 'Europe', bump: 'major', blurb: 'Opens the product to European users' }
    case 'deep': {
      const kind = getDeepWork(proposal.id)
      return { title: kind?.name ?? 'Deep work', bump: 'patch', blurb: kind?.blurb ?? '' }
    }
    case 'strike':
      return { title: 'Strike back', bump: 'patch', blurb: 'A campaign aimed at their customers' }
  }
}

/** From this load on, a plan always offers more servers (if there are any to build). */
const OUTAGE_WARNING = 0.85

interface Candidate extends Proposal {
  weight: number
  /** Candidates of one group are not all proposed together: a spec offers a spread. */
  group: string
}

/** Everything the floor could propose, weighted by what the product's own numbers say it needs. */
function candidates(state: GameState, product: Product): Candidate[] {
  const out: Candidate[] = []
  const type = getProductType(product.productTypeId)
  const likes = audienceFor(product.productTypeId, product.audienceId).likes
  const expected = new Set(missingFeatures(product, state.day))
  for (const feature of FEATURES) {
    if (!feature.suits.includes(product.productTypeId) || product.featureIds.includes(feature.id) || featureLock(state, feature) !== null) continue
    const love = likes[feature.id] ?? 1
    const wanted = expected.has(feature.id)
    const weight = wanted ? 5 : love >= LOVED_AT ? 3 : love <= SHRUGGED_AT ? 0.2 : 0.7 + 0.2 * feature.value
    const why = wanted ? `Users now expect ${feature.name}; without it they leave` : love >= LOVED_AT ? `${type.userNoun} keep asking for ${feature.name}` : `${feature.name} would suit it`
    out.push({ kind: 'feature', id: feature.id, why, weight, group: 'feature' })
  }
  const load = loadOf(product)
  const busy = new Set(activeProjects(state).flatMap(({ project }) => (project.itemId ? [project.itemId] : [])))
  for (const item of ALL_ITEMS) {
    if (busy.has(item.id) || itemBlocker(state, product, item) !== null) continue
    let weight = 1
    let why = item.blurb
    switch (item.workstream) {
      case 'scale':
        weight = load >= 0.92 ? 9 : load >= 0.75 ? 4 : load >= 0.5 ? 1 : 0.1
        why = load >= 0.5 ? `The servers are ${Math.round(load * 100)}% full` : 'The servers have room for now'
        break
      case 'quality':
        weight = product.bugs >= 20 ? 3 : product.bugs >= 5 ? 1.5 : 0.5
        why = product.bugs >= 5 ? `${Math.round(product.bugs)} open bugs and users notice` : 'It would make the product steadier'
        break
      case 'growth':
        weight = (product.fit ?? 0) >= 70 ? 1.8 : 0.6
        why = (product.fit ?? 0) >= 70 ? 'Users who try it stay: now is the time to reach more of them' : 'Better to fix the product before pushing it'
        break
      case 'monetisation':
        weight = 1.5
        why = 'Each user could be worth more'
        break
      case 'europe':
        weight = 2
        why = 'Europe is open to us'
        break
      case 'companions':
        weight = 1.2
        why = 'A companion product would make this one bigger'
        break
      case 'tools':
        weight = 0.8
        why = 'The team would work better with it'
        break
    }
    out.push({ kind: 'item', id: item.id, why, weight, group: item.workstream })
  }
  out.push({ kind: 'polish', id: 'polish', why: product.bugs >= 5 ? `${Math.round(product.bugs)} open bugs` : 'Little to fix, but it keeps users', weight: product.bugs >= 20 ? 3 : product.bugs >= 5 ? 1.5 : 0.3, group: 'quality' })
  for (const step of ['compliance', 'localise'] as const) {
    if (stepBlocker(state, product, step) === null) out.push({ kind: step, id: step, why: step === 'compliance' ? "Europe asks for its data rules first" : 'Europe is ready for us', weight: 2.5, group: 'europe' })
  }
  return out
}

/**
 * The requirements the floor proposes: a weighted pick that spreads over kinds of work. The less clear the floor's reading of
 * the product, the more its picks drift from what the numbers say.
 */
export function propose(state: GameState, product: Product, clarity: number): Proposal[] {
  const noisy = candidates(state, product)
    .map((c) => ({ c, score: Math.max(0.05, c.weight * (1 + (1 - clarity / 100) * 3 * (rand(state) - 0.5))) }))
    .sort((a, b) => b.score - a.score)
  const chosen: Candidate[] = []
  const used = new Map<string, number>()
  // The best feature always gets a place: what a product of this kind should do next is the heart of a spec.
  const feature = noisy.find(({ c }) => c.kind === 'feature')
  if (feature) {
    chosen.push(feature.c)
    used.set('feature', 1)
  }
  for (const { c } of noisy) {
    if (chosen.length >= SPEC_PROPOSALS) break
    if ((used.get(c.group) ?? 0) >= (c.group === 'feature' ? 2 : 1) || chosen.includes(c)) continue
    chosen.push(c)
    used.set(c.group, (used.get(c.group) ?? 0) + 1)
  }
  for (const { c } of noisy) if (chosen.length < SPEC_PROPOSALS && !chosen.includes(c)) chosen.push(c)
  // Servers about to fall over are never left to chance: there is always a way to act on it.
  const scale = noisy.find(({ c }) => c.group === 'scale')
  if (scale && loadOf(product) >= OUTAGE_WARNING && !chosen.includes(scale.c)) chosen[chosen.length - 1] = scale.c
  return chosen.map(({ kind, id, why }) => ({ kind, id, why }))
}

/** The card for your own hands: hitting back when the rival is ahead and you can, or else the deep work the product needs most. */
function ownCard(state: GameState, product: Product): Proposal | undefined {
  const rival = nemesisRival(state)
  if (rival && (rival.ratio ?? 0) >= 1 && strikeBackBlocker(state) === null) return { kind: 'strike', id: 'strike', why: `${rival.name} is ahead of you` }
  return deepCard(state, product)
}

function deepCard(state: GameState, product: Product): Proposal | undefined {
  const rival = nemesisRival(state)
  const wanted: [string, string][] = [
    ...(product.bugs >= 20 ? [['rewrite', `${Math.round(product.bugs)} open bugs: the core is showing its age`] as [string, string]] : []),
    ...(rival ? [['study', `Find what ${rival.name} cannot do`] as [string, string]] : []),
    ['signature', 'Give people one thing to remember it by'],
    ['story', 'Tell people why it exists'],
  ]
  const free = wanted.filter(([id]) => deepWorkBlocker(state, id) === null)
  if (free.length === 0) return undefined
  // Not the same piece twice running, when there is another.
  const [id, why] = free.find(([id]) => id !== state.lastDeepWork) ?? free[0]
  return { kind: 'deep', id, why }
}

function deal(state: GameState, product: Product, clarity: number): Proposal[] {
  const own = ownCard(state, product)
  return [...propose(state, product, clarity), ...(own ? [own] : [])]
}

/** The hit, if the company is in the release cycle: out of the garage, with a floor to work on it. */
export function cycleProduct(state: GameState): Product | undefined {
  if (inGarage(state) || hitFloors(state).length === 0) return undefined
  return state.products.find((p) => p.id === state.signatureId)
}

/** True when the clock has to wait for the player. */
export const awaitingChoice = (state: GameState): boolean => state.plan !== undefined && state.plan.researchUntil === undefined

/** Puts the next plan on the table once the company is free, and deals new cards when the analysts come back. */
export function planDay(state: GameState): void {
  const product = cycleProduct(state)
  if (!product) {
    delete state.plan
    return
  }
  const plan = state.plan
  if (plan) {
    if (plan.researchUntil !== undefined && state.day >= plan.researchUntil) {
      delete plan.researchUntil
      plan.cards = deal(state, product, plan.clarity)
    }
    return
  }
  if (state.deepWork || productInWork(state, product.id)) return
  const clarity = companyClarity(state)
  state.plan = { clarity, cards: deal(state, product, clarity) }
}

/** Skills a release's build asks for: bigger when vague, bigger for a bigger company, and never done in a blink. */
function releaseTarget(state: GameState, lead: Office, product: Product, proposal: Proposal, clarity: number): Skills {
  const base = releaseScope(product, proposal, clarity)
  const units = proposal.kind === 'item' ? (getWorkItem(proposal.id)?.work ?? 1) : 1
  const floors = 1 + helpersOf(state, lead).length
  const rate = crewRate(state, lead, product)
  const target = emptySkills()
  for (const d of DISCIPLINES) target[d] = base[d] > 0 ? Math.max(base[d] * (1 + RELEASE_FLOOR_WORK * (floors - 1)), rate[d] * RELEASE_MIN_DAYS * Math.min(2, units)) : 0
  return target
}

/** What a card really adds to the product, whoever builds it: its work and, if the plan is vague, the rework. */
function releaseScope(product: Product, proposal: Proposal, clarity: number): Skills {
  const features = proposal.kind === 'feature' ? [proposal.id] : proposal.kind === 'compliance' ? [COMPLIANCE_FEATURE] : []
  const scope = projectTarget(product.productTypeId, features, 'update', product.size)
  const item = proposal.kind === 'item' ? getWorkItem(proposal.id) : undefined
  for (const d of DISCIPLINES) scope[d] *= (item?.work ?? 1) * (1 + (1 - clarity / 100) * SPEC_REWORK)
  return scope
}

/** What the whole company adds to the hit in a day, the lead floor and those lending a hand. */
function crewRate(state: GameState, lead: Office, product: Product): Skills {
  const subject = { typeId: product.productTypeId, productId: product.id }
  const rate = emptySkills()
  for (const floor of [lead, ...helpersOf(state, lead)]) {
    const mine = teamRate(state, floor, subject)
    for (const d of DISCIPLINES) rate[d] += mine[d]
  }
  return rate
}

/** Days left on a team release, at what the whole company adds in a day. */
export function buildDaysLeft(state: GameState, office: Office, product: Product): number {
  const project = office.project
  if (!project) return 0
  const left = emptySkills()
  for (const d of DISCIPLINES) left[d] = Math.max(0, project.target[d] - project.progress[d])
  return estimateDaysAt(left, crewRate(state, office, product))
}

const leadFloor = (state: GameState): Office | undefined => hitFloors(state).find((o) => !o.project)

/** Starts the build for a card; the plan's clarity makes it bigger and buggier the vaguer it was. */
function startBuild(state: GameState, office: Office, product: Product, proposal: Proposal, clarity: number): Result {
  const { title, bump } = describeProposal(proposal)
  const target = releaseTarget(state, office, product, proposal, clarity)
  let result: Result
  switch (proposal.kind) {
    case 'feature':
      result = startUpdate(state, product.id, [proposal.id], office.id, false, true)
      break
    case 'compliance':
      result = startUpdate(state, product.id, [COMPLIANCE_FEATURE], office.id, false, true)
      break
    case 'localise':
      result = startLocalisation(state, product.id, office.id, true)
      break
    default:
      result = startUpdate(state, product.id, [], office.id, false, true)
  }
  const project = office.project
  if (!result.ok || !project) return result
  project.byTeam = true
  project.target = target
  project.scope = DISCIPLINES.reduce((sum, d) => sum + releaseScope(product, proposal, clarity)[d], 0)
  if (proposal.kind === 'polish') {
    project.polishes = true
    project.bugRisk *= POLISH_BUG_RISK
  }
  if (proposal.kind === 'item') project.itemId = proposal.id
  project.bugRisk *= 1 + (1 - clarity / 100) * SPEC_BUGS
  project.spec = { title, bump, clarity, promise: releaseEffect(state, office, product, proposal, clarity) }
  project.name = `${product.name} ${nextVersion(product, bump)}: ${title}`
  return OK
}

/** What a card says: what it is called, what it does and what it costs. */
export interface CardText {
  title: string
  /** The next version, for a release. */
  version?: string
  effect: string
  cost: string
  /** Why it can't be played now, or null when it can. */
  blocker: string | null
}

function releaseEffect(state: GameState, office: Office | undefined, product: Product, card: Proposal, clarity: number): string {
  const features = card.kind === 'feature' ? [card.id] : []
  const parts: string[] = []
  switch (card.kind) {
    case 'feature': {
      const growth = (estimateUpdateReach(state, product.id, features) / Math.max(1, product.reach)) * clarityReach(clarity)
      parts.push(`+${Math.max(0, Math.round(growth * 100 - 100))}% reach`)
      break
    }
    case 'item': {
      const item = getWorkItem(card.id)!
      // The item's fit is in the fit line below.
      parts.push(effectText({ ...item.effect, fit: undefined }) || item.blurb)
      break
    }
    case 'polish':
      parts.push(`Fixes ${Math.round(POLISH_FIX_SHARE * 100)}% of ${Math.round(product.bugs)} open bugs`)
      break
    case 'compliance':
      parts.push('Needed before you can open in Europe')
      break
    case 'localise':
      parts.push(`Opens Europe: +${Math.round(euGain(product) * 100)}% reach`)
      break
  }
  const now = Math.round(product.fit ?? 0)
  const earned = card.kind === 'item' ? (getWorkItem(card.id)?.effect.fit ?? 0) : 0
  const after = Math.round(Math.min(100, estimateUpdateFit(state, product.id, features, office) + earned))
  if (after !== now) parts.push(`fit ${now} → ${after}`)
  return parts.join(' · ')
}

/** Everything the player needs to weigh a card: no tooltips, no guessing. */
export function cardText(state: GameState, product: Product, card: Proposal, clarity: number): CardText {
  const { title, bump } = describeProposal(card)
  if (card.kind === 'strike') {
    const cost = strikeBackCost(state)
    return { title, effect: `Their income falls by ${Math.round(NEMESIS_STRIKE_SETBACK * 100)}% of yours`, cost: `${formatMoney(cost)} · instant, then choose again`, blocker: strikeBackBlocker(state) }
  }
  if (card.kind === 'deep') {
    const kind = getDeepWork(card.id)
    const chance = Math.round(deepChanceOf(state, card.id) * 100)
    return { title, effect: `${chance}% chance: ${kind?.reward ?? ''}. Otherwise ${kind?.failure ?? ''}`, cost: `${kind?.days ?? 0} days of your own time, no release meanwhile`, blocker: deepWorkBlocker(state, card.id) }
  }
  const lead = leadFloor(state)
  const target = lead ? releaseTarget(state, lead, product, card, clarity) : emptySkills()
  const days = lead ? estimateDaysAt(target, crewRate(state, lead, product)) : 0
  const budget = card.kind === 'localise' ? projectBudget(projectTarget(product.productTypeId, [], 'update', product.size)) : 0
  return {
    title,
    version: nextVersion(product, bump),
    effect: releaseEffect(state, lead, product, card, clarity),
    cost: `${budget > 0 ? `${formatMoney(budget)} · ` : ''}${Number.isFinite(days) ? `about ${days} days` : 'missing required build skills'}`,
    blocker: !lead ? 'Nobody is free to build it' : !Number.isFinite(days) ? 'Missing required build skills' : budgetBlocker(state, budget),
  }
}

/** A decision contract for the existing cycle, not a promise of Stage 2 parallel staffing. */
export function initiativePreview(state: GameState, product: Product, card: Proposal, clarity: number) {
  const text = cardText(state, product, card, clarity)
  const lead = leadFloor(state)
  const finite = card.kind !== 'deep' && card.kind !== 'strike'
  const target = finite && lead ? releaseTarget(state, lead, product, card, clarity) : emptySkills()
  const rate = finite && lead ? crewRate(state, lead, product) : emptySkills()
  const missing = DISCIPLINES.filter((discipline) => target[discipline] > 0 && rate[discipline] <= 0)
  const floors = finite && lead ? [lead, ...helpersOf(state, lead)].map((office) => office.id) : []
  const item = card.kind === 'item' ? getWorkItem(card.id) : undefined
  return {
    productId: product.id,
    title: text.title,
    outcome: text.effect,
    immediate: card.kind === 'strike' ? 'Rival setback applies immediately.' : card.kind === 'deep'
      ? 'No immediate product improvement; outcome is uncertain and resolves at completion.'
      : 'Product changes apply when the release ships, not when work starts.',
    delayed: 'Demand, user adoption and revenue develop later alongside market conditions and other work; no guaranteed return.',
    upfrontCash: card.kind === 'strike' ? strikeBackCost(state) : card.kind === 'localise'
      ? projectBudget(projectTarget(product.productTypeId, [], 'update', product.size)) : 0,
    addedDailyUpkeep: item?.effect.upkeep ?? 0,
    target, rate, floors, missing,
    blocker: text.blocker ?? (missing.length ? `Missing build output: ${missing.join(', ')}` : null),
    displaced: finite ? `${floors.length} floor(s) contribute under the current shared-release rules; their builders cannot build a second release at the same time. Existing bug-fixing pairs stay on fixes.`
      : card.kind === 'deep' ? 'Uses the founder’s time and prevents another release while deep work is active.'
      : 'No build time; the plan remains open for another choice.',
    costNote: 'Payroll, rent and existing hosting/tool costs continue. Staffing is not free; previews exclude future hosting changes from additional users.',
  }
}

/** Plays a card. Hitting back takes no time, so the player still chooses; anything else ends the plan. */
function chooseCardAction(state: GameState, index: number): Result {
  const plan = state.plan
  const card = plan?.cards[index]
  const product = cycleProduct(state)
  if (!plan || !card || !product) return fail('There is no such card')
  if (card.kind === 'strike') {
    const result = strikeBack(state)
    if (result.ok) {
      const next = deepCard(state, product)
      plan.cards = plan.cards.filter((c) => c !== card).concat(next ? [next] : [])
    }
    return result
  }
  if (card.kind === 'deep') {
    const result = startDeepWork(state, card.id)
    if (result.ok) delete state.plan
    return result
  }
  const lead = leadFloor(state)
  if (!lead) return fail('Nobody is free to build it')
  const blocker = cardText(state, product, card, plan.clarity).blocker
  if (blocker) return fail(blocker)
  const result = startBuild(state, lead, product, card, plan.clarity)
  if (result.ok) delete state.plan
  return result
}

/** Record only accepted decisions, before their immediate costs/effects are applied. */
export function chooseCard(state: GameState, index: number): Result {
  const product = cycleProduct(state)
  const card = state.plan?.cards[index]
  if (!product || !card) return fail('There is no such card')
  const before = businessSnapshot(state, product)
  const result = chooseCardAction(state, index)
  if (result.ok) {
    const project = state.offices.find((office) => office.project?.parentId === product.id)?.project
    recordBusinessDecision(state, product, describeProposal(card).title,
      card.kind === 'deep' ? 'deep' : card.kind === 'strike' ? 'strike' : 'release', before,
      card.kind === 'deep' || card.kind === 'strike' ? undefined : project?.id)
  }
  return result
}

/** Why the analysts can't be sent back now, or null when they can. */
export function researchPlanBlocker(state: GameState): string | null {
  if (!awaitingChoice(state)) return 'There is no plan to research'
  if (!canResearch(state)) return 'Hire an analyst to research'
  return (state.plan?.clarity ?? 0) >= 100 ? 'It could not be clearer' : null
}

/** The player sends the analysts back to the numbers: days pass, and the plan comes back clearer with new cards. */
export function researchPlan(state: GameState): Result {
  const blocker = researchPlanBlocker(state)
  if (blocker) return fail(blocker)
  const plan = state.plan!
  plan.clarity = Math.min(100, plan.clarity + PLAN_RESEARCH_CLARITY)
  plan.cards = []
  plan.researchUntil = state.day + PLAN_RESEARCH_DAYS
  return OK
}

/** What a floor is doing in the cycle, in a few words: for the tabs and the street. */
export function floorCycle(state: GameState, office: Office): string {
  const project = office.project
  if (project) {
    if (project.kind === 'contract') return 'client work'
    return project.spec ? `building ${project.spec.title}` : 'building a release'
  }
  if (teamOf(state, office).length === 0) return 'empty'
  if (office.productId !== state.signatureId) return 'keeping it fresh'
  const lead = activeProjects(state).find(({ project: p }) => p.byTeam && p.parentId === office.productId)
  if (lead?.project.spec) return `helping with ${lead.project.spec.title}`
  if (state.deepWork) return 'keeping things running'
  if (state.plan) return state.plan.researchUntil === undefined ? 'waiting for your call' : 'researching'
  return 'between releases'
}
