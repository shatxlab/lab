import { getResearch } from '@/lib/tycoon/data/research'
import { eraIndexAt, eraPhrase, ERAS } from '@/lib/tycoon/data/eras'
import { getStage } from '@/lib/tycoon/data/stages'
import { PROJECT_SIZES } from './balance'
import type { Feature, GameState, Office, ProductType, ProjectSize } from './types'

export function isResearched(state: GameState, id: string): boolean {
  return state.research.done.includes(id)
}

function researchName(id: string): string {
  return getResearch(id)?.name ?? id
}

/** Why a product type can't be started yet, or null when it can. */
export function productTypeLock(state: GameState, type: ProductType): string | null {
  const reasons: string[] = []
  if (type.era > eraIndexAt(state.day)) return `Not until ${eraPhrase(ERAS[type.era])}`
  if (type.unlockReputation > state.reputation) reasons.push(`Reputation ${type.unlockReputation}`)
  if (type.requiresResearch && !isResearched(state, type.requiresResearch)) {
    reasons.push(`Research: ${researchName(type.requiresResearch)}`)
  }
  return reasons.length > 0 ? reasons.join(' · ') : null
}

/** Why a feature can't be chosen yet, or null when it can. */
export function featureLock(state: GameState, feature: Feature): string | null {
  if (feature.requiresResearch && !isResearched(state, feature.requiresResearch)) {
    return `Research: ${researchName(feature.requiresResearch)}`
  }
  return null
}

/** Why a project size can't be started yet in this office (the first by default), or null when it can. */
export function sizeLock(state: GameState, size: ProjectSize, office: Office = state.offices[0]): string | null {
  const spec = PROJECT_SIZES[size]
  if (spec.office && office.kind === 'garage') return 'a real office'
  return state.stage >= spec.stage ? null : `a studio that is a ${getStage(spec.stage).name.toLowerCase()}`
}
