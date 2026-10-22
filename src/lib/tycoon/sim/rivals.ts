import { eraIndexAt } from '@/lib/tycoon/data/eras'
import { getProductType, PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import { STUDIO_HEADS, STUDIO_TAILS } from '@/lib/tycoon/data/names'
import { ERAS } from '@/lib/tycoon/data/eras'
import { NEWCOMERS, RIVALS, type RivalSeed } from '@/lib/tycoon/data/rivals'
import {
  ACQUISITION_DAYS,
  ACQUISITION_FLOOR,
  ACQUISITION_REPUTATION,
  ABSORB_SKILL_SPREAD,
  ABSORB_STAFF_BASE,
  ABSORB_STAFF_MAX,
  ABSORB_STAFF_PER_REPUTATION,
  ABSORB_PRODUCT_DAYS,
  ABSORB_TYPE_DAYS,
  ACQUISITION_STAGE,
  HIRE_MAX_LEVEL,
  LEADER_STAGE,
  TOP_SLIP_DAYS,
  PORTFOLIO_LIMIT,
  DAYS_PER_MONTH,
  RIVAL_BUSINESS_CAP,
  HIT_MIN_QUALITY,
  HIT_REACH,
  LAUNCH_ADOPTERS,
  PROJECT_SIZES,
  REPUTATION_DIVISOR,
  REPUTATION_MAX,
  REPUTATION_NEUTRAL_QUALITY,
  REPUTATION_REACH_BONUS,
  RIVAL_FEATURE_REACH,
  RIVAL_HIT_CHANCE,
  RIVAL_ERA_REACH,
  RIVAL_KEEP_SHARE,
  RIVAL_LAUNCH_MAX_DAYS,
  RIVAL_LAUNCH_MIN_DAYS,
  RIVAL_PACE_GROWTH,
  RIVAL_QUALITY_SPREAD,
  RIVAL_SIZE_REPUTATION,
  RIVAL_SKILL_GROWTH,
  RIVAL_SKILL_MAX,
} from './balance'
import { generateEmployee, ROLE_DISCIPLINE, ROLES, salaryOf } from './hiring'
import { levelForSkill } from './careers'
import { REGION_NAME } from '@/lib/tycoon/data/regions'
import { trailingIncome } from './economy'
import { buildingName, closeSale, inGarage, openableRegions } from './offices'
import { marketDemand } from './market'
import { freshProductName } from './naming'
import { interestSince, revenueForUsers } from './products'
import { pick, rand, randRange } from './rng'
import { expectedFeatures } from '@/lib/tycoon/data/eras'
import { fail, OK, PROJECT_SIZE_IDS, type Employee, type GameState, type Office, type ProjectSize, type Region, type Result, type Rival, type RivalProduct } from './types'

/** Rival products this far past their last update, with almost nobody left, are taken off the market. */
const RETIRE_AFTER_DAYS = 720
const RETIRE_SHARE = 0.02

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** The biggest size a rival with this reputation takes on. */
function sizeFor(reputation: number): ProjectSize {
  return PROJECT_SIZE_IDS.filter((s) => reputation >= RIVAL_SIZE_REPUTATION[s]).at(-1) ?? 'small'
}

/** Users a rival product of this quality and size can reach in today's market. */
function rivalReach(state: GameState, rival: Rival, productTypeId: string, size: ProjectSize, quality: number): number {
  const type = getProductType(productTypeId)
  return (
    type.audience *
    (quality / 100) ** 2 *
    marketDemand(state, productTypeId) *
    (RIVAL_FEATURE_REACH + RIVAL_ERA_REACH * eraIndexAt(Math.max(state.day, 0))) *
    (1 + REPUTATION_REACH_BONUS * rival.reputation) *
    PROJECT_SIZES[size].reach
  )
}

/** Days until a rival's next launch: longer after a bigger one, shorter as the years go by and the studio grows. */
function launchGap(state: GameState, size: ProjectSize): number {
  const years = Math.max(state.day, 0) / (12 * DAYS_PER_MONTH)
  const gap = randRange(state, RIVAL_LAUNCH_MIN_DAYS, RIVAL_LAUNCH_MAX_DAYS) * Math.sqrt(PROJECT_SIZES[size].work)
  return Math.round(gap / (1 + RIVAL_PACE_GROWTH * years))
}

/** A product the rival puts out: mostly in the markets it likes, at about its skill, now and then a hit. */
function makeProduct(state: GameState, rival: Rival, releaseDay: number): RivalProduct {
  const era = eraIndexAt(Math.max(releaseDay, 0))
  const open = PRODUCT_TYPES.filter((t) => t.era <= era)
  const liked = open.filter((t) => rival.focus.includes(t.id))
  const type = liked.length > 0 && rand(state) < 0.8 ? pick(state, liked) : pick(state, open)
  // Mostly its biggest size, sometimes a step down.
  const sizes = PROJECT_SIZE_IDS.slice(0, PROJECT_SIZE_IDS.indexOf(rival.size) + 1)
  const size = rand(state) < 0.6 ? rival.size : pick(state, sizes)
  const quality = clamp(rival.skill + randRange(state, -RIVAL_QUALITY_SPREAD, RIVAL_QUALITY_SPREAD), 30, 98)
  const hit = quality >= HIT_MIN_QUALITY && rand(state) < RIVAL_HIT_CHANCE
  const reach = rivalReach(state, rival, type.id, size, quality) * (hit ? HIT_REACH[size] : 1)
  return {
    id: state.nextId++,
    rivalId: rival.id,
    name: freshProductName(state),
    productTypeId: type.id,
    size,
    quality,
    releaseDay,
    updatedDay: releaseDay,
    reach,
    users: reach * LAUNCH_ADOPTERS,
    hit,
  }
}

/** Puts a studio on the market from its seed, with its first products already out. */
function addRival(state: GameState, seed: RivalSeed, products: number): Rival {
  const rival: Rival = {
    id: state.nextId++,
    name: seed.name,
    skill: seed.skill,
    reputation: seed.reputation,
    focus: [...seed.focus],
    region: seed.region ?? 'us',
    size: seed.size,
    nextLaunchDay: state.day + Math.round(randRange(state, 20, RIVAL_LAUNCH_MAX_DAYS)),
    business: seed.business,
    growth: seed.growth,
    businessCap: seed.business * RIVAL_BUSINESS_CAP,
  }
  state.rivals.push(rival)
  for (let i = 0; i < products; i++) {
    const product = makeProduct(state, rival, state.day - Math.round(randRange(state, 60, 400)))
    // Out for a while and recently kept up: its users have long since arrived.
    product.updatedDay = state.day + Math.floor(randRange(state, -60, 0))
    product.users = product.reach * 0.8
    state.rivalProducts.push(product)
  }
  return rival
}

/** The competition at the start: established studios with products already out, and a newcomer or two. */
export function createRivals(state: GameState): void {
  for (const seed of RIVALS) if (seed.arrivesYear === undefined) addRival(state, seed, seed.products)
}

const DAYS_PER_YEAR = 12 * DAYS_PER_MONTH

/** Studios whose year has come move into the market, each with a single product; none is added twice. Also catches up old saves. */
export function rivalsArrive(state: GameState, quiet = false): void {
  for (const seed of RIVALS) {
    if (seed.arrivesYear === undefined || state.day < (seed.arrivesYear - 1) * DAYS_PER_YEAR) continue
    if (state.rivals.some((r) => r.name === seed.name)) continue
    const rival = addRival(state, seed, Math.min(seed.products, 1))
    if (!quiet) state.events.push({ type: 'notice', text: `${rival.name} has moved into the market.` })
  }
}

/** A studio name no rival (or seed, hand-written or not) already uses. */
export function freshStudioName(state: GameState): string {
  const taken = new Set([...state.rivals.map((r) => r.name), ...RIVALS.map((r) => r.name), ...Object.values(NEWCOMERS).map((r) => r!.name)])
  for (let i = 0; i < 60; i++) {
    const name = `${pick(state, STUDIO_HEADS)} ${pick(state, STUDIO_TAILS)}`
    if (!taken.has(name)) return name
  }
  return `${pick(state, STUDIO_HEADS)} ${pick(state, STUDIO_TAILS)} ${taken.size}`
}

/** A newcomer for an era with no hand-written one: small, aimed at what the era's market wants most. */
export function generatedNewcomer(state: GameState, era: number): RivalSeed {
  const demand = ERAS[era]?.demand ?? {}
  const open = PRODUCT_TYPES.filter((t) => t.era <= era).sort((a, b) => (demand[b.id] ?? 1) - (demand[a.id] ?? 1))
  const focus = open.slice(0, 3).map((t) => t.id)
  return {
    name: freshStudioName(state),
    // Newcomers start up on both sides of the Atlantic in turn.
    region: era % 2 === 0 ? 'us' : 'eu',
    skill: 56 + 2 * era,
    reputation: 6 + 2 * era,
    focus,
    products: 0,
    size: 'small',
    business: 100 + 20 * era,
    growth: 0.5,
  }
}

/** The seed for the studio that starts up as this era begins: a hand-written one where there is one, otherwise a generated one. None in the first era. */
export function newcomerFor(state: GameState, era: number): RivalSeed | null {
  if (era <= 0) return null
  return NEWCOMERS[era] ?? generatedNewcomer(state, era)
}

/** A new studio starts up as an era begins, if the market has room and it is not already here. */
export function rivalArrives(state: GameState, era: number): void {
  const seed = newcomerFor(state, era)
  if (!seed || state.rivals.some((r) => r.name === seed.name)) return
  const rival = addRival(state, seed, 0)
  state.events.push({ type: 'notice', text: `A new studio, ${rival.name}, is starting up in the ${seed.focus[0].replace('_', ' ')} market.` })
}

function launch(state: GameState, rival: Rival): void {
  const product = makeProduct(state, rival, state.day)
  state.rivalProducts.push(product)
  const size = PROJECT_SIZES[product.size]
  const change = ((product.quality - REPUTATION_NEUTRAL_QUALITY) / REPUTATION_DIVISOR) * size.reputation * 0.5
  rival.reputation = clamp(rival.reputation + change, 0, REPUTATION_MAX)
  rival.size = sizeFor(rival.reputation)
  rival.nextLaunchDay = state.day + launchGap(state, product.size)
  const type = getProductType(product.productTypeId).name.toLowerCase()
  // With ten studios launching, only news that touches you gets a toast: a hit, or a product in a market you are in.
  if (!product.hit && !state.products.some((p) => p.productTypeId === product.productTypeId)) return
  state.events.push({
    type: 'notice',
    text: product.hit
      ? `${rival.name}'s new ${type} ${product.name} is taking off. Expect a crowded market.`
      : `${rival.name} launched ${product.name}, a ${size.name.toLowerCase()} ${type} (quality ${Math.round(product.quality)}).`,
  })
}

/**
 * One day for the rivals: launch whatever is due, keep their best products fresh (now and then, as a
 * studio would), and once a month grow a little better and clear out what nobody uses any more.
 */
export function rivalsDay(state: GameState): void {
  for (const rival of state.rivals) if (state.day >= rival.nextLaunchDay) launch(state, rival)

  for (const product of state.rivalProducts) {
    const fading = interestSince(product.updatedDay, product.size, state.day) < 0.8
    if (fading && product.users >= product.reach * RIVAL_KEEP_SHARE && rand(state) < 1 / 30) product.updatedDay = state.day
  }

  if (state.day % DAYS_PER_MONTH !== 0) return
  rivalsArrive(state)
  for (const rival of state.rivals) {
    rival.skill = Math.min(RIVAL_SKILL_MAX, rival.skill + RIVAL_SKILL_GROWTH / 12)
    rival.business = Math.min(rival.businessCap, rival.business * (1 + rival.growth) ** (1 / 12))
  }
  state.rivalProducts = state.rivalProducts.filter(
    (p) => state.day - p.updatedDay < RETIRE_AFTER_DAYS || p.users >= p.reach * RETIRE_SHARE,
  )
}

export interface Standing {
  /** The rival's id, or 0 for your studio. */
  id: number
  name: string
  /** Income per day: products, plus other business for the rivals. */
  revenue: number
  reputation: number
  /** The product with the most users, if any. */
  best: string | null
}

/** The industry ranking: every studio by what its products earn a day, the biggest first. */
export function standings(state: GameState): Standing[] {
  const yourBest = [...state.products].sort((a, b) => b.users - a.users)[0]
  const rows: Standing[] = [{ id: 0, name: 'Your studio', revenue: trailingIncome(state), reputation: state.reputation, best: yourBest?.name ?? null }]
  for (const rival of state.rivals) {
    const products = state.rivalProducts.filter((p) => p.rivalId === rival.id)
    const best = [...products].sort((a, b) => b.users - a.users)[0]
    rows.push({
      id: rival.id,
      name: rival.name,
      revenue: rivalRevenue(state, rival),
      reputation: rival.reputation,
      best: best?.name ?? null,
    })
  }
  return rows.sort((a, b) => b.revenue - a.revenue)
}

/** Your place in the ranking, 1 for the top. */
export function playerRank(state: GameState): number {
  return standings(state).findIndex((s) => s.id === 0) + 1
}

/** Counts days at the top as an industry leader, for the last stage of the journey: a day below the top costs a few of them. */
export function rankingDay(state: GameState): void {
  if (state.stage < LEADER_STAGE) state.daysAtTop = 0
  else state.daysAtTop = playerRank(state) === 1 ? state.daysAtTop + 1 : Math.max(0, state.daysAtTop - TOP_SLIP_DAYS)
}

/** What a rival earns per day: its products, and its business beyond them. */
function rivalRevenue(state: GameState, rival: Rival): number {
  const products = state.rivalProducts.filter((p) => p.rivalId === rival.id)
  return rival.business + products.reduce((sum, p) => sum + revenueForUsers(p.productTypeId, p.users), 0)
}

/** What absorbing a rival costs: many days of its income, more for one that is growing fast, with a floor for the small ones. */
export function acquisitionPrice(state: GameState, rival: Rival): number {
  const worth = rivalRevenue(state, rival) * ACQUISITION_DAYS * (1 + rival.growth)
  return Math.max(ACQUISITION_FLOOR, Math.round(worth / 10000) * 10000)
}

/** The rival's products, biggest first: the ones the studio could keep. */
export function rivalProductsOf(state: GameState, rival: Rival): RivalProduct[] {
  return state.rivalProducts.filter((p) => p.rivalId === rival.id).sort((a, b) => b.users - a.users)
}

/** Portfolio places free for products that come with a rival. */
export function absorbSlots(state: GameState): number {
  const making = state.offices.filter((o) => o.project?.kind === 'new').length
  return Math.max(0, PORTFOLIO_LIMIT - state.products.length - making)
}

/** The region the rival's office is in. */
const regionOfRival = (rival: Rival): Region => rival.region ?? 'us'

/** Why this rival can't be absorbed now, or null when it can. Its office takes the place of one the studio would have built. */
export function acquisitionBlocker(state: GameState, rival: Rival): string | null {
  if (state.stage < ACQUISITION_STAGE) return 'Only an established company can absorb a rival'
  if (inGarage(state)) return 'Move out of the garage first'
  // Its team moves into a floor of your building in its region.
  if (!openableRegions(state).includes(regionOfRival(rival))) return `${buildingName(regionOfRival(rival))} has no floor left for its team`
  return state.money < acquisitionPrice(state, rival) ? 'Not enough money' : null
}

/** The people an absorbed studio brings: builders of its skill, who know the kind of product it makes and the products kept. */
function absorbedStaff(state: GameState, rival: Rival, office: Office, kept: RivalProduct[]): Employee[] {
  const count = Math.min(ABSORB_STAFF_MAX, ABSORB_STAFF_BASE + Math.floor(rival.reputation / ABSORB_STAFF_PER_REPUTATION))
  const region = regionOfRival(rival)
  return Array.from({ length: count }, (_, i) => {
    const role = ROLES[i % ROLES.length]
    const person = generateEmployee(state, role, region)
    const primary = ROLE_DISCIPLINE[role]
    person.skills[primary] = Math.round(clamp(rival.skill + randRange(state, -ABSORB_SKILL_SPREAD, ABSORB_SKILL_SPREAD), 30, 95))
    person.level = levelForSkill(person.skills[primary], HIRE_MAX_LEVEL)
    person.officeId = office.id
    person.knowledge = { types: {}, products: {} }
    for (const type of rival.focus) person.knowledge.types[type] = ABSORB_TYPE_DAYS
    for (const product of kept) {
      person.knowledge.types[product.productTypeId] = Math.max(person.knowledge.types[product.productTypeId] ?? 0, ABSORB_TYPE_DAYS)
      person.knowledge.products[String(product.id)] = ABSORB_PRODUCT_DAYS
    }
    person.salary = salaryOf(person, state.day)
    return person
  })
}

/**
 * Absorbs a rival studio: it leaves the market and the ranking, its other business adds to your income, its office
 * (in its region) opens as one of yours with its people, who know what it made, and you keep the products you
 * choose, which take places in the portfolio. The rest are gone with it.
 */
export function acquire(state: GameState, rivalId: number, keepIds: readonly number[] = []): Result {
  const rival = state.rivals.find((r) => r.id === rivalId)
  if (!rival) return fail('Unknown studio')
  const blocker = acquisitionBlocker(state, rival)
  if (blocker) return fail(blocker)
  const theirs = rivalProductsOf(state, rival)
  const kept = theirs.filter((p) => keepIds.includes(p.id))
  if (kept.length !== new Set(keepIds).size) return fail('Those products are not theirs')
  if (kept.length > absorbSlots(state)) return fail(`Your portfolio has room for ${absorbSlots(state)} more`)

  state.money -= acquisitionPrice(state, rival)
  const region = regionOfRival(rival)
  const office: Office = { id: state.nextId++, kind: 'office', theme: state.offices.length, region, project: null }
  state.offices.push(office)
  closeSale(state)
  state.employees.push(...absorbedStaff(state, rival, office, kept))
  for (const p of kept) {
    state.products.push({
      id: p.id,
      name: p.name,
      productTypeId: p.productTypeId,
      size: p.size,
      featureIds: [...expectedFeatures(p.productTypeId, state.day)],
      quality: p.quality,
      releaseDay: p.releaseDay,
      reach: p.reach,
      users: p.users,
      // A European studio's products are European: all their users are there.
      ...(region === 'eu' ? { euShare: 1, euUsers: p.users } : {}),
      bugs: 5 * PROJECT_SIZES[p.size].work,
      pendingBugs: 0,
      hit: p.hit,
      totalRevenue: 0,
      updates: p.updatedDay > p.releaseDay ? [{ day: p.updatedDay }] : [],
      boostUntil: 0,
      boostUsers: 0,
    })
  }
  state.rivalProducts = state.rivalProducts.filter((p) => p.rivalId !== rival.id)
  state.rivals = state.rivals.filter((r) => r.id !== rival.id)
  state.acquiredIncome += rival.business
  state.reputation = Math.min(REPUTATION_MAX, state.reputation + ACQUISITION_REPUTATION)
  state.events.push({
    type: 'notice',
    text: `You absorbed ${rival.name}. Its team moved into a new floor of ${buildingName(region)}${kept.length > 0 ? `, with ${kept.map((p) => p.name).join(', ')}` : ''}.`,
    sound: 'deal',
  })
  return OK
}

/** A rival that builds this type of product, preferring those that like it; for events. */
export function rivalFor(state: GameState, productTypeId: string): Rival | undefined {
  const liked = state.rivals.filter((r) => r.focus.includes(productTypeId))
  return liked[0] ?? state.rivals[0]
}
