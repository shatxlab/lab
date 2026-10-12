import { DAYS_PER_MONTH, HISTORY_LIMIT } from './balance'
import { dailyIncome, monthlyBurn } from './economy'
import type { GameState, HistoryPoint } from './types'

/** The studio's numbers right now, as a chart point. */
export function sampleNow(state: GameState): HistoryPoint {
  return {
    day: state.day,
    money: state.money,
    income: dailyIncome(state),
    burn: monthlyBurn(state) / DAYS_PER_MONTH,
  }
}

/** Adds this month's sample and drops the oldest beyond the cap. */
export function recordHistory(state: GameState): void {
  state.history.push(sampleNow(state))
  if (state.history.length > HISTORY_LIMIT) state.history.splice(0, state.history.length - HISTORY_LIMIT)
}

/** The recorded months plus today, so a chart always reaches the present. */
export function historyWithNow(state: GameState): HistoryPoint[] {
  const last = state.history[state.history.length - 1]
  return last && last.day >= state.day ? state.history : [...state.history, sampleNow(state)]
}
