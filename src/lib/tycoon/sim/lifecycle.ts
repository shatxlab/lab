import { AUTO_PROMOTE_RESERVE_DAYS, CAMPAIGNS, DAYS_PER_MONTH, FRESH_DAYS, PROMOTIONS, UPDATE_MIN_AGE_DAYS, type MarketingOffer } from './balance'
import { monthlyBurn } from './economy'
import { logEntry } from './journal'
import { marketDemand } from './market'
import { productInWork, staffOf } from './offices'
import { interest, lastReleaseDay, revenueForUsers, targetUsers } from './products'
import { computeReach } from './scoring'
import { fail, OK, TIERS, type GameState, type Office, type Product, type Project, type Result, type Tier } from './types'

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
    const cost = promotionCost(product, tier)
    if (state.money - cost < promotionReserve(state)) continue
    state.money -= cost
    startBoost(product, PROMOTIONS[tier], state.day)
    logEntry(state, 'promote.auto', `${product.name} promoted itself (${tier})`, { cost, users: Math.round(product.users) })
  }
}

export type ProductPhase = 'Launch' | 'Growing' | 'Established' | 'Fading'

/** Where a product is in its life: new, still gaining users, settled, or losing people for want of an update. */
export function productPhase(state: GameState, product: Product): ProductPhase {
  if (state.day - product.releaseDay < FRESH_DAYS) return 'Launch'
  if (interest(product, state.day) < 0.5) return 'Fading'
  return product.users < targetUsers(state, product) * 0.9 ? 'Growing' : 'Established'
}
