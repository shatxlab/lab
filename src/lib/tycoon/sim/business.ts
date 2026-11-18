import { operatingGrowth } from './services'
import { DAYS_PER_MONTH, OUTAGE_LOAD } from './balance'
import { companionEffects } from './companions'
import { cashRunwayDays, dailyIncome, monthlySalaries } from './economy'
import { monthlyRent, workersOf } from './offices'
import { capacityOf, hostingCost, loadOf, worldGrowth } from './scale'
import { toolUpkeep } from './tools'
import { expectedContribution } from './work'
import { DISCIPLINES, emptySkills, type GameState } from './types'

/** Pure current-state facts, not retrospective causal attribution or a second economy model. */
export function businessOverview(state: GameState) {
  const costs = {
    salaries: monthlySalaries(state) / DAYS_PER_MONTH,
    rent: monthlyRent(state) / DAYS_PER_MONTH,
    hosting: hostingCost(state),
    tools: toolUpkeep(state),
  }
  const revenue = dailyIncome(state)
  const totalCosts = Object.values(costs).reduce((sum, value) => sum + value, 0)
  // Count each worker once even in legacy remote/helper arrangements. Fixing staff are excluded.
  const workers = new Map(state.offices.flatMap((office) => workersOf(state, office)).map((worker) => [worker.id, worker]))
  const capacity = emptySkills()
  for (const worker of workers.values()) {
    const rate = expectedContribution(worker, state)
    for (const discipline of DISCIPLINES) capacity[discipline] += rate[discipline]
  }
  const companions = companionEffects(state)
  const products = state.products.filter((product) => product.hit).map((product) => {
    const growth = worldGrowth(product, operatingGrowth(state, product) + (product.id === state.signatureId ? companions.reach : 0))
    const limits: string[] = []
    if (growth.capacityBlocked) limits.push('Servers are full: demand-pull growth is blocked.')
    else if (loadOf(product) >= OUTAGE_LOAD) limits.push('Server load is high: an outage can lose users.')
    if (growth.health < 0) limits.push('Fit is below 50: demand pull is weakening.')
    else if (growth.health === 0) limits.push('Fit is 50: no organic demand-pull growth.')
    if (growth.room <= 0) limits.push('The current market has no remaining headroom.')
    return { id: product.id, name: product.name, users: product.users, fit: product.fit ?? 0,
      capacity: capacityOf(product), load: loadOf(product), growth, limits }
  })
  return { day: state.day, revenue, costs, totalCosts, net: revenue - totalCosts,
    runway: cashRunwayDays(state), workers: workers.size, capacity, products }
}
