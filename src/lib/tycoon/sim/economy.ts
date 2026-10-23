import { BANKRUPT_AFTER_DEBT_DAYS, DAYS_PER_MONTH, INCOME_AVERAGE_DAYS } from './balance'
import { statMultiplier } from './modifiers'
import { inCafe, monthlyRent } from './offices'
import { licenseIncome } from './licensing'
import { productRevenue } from './products'
import type { GameState } from './types'

/** What the team is paid a month; in the café the founders live on their savings and draw nothing. */
export function monthlySalaries(state: GameState): number {
  const cafe = inCafe(state)
  return state.employees.reduce((sum, e) => sum + (cafe && e.founder ? 0 : e.salary), 0) * statMultiplier(state, 'wage')
}

/** Salaries + rent, per month. Costs are charged daily as 1/DAYS_PER_MONTH of this. */
export function monthlyBurn(state: GameState): number {
  return monthlySalaries(state) + monthlyRent(state)
}

/** Revenue the current products bring in on the current day, after active modifiers. */
export function dailyIncome(state: GameState): number {
  const base = state.products.reduce((sum, p) => sum + productRevenue(p) + licenseIncome(state, p), 0)
  return base * statMultiplier(state, 'revenue') + state.acquiredIncome
}

/** Income per day averaged over the last couple of months: what the ranking, the income goals and buyers go by. */
export function trailingIncome(state: GameState): number {
  return state.incomeAverage ?? dailyIncome(state)
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
    const revenue = (productRevenue(product) + licenseIncome(state, product)) * mult
    product.totalRevenue += revenue
    state.money += revenue
    state.lifetimeRevenue += revenue
  }
  // The businesses that came with bought rivals.
  state.money += state.acquiredIncome
  state.lifetimeRevenue += state.acquiredIncome
  const today = dailyIncome(state)
  state.incomeAverage = state.incomeAverage === undefined ? today : state.incomeAverage + (today - state.incomeAverage) / INCOME_AVERAGE_DAYS
}

export function costsDay(state: GameState): void {
  state.money -= monthlyBurn(state) / DAYS_PER_MONTH
}

export function checkBankruptcy(state: GameState): void {
  state.debtDays = state.money < 0 ? state.debtDays + 1 : 0
  if (state.debtDays >= BANKRUPT_AFTER_DEBT_DAYS && !state.gameOver) {
    state.gameOver = true
    state.ending = { kind: 'bankrupt', day: state.day, worth: 0 }
    state.events.push({ type: 'bankrupt' })
  }
}
