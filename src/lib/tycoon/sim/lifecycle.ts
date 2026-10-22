import { COMPLIANCE_FEATURE } from '@/lib/tycoon/data/regions'
import { getFeature } from '@/lib/tycoon/data/features'
import {
  AUTO_PROMOTE_MIN_EFFECT,
  AUTO_PROMOTE_RESERVE_DAYS,
  CAMPAIGNS,
  DAYS_PER_MONTH,
  FRESH_DAYS,
  GROW_MIN_AGE_DAYS,
  NEW_PRODUCT_FREE_COUNT,
  NEW_PRODUCT_GAP_DAYS,
  PORTFOLIO_LIMIT,
  PROMO_AUDIENCE,
  PROMO_FRICTION,
  PROMO_KEEP,
  PROMO_LOYAL_DAYS,
  PROMO_MIN_EFFECT,
  PROMO_RECOVERY_DAYS,
  USER_DECLINE,
  PROJECT_SIZES,
  PROMOTIONS,
  UPDATE_MIN_AGE_DAYS,
  type MarketingOffer,
} from './balance'
import { officeRunning, pmReachFactor } from './direction'
import { monthlyBurn } from './economy'
import { logEntry } from './journal'
import { marketDemand } from './market'
import { activeProjects, hasEuropeOffice, inGarage, productInWork, teamOf } from './offices'
import { euShareOf, interest, lastReleaseDay, revenueForUsers, settledUsers, targetUsers } from './products'
import { computeReach } from './scoring'
import { sizeLock } from './unlocks'
import { fail, OK, PROJECT_SIZE_IDS, TIERS, type GameState, type Office, type Product, type Project, type ProjectSize, type Result, type Tier } from './types'

/** Costs are rounded to a tidy $50 so they read as prices. */
const price = (amount: number, floor: number) => Math.max(floor, Math.round(amount / 50) * 50)

/** Why `office` can't take on work on this product right now (an update or a fix), or null when it can. */
export function productWorkBlocker(state: GameState, office: Office, product: Product): string | null {
  if (office.project) return 'A project is in progress'
  if (teamOf(state, office).length === 0) return 'Hire someone first'
  return productInWork(state, product.id) ? 'Another team is working on it' : null
}

/** Why a product can't be updated by `office` right now, or null when it can. */
export function updateBlocker(state: GameState, office: Office, product: Product): string | null {
  const busy = productWorkBlocker(state, office, product)
  if (busy) return busy
  const wait = UPDATE_MIN_AGE_DAYS - (state.day - lastReleaseDay(product))
  return wait > 0 ? `Wait ${wait} more day${wait === 1 ? '' : 's'}` : null
}

/**
 * The people a promotion of this product speaks to: its reach, but no more than a few times the users its
 * market holds for it now. A crowded or saturated market has few new people left to find.
 */
export function promotionAudience(state: GameState, product: Product): number {
  return Math.min(product.reach, PROMO_AUDIENCE * targetUsers(state, product))
}

/** What a promotion costs: days of what its audience would earn, more for a bigger push. */
export function promotionCost(state: GameState, product: Product, tier: Tier): number {
  const offer = PROMOTIONS[tier]
  return price(revenueForUsers(product.productTypeId, promotionAudience(state, product), product.audienceId) * offer.costDays, offer.costFloor)
}

/** Days of use a user brought by a marketing push is worth, on average: most drift back within weeks, the few who become regulars stay about a year. */
const DAYS_PER_BROUGHT_USER = ((1 - PROMO_KEEP) / USER_DECLINE + PROMO_KEEP * PROMO_LOYAL_DAYS) * PROMO_FRICTION

/**
 * About what a promotion earns back for every dollar it costs, if the product stays fresh: 1.5 or so after
 * a good rest, well under 1 soon after the last one. Ignores the cost floor's rounding.
 */
export function promotionReturn(state: GameState, product: Product, tier: Tier): number {
  const offer = PROMOTIONS[tier]
  const cost = promotionCost(state, product, tier)
  const users = promotionAudience(state, product) * offer.users * promotionEffect(state, product)
  return cost > 0 ? (revenueForUsers(product.productTypeId, users, product.audienceId) * DAYS_PER_BROUGHT_USER) / cost : 0
}

/**
 * How much of its users a promotion would bring right now, 0..1: full for a product that has not been pushed
 * lately, and less the sooner it follows the last push (a launch campaign counts too).
 */
export function promotionEffect(state: GameState, product: Product): number {
  if (product.boostUntil <= 0) return 1
  const rested = Math.min(1, Math.max(0, state.day - product.boostUntil) / PROMO_RECOVERY_DAYS)
  return PROMO_MIN_EFFECT + (1 - PROMO_MIN_EFFECT) * rested
}

/** Starts a marketing push on a product: its new users, a share of `audience` scaled by `effect`, arrive a little each day while it runs. */
export function startBoost(product: Product, offer: MarketingOffer, day: number, audience: number, effect = 1): void {
  product.boostUntil = day + offer.days
  product.boostUsers = (audience * offer.users * effect) / offer.days
}

/** Why a product can't be promoted at this tier, or null when it can. */
export function promotionBlocker(state: GameState, product: Product, tier: Tier): string | null {
  const left = product.boostUntil - state.day
  if (left > 0) return `Promoted for ${left} more day${left === 1 ? '' : 's'}`
  return state.money < promotionCost(state, product, tier) ? 'Not enough money' : null
}

export function promoteProduct(state: GameState, productId: number, tier: Tier): Result {
  const product = state.products.find((p) => p.id === productId)
  if (!product) return fail('Unknown product')
  const blocker = promotionBlocker(state, product, tier)
  if (blocker) return fail(blocker)
  const audience = promotionAudience(state, product)
  state.money -= promotionCost(state, product, tier)
  startBoost(product, PROMOTIONS[tier], state.day, audience, promotionEffect(state, product))
  return OK
}

/**
 * The users a launch would reach right now, without the per-product luck. The launch campaign is
 * priced from this, so the price the player sees is the price they pay.
 */
export function estimateReach(state: GameState, project: Project, quality: number): number {
  return computeReach(project, quality, state.reputation, marketDemand(state, project.productTypeId)) * pmReachFactor(state, officeRunning(state, project))
}

/** The people a launch campaign speaks to: as for a promotion, the reach, but no more than a few times the users the market will hold for it. */
export function campaignAudience(state: GameState, project: Project, quality: number): number {
  const reach = estimateReach(state, project, quality)
  return Math.min(reach, PROMO_AUDIENCE * settledUsers(state, project.productTypeId, project.featureIds, reach))
}

/** A launch campaign is priced from what its audience would earn per day. */
export function campaignCost(state: GameState, project: Project, quality: number, tier: Tier): number {
  const offer = CAMPAIGNS[tier]
  const daily = revenueForUsers(project.productTypeId, campaignAudience(state, project, quality), project.audienceId)
  return price(daily * offer.costDays, offer.costFloor)
}

/** The research that lets a product promote itself. */
export const AUTO_PROMOTE_RESEARCH = 'marketing_automation'

export function autoPromoteUnlocked(state: GameState): boolean {
  return state.research.done.includes(AUTO_PROMOTE_RESEARCH)
}

/** Sets a product to promote itself at `tier` whenever it is not already promoted and the bank can spare it; null turns it off. */
export function setAutoPromote(state: GameState, productId: number, tier: Tier | null): Result {
  const product = state.products.find((p) => p.id === productId)
  if (!product) return fail('Unknown product')
  if (!autoPromoteUnlocked(state)) return fail('Research Marketing automation first')
  if (tier !== null && !TIERS.includes(tier)) return fail('Unknown promotion')
  product.autoPromote = tier
  return OK
}

/** The bank a studio keeps whatever it promotes: a couple of months of what it burns. */
export function promotionReserve(state: GameState): number {
  return (monthlyBurn(state) / DAYS_PER_MONTH) * AUTO_PROMOTE_RESERVE_DAYS
}

/** Products set to promote themselves do so when they can, without dipping into the reserve. */
export function autoPromoteDay(state: GameState): void {
  if (!autoPromoteUnlocked(state)) return
  for (const product of state.products) {
    const tier = product.autoPromote
    if (!tier || promotionBlocker(state, product, tier) !== null) continue
    const effect = promotionEffect(state, product)
    if (effect < AUTO_PROMOTE_MIN_EFFECT) continue
    const cost = promotionCost(state, product, tier)
    if (state.money - cost < promotionReserve(state)) continue
    const payback = Math.round(promotionReturn(state, product, tier) * 100) / 100
    state.money -= cost
    startBoost(product, PROMOTIONS[tier], state.day, promotionAudience(state, product), effect)
    logEntry(state, 'promote.auto', `${product.name} promoted itself (${tier})`, { cost, users: Math.round(product.users), effect: Math.round(effect * 100), payback })
  }
}

export type ProductPhase = 'Launch' | 'Growing' | 'Established' | 'Fading'

/** Where a product is in its life: new, still gaining users, settled, or losing people for want of an update. */
export function productPhase(state: GameState, product: Product): ProductPhase {
  if (state.day - product.releaseDay < FRESH_DAYS) return 'Launch'
  if (interest(product, state.day) < 0.5) return 'Fading'
  return product.users < targetUsers(state, product) * 0.9 ? 'Growing' : 'Established'
}

/** Why another new product can't be started, or null when it can. Only applies outside the garage. */
export function newProductBlocker(state: GameState): string | null {
  if (inGarage(state)) return null
  const making = activeProjects(state).filter((a) => a.project.kind === 'new').length
  if (state.products.length + making >= PORTFOLIO_LIMIT) {
    return `Your portfolio is full (${PORTFOLIO_LIMIT} products): retire one to make room, or grow one you have`
  }
  if (state.products.length >= NEW_PRODUCT_FREE_COUNT) {
    const wait = NEW_PRODUCT_GAP_DAYS - (state.day - state.lastNewProductDay)
    if (wait > 0) return `One new product a year: ${wait} more day${wait === 1 ? '' : 's'}`
  }
  return null
}

/** The size a product grows into, or null for a flagship. */
export function nextSize(size: ProjectSize): ProjectSize | null {
  return PROJECT_SIZE_IDS[PROJECT_SIZE_IDS.indexOf(size) + 1] ?? null
}

/** Why `office` can't start growing `product` into the next size, or null when it can. */
export function growBlocker(state: GameState, office: Office, product: Product): string | null {
  const next = nextSize(product.size)
  if (!next) return 'Already as big as a product gets'
  if (state.day - product.releaseDay < GROW_MIN_AGE_DAYS) return `Too young: ${GROW_MIN_AGE_DAYS - (state.day - product.releaseDay)} more days`
  const busy = updateBlocker(state, office, product)
  if (busy) return busy
  const lock = sizeLock(state, next, office)
  if (lock) return `${PROJECT_SIZES[next].name} projects need ${lock}`
  const phase = productPhase(state, product)
  return phase === 'Fading' ? 'Bring it back to life with an update first' : null
}

/** Why `office` can't start localising `product` for Europe right now, or null when it can. */
export function localiseBlocker(state: GameState, office: Office, product: Product): string | null {
  if (euShareOf(product) > 0) return 'Already in Europe'
  if (!hasEuropeOffice(state)) return 'Needs an office in Europe'
  if (!product.featureIds.includes(COMPLIANCE_FEATURE)) return `Europe's data rules: it needs ${getFeature(COMPLIANCE_FEATURE).name} first`
  return updateBlocker(state, office, product)
}
