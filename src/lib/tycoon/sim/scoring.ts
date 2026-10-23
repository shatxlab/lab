import { audienceFor } from '@/lib/tycoon/data/audiences'
import { EU_LIKES } from '@/lib/tycoon/data/regions'
import { getFeature } from '@/lib/tycoon/data/features'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import {
  COVERAGE_EXPONENT,
  FEATURE_REACH_BONUS,
  FIT_FLOOR,
  OFF_TYPE_FEATURE_FIT,
  OVERSHOOT_CAP,
  PROJECT_SIZES,
  QUALITY_BASE,
  QUALITY_POLISH,
  REPUTATION_REACH_BONUS,
} from './balance'
import { DISCIPLINES, type Discipline, type Project, type Region } from './types'

/** What the progress helpers need: a project, or a bug-fixing job. */
type Work = Pick<Project, 'target' | 'progress'>

/** Progress / target for one discipline, capped at OVERSHOOT_CAP. */
export function coverage(project: Work, discipline: Discipline): number {
  const target = project.target[discipline]
  if (target <= 0) return OVERSHOOT_CAP
  return Math.min(project.progress[discipline] / target, OVERSHOOT_CAP)
}

/** How far along the whole project is, 0..1: every bar counts up to its target, by its size. */
export function overallProgress(project: Work): number {
  let done = 0
  let total = 0
  for (const d of DISCIPLINES) {
    done += Math.min(project.progress[d], project.target[d])
    total += project.target[d]
  }
  return total > 0 ? done / total : 1
}

export function isReady(project: Work): boolean {
  return DISCIPLINES.every((d) => project.progress[d] >= project.target[d])
}

function featureFit(productTypeId: string, featureId: string): number {
  return getFeature(featureId).suits.includes(productTypeId) ? 1 : OFF_TYPE_FEATURE_FIT
}

/** Value-weighted share of features that suit the product type, 0..1. */
export function overallFit(productTypeId: string, featureIds: readonly string[]): number {
  if (featureIds.length === 0) return 1
  let total = 0
  let weighted = 0
  for (const id of featureIds) {
    const value = getFeature(id).value
    total += value
    weighted += value * featureFit(productTypeId, id)
  }
  return weighted / total
}

/** What the audience makes of a feature: above 1 they love it, below 1 they shrug. */
export function audienceLikes(productTypeId: string, audienceId: string | undefined, featureId: string, region: Region = 'us'): number {
  return (audienceFor(productTypeId, audienceId).likes[featureId] ?? 1) * (region === 'eu' ? (EU_LIKES[featureId] ?? 1) : 1)
}

/** Sum of (value × fit × what the audience thinks of it) across features; drives the revenue bonus. */
export function featureScore(productTypeId: string, featureIds: readonly string[], audienceId?: string, region: Region = 'us'): number {
  let score = 0
  for (const id of featureIds) score += getFeature(id).value * featureFit(productTypeId, id) * audienceLikes(productTypeId, audienceId, id, region)
  return score
}

/** What the audience says after a launch: features they loved, features they shrugged at, and ones they wished for. */
export interface Feedback {
  loved: string[]
  shrugged: string[]
  missed: string[]
}

export const LOVED_AT = 1.4
export const SHRUGGED_AT = 0.7

export function audienceFeedback(productTypeId: string, audienceId: string | undefined, featureIds: readonly string[]): Feedback {
  const likes = audienceFor(productTypeId, audienceId).likes
  const names = (ids: string[]) => ids.map((id) => getFeature(id).name)
  const built = new Set(featureIds)
  const wished = Object.entries(likes)
    .filter(([id, weight]) => weight >= LOVED_AT && !built.has(id) && getFeature(id).suits.includes(productTypeId))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id)
  return {
    loved: names(featureIds.filter((id) => audienceLikes(productTypeId, audienceId, id) >= LOVED_AT)),
    shrugged: names(featureIds.filter((id) => audienceLikes(productTypeId, audienceId, id) <= SHRUGGED_AT)),
    missed: names(wished),
  }
}

/**
 * Quality 0..100. Never decreases as progress in any discipline grows.
 * The polish bonus follows the slowest bar, so it only grows once every discipline
 * has passed its target. `bonus` is the studio-wide quality multiplier from research.
 */
export function computeQuality(project: Project, bonus = 1): number {
  const type = getProductType(project.productTypeId)
  let base = 0
  let polish = 1
  for (const d of DISCIPLINES) {
    const c = coverage(project, d)
    base += type.weights[d] * Math.min(c, 1)
    polish = Math.min(polish, Math.max(c - 1, 0) / (OVERSHOOT_CAP - 1))
  }
  base = base ** COVERAGE_EXPONENT
  const fit = overallFit(project.productTypeId, project.featureIds)
  const fitFactor = FIT_FLOOR + (1 - FIT_FLOOR) * fit
  const quality = base * (QUALITY_BASE * fitFactor + QUALITY_POLISH * polish) * bonus
  return Math.max(0, Math.min(100, quality))
}

/** Reach multiplier from the features: more valuable features that suit the type reach more people. */
export function featureReach(productTypeId: string, featureIds: readonly string[], audienceId?: string, region: Region = 'us'): number {
  return 1 + FEATURE_REACH_BONUS * featureScore(productTypeId, featureIds, audienceId, region)
}

/** Users a release of this project at `quality` can reach: the type's audience, scaled by everything about it. */
export function computeReach(project: Project, quality: number, reputation: number, demand: number): number {
  const type = getProductType(project.productTypeId)
  const reputationBonus = 1 + REPUTATION_REACH_BONUS * reputation
  const scale = PROJECT_SIZES[project.size].reach * project.hype
  return type.audience * (quality / 100) ** 2 * demand * featureReach(project.productTypeId, project.featureIds, project.audienceId) * audienceFor(project.productTypeId, project.audienceId).reach * reputationBonus * scale
}
