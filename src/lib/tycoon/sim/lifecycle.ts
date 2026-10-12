import { CAMPAIGNS, PROMOTIONS, UPDATE_MIN_AGE_DAYS, type MarketingOffer } from './balance'
import { marketDemand } from './market'
import { productInWork, staffOf } from './offices'
import { lastReleaseDay, revenueForUsers } from './products'
import { computeReach } from './scoring'
import { fail, OK, type GameState, type Office, type Product, type Project, type Result, type Tier } from './types'

/** Costs are rounded to a tidy $50 so they read as prices. */
const price = (amount: number, floor: number) => Math.max(floor, Math.round(amount / 50) * 50)

/** Why `office` can't take on work on this product right now (an update or a fix), or null when it can. */
export function productWorkBlocker(state: GameState, office: Office, product: Product): string | null {
  if (office.project) return 'A project is in progress'
  if (staffOf(state, office).length === 0) return 'Hire someone first'
  return productInWork(state, product.id) ? 'Another team is working on it' : null
}

/** Why a product can't be updated by `office` right now, or null when it can. */
export function updateBlocker(state: GameState, office: Office, product: Product): string | null {
  const busy = productWorkBlocker(state, office, product)
  if (busy) return busy
  const wait = UPDATE_MIN_AGE_DAYS - (state.day - lastReleaseDay(product))
  return wait > 0 ? `Wait ${wait} more day${wait === 1 ? '' : 's'}` : null
}

/** What a promotion costs: a few days of what the product earns at its full reach, more for a bigger push. */
export function promotionCost(product: Product, tier: Tier): number {
  const offer = PROMOTIONS[tier]
  return price(revenueForUsers(product.productTypeId, product.reach) * offer.costDays, offer.costFloor)
}

/** Starts a marketing push on a product: its new users arrive a little each day while it runs. */
export function startBoost(product: Product, offer: MarketingOffer, day: number): void {
  product.boostUntil = day + offer.days
  product.boostUsers = (product.reach * offer.users) / offer.days
}

/** Why a product can't be promoted at this tier, or null when it can. */
export function promotionBlocker(state: GameState, product: Product, tier: Tier): string | null {
  const left = product.boostUntil - state.day
  if (left > 0) return `Promoted for ${left} more day${left === 1 ? '' : 's'}`
  return state.money < promotionCost(product, tier) ? 'Not enough money' : null
}

export function promoteProduct(state: GameState, productId: number, tier: Tier): Result {
  const product = state.products.find((p) => p.id === productId)
  if (!product) return fail('Unknown product')
  const blocker = promotionBlocker(state, product, tier)
  if (blocker) return fail(blocker)
  state.money -= promotionCost(product, tier)
  startBoost(product, PROMOTIONS[tier], state.day)
  return OK
}

/**
 * The users a launch would reach right now, without the per-product luck. The launch campaign is
 * priced from this, so the price the player sees is the price they pay.
 */
export function estimateReach(state: GameState, project: Project, quality: number): number {
  return computeReach(project, quality, state.reputation, marketDemand(state, project.productTypeId))
}

/** A launch campaign is priced from what the product will earn per day once its users have arrived. */
export function campaignCost(state: GameState, project: Project, quality: number, tier: Tier): number {
  const offer = CAMPAIGNS[tier]
  const daily = revenueForUsers(project.productTypeId, estimateReach(state, project, quality))
  return price(daily * offer.costDays, offer.costFloor)
}
