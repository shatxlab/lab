import { AUDIENCES, getAudience } from '@/lib/tycoon/data/audiences'
import { eraIndexAt, eraPhrase, ERAS } from '@/lib/tycoon/data/eras'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import { getResearch, unlocksOf, type ResearchNode } from '@/lib/tycoon/data/research'
import { getStage } from '@/lib/tycoon/data/stages'
import { isResearched, productTypeLock } from './unlocks'
import { fail, OK, type GameState, type Result } from './types'

/** The audiences a study could be about: those of product types the studio can build, that it has not studied yet. */
export function studyTargets(state: GameState): string[] {
  return AUDIENCES.filter((a) => !state.surveyed.includes(a.id) && productTypeLock(state, getProductType(a.productTypeId)) === null).map((a) => a.id)
}

/** Why `id` can't be started right now, or null when it can. */
export function researchBlocker(state: GameState, node: ResearchNode): string | null {
  if (!node.repeatable && isResearched(state, node.id)) return 'Done'
  if (state.research.active?.id === node.id) return 'In progress'
  if (state.research.active) return 'Busy with other research'
  if (node.era !== undefined && node.era > eraIndexAt(state.day)) return `Not until ${eraPhrase(ERAS[node.era])}`
  if (node.stage !== undefined && node.stage > state.stage) {
    const name = getStage(node.stage).name.toLowerCase()
    return `Not until the studio is ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`
  }
  const missing = node.requires.find((id) => !isResearched(state, id))
  if (missing) return `Needs ${getResearch(missing)?.name ?? missing}`
  if (node.repeatable === 'audience' && studyTargets(state).length === 0) return 'Every audience is studied'
  if (state.money < node.cost) return 'Not enough money'
  return null
}

/** Starts research on `id`; a repeatable study also needs what it is about (`target`). */
export function startResearch(state: GameState, id: string, target?: string): Result {
  const node = getResearch(id)
  if (!node) return fail('Unknown research')
  const blocker = researchBlocker(state, node)
  if (blocker) return fail(blocker)
  if (node.repeatable === 'audience' && (target === undefined || !studyTargets(state).includes(target))) return fail('Pick an audience to study')
  state.money -= node.cost
  state.research.active = { id, finishDay: state.day + node.days, ...(node.repeatable ? { target } : {}) }
  return OK
}

/** What finishing a research gives, in a sentence for the news toast. */
export function completionText(node: ResearchNode): string {
  const { features, productTypes } = unlocksOf(node.id)
  const parts: string[] = []
  if (productTypes.length > 0) parts.push(`${productTypes.join(', ')} can now be built (with enough reputation)`)
  if (features.length > 0) parts.push(`new features: ${features.join(', ')}`)
  const unlocks = parts.length > 0 ? ` ${parts.join('; ')}.` : ''
  return `Research complete: ${node.name}. ${node.description}${unlocks}`
}

/** Finishes the active research once its day arrives. */
export function researchDay(state: GameState): void {
  const active = state.research.active
  if (!active || state.day < active.finishDay) return
  state.research.active = null
  const node = getResearch(active.id)
  if (!node) return
  if (node.repeatable === 'audience' && active.target) {
    if (!state.surveyed.includes(active.target)) state.surveyed.push(active.target)
    state.events.push({ type: 'notice', text: `Study complete: you know what ${getAudience(active.target).name.toLowerCase()} think of every feature.`, sound: 'research' })
    return
  }
  state.research.done.push(node.id)
  state.events.push({ type: 'notice', text: completionText(node), sound: 'research' })
}

/** Days left on the active research, for display. */
export function researchDaysLeft(state: GameState): number | null {
  const active = state.research.active
  return active ? Math.max(0, active.finishDay - state.day) : null
}
