import { CRISIS_MONTHS, CRISIS_MORALE, CRISIS_RATIO, RALLY_CASH_SHARE, RALLY_MORALE, RALLY_SETBACK } from './balance'
import { offerEvent } from './events'
import { logEntry } from './journal'
import { adjustMorale } from './morale'
import { nemesisRival } from './nemesis'
import type { GameState } from './types'

/**
 * The company can turn on its founder. When the people are unhappy and the rival is pulling ahead, month after month, they
 * stop believing in you; you can rally them once, and after that all that is left is to step down. It is the way a company
 * with money in the bank still ends badly: you lose it, and your friend, and start again at a café table.
 */

const averageMorale = (state: GameState): number =>
  state.employees.length === 0 ? 100 : state.employees.reduce((sum, e) => sum + e.morale, 0) / state.employees.length

/** Whether the company doubts you this month. */
export function doubtsYou(state: GameState): boolean {
  const ratio = nemesisRival(state)?.ratio ?? 0
  return state.employees.length >= 3 && averageMorale(state) < CRISIS_MORALE && ratio >= CRISIS_RATIO
}

/** What rallying the company costs: a share of the cash. */
export const rallyCost = (state: GameState): number => Math.round(Math.max(0, state.money) * RALLY_CASH_SHARE)

/** Once a month: doubts add up, ease off when things look better, and past the limit a vote of no confidence is put to you. */
export function crisisMonth(state: GameState): void {
  if (state.gameOver || !state.nemesis) {
    state.doubtMonths = 0
    return
  }
  state.doubtMonths = doubtsYou(state) ? (state.doubtMonths ?? 0) + 1 : Math.max(0, (state.doubtMonths ?? 0) - 1)
  if ((state.doubtMonths ?? 0) >= CRISIS_MONTHS && !state.pendingEvent) {
    offerEvent(state, 'no_confidence')
  }
}

/** You rally the company: a speech, a bonus and a plan. They believe you, for now. The event charges `rallyCost`. */
export function rally(state: GameState): string {
  state.rallied = true
  state.doubtMonths = 0
  adjustMorale(state, RALLY_MORALE)
  const rival = nemesisRival(state)
  if (rival?.ratio !== undefined) rival.ratio = Math.max(0.3, rival.ratio - RALLY_SETBACK)
  logEntry(state, 'crisis.rally', 'Rallied the company')
  return 'They believe you again. Do not waste it.'
}

/** You step down: the run ends here, and you leave with next to nothing. */
export function stepDown(state: GameState): string {
  state.gameOver = true
  state.ending = { kind: 'ousted', day: state.day, worth: 0 }
  logEntry(state, 'end.ousted', 'Stepped down as the company lost confidence')
  return 'You clear your desk. It is not yours any more.'
}
