import { getCompanion, type Companion } from '@/lib/tycoon/data/companions'
import { COMPANION_CARE_FIT, COMPANION_KEEP_PAY, COMPANION_KEEP_RETENTION, COMPANION_REACH_BOOST, COMPANION_SHARE, COMPANION_SLOTS, DAYS_PER_MONTH } from './balance'
import { bugDensity, interest } from './products'
import type { GameState, Product } from './types'

/** The live companions of the hit, and the side products kept from the garage: those who take the second-product slots. */
export const slotProducts = (state: GameState): Product[] => state.products.filter((p) => p.role !== undefined)

export const companionsOf = (state: GameState): Product[] => state.products.filter((p) => p.role === 'reach' || p.role === 'keep')

/** Second-product slots still free. */
export const freeSlots = (state: GameState): number => Math.max(0, COMPANION_SLOTS - slotProducts(state).length)

/** Whether a companion is in good shape: fresh, and not buggy. An unhealthy one does nothing for the hit, and costs it. */
export function companionHealthy(state: GameState, product: Product): boolean {
  return interest(product, state.day) >= 0.6 && bugDensity(product) < 10
}

/** Why this companion can't be launched now, or null when it can. */
export function companionBlocker(state: GameState, companion: Companion): string | null {
  const hit = state.products.find((p) => p.id === state.signatureId)
  if (!hit) return 'Needs a hit'
  if (!companion.suits.includes(hit.productTypeId)) return `Does not suit ${hit.name}`
  if (state.products.some((p) => p.companionId === companion.id)) return 'Already launched'
  return freeSlots(state) > 0 ? null : 'Both second-product slots are taken: retire a side product or a companion'
}

/** What the hit gets from its healthy companions. */
export function companionEffects(state: GameState): { reach: number; retention: number; pay: number } {
  const total = { reach: 0, retention: 0, pay: 0 }
  for (const product of companionsOf(state)) {
    if (!companionHealthy(state, product)) continue
    if (product.role === 'reach') total.reach += COMPANION_REACH_BOOST
    else {
      total.retention += COMPANION_KEEP_RETENTION
      total.pay += COMPANION_KEEP_PAY
    }
  }
  return total
}

/** Fit points a day an unhealthy companion costs the hit. */
export function companionPressure(state: GameState): number {
  return companionsOf(state).filter((p) => !companionHealthy(state, p)).length * COMPANION_CARE_FIT
}

/** Launches the companion as a product: a small one, with a slice of the hit's users to start with. */
export function launchCompanion(state: GameState, companionId: string): Product | null {
  const companion = getCompanion(companionId)
  const hit = state.products.find((p) => p.id === state.signatureId)
  if (!companion || !hit || companionBlocker(state, companion)) return null
  const users = Math.round(hit.users * COMPANION_SHARE)
  const product: Product = {
    id: state.nextId++,
    name: companion.name,
    productTypeId: companion.productTypeId,
    size: 'small',
    featureIds: [],
    quality: hit.quality,
    releaseDay: state.day,
    reach: users,
    users,
    bugs: 0,
    pendingBugs: 0,
    hit: false,
    totalRevenue: 0,
    updates: [],
    boostUntil: 0,
    boostUsers: 0,
    role: companion.role,
    companionId: companion.id,
  }
  state.products.push(product)
  return product
}

/** True while some floor works on the hit's Companions stream: the people the companions cost the hit. */
export const looksAfterCompanions = (state: GameState): boolean => state.offices.some((o) => o.kind === 'office' && o.workstream === 'companions' && o.productId === state.signatureId)

/** Once a month the companions follow the hit: their reach is a slice of its users while they are looked after. */
export function companionsDay(state: GameState): void {
  if (state.day % DAYS_PER_MONTH !== 0) return
  const hit = state.products.find((p) => p.id === state.signatureId)
  if (!hit) return
  for (const product of companionsOf(state)) {
    // A companion nobody looks after is left to fade on its own.
    if (!looksAfterCompanions(state)) continue
    product.reach = Math.max(product.reach, hit.users * COMPANION_SHARE)
  }
}
