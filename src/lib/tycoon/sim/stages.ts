import { getStage, STAGES } from '@/lib/tycoon/data/stages'
import type { GameState } from './types'

/** True when the studio has done everything its current stage asks; the last stage never ends. */
export function stageComplete(state: GameState): boolean {
  const goals = getStage(state.stage).goals
  return state.stage < STAGES.length - 1 && goals.length > 0 && goals.every((g) => g.check(state))
}

/** Moves the studio on to its next stage once the current one's goals are all met, and says so. */
export function checkStage(state: GameState): void {
  if (!stageComplete(state)) return
  state.stage += 1
  state.events.push({ type: 'stage', stage: state.stage })
}
