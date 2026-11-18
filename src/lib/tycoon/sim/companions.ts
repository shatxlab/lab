import { getProductType } from '@/lib/tycoon/data/productTypes'
import { getCompanion, type Companion } from '@/lib/tycoon/data/companions'
import { COMPANION_CARE_FIT, COMPANION_KEEP_PAY, COMPANION_KEEP_RETENTION, COMPANION_REACH_BOOST, COMPANION_SHARE, COMPANION_SLOTS, DAYS_PER_MONTH } from './balance'
import { COMPANION_SERVICE_DEMAND, operating, productService, serviceOutput } from './services'
import { bugDensity, bugsFoundPerDay, interest } from './products'
import { productTypeLock } from './unlocks'
import type { GameState, Product } from './types'

/** The products counted by legacy retained-catalogue admission; not the managed companion limit. */
export const slotProducts = (state: GameState): Product[] => state.products.filter((p) => p.role !== undefined)

export const companionsOf = (state: GameState): Product[] => state.products.filter((p) => p.role === 'reach' || p.role === 'keep')

/** Legacy retained-catalogue allowance (also used by acquisitions), not a managed companion cap. */
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
  if (companion.id === 'ai_assistant') {
    const lock = productTypeLock(state, getProductType(companion.productTypeId))
    if (lock) return lock
  }
  // Managed ecosystems pay live hosting/support demand; scarce effective care bounds their value,
  // not an arbitrary catalogue count. Existing products and unfinished paid launches remain intact.
  if (operating(state)) return null
  return freeSlots(state) > 0 ? null : 'Both second-product slots are taken: retire a side product or a companion'
}

/** Old saves retain their pre-operations effects; live operations must actually supply care. */
export function companionCoverage(state: GameState): number {
  if (!operating(state)) return looksAfterCompanions(state) ? 1 : 0
  const hit = state.products.find((p) => p.id === state.signatureId)
  if (!hit) return 0
  const service = productService(state, hit, 'reliability')
  return Math.min(1, service.provided / Math.max(COMPANION_SERVICE_DEMAND, service.demand))
}

/** What the hit gets from its healthy companions, bounded by shared care in operating companies. */
export function companionEffects(state: GameState): { reach: number; retention: number; pay: number } {
  const total = { reach: 0, retention: 0, pay: 0 }
  const coverage = operating(state) ? companionCoverage(state) : 1
  for (const product of companionsOf(state)) {
    if (!companionHealthy(state, product)) continue
    if (product.role === 'reach') total.reach += COMPANION_REACH_BOOST * coverage
    else {
      total.retention += COMPANION_KEEP_RETENTION * coverage
      total.pay += COMPANION_KEEP_PAY * coverage
    }
  }
  return total
}

/** Fit points a day an unhealthy companion costs the hit. */
export function companionPressure(state: GameState): number {
  return companionsOf(state).filter((p) => !companionHealthy(state, p)).length * COMPANION_CARE_FIT
}

/** A pure launch draft: previews and execution use identical users/quality/bug-demand inputs. */
function companionDraft(state: GameState, companion: Companion, hit: Product): Product {
  const users = Math.round(hit.users * COMPANION_SHARE)
  return {
    id: state.nextId, name: companion.name, productTypeId: companion.productTypeId,
    size: 'small', featureIds: [], quality: hit.quality, releaseDay: state.day,
    reach: users, users, bugs: 0, pendingBugs: 0, hit: false, totalRevenue: 0, updates: [],
    boostUntil: 0, boostUsers: 0, role: companion.role, companionId: companion.id,
  }
}

/** Informational capacity, not a second labour pool or a launch promise.
 * Excluding the prospective build floor prevents showing its former standing care as simultaneous output.
 * Paid launches reserve forecast demand for display only: later neglect must not erase paid delivery.
 */
export function ecosystemCapacity(state: GameState, buildOfficeId?: number) {
  if (!operating(state)) return null
  const hit = state.products.find((p) => p.id === state.signatureId)
  if (!hit) return null
  const live = productService(state, hit, 'reliability')
  const floor = state.offices.find((o) => o.id === buildOfficeId)
  const lostCare = floor?.assignment?.kind === 'standing' && floor.assignment.service === 'reliability' && floor.assignment.productId === hit.id
    ? serviceOutput(state, floor, 'reliability') : 0
  const pending = state.offices.filter((o) => o.id !== buildOfficeId && o.project?.parentId === hit.id)
    .flatMap((o) => {
      const id = o.project?.itemId
      const c = id?.startsWith('companion:') ? getCompanion(id.slice('companion:'.length)) : undefined
      return c && !state.products.some((p) => p.companionId === c.id) ? [c] : []
    }).filter((c, index, all) => all.findIndex((other) => other.id === c.id) === index)
  const reservedDemand = pending.reduce((sum, c) => sum + COMPANION_SERVICE_DEMAND + bugsFoundPerDay(companionDraft(state, c, hit)), 0)
  const provided = Math.max(0, live.provided - lostCare)
  const demand = live.demand + reservedDemand
  return { provided, liveDemand: live.demand, reservedDemand, pending: pending.length, demand, headroom: provided - demand }
}

/** Forecast at today's traffic/quality, including loss of the chosen build floor's care.
 * Demand can change during delivery; partial/no coverage is allowed but never earns full bonuses.
 */
export function companionLaunchForecast(state: GameState, companion: Companion, buildOfficeId?: number) {
  const hit = state.products.find((p) => p.id === state.signatureId)
  const capacity = ecosystemCapacity(state, buildOfficeId)
  if (!hit || !capacity) return null
  const draft = companionDraft(state, companion, hit)
  const bugDemand = bugsFoundPerDay(draft)
  const demand = capacity.demand + COMPANION_SERVICE_DEMAND + bugDemand
  return { ...capacity, users: draft.users, bugDemand, addedDemand: COMPANION_SERVICE_DEMAND + bugDemand,
    demand, headroom: capacity.provided - demand, coverage: Math.min(1, capacity.provided / Math.max(COMPANION_SERVICE_DEMAND, demand)) }
}

/** Launches the companion as a product: a small one, with a slice of the hit's users to start with. */
export function launchCompanion(state: GameState, companionId: string): Product | null {
  const companion = getCompanion(companionId)
  const hit = state.products.find((p) => p.id === state.signatureId)
  if (!companion || !hit || companionBlocker(state, companion)) return null
  const product = companionDraft(state, companion, hit)
  state.nextId++
  state.products.push(product)
  return product
}

/** Legacy care flag. Operating effects and reach use measured companionCoverage instead. */
export const looksAfterCompanions = (state: GameState): boolean => state.offices.some((o) => o.kind === 'office' && (o.assignment ? o.assignment.kind === 'standing' && o.assignment.service === 'reliability' && o.assignment.productId === state.signatureId : o.workstream === 'companions' && o.productId === state.signatureId))

/** Once a month the companions follow the hit: their reach is a slice of its users while they are looked after. */
export function companionsDay(state: GameState): void {
  if (state.day % DAYS_PER_MONTH !== 0) return
  const hit = state.products.find((p) => p.id === state.signatureId)
  if (!hit) return
  const coverage = companionCoverage(state)
  for (const product of companionsOf(state)) {
    // A companion nobody looks after is left to fade on its own.
    if (coverage <= 0) continue
    product.reach = Math.max(product.reach, hit.users * COMPANION_SHARE * coverage)
  }
}
