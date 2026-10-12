import { getMilestone, MILESTONES, rewardLabel } from '@/lib/tycoon/data/milestones'
import { REPUTATION_MAX } from './balance'
import type { GameState } from './types'

/** Ids of every milestone the state already satisfies; used to credit an older save without paying out. */
export function achievedMilestones(state: GameState): string[] {
  return MILESTONES.filter((m) => m.check(state)).map((m) => m.id)
}

/** Awards every milestone newly reached: cash and reputation, and a toast for each. */
export function checkMilestones(state: GameState): void {
  for (const milestone of MILESTONES) {
    if (state.milestones.includes(milestone.id) || !milestone.check(state)) continue
    state.milestones.push(milestone.id)
    state.money += milestone.reward.money ?? 0
    state.reputation = Math.min(REPUTATION_MAX, state.reputation + (milestone.reward.reputation ?? 0))
    state.events.push({
      type: 'notice',
      text: `Milestone: ${milestone.name}. ${milestone.description} ${rewardLabel(milestone.reward)}.`,
      sound: 'milestone',
    })
  }
}

export { getMilestone }
