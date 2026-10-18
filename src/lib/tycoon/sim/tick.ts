import { CANDIDATE_REFRESH_DAYS, DAYS_PER_MONTH } from './balance'
import { contractsDay } from './contracts'
import { checkBankruptcy, costsDay, revenueDay } from './economy'
import { rollRandomEvent } from './events'
import { recordHistory } from './history'
import { journalDay, journalMonth } from './journal'
import { careerDay } from './careers'
import { exitDay } from './exit'
import { fixesDay } from './fixes'
import { autoPromoteDay } from './lifecycle'
import { refreshCandidates, salaryOf } from './hiring'
import { updateMarket } from './market'
import { checkMilestones } from './milestones'
import { pruneModifiers } from './modifiers'
import { researchDay } from './research'
import { eraIndexAt } from '@/lib/tycoon/data/eras'
import { productsDay } from './products'
import { rankingDay, rivalArrives, rivalsDay } from './rivals'
import { checkStage } from './stages'
import { moraleDay, trainingDay } from './staff'
import type { GameState, SimEvent } from './types'
import { workDay } from './work'

/**
 * The only place time moves. Order: bug fixing, work, the rivals, users and bugs, income, the ranking, a new era, costs, research, training, morale, expiring modifiers, monthly raises and
 * market drift and a history sample, hire-pool refresh, bankruptcy, milestones and the journey, then maybe a random event.
 */
export function advanceDay(state: GameState): void {
  if (state.gameOver) return
  const eventsBefore = state.events.length
  state.day += 1
  state.dayWork = []
  fixesDay(state)
  workDay(state)
  rivalsDay(state)
  productsDay(state)
  revenueDay(state)
  rankingDay(state)
  if (eraIndexAt(state.day) !== eraIndexAt(state.day - 1)) {
    state.events.push({ type: 'era', era: eraIndexAt(state.day) })
    rivalArrives(state, eraIndexAt(state.day))
  }
  costsDay(state)
  autoPromoteDay(state)
  researchDay(state)
  trainingDay(state)
  moraleDay(state)
  careerDay(state)
  contractsDay(state)
  pruneModifiers(state)
  if (state.day % DAYS_PER_MONTH === 0) {
    for (const employee of state.employees) employee.salary = salaryOf(employee, state.day)
    updateMarket(state)
    recordHistory(state)
    journalMonth(state)
  }
  if (state.day % CANDIDATE_REFRESH_DAYS === 0) refreshCandidates(state)
  checkBankruptcy(state)
  if (!state.gameOver) exitDay(state)
  if (!state.gameOver) {
    checkMilestones(state)
    checkStage(state)
  }
  rollRandomEvent(state)
  journalDay(state, eventsBefore)
}

export function advance(state: GameState, days: number): void {
  for (let i = 0; i < days && !state.gameOver; i++) advanceDay(state)
}

/** Returns pending events and clears the queue. */
export function drainEvents(state: GameState): SimEvent[] {
  const events = state.events
  state.events = []
  return events
}
