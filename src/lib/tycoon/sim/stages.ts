import { companyGoalLabel } from './company-scale'
import { charterRequirements } from './charter'
import { getStage, STAGES } from '@/lib/tycoon/data/stages'
import { scaleRequirements } from './scale-readiness'
import { operating } from './services'
import type { GameState } from './types'

/** Paid footprints bypass introductory chores, never the signature-product/market-fit gate. */
export function skippedStageGoals(state: GameState, stage: number) {
  const direct = state.founding && state.founding.ambition !== 'modest'
  const skipped = direct ? ['cafe_jobs', 'to_garage', 'ship_3'] : []
  return getStage(stage).goals.filter((g) => skipped.includes(g.id))
}

/** One current-state read model for simulation, operations, Journey, announcements and diagnostics. */
export function stageProgress(state: GameState, stage = state.stage) {
  const replaced = operating(state) && stage >= 3 && stage <= 5 ? ['team_12', 'two_offices', 'three_offices'] : []
  const skipped = skippedStageGoals(state, stage).map((g) => g.id)
  const goals = getStage(stage).goals.filter((g) => !replaced.includes(g.id) && !skipped.includes(g.id)).map((g) => ({
    id: g.id, label: companyGoalLabel(state, g), met: g.check(state), progress: g.progress?.(state), remedy: '',
  }))
  return [...goals, ...scaleRequirements(state, stage), ...(stage === STAGES.length - 1 ? charterRequirements(state) : [])]
}

/** True when the studio has done everything its current stage asks; the last stage never ends. */
export function stageComplete(state: GameState): boolean {
  if (state.stage >= STAGES.length - 1) return false
  const goals = stageProgress(state)
  return goals.length > 0 && goals.every((g) => g.met)
}

/** Moves the studio on to its next stage once the current one's goals are all met, and says so. */
export function checkStage(state: GameState): void {
  if (!stageComplete(state)) return
  state.stage += 1
  state.events.push({ type: 'stage', stage: state.stage })
}
