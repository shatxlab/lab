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
  MARKET_CAP,
  MARKET_ROOM,
  PROJECT_SIZES,
  REPUTATION_MAX,
  STALE_DAYS,
  USER_DECLINE,
  USER_DISCOVERY,
  USER_WORD_OF_MOUTH,
} from './balance'
import { coverage } from './scoring'
import { DISCIPLINES, type GameState, type Product, type Project, type ProjectSize, type RivalProduct } from './types'

/** Day of the product's most recent release or update. */
export function lastReleaseDay(product: Product): number {
  return product.updates.reduce((day, u) => Math.max(day, u.day), product.releaseDay)
}

/** Interest in a product of `size` last released on `lastRelease`: full for a while, then fading until the next update. */
export function interestSince(lastRelease: number, size: ProjectSize, day: number): number {
  const life = PROJECT_SIZES[size].life
  const stale = day - lastRelease - FRESH_DAYS * life
  return stale <= 0 ? 1 : Math.exp(-stale / (STALE_DAYS * life))
}

/** How interested users still are, 0..1: fully for a while after each release, then fading until the next update. */
export function interest(product: Product, day: number): number {
  return interestSince(lastReleaseDay(product), product.size, day)
}

/** Features this era's users expect of the product that it doesn't have. */
export function missingFeatures(product: Product, day: number): string[] {
  return expectedFeatures(product.productTypeId, day).filter((id) => !product.featureIds.includes(id))
}

/** Share of its reach a product keeps for lacking what users now take for granted, 0..1. */
export function expectationFactor(product: Product, day: number): number {
  return Math.max(EXPECTED_FEATURE_FLOOR, 1 - EXPECTED_FEATURE_PENALTY * missingFeatures(product, day).length)
}

/**
 * Users a product could hold, eased toward the market's cap: about `users` while that is small next to
 * the type's audience, never more than MARKET_CAP times it however big the reach.
 */
export function saturate(productTypeId: string, users: number): number {
  const cap = getProductType(productTypeId).audience * MARKET_CAP
  return cap * (1 - Math.exp(-users / cap))
}

/** How much of its market a product takes up: its reach while it holds people's interest, against the market's room. */
function marketWeight(productTypeId: string, reach: number, interestNow: number): number {
  return saturate(productTypeId, reach * interestNow) / (getProductType(productTypeId).audience * MARKET_ROOM)
}

const ownWeight = (product: Product, day: number) => marketWeight(product.productTypeId, product.reach, interest(product, day))
const rivalWeight = (product: RivalProduct, day: number) =>
  marketWeight(product.productTypeId, product.reach, interestSince(product.updatedDay, product.size, day))

/** Every market's total weight: all the live products of each type, yours and the rivals'. */
export function marketWeights(state: GameState): Map<string, number> {
  const weights = new Map<string, number>()
  const add = (type: string, weight: number) => weights.set(type, (weights.get(type) ?? 0) + weight)
  for (const p of state.products) add(p.productTypeId, ownWeight(p, state.day))
  for (const p of state.rivalProducts) add(p.productTypeId, rivalWeight(p, state.day))
  return weights
}

/** How crowded a product's market is by everyone else's products: 0 when it is alone. */
function crowding(weights: Map<string, number>, productTypeId: string, own: number): number {
  return Math.max(0, (weights.get(productTypeId) ?? 0) - own)
}

/** How crowded the market for this product type is right now, for a product that isn't in it yet. */
export function marketCrowding(state: GameState, productTypeId: string): number {
  return crowding(marketWeights(state), productTypeId, 0)
}

/**
 * Users a product with this reach and these features can expect to settle at in today's market, fresh and
 * bug-free: less than its reach when it lacks what users expect, or when others already crowd the market.
 */
export function settledUsers(state: GameState, productTypeId: string, featureIds: readonly string[], reach: number): number {
  const missing = expectedFeatures(productTypeId, state.day).filter((id) => !featureIds.includes(id)).length
  const expectation = Math.max(EXPECTED_FEATURE_FLOOR, 1 - EXPECTED_FEATURE_PENALTY * missing)
  return saturate(productTypeId, reach * expectation) / (1 + marketCrowding(state, productTypeId))
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
export function targetUsers(state: GameState, product: Product, weights = marketWeights(state)): number {
  const crowd = crowding(weights, product.productTypeId, ownWeight(product, state.day))
  const users = product.reach * interest(product, state.day) * bugFactor(product) * expectationFactor(product, state.day)
  return saturate(product.productTypeId, users) / (1 + crowd)
}

/** The same for a rival's product, which keeps up with what users expect and has no bugs to speak of. */
export function rivalTargetUsers(state: GameState, product: RivalProduct, weights = marketWeights(state)): number {
  const crowd = crowding(weights, product.productTypeId, rivalWeight(product, state.day))
  return saturate(product.productTypeId, product.reach * interestSince(product.updatedDay, product.size, state.day)) / (1 + crowd)
}

/** Income per day from `users` of a product type, before studio-wide modifiers. */
export function revenueForUsers(productTypeId: string, users: number): number {
  return (users * getProductType(productTypeId).revenuePerUser) / DAYS_PER_MONTH
}

/** What the product earns per day right now, before studio-wide modifiers. */
export function productRevenue(product: Product): number {
  return revenueForUsers(product.productTypeId, product.users)
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
    product.users = nextUsers(product.users, targetUsers(state, product, weights))
    if (state.day < product.boostUntil) product.users += product.boostUsers

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
