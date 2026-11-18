import { careerSpeed } from './career-profile'
import { professionWorkMultiplier } from './people-management'
import { BUG_SURFACE_RATE, INCIDENT_RELIABILITY_MULTIPLIER } from './balance'
import { bugsFoundPerDay } from './products'
import { isResearched } from './unlocks'
import { staffOf } from './offices'
import { teamRate } from './work'
import { standingService, type StandingService } from './operating-contract'
import type { GameState, Office, Product } from './types'

export const operating = (state: GameState): boolean => state.offices.some((o) => o.assignment !== undefined)

/** Bounded service accounting. Payroll/rent already charge all staff; no second free worker pool. */
export function serviceOutput(state: GameState, office: Office, service: StandingService['service']): number {
  const rate = teamRate(state, office)
  const analysis = staffOf(state, office).filter((e) => (e.role === 'analyst' || e.role === 'pm') && !e.training && e.title !== 'CEO' && !(e.founder && state.deepWork))
    .reduce((sum, e) => sum + (e.analysis ?? 0) / 50 * (state.peopleManagement ? careerSpeed(e) * professionWorkMultiplier(state, e) : 1), 0)
  if (service === 'research') return analysis
  if (service === 'growth') return analysis + rate.design / 20
  return Math.min(rate.engineering, rate.qa) / 20 * (operating(state) && isResearched(state, 'incident_management') ? INCIDENT_RELIABILITY_MULTIPLIER : 1)
}

/** Companions share flagship reliability; unrelated retained products do not. */
export function reliabilityProducts(state: GameState, product: Product): Product[] {
  return product.id === state.signatureId
    ? [product, ...state.products.filter((p) => p.role === 'reach' || p.role === 'keep')]
    : [product]
}

/** Routine integration/support costs, in the same service points as fixing one bug. */
export const COMPANION_SERVICE_DEMAND = 0.25
export function companionServiceDemand(state: GameState, product: Product): number {
  return product.id === state.signatureId ? (reliabilityProducts(state, product).length - 1) * COMPANION_SERVICE_DEMAND : 0
}

export function productService(state: GameState, product: Product, service: StandingService['service']): StandingService {
  const provided = state.offices.reduce((sum, o) => {
    const a = o.assignment
    return sum + (a?.kind === 'standing' && a.service === service && a.productId === product.id ? serviceOutput(state, o, service) : 0)
  }, 0)
  const demand = service === 'reliability' ? reliabilityProducts(state, product).reduce((sum, p) => sum + bugsFoundPerDay(p) + p.pendingBugs * BUG_SURFACE_RATE + p.bugs / 60, 0) + companionServiceDemand(state, product)
    : service === 'growth' ? 1 + product.users / 500_000 : state.research.active ? 1 : 0
  return standingService(service, provided, demand, service === 'reliability' ? 'service points/day' : 'specialist days/day')
}

/** A staffed campaign accelerates healthy organic demand by at most 25%, never per-floor compounding. */
export function operatingGrowth(state: GameState, product: Product): number {
  if (!operating(state)) return 0
  const service = productService(state, product, 'growth')
  return 0.25 * Math.min(1, service.provided / Math.max(1, service.demand))
}
