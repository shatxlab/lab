import { audienceFor } from '@/lib/tycoon/data/audiences'
import { FEATURES, getFeature } from '@/lib/tycoon/data/features'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import { COMPLIANCE_FEATURE } from '@/lib/tycoon/data/regions'
import { ALL_ITEMS, getWorkItem } from '@/lib/tycoon/data/workstreams'
import {
  CLARITY_ANALYST,
  CLARITY_BASE,
  CLARITY_EXTRA_ANALYST,
  CLARITY_NO_PM_CAP,
  CLARITY_PM,
  CLARITY_PM_PRESENT,
  POLISH_BUG_RISK,
  SPEC_BASE_DAYS,
  SPEC_BUGS,
  SPEC_DECIDE_DAYS,
  SPEC_MIN_DAYS,
  SPEC_PROPOSALS,
  SPEC_REWORK,
  TEAM_IDLE_DAYS,
} from './balance'
import { isAnalyst } from './insight'
import { logEntry } from './journal'
import { activeProjects, getOffice, officeName, productInWork, staffOf, teamOf } from './offices'
import { startLocalisation, startUpdate } from './project'
import { missingFeatures } from './products'
import { rand } from './rng'
import { LOVED_AT, SHRUGGED_AT } from './scoring'
import { itemBlocker, stepBlocker } from './roadmap'
import { loadOf } from './scale'
import { nextVersion } from './releases'
import { featureLock } from './unlocks'
import { fail, OK, type Bump, type GameState, type Office, type Product, type Proposal, type Result } from './types'

/** The people on a floor who read the product: its analysts and its product manager. */
export function readers(state: GameState, office: Office) {
  return staffOf(state, office).filter((e) => isAnalyst(e) && !e.training && e.title !== 'CEO')
}

/** True when a floor has someone to write specs; without, its team only keeps the product fresh. */
export const runsCycle = (state: GameState, office: Office): boolean => readers(state, office).length > 0

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

/** Days a spec takes to write at this clarity. */
export const specDays = (clarity: number): number => Math.max(SPEC_MIN_DAYS, Math.round(SPEC_BASE_DAYS * (1.6 - clarity / 100)))

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
  }
}

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
  return chosen.map(({ kind, id, why }) => ({ kind, id, why }))
}

/** True when the floor is ready to start reading the product for its next release. */
export function discoveryDue(state: GameState, office: Office, product: Product): boolean {
  return (
    office.kind === 'office' &&
    !office.spec &&
    runsCycle(state, office) &&
    teamOf(state, office).length > 0 &&
    !productInWork(state, product.id, true) &&
    state.day >= (office.idleSince ?? state.day) + TEAM_IDLE_DAYS
  )
}

function startDiscovery(state: GameState, office: Office): void {
  const clarity = clarityOf(state, office)
  office.spec = { phase: 'writing', startDay: state.day, days: specDays(clarity), clarity, proposals: [] }
}

/** Starts the build for one proposal; the spec's clarity makes it bigger and buggier the vaguer it was. */
function startBuild(state: GameState, office: Office, product: Product, proposal: Proposal, clarity: number): Result {
  const { title, bump } = describeProposal(proposal)
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
  if (proposal.kind === 'polish') {
    project.polishes = true
    project.bugRisk *= POLISH_BUG_RISK
  }
  if (proposal.kind === 'item') {
    const item = getWorkItem(proposal.id)!
    project.itemId = item.id
    for (const d of Object.keys(project.target) as (keyof typeof project.target)[]) project.target[d] *= item.work
  }
  const rework = 1 + (1 - clarity / 100) * SPEC_REWORK
  for (const d of Object.keys(project.target) as (keyof typeof project.target)[]) project.target[d] *= rework
  project.bugRisk *= 1 + (1 - clarity / 100) * SPEC_BUGS
  project.spec = { title, bump, clarity }
  project.name = `${product.name} ${nextVersion(product, bump)}: ${title}`
  return OK
}

/** Why the player can't choose now, or null when they can. */
export function chooseBlocker(state: GameState, officeId: number, index: number): string | null {
  const office = getOffice(state, officeId)
  if (!office?.spec || office.spec.phase !== 'choose') return 'There is no spec to choose from'
  if (!office.spec.proposals[index]) return 'No such requirement'
  const product = state.products.find((p) => p.id === office.productId)
  return product ? null : 'The floor has no product'
}

/** The player picks a requirement from the spec: the team starts building it. */
export function chooseRequirement(state: GameState, officeId: number, index: number): Result {
  const blocker = chooseBlocker(state, officeId, index)
  if (blocker) return fail(blocker)
  const office = getOffice(state, officeId)!
  const spec = office.spec!
  const product = state.products.find((p) => p.id === office.productId)!
  const result = startBuild(state, office, product, spec.proposals[index], spec.clarity)
  if (result.ok) delete office.spec
  return result
}

/** The player sends the spec back: the analysts read again, at a cost of days. */
export function discardSpec(state: GameState, officeId: number): Result {
  const office = getOffice(state, officeId)
  if (!office?.spec || office.spec.phase !== 'choose') return fail('There is no spec to send back')
  startDiscovery(state, office)
  office.spec.days += 2
  return OK
}

/** One day for the floors' specs: writing finishes and is put to the player, who has a while to choose before the product manager does. */
export function specDay(state: GameState): void {
  for (const office of state.offices) {
    const spec = office.spec
    const product = state.products.find((p) => p.id === office.productId)
    if (!spec) continue
    if (!product || !runsCycle(state, office)) {
      delete office.spec
      continue
    }
    if (spec.phase === 'writing') {
      if (state.day < spec.startDay + spec.days) continue
      spec.phase = 'choose'
      spec.askedDay = state.day
      spec.proposals = propose(state, product, spec.clarity)
      if (spec.proposals.length === 0) {
        delete office.spec
        continue
      }
      state.events.push({ type: 'notice', text: `${officeName(state, office)} has a spec for ${product.name}: choose what to build.` })
      continue
    }
    if (state.day - (spec.askedDay ?? state.day) < SPEC_DECIDE_DAYS) continue
    const first = spec.proposals[0]
    if (startBuild(state, office, product, first, spec.clarity).ok) {
      delete office.spec
      const { title } = describeProposal(first)
      state.events.push({ type: 'notice', text: `${officeName(state, office)}'s product manager went with ${title}.` })
      logEntry(state, 'team.spec', `${officeName(state, office)} built ${title} unasked`, { office: officeName(state, office) })
    }
  }
}

/** Called each day for a floor that is idle: reads the product if it is time. Returns true when the floor is in the cycle. */
export function cycleDay(state: GameState, office: Office, product: Product): boolean {
  if (!runsCycle(state, office)) {
    delete office.spec
    return false
  }
  if (discoveryDue(state, office, product)) startDiscovery(state, office)
  return true
}

/** What a floor is doing in the cycle, in a few words: for the dashboard, the tabs and the street. */
export function floorCycle(state: GameState, office: Office): string {
  const project = office.project
  if (project) {
    if (project.kind === 'contract') return 'client work'
    return project.spec ? `building ${project.spec.title}` : 'building a release'
  }
  const spec = office.spec
  if (spec?.phase === 'writing') return `writing a spec, ${Math.max(0, spec.startDay + spec.days - state.day)} days left`
  if (spec?.phase === 'choose') return 'spec ready: choose what to build'
  if (teamOf(state, office).length === 0) return 'empty'
  return runsCycle(state, office) ? 'reading the product' : 'no analyst: only upkeep'
}
