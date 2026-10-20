import { audienceFor } from '@/lib/tycoon/data/audiences'
import { EU_PAY, EU_TYPE_SIZE } from '@/lib/tycoon/data/regions'
import { expectedFeatures } from '@/lib/tycoon/data/eras'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import {
  BUG_COMPLAINT_REPUTATION,
  BUG_COMPLAINTS,
  BUG_DISCOVERY,
  BUG_PRONE_MAX,
  BUG_PRONE_MIN,
  BUG_PRONE_SPREAD,
  BUG_SURFACE_RATE,
  BUG_LEAK_FLOOR,
  BUG_LEAK_NO_QA,
  BUG_TOLERANCE,
  BUGS_PER_POINT,
  DAYS_PER_MONTH,
  EXPECTED_FEATURE_FLOOR,
  EXPECTED_FEATURE_PENALTY,
  FRESH_DAYS,
  MATURITY_MAX_UPDATES,
  MATURITY_PER_UPDATE,
  MARKET_CAP,
  MARKET_ROOM,
  PROJECT_SIZES,
  REPUTATION_MAX,
  RIVAL_ABROAD,
  STALE_DAYS,
  USER_DECLINE,
  USER_DISCOVERY,
  USER_WORD_OF_MOUTH,
} from './balance'
import { coverage, featureReach } from './scoring'
import { DISCIPLINES, REGIONS, type GameState, type Product, type Project, type ProjectSize, type Region, type RivalProduct } from './types'

/** Day of the product's most recent release or update. */
export function lastReleaseDay(product: Product): number {
  return product.updates.reduce((day, u) => Math.max(day, u.day), product.releaseDay)
}

/** Interest in a product of `size` last released on `lastRelease`: full for a while, then fading until the next update; slower for one that has had `updates`. */
export function interestSince(lastRelease: number, size: ProjectSize, day: number, updates = 0): number {
  const life = PROJECT_SIZES[size].life
  const stale = day - lastRelease - FRESH_DAYS * life
  const maturity = 1 + MATURITY_PER_UPDATE * Math.min(updates, MATURITY_MAX_UPDATES)
  return stale <= 0 ? 1 : Math.exp(-stale / (STALE_DAYS * life * maturity))
}

/** How interested users still are, 0..1: fully for a while after each release, then fading until the next update. */
export function interest(product: Product, day: number): number {
  return interestSince(lastReleaseDay(product), product.size, day, product.updates.length)
}

/** Features this era's users expect of the product that it doesn't have. */
export function missingFeatures(product: Product, day: number): string[] {
  return expectedFeatures(product.productTypeId, day).filter((id) => !product.featureIds.includes(id))
}

/** Share of its reach a product keeps for lacking what users now take for granted, 0..1. */
export function expectationFactor(product: Product, day: number): number {
  return Math.max(EXPECTED_FEATURE_FLOOR, 1 - EXPECTED_FEATURE_PENALTY * missingFeatures(product, day).length)
}

/** How big a region's market for this product type is, next to the US one. */
export function regionScale(productTypeId: string, region: Region): number {
  return region === 'us' ? 1 : (EU_TYPE_SIZE[productTypeId] ?? 0.7)
}

/** The share of a product's reach that is in Europe: 0 until it is localised. */
export const euShareOf = (product: Pick<Product, 'euShare'>): number => product.euShare ?? 0

/** Users a product has in a region. */
export function usersIn(product: Pick<Product, 'users' | 'euUsers'>, region: Region): number {
  const eu = product.euUsers ?? 0
  return region === 'eu' ? eu : product.users - eu
}

/** The part of a product's reach that is in a region. */
export function reachIn(product: Pick<Product, 'reach' | 'euShare'>, region: Region): number {
  return product.reach * (region === 'eu' ? euShareOf(product) : 1 - euShareOf(product))
}

/**
 * Users a product could hold in a region, eased toward the market's cap: about `users` while that is small
 * next to the type's audience there, never more than MARKET_CAP times it however big the reach.
 */
export function saturate(productTypeId: string, users: number, region: Region = 'us'): number {
  const cap = getProductType(productTypeId).audience * regionScale(productTypeId, region) * MARKET_CAP
  return cap * (1 - Math.exp(-users / cap))
}

/** How much of its market a product takes up: its reach while it holds people's interest, against the market's room. */
function marketWeight(productTypeId: string, reach: number, interestNow: number, region: Region): number {
  return saturate(productTypeId, reach * interestNow, region) / (getProductType(productTypeId).audience * regionScale(productTypeId, region) * MARKET_ROOM)
}

/** The key of one product type's market in one region. */
export const marketKey = (productTypeId: string, region: Region): string => (region === 'us' ? productTypeId : `${productTypeId}@${region}`)

const ownWeight = (product: Product, day: number, region: Region) =>
  marketWeight(product.productTypeId, reachIn(product, region), interest(product, day), region)
const rivalWeight = (product: RivalProduct, day: number, region: Region) =>
  marketWeight(product.productTypeId, product.reach, interestSince(product.updatedDay, product.size, day), region)

/** Where a rival is at home. */
const homeOf = (state: GameState, rivalId: number): Region => state.rivals.find((r) => r.id === rivalId)?.region ?? 'us'

/** Every market's total weight, a market for each product type in each region: all the live products of the type there, yours and the rivals' (a rival weighs in full at home and a little abroad). */
export function marketWeights(state: GameState): Map<string, number> {
  const weights = new Map<string, number>()
  const add = (type: string, region: Region, weight: number) => {
    const key = marketKey(type, region)
    weights.set(key, (weights.get(key) ?? 0) + weight)
  }
  for (const p of state.products) for (const region of REGIONS) if (reachIn(p, region) > 0) add(p.productTypeId, region, ownWeight(p, state.day, region))
  for (const p of state.rivalProducts) {
    const home = homeOf(state, p.rivalId)
    for (const region of REGIONS) add(p.productTypeId, region, rivalWeight(p, state.day, region) * (region === home ? 1 : RIVAL_ABROAD))
  }
  return weights
}

/** How crowded a product's market is by everyone else's products: 0 when it is alone. */
function crowding(weights: Map<string, number>, productTypeId: string, own: number, region: Region): number {
  return Math.max(0, (weights.get(marketKey(productTypeId, region)) ?? 0) - own)
}

/** How crowded the market for this product type is right now in a region, for a product that isn't in it yet. */
export function marketCrowding(state: GameState, productTypeId: string, region: Region = 'us'): number {
  return crowding(marketWeights(state), productTypeId, 0, region)
}

/**
 * Users a product with this reach and these features can expect to settle at in today's market, fresh and
 * bug-free: less than its reach when it lacks what users expect, or when others already crowd the market.
 */
export function settledUsers(state: GameState, productTypeId: string, featureIds: readonly string[], reach: number, region: Region = 'us'): number {
  const missing = expectedFeatures(productTypeId, state.day).filter((id) => !featureIds.includes(id)).length
  const expectation = Math.max(EXPECTED_FEATURE_FLOOR, 1 - EXPECTED_FEATURE_PENALTY * missing)
  return saturate(productTypeId, reach * expectation, region) / (1 + marketCrowding(state, productTypeId, region))
}

/** Bugs per unit of the size's work: how buggy it feels, whatever its size. */
export function bugDensity(product: Product): number {
  return product.bugs / PROJECT_SIZES[product.size].work
}

/** Share of the users it could have that a product keeps despite its bugs, 0..1. */
export function bugFactor(product: Product): number {
  return 1 / (1 + bugDensity(product) / BUG_TOLERANCE)
}

/**
 * Users the product is heading toward today: its reach, cut by staleness, bugs, features users now expect
 * that it lacks, and the other products competing for the same people.
 */
export function targetUsersIn(state: GameState, product: Product, region: Region, weights = marketWeights(state)): number {
  const reach = reachIn(product, region)
  if (reach <= 0) return 0
  const crowd = crowding(weights, product.productTypeId, ownWeight(product, state.day, region), region)
  const users = reach * interest(product, state.day) * bugFactor(product) * expectationFactor(product, state.day)
  return saturate(product.productTypeId, users, region) / (1 + crowd)
}

/** The users a product is heading toward in all its markets together. */
export function targetUsers(state: GameState, product: Product, weights = marketWeights(state)): number {
  return REGIONS.reduce((sum, region) => sum + targetUsersIn(state, product, region, weights), 0)
}

/** The same for a rival's product, which keeps up with what users expect and has no bugs to speak of. */
export function rivalTargetUsers(state: GameState, product: RivalProduct, weights = marketWeights(state)): number {
  const home = homeOf(state, product.rivalId)
  const crowd = crowding(weights, product.productTypeId, rivalWeight(product, state.day, home), home)
  return saturate(product.productTypeId, product.reach * interestSince(product.updatedDay, product.size, state.day), home) / (1 + crowd)
}

/** Income per day from `users` of a product type, before studio-wide modifiers. */
export function revenueForUsers(productTypeId: string, users: number, audienceId?: string, region: Region = 'us'): number {
  return (users * getProductType(productTypeId).revenuePerUser * audienceFor(productTypeId, audienceId).pay * (region === 'eu' ? EU_PAY : 1)) / DAYS_PER_MONTH
}

/** What the product earns per day right now, before studio-wide modifiers: its users in each region pay what people there pay. */
export function productRevenue(product: Product): number {
  return REGIONS.reduce((sum, region) => sum + revenueForUsers(product.productTypeId, usersIn(product, region), product.audienceId, region), 0)
}

/** Bugs a release of `project` ships with: more work means more bugs, and QA catches them. */
export function releaseBugs(project: Project): number {
  const points = DISCIPLINES.reduce((sum, d) => sum + project.target[d], 0)
  const leak = Math.max(BUG_LEAK_FLOOR, BUG_LEAK_NO_QA - (BUG_LEAK_NO_QA - 1) * coverage(project, 'qa'))
  return points * BUGS_PER_POINT * leak * project.bugRisk
}

/** How prone to bugs a product's code is, from its quality: 1 at quality 60, much less for a polished product. */
export function bugProneness(quality: number): number {
  return Math.min(BUG_PRONE_MAX, Math.max(BUG_PRONE_MIN, (100 - quality) / BUG_PRONE_SPREAD))
}

/** New bugs users find per day: more in bigger products, more the more people use it, and fewer in well-made ones. */
export function bugsFoundPerDay(product: Product): number {
  const size = PROJECT_SIZES[product.size]
  const usage = product.users / (getProductType(product.productTypeId).audience * size.reach)
  return BUG_DISCOVERY * size.work * Math.sqrt(Math.max(usage, 0)) * bugProneness(product.quality)
}

/** Moves a share of the bugs an update shipped, which nobody has found yet, into the open ones. */
export function surfaceBugs(product: Product): void {
  if (product.pendingBugs <= 0) return
  const surfacing = product.pendingBugs * BUG_SURFACE_RATE
  const left = product.pendingBugs - surfacing
  product.bugs += left < 0.01 ? product.pendingBugs : surfacing
  product.pendingBugs = left < 0.01 ? 0 : left
}

/**
 * Users after one more day. Below the target they sign up slowly at first and then faster, as word of
 * mouth takes over, easing off as the target fills (an S-curve); above it they drift away.
 */
export function nextUsers(users: number, target: number): number {
  if (users >= target) return users - (users - target) * USER_DECLINE
  return users + (USER_DISCOVERY * target + USER_WORD_OF_MOUTH * users) * (1 - users / target)
}

/**
 * One day for every live product, yours and the rivals': users move toward today's target. On yours a
 * running promotion brings in its share, and users find new bugs; a product that gets buggy enough sets
 * off public complaints, costing reputation.
 */
export function productsDay(state: GameState): void {
  const weights = marketWeights(state)
  for (const product of state.rivalProducts) product.users = nextUsers(product.users, rivalTargetUsers(state, product, weights))
  for (const product of state.products) {
    const share = euShareOf(product)
    const us = nextUsers(usersIn(product, 'us'), targetUsersIn(state, product, 'us', weights))
    const eu = share > 0 ? nextUsers(usersIn(product, 'eu'), targetUsersIn(state, product, 'eu', weights)) : 0
    const boost = state.day < product.boostUntil ? product.boostUsers : 0
    // A promotion reaches people in each market in proportion to the reach it has there.
    product.users = us + eu + boost
    if (share > 0) product.euUsers = eu + boost * share

    const before = bugDensity(product)
    surfaceBugs(product)
    product.bugs += bugsFoundPerDay(product)
    if (before < BUG_COMPLAINTS && bugDensity(product) >= BUG_COMPLAINTS) {
      state.reputation = Math.max(0, Math.min(REPUTATION_MAX, state.reputation - BUG_COMPLAINT_REPUTATION))
      state.events.push({
        type: 'notice',
        text: `${product.name} has ${Math.round(product.bugs)} open bugs and ${getProductType(product.productTypeId).userNoun} are complaining in public: -${BUG_COMPLAINT_REPUTATION} reputation.`,
      })
    }
  }
}
