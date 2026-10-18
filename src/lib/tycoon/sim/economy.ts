import { BANKRUPT_AFTER_DEBT_DAYS, DAYS_PER_MONTH } from './balance'
import { statMultiplier } from './modifiers'
import { monthlyRent } from './offices'
import { productRevenue } from './products'
import type { GameState } from './types'

export function monthlySalaries(state: GameState): number {
  return state.employees.reduce((sum, e) => sum + e.salary, 0) * statMultiplier(state, 'wage')
}

/** Salaries + rent, per month. Costs are charged daily as 1/DAYS_PER_MONTH of this. */
export function monthlyBurn(state: GameState): number {
  return monthlySalaries(state) + monthlyRent(state)
}

/** Revenue the current products bring in on the current day, after active modifiers. */
export function dailyIncome(state: GameState): number {
  const base = state.products.reduce((sum, p) => sum + productRevenue(p), 0)
  return base * statMultiplier(state, 'revenue') + state.acquiredIncome
}

/** Net money per day at today's income and costs. */
export function netPerDay(state: GameState): number {
  return dailyIncome(state) - monthlyBurn(state) / DAYS_PER_MONTH
}

/** Days the current cash lasts at today's net burn, or null if income covers costs. */
export function cashRunwayDays(state: GameState): number | null {
  const net = netPerDay(state)
  return net >= 0 ? null : Math.max(state.money, 0) / -net
}

export function revenueDay(state: GameState): void {
  const mult = statMultiplier(state, 'revenue')
  for (const product of state.products) {
    const revenue = productRevenue(product) * mult
    product.totalRevenue += revenue
    state.money += revenue
    state.lifetimeRevenue += revenue
  }
  // The businesses that came with bought rivals.
  state.money += state.acquiredIncome
  state.lifetimeRevenue += state.acquiredIncome
}

export function costsDay(state: GameState): void {
  state.money -= monthlyBurn(state) / DAYS_PER_MONTH
}

export function checkBankruptcy(state: GameState): void {
  state.debtDays = state.money < 0 ? state.debtDays + 1 : 0
  if (state.debtDays >= BANKRUPT_AFTER_DEBT_DAYS && !state.gameOver) {
    state.gameOver = true
    state.ending = { kind: 'bankrupt', day: state.day }
    state.events.push({ type: 'bankrupt' })
  }
}
