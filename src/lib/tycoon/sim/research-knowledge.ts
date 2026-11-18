import { getResearch, type ResearchNode } from '@/lib/tycoon/data/research'
import type { GameState } from './types'

/** Current completions are proof of learning too; archive reads never activate a company multiplier. */
export function learnedResearchIds(state: GameState): string[] {
  return [...new Set([...state.research.known, ...state.research.done])]
    .filter((id) => { const node = getResearch(id); return node && !node.repeatable })
}

export function knowsResearch(state: GameState, id: string): boolean {
  return state.research.done.includes(id) || state.research.known.includes(id)
}

/** Theory can use learned prerequisite methods. Establishing a company practice needs its prerequisite
 * practices active here; a prerequisite that is pure knowledge does not need to be bought again.
 */
export function researchPrerequisiteMet(state: GameState, node: ResearchNode, id: string): boolean {
  return node.carry === 'knowledge' || getResearch(id)?.carry === 'knowledge'
    ? knowsResearch(state, id) : state.research.done.includes(id)
}

/** Pure preview shared by next-chapter UI and transfer; no RNG, IDs, money or state mutation. */
export function researchTransferPreview(state: GameState) {
  const known = learnedResearchIds(state)
  const nodes = known.map((id) => getResearch(id)!)
  return {
    known,
    knowledge: nodes.filter((n) => n.carry === 'knowledge' || n.carry === 'mixed'),
    practices: nodes.filter((n) => n.carry === 'practice' || n.carry === 'mixed'),
    audiences: [...new Set(state.surveyed)],
    unfinished: state.research.active?.id ?? null,
  }
}
