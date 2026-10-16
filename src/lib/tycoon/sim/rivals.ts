import { eraIndexAt } from '@/lib/tycoon/data/eras'
import { PRODUCT_WORDS } from '@/lib/tycoon/data/names'
import { getProductType, PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import { NEWCOMERS, RIVALS, type RivalSeed } from '@/lib/tycoon/data/rivals'
import {
  ACQUISITION_DAYS,
  ACQUISITION_FLOOR,
  ACQUISITION_REPUTATION,
  ACQUISITION_STAGE,
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
import { dailyIncome } from './economy'
import { marketDemand } from './market'
import { interestSince, revenueForUsers } from './products'
import { pick, rand, randRange } from './rng'
import { expectedFeatures } from '@/lib/tycoon/data/eras'
import { fail, OK, PROJECT_SIZE_IDS, type GameState, type ProjectSize, type Result, type Rival, type RivalProduct } from './types'

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
    name: pick(state, PRODUCT_WORDS),
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
  for (const seed of RIVALS) addRival(state, seed, seed.products)
}

/** For a save from before there were ten studios: the ones it lacks move in, each with a single product. */
export function introduceRivals(state: GameState): void {
  for (const seed of RIVALS) {
    if (!state.rivals.some((r) => r.name === seed.name)) addRival(state, seed, Math.min(seed.products, 1))
  }
}

/** A new studio starts up as an era begins, if the market has room and it is not already here. */
export function rivalArrives(state: GameState, era: number): void {
  const seed = NEWCOMERS[era]
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
  const rows: Standing[] = [{ id: 0, name: 'Your studio', revenue: dailyIncome(state), reputation: state.reputation, best: yourBest?.name ?? null }]
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

/** Counts consecutive days at the top as an industry leader, for the last stage of the journey. */
export function rankingDay(state: GameState): void {
  state.daysAtTop = state.stage >= ACQUISITION_STAGE && playerRank(state) === 1 ? state.daysAtTop + 1 : 0
}

/** What a rival earns per day: its products, and its business beyond them. */
function rivalRevenue(state: GameState, rival: Rival): number {
  const products = state.rivalProducts.filter((p) => p.rivalId === rival.id)
  return rival.business + products.reduce((sum, p) => sum + revenueForUsers(p.productTypeId, p.users), 0)
}

/** What buying out a rival costs: many days of its income, with a floor for the small ones. */
export function acquisitionPrice(state: GameState, rival: Rival): number {
  return Math.max(ACQUISITION_FLOOR, Math.round((rivalRevenue(state, rival) * ACQUISITION_DAYS) / 10000) * 10000)
}

/** Why this rival can't be bought now, or null when it can. */
export function acquisitionBlocker(state: GameState, rival: Rival): string | null {
  if (state.stage < ACQUISITION_STAGE) return 'Only an industry leader can buy a rival'
  return state.money < acquisitionPrice(state, rival) ? 'Not enough money' : null
}

/**
 * Buys a rival studio outright: it is gone from the market, its other business adds to your income, and
 * its products are yours, with their users. They come with a few bugs and whatever features the era
 * expects, and need looking after like the rest.
 */
export function acquire(state: GameState, rivalId: number): Result {
  const rival = state.rivals.find((r) => r.id === rivalId)
  if (!rival) return fail('Unknown studio')
  const blocker = acquisitionBlocker(state, rival)
  if (blocker) return fail(blocker)
  state.money -= acquisitionPrice(state, rival)
  for (const p of state.rivalProducts.filter((q) => q.rivalId === rival.id)) {
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
  state.events.push({ type: 'notice', text: `You bought ${rival.name}. Its products are yours now.`, sound: 'deal' })
  return OK
}

/** A rival that builds this type of product, preferring those that like it; for events. */
export function rivalFor(state: GameState, productTypeId: string): Rival | undefined {
  const liked = state.rivals.filter((r) => r.focus.includes(productTypeId))
  return liked[0] ?? state.rivals[0]
}
