import { BASE_CAPACITY, HIT_GROWTH_RATE, HOSTING_PER_USER_DAY, OUTAGE_BUGS, OUTAGE_CHANCE, OUTAGE_LOAD, OUTAGE_REPUTATION, OUTAGE_USER_LOSS, REPUTATION_MAX } from './balance'
import { itemEffects } from '@/lib/tycoon/data/workstreams'
import { marketCap } from './products'
import { rand } from './rng'
import type { GameState, Product } from './types'

/** The users a hit's servers hold: what it starts with, and what its Scale work added. Other products are not held back. */
export function capacityOf(product: Product): number {
  return BASE_CAPACITY + itemEffects(product).capacity
}

/** How full the servers are, 0 and up; 1 is the limit. Zero for a product that is not a hit. */
export function loadOf(product: Product): number {
  return product.hit ? product.users / capacityOf(product) : 0
}

/** What the studio pays for servers per day: its hits' users, at a price each. */
export function hostingCost(state: GameState): number {
  return state.products.reduce((sum, p) => sum + (p.hit ? p.users * HOSTING_PER_USER_DAY : 0), 0)
}

/** What each of a product's users pays, relative to the type's price: Monetisation work raises it. */
export const payFactor = (product: Pick<Product, 'built'>): number => 1 + itemEffects(product).pay

/**
 * One day of load on a hit. Past its capacity users are turned away (they never arrive). Near it, an outage may strike:
 * some users leave for good, bugs surface and the studio's name suffers. Returns true if one struck.
 */
export function loadDay(state: GameState, product: Product): boolean {
  if (!product.hit) return false
  const capacity = capacityOf(product)
  if (product.users > capacity) {
    const keep = capacity / product.users
    product.users = capacity
    if (product.euUsers !== undefined) product.euUsers *= keep
  }
  if (product.users < capacity * OUTAGE_LOAD || rand(state) >= OUTAGE_CHANCE) return false
  const lost = product.users * OUTAGE_USER_LOSS
  product.users -= lost
  if (product.euUsers !== undefined) product.euUsers *= 1 - OUTAGE_USER_LOSS
  product.bugs += OUTAGE_BUGS
  state.reputation = Math.max(0, Math.min(REPUTATION_MAX, state.reputation - OUTAGE_REPUTATION))
  state.events.push({ type: 'notice', text: `${product.name} went down: the servers were full. ${Math.round(lost).toLocaleString('en-US')} users left, and the press noticed.` })
  return true
}

/** How well a hit is doing at holding people, -1 to 1: it grows above a fit of 50 and loses its pull below. */
export function hitHealth(product: Product): number {
  return Math.max(-1, Math.min(1, ((product.fit ?? 0) - 50) / 50))
}

/** The pull a hit has on the world: what multiplies its reach. */
export const worldOf = (product: Pick<Product, 'world' | 'hit'>): number => (product.hit ? (product.world ?? 1) : 1)

/**
 * A hit finds more people each day while it is healthy and its servers are not full; Growth work speeds it up, and it
 * slows as the product fills the market it is in (the Europe share is counted with the rest).
 */
export function growWorld(product: Product, boost = 0): void {
  if (!product.hit) return
  if (product.users >= capacityOf(product) && hitHealth(product) >= 0) return
  const room = Math.max(0, 1 - product.users / (marketCap(product.productTypeId, 'us', true) * (1 + (product.euShare ?? 0))))
  const health = hitHealth(product)
  const rate = health >= 0 ? HIT_GROWTH_RATE * health * room * (1 + itemEffects(product).reach + boost) : HIT_GROWTH_RATE * health
  product.world = Math.max(1, worldOf(product) * (1 + rate))
}
