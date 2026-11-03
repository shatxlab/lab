import { dailyIncome, netPerDay } from './economy'
import { capacityOf } from './scale'
import type { BusinessDecision, BusinessSnapshot, GameState, Product } from './types'

/** Decision/outcome boundaries, not end-of-day samples or causal attribution. No RNG consumed. */
export function businessSnapshot(state: GameState, product: Product): BusinessSnapshot {
  return { day: state.day, cash: state.money, revenue: dailyIncome(state), net: netPerDay(state),
    users: product.users, fit: product.fit ?? 0, bugs: product.bugs,
    reach: product.reach, capacity: capacityOf(product) }
}

export function recordBusinessDecision(state: GameState, product: Product, title: string,
  kind: BusinessDecision['kind'], before: BusinessSnapshot, projectId?: number): void {
  const decision: BusinessDecision = { productId: product.id, title, kind, before,
    ...(projectId === undefined ? {} : { projectId }) }
  state.businessDecisions = [...(state.businessDecisions ?? []), decision].slice(-24)
  if (kind === 'strike') decision.after = businessSnapshot(state, product)
}

/** A project identity prevents unrelated updates from completing the wrong decision. */
export function completeBusinessDecision(state: GameState, productId: number, projectId?: number): void {
  const decision = [...(state.businessDecisions ?? [])].reverse().find((entry) =>
    !entry.after && entry.productId === productId && entry.projectId === projectId)
  const product = state.products.find((entry) => entry.id === productId)
  if (decision && product) decision.after = businessSnapshot(state, product)
}

/** Observed changes over the interval; other work, market events and daily costs also contribute. */
export function businessDelta(before: BusinessSnapshot, after: BusinessSnapshot): BusinessSnapshot {
  return { day: after.day - before.day, cash: after.cash - before.cash,
    revenue: after.revenue - before.revenue, net: after.net - before.net,
    users: after.users - before.users, fit: after.fit - before.fit,
    bugs: after.bugs - before.bugs, reach: after.reach - before.reach,
    capacity: after.capacity - before.capacity }
}
