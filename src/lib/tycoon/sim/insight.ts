import {
  ANALYSIS_GAIN,
  FEEDBACK_LOVED_DAYS,
  FEEDBACK_MISSED_DAYS,
  FEEDBACK_SHRUGGED_DAYS,
  INSIGHT_PER_SKILL,
  LEVELS,
  PM_INSIGHT_SHARE,
  SURVEY_COST,
} from './balance'
import { moraleSpeed } from './morale'
import { audienceFeedback, type Feedback } from './scoring'
import { fail, OK, type Employee, type GameState, type Product, type Result } from './types'

/** Analysts and product managers: the people who study users. */
export const isAnalyst = (employee: Pick<Employee, 'role'>): boolean => employee.role === 'analyst' || employee.role === 'pm'

/** Insight this person gathers a day: their skill, their level and their mood count; a product manager spends most of the day steering. */
export function insightOf(employee: Employee): number {
  if (!isAnalyst(employee) || employee.training) return 0
  const share = employee.role === 'pm' ? PM_INSIGHT_SHARE : 1
  return (employee.analysis ?? 0) * INSIGHT_PER_SKILL * share * LEVELS[employee.level].speed * moraleSpeed(employee.morale)
}

/** Insight the whole studio gathers a day. */
export function insightRate(state: GameState): number {
  return state.employees.reduce((sum, e) => sum + insightOf(e), 0)
}

/** True when the studio has anyone who studies users. */
export function hasAnalyst(state: GameState): boolean {
  return state.employees.some(isAnalyst)
}

/** One day for the analysts: insight piles up, and the work makes them a little sharper. */
export function insightDay(state: GameState): void {
  state.insight += insightRate(state)
  for (const employee of state.employees) {
    if (!isAnalyst(employee) || employee.training) continue
    const skill = employee.analysis ?? 0
    employee.analysis = Math.min(100, skill + ANALYSIS_GAIN * (1 - skill / 100))
  }
}

/** True once an audience has been studied: what it likes shows in the feature list. */
export function isSurveyed(state: GameState, audienceId: string | undefined): boolean {
  return audienceId !== undefined && state.surveyed.includes(audienceId)
}

/** Why this audience can't be surveyed now, or null when it can. */
export function surveyBlocker(state: GameState, audienceId: string): string | null {
  if (isSurveyed(state, audienceId)) return 'Already studied'
  if (!hasAnalyst(state)) return 'Needs an analyst'
  return state.insight < SURVEY_COST ? `Needs ${SURVEY_COST} insight` : null
}

/** Spends insight to learn what an audience likes. */
export function surveyAudience(state: GameState, audienceId: string): Result {
  const blocker = surveyBlocker(state, audienceId)
  if (blocker) return fail(blocker)
  state.insight -= SURVEY_COST
  state.surveyed.push(audienceId)
  return OK
}

/** The best eye for users the studio has: its sharpest analyst or product manager's skill, 0..100. */
export function readingSkill(state: GameState): number {
  return state.employees.filter(isAnalyst).reduce((best, e) => Math.max(best, e.analysis ?? 0), 0)
}

/**
 * What the audience has said about a product so far: it arrives over the months after launch, sooner the sharper the
 * studio's analysts, and all at once for an audience the studio has studied.
 */
export function feedbackFor(state: GameState, product: Product): Feedback & { waiting: boolean } {
  const full = audienceFeedback(product.productTypeId, product.audienceId, product.featureIds)
  if (isSurveyed(state, product.audienceId)) return { ...full, waiting: false }
  const age = (state.day - product.releaseDay) / Math.max(0.05, 1 - readingSkill(state) / 100)
  const loved = age >= FEEDBACK_LOVED_DAYS
  const shrugged = age >= FEEDBACK_SHRUGGED_DAYS
  const missed = age >= FEEDBACK_MISSED_DAYS
  return {
    loved: loved ? full.loved : [],
    shrugged: shrugged ? full.shrugged : [],
    missed: missed ? full.missed : [],
    waiting: (!loved && full.loved.length > 0) || (!shrugged && full.shrugged.length > 0) || (!missed && full.missed.length > 0),
  }
}
