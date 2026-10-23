import { getRandomEvent } from '@/lib/tycoon/data/events'
import { getMilestone } from '@/lib/tycoon/data/milestones'
import { getResearch } from '@/lib/tycoon/data/research'
import { isKnownTrait } from '@/lib/tycoon/data/traits'
import { FEATURES } from '@/lib/tycoon/data/features'
import { PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import { STAGES } from '@/lib/tycoon/data/stages'
import { CAFE_START_MONEY, LEVELS, OFFICE_KINDS } from './balance'
import { refreshContracts } from './contracts'
import { createRivals, rivalsArrive } from './rivals'
import { ALL_ROLES, generateAnalyst, generateEmployee, refreshCandidates, ROLES, salaryOf } from './hiring'
import { rollStudioName } from './founding'
import { rand } from './rng'
import { sampleNow } from './history'
import { initialMarket } from './market'
import { DISCIPLINES, PROJECT_SIZE_IDS, REGIONS, STATS, TIERS, type GameState } from './types'

/**
 * Version 2 replaced fading income with users and bugs, version 3 brought offices, version 4 moved bug
 * fixing to a developer and tester pair, hid an update's new bugs for a while and added selling products.
 * Version 5 made the two people who start the studio founders: they never leave and draw half pay.
 * Version 6 put a café before the garage, a journey stage of its own, so every later stage moved up one.
 * Version 3 to 6 saves are upgraded on load (see `upgradeFromV3`, `upgradeFromV4`, `upgradeFromV5`, `upgradeFromV6`); older ones can't be carried over.
 */
export const STATE_VERSION = 7

export function createInitialState(seed: number): GameState {
  const state: GameState = {
    version: STATE_VERSION,
    rng: seed >>> 0,
    day: 0,
    money: CAFE_START_MONEY,
    reputation: 0,
    nextId: 1,
    employees: [],
    offices: [],
    stage: 0,
    products: [],
    candidates: [],
    contracts: [],
    contractsDone: 0,
    rivals: [],
    rivalProducts: [],
    daysAtTop: 0,
    acquiredIncome: 0,
    lifetimeRevenue: 0,
    shippedCount: 0,
    fixes: [],
    onCall: null,
    retired: [],
    bugsFixed: 0,
    insight: 0,
    surveyed: [],
    signatureId: null,
    debtDays: 0,
    market: initialMarket(),
    modifiers: [],
    pendingEvent: null,
    research: { done: [], active: null },
    lastEventDay: 0,
    investorDeals: 0,
    lastOutingDay: -1000,
    milestones: [],
    history: [],
    journal: [],
    lastNewProductDay: -10000,
    gameOver: false,
    ending: null,
    exit: { declined: 0, nextDay: 0, pending: null, firstDay: null, closed: false },
    dayWork: [],
    events: [],
  }
  // You and a friend start at a café table: you study users, your friend builds.
  const cafe = { id: state.nextId++, kind: 'cafe' as const, theme: 0, region: 'us' as const, project: null }
  state.offices.push(cafe)
  for (const person of [generateAnalyst(state), generateEmployee(state, 'developer')]) {
    const founder = { ...person, officeId: cafe.id, founder: true }
    state.employees.push({ ...founder, salary: salaryOf(founder, state.day) })
  }
  refreshCandidates(state)
  refreshContracts(state)
  createRivals(state)
  state.studioName = rollStudioName(state.rivals.map((r) => r.name), () => rand(state))
  state.history.push(sampleNow(state))
  return state
}

export function serialize(state: GameState): string {
  return JSON.stringify(state)
}

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isSkills = (v: unknown): boolean => isObj(v) && DISCIPLINES.every((d) => isNum(v[d]))
const knownType = (v: unknown): boolean => PRODUCT_TYPES.some((t) => t.id === v)
const knownFeature = (v: unknown): boolean => FEATURES.some((f) => f.id === v)
const knownRegion = (v: unknown): boolean => REGIONS.some((r) => r === v)
const knownSize = (v: unknown): boolean => PROJECT_SIZE_IDS.some((s) => s === v)

function validModifier(v: unknown): boolean {
  return (
    isObj(v) &&
    isNum(v.id) &&
    typeof v.source === 'string' &&
    (STATS as readonly string[]).includes(v.stat as string) &&
    isNum(v.mult) &&
    isNum(v.expiresDay)
  )
}

function validResearch(v: unknown): boolean {
  return (
    isObj(v) &&
    Array.isArray(v.done) &&
    v.done.every((id) => typeof id === 'string') &&
    (v.active === null || (isObj(v.active) && typeof v.active.id === 'string' && isNum(v.active.finishDay) && (v.active.target === undefined || typeof v.active.target === 'string')))
  )
}

function validPendingEvent(v: unknown): boolean {
  return isObj(v) && typeof v.id === 'string' && isObj(v.data) && Object.values(v.data).every(isNum)
}

function validKnowledge(v: unknown): boolean {
  const days = (r: unknown) => isObj(r) && Object.values(r).every(isNum)
  return isObj(v) && days(v.types) && days(v.products)
}

function validEmployee(v: unknown): boolean {
  return (
    isObj(v) &&
    isNum(v.id) &&
    typeof v.name === 'string' &&
    ALL_ROLES.some((r) => r === v.role) &&
    (v.analysis === undefined || isNum(v.analysis)) &&
    (v.region === undefined || knownRegion(v.region)) &&
    (v.teamId === undefined || isNum(v.teamId)) &&
    isSkills(v.skills) &&
    isNum(v.salary) &&
    isKnownTrait(v.trait) &&
    isNum(v.morale) &&
    isNum(v.officeId) &&
    Number.isInteger(v.level) &&
    (v.level as number) >= 0 &&
    (v.level as number) < LEVELS.length &&
    isNum(v.levelDay) &&
    isNum(v.hiredDay) &&
    (v.readySince === null || isNum(v.readySince)) &&
    (v.founder === undefined || typeof v.founder === 'boolean') &&
    (v.keptDay === undefined || isNum(v.keptDay)) &&
    (v.knowledge === undefined || validKnowledge(v.knowledge)) &&
    (v.training === null ||
      (isObj(v.training) && (DISCIPLINES as readonly string[]).includes(v.training.discipline as string) && isNum(v.training.finishDay)))
  )
}

function validProduct(v: unknown): boolean {
  return (
    isObj(v) &&
    isNum(v.id) &&
    typeof v.name === 'string' &&
    knownType(v.productTypeId) &&
    (v.audienceId === undefined || typeof v.audienceId === 'string') &&
    knownSize(v.size) &&
    Array.isArray(v.featureIds) &&
    v.featureIds.every(knownFeature) &&
    isNum(v.quality) &&
    isNum(v.releaseDay) &&
    isNum(v.reach) &&
    isNum(v.users) &&
    isNum(v.bugs) &&
    isNum(v.pendingBugs) &&
    typeof v.hit === 'boolean' &&
    isNum(v.totalRevenue) &&
    Array.isArray(v.updates) &&
    v.updates.every((u) => isObj(u) && isNum(u.day)) &&
    isNum(v.boostUntil) &&
    isNum(v.boostUsers) &&
    (v.autoPromote === undefined || v.autoPromote === null || TIERS.some((t) => t === v.autoPromote)) &&
    (v.licensed === undefined || typeof v.licensed === 'boolean') &&
    (v.euShare === undefined || isNum(v.euShare)) &&
    (v.euUsers === undefined || isNum(v.euUsers))
  )
}

function validProject(v: unknown): boolean {
  return (
    isObj(v) &&
    isNum(v.id) &&
    typeof v.name === 'string' &&
    (v.kind === 'new' || v.kind === 'update' || v.kind === 'contract') &&
    (v.parentId === null || isNum(v.parentId)) &&
    knownType(v.productTypeId) &&
    knownSize(v.size) &&
    Array.isArray(v.featureIds) &&
    v.featureIds.every(knownFeature) &&
    isSkills(v.target) &&
    isSkills(v.progress) &&
    isNum(v.startDay) &&
    typeof v.readyNotified === 'boolean' &&
    isNum(v.hype) &&
    typeof v.alphaOffered === 'boolean' &&
    (v.localises === undefined || typeof v.localises === 'boolean') &&
    isNum(v.bugRisk) &&
    (v.contract === null ||
      (isObj(v.contract) &&
        typeof v.contract.client === 'string' &&
        isNum(v.contract.pay) &&
        isNum(v.contract.dueDay) &&
        (v.contract.deposit === undefined || isNum(v.contract.deposit)) &&
        (v.contract.productId === undefined || isNum(v.contract.productId))))
  )
}

function validRival(v: unknown): boolean {
  return (
    isObj(v) &&
    isNum(v.id) &&
    typeof v.name === 'string' &&
    isNum(v.skill) &&
    isNum(v.reputation) &&
    Array.isArray(v.focus) &&
    v.focus.every(knownType) &&
    knownSize(v.size) &&
    (v.region === undefined || knownRegion(v.region)) &&
    isNum(v.nextLaunchDay) &&
    isNum(v.business) &&
    isNum(v.growth) &&
    isNum(v.businessCap)
  )
}

function validRivalProduct(v: unknown): boolean {
  return (
    isObj(v) &&
    isNum(v.id) &&
    isNum(v.rivalId) &&
    typeof v.name === 'string' &&
    knownType(v.productTypeId) &&
    knownSize(v.size) &&
    isNum(v.quality) &&
    isNum(v.releaseDay) &&
    isNum(v.updatedDay) &&
    isNum(v.reach) &&
    isNum(v.users) &&
    typeof v.hit === 'boolean'
  )
}

function validOffer(v: unknown): boolean {
  return (
    isObj(v) &&
    isNum(v.id) &&
    typeof v.client === 'string' &&
    typeof v.title === 'string' &&
    isSkills(v.target) &&
    isNum(v.pay) &&
    isNum(v.days) &&
    (v.expiresDay === undefined || isNum(v.expiresDay)) &&
    (v.productId === undefined || isNum(v.productId))
  )
}

function validFix(v: unknown, state: Obj): boolean {
  return (
    isObj(v) &&
    isNum(v.id) &&
    isNum(v.productId) &&
    isNum(v.developerId) &&
    isNum(v.testerId) &&
    isSkills(v.target) &&
    isSkills(v.progress) &&
    isNum(v.bugs) &&
    isNum(v.bugsFixed) &&
    isNum(v.startDay) &&
    typeof v.auto === 'boolean' &&
    (state.products as Obj[]).some((p) => p.id === v.productId) &&
    (state.employees as Obj[]).some((e) => e.id === v.developerId) &&
    (state.employees as Obj[]).some((e) => e.id === v.testerId)
  )
}

function validRetired(v: unknown): boolean {
  return (
    isObj(v) &&
    isNum(v.id) &&
    typeof v.name === 'string' &&
    knownType(v.productTypeId) &&
    knownSize(v.size) &&
    typeof v.hit === 'boolean' &&
    isNum(v.releaseDay) &&
    isNum(v.endDay) &&
    isNum(v.users) &&
    isNum(v.totalRevenue) &&
    (v.outcome === 'retired' || v.outcome === 'sold') &&
    isNum(v.price) &&
    (v.buyer === null || typeof v.buyer === 'string')
  )
}

function validOffice(v: unknown, products: unknown[]): boolean {
  if (!isObj(v) || !isNum(v.id) || !Object.keys(OFFICE_KINDS).includes(v.kind as string) || !Number.isInteger(v.theme) || (v.region !== undefined && !knownRegion(v.region))) return false
  const project = v.project
  if (project === null) return true
  if (!validProject(project) || !isObj(project)) return false
  // An update has to point at a product that exists.
  if (project.kind === 'update') return products.some((p) => isObj(p) && p.id === project.parentId)
  return true
}

/** True when `v` has the full shape of a GameState and refers only to content that exists. */
function validState(v: unknown): v is GameState {
  return (
    isObj(v) &&
    v.version === STATE_VERSION &&
    isNum(v.rng) &&
    isNum(v.day) &&
    isNum(v.money) &&
    isNum(v.reputation) &&
    isNum(v.nextId) &&
    isNum(v.lifetimeRevenue) &&
    isNum(v.shippedCount) &&
    isNum(v.bugsFixed) &&
    isNum(v.insight) &&
    Array.isArray(v.surveyed) &&
    v.surveyed.every((id) => typeof id === 'string') &&
    (v.signatureId === null || isNum(v.signatureId)) &&
    (v.studioName === undefined || typeof v.studioName === 'string') &&
    isNum(v.debtDays) &&
    isNum(v.lastEventDay) &&
    (v.recentEvents === undefined || (Array.isArray(v.recentEvents) && v.recentEvents.every((id) => typeof id === 'string'))) &&
    isNum(v.investorDeals) &&
    isNum(v.lastOutingDay) &&
    Array.isArray(v.milestones) &&
    v.milestones.every((id) => typeof id === 'string') &&
    Array.isArray(v.history) &&
    v.history.every((h) => isObj(h) && isNum(h.day) && isNum(h.money) && isNum(h.income) && isNum(h.burn)) &&
    isObj(v.market) &&
    Object.values(v.market).every(isNum) &&
    Array.isArray(v.modifiers) &&
    v.modifiers.every(validModifier) &&
    (v.pendingEvent === null || validPendingEvent(v.pendingEvent)) &&
    validResearch(v.research) &&
    typeof v.gameOver === 'boolean' &&
    Number.isInteger(v.stage) &&
    (v.stage as number) >= 0 &&
    (v.stage as number) < STAGES.length &&
    Array.isArray(v.products) &&
    v.products.every(validProduct) &&
    Array.isArray(v.retired) &&
    v.retired.every(validRetired) &&
    // The signature hit may have been sold or retired since.
    (v.signatureId === null ||
      v.products.some((p) => isObj(p) && p.id === v.signatureId) ||
      v.retired.some((p) => isObj(p) && p.id === v.signatureId)) &&
    Array.isArray(v.offices) &&
    v.offices.length > 0 &&
    v.offices.every((o) => validOffice(o, v.products as unknown[])) &&
    Array.isArray(v.employees) &&
    v.employees.every(validEmployee) &&
    Array.isArray(v.fixes) &&
    v.fixes.every((f) => validFix(f, v)) &&
    (v.onCall === null ||
      (isObj(v.onCall) &&
        (v.employees as Obj[]).some((e) => e.id === (v.onCall as Obj).developerId) &&
        (v.employees as Obj[]).some((e) => e.id === (v.onCall as Obj).testerId))) &&
    // Everyone works in an office that exists.
    v.employees.every((e) => (v.offices as Obj[]).some((o) => o.id === (e as Obj).officeId)) &&
    Array.isArray(v.candidates) &&
    v.candidates.every(validEmployee) &&
    Array.isArray(v.contracts) &&
    v.contracts.every(validOffer) &&
    isNum(v.contractsDone) &&
    (v.nextOfferDay === undefined || isNum(v.nextOfferDay)) &&
    (v.nextEnterpriseDay === undefined || isNum(v.nextEnterpriseDay)) &&
    Array.isArray(v.rivals) &&
    v.rivals.every(validRival) &&
    Array.isArray(v.rivalProducts) &&
    v.rivalProducts.every(validRivalProduct) &&
    isNum(v.daysAtTop) &&
    isNum(v.acquiredIncome)
  )
}

/**
 * Brings a version 3 save up to date: bug-fixing sprints, which took a whole office, are dropped (the bugs
 * stay on the product); products get no hidden bugs; there are no fixing jobs, on-call pair or past products.
 */
function upgradeFromV3(raw: unknown): unknown {
  if (!isObj(raw) || raw.version !== 3) return raw
  const withoutFixes = (office: unknown) => {
    if (!isObj(office) || !isObj(office.project) || office.project.kind !== 'fix') return office
    return { ...office, project: null }
  }
  const stripBugFields = (office: unknown) => {
    if (!isObj(office) || !isObj(office.project)) return office
    const { bugs: _bugs, bugsFixed: _fixed, ...project } = office.project
    return { ...office, project }
  }
  return {
    ...raw,
    version: 4,
    offices: Array.isArray(raw.offices) ? raw.offices.map(withoutFixes).map(stripBugFields) : raw.offices,
    products: Array.isArray(raw.products) ? raw.products.map((p) => (isObj(p) ? { pendingBugs: 0, ...p } : p)) : raw.products,
    fixes: [],
    onCall: null,
    retired: [],
  }
}

/** Version 4 to 5 only changes who the first two employees are, which needs the sim's salary rules: see `markFounders`. */
function upgradeFromV4(raw: unknown): unknown {
  return isObj(raw) && raw.version === 4 ? { ...raw, version: 5 } : raw
}

/** Version 5 to 6: the café became the first stage of the journey, so a studio from before is a stage further on. */
function upgradeFromV5(raw: unknown): unknown {
  if (!isObj(raw) || raw.version !== 5) return raw
  return { ...raw, version: 6, stage: isNum(raw.stage) ? raw.stage + 1 : raw.stage }
}

/** Version 6 to 7: a floor works on a workstream, not a direction (grow and keep become features, polish quality, expand Europe). */
function upgradeFromV6(raw: unknown): unknown {
  if (!isObj(raw) || raw.version !== 6) return raw
  const stream: Record<string, string> = { grow: 'features', keep: 'features', polish: 'quality', expand: 'europe' }
  const floor = (office: unknown) => {
    if (!isObj(office) || !('direction' in office)) return office
    const { direction, ...rest } = office
    return typeof direction === 'string' && stream[direction] ? { ...rest, workstream: stream[direction] } : rest
  }
  return { ...raw, version: STATE_VERSION, offices: Array.isArray(raw.offices) ? raw.offices.map(floor) : raw.offices }
}

/** The people hired on day 0 in a save from before founders existed become the founders. */
function markFounders(state: GameState): void {
  if (state.employees.some((e) => e.founder)) return
  for (const person of state.employees.filter((e) => e.hiredDay <= 0).slice(0, 2)) {
    person.founder = true
    person.salary = salaryOf(person, state.day)
  }
}

/**
 * Lets a save outlive content that a later build removed: milestones, research and a pending event
 * this build doesn't know are dropped, and product types it added get a normal market.
 * Runs before validation; never reshape anything here.
 */
function dropRemovedContent(raw: unknown): unknown {
  if (!isObj(raw)) return raw
  const upgraded: Obj = { ...raw }
  upgraded.journal = Array.isArray(raw.journal) ? raw.journal : []
  upgraded.insight = isNum(raw.insight) ? raw.insight : 0
  upgraded.surveyed = Array.isArray(raw.surveyed) ? raw.surveyed : []
  upgraded.lastNewProductDay = isNum(raw.lastNewProductDay) ? raw.lastNewProductDay : -10000
  upgraded.ending = isObj(raw.ending) ? { worth: 0, ...raw.ending } : null
  const exit = isObj(raw.exit) ? raw.exit : {}
  upgraded.exit = { declined: isNum(exit.declined) ? exit.declined : 0, nextDay: isNum(exit.nextDay) ? exit.nextDay : 0, pending: isObj(exit.pending) ? exit.pending : null, firstDay: isNum(exit.firstDay) ? exit.firstDay : null, closed: exit.closed === true }
  upgraded.market = { ...initialMarket(), ...(isObj(raw.market) ? raw.market : {}) }
  if (Array.isArray(raw.milestones)) upgraded.milestones = raw.milestones.filter((id) => typeof id === 'string' && getMilestone(id))
  // Research this build no longer knows is dropped; an active one that vanished is simply cancelled.
  if (isObj(raw.research)) {
    const research = raw.research
    const done = Array.isArray(research.done) ? research.done.filter((id) => typeof id === 'string' && getResearch(id)) : research.done
    const active = isObj(research.active) && !getResearch(String(research.active.id)) ? null : research.active
    upgraded.research = { ...research, done, active }
  }
  if (isObj(upgraded.pendingEvent) && !getRandomEvent(String(upgraded.pendingEvent.id))) upgraded.pendingEvent = null
  return upgraded
}

/**
 * Parses a saved game. Returns null for malformed JSON, another version, a missing field,
 * or content ids this build doesn't know. Transient fields (`dayWork`, `events`) are reset.
 */
export function deserialize(json: string): GameState | null {
  try {
    const raw: unknown = JSON.parse(json)
    const from = isObj(raw) && typeof raw.version === 'number' ? raw.version : 0
    const parsed = dropRemovedContent(upgradeFromV6(upgradeFromV5(upgradeFromV4(upgradeFromV3(raw)))))
    if (!validState(parsed)) return null
    const state: GameState = { ...parsed, dayWork: [], events: [] }
    if (from === 3) rivalsArrive(state, true) // the market grew since version 3: the studios due by now move in
    if (from >= 3 && from < STATE_VERSION) markFounders(state)
    return state
  } catch {
    return null
  }
}
