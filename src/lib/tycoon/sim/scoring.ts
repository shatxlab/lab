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
import { DISCIPLINES, type Discipline, type Project } from './types'

/** Progress / target for one discipline, capped at OVERSHOOT_CAP. */
export function coverage(project: Project, discipline: Discipline): number {
  const target = project.target[discipline]
  if (target <= 0) return OVERSHOOT_CAP
  return Math.min(project.progress[discipline] / target, OVERSHOOT_CAP)
}

/** How far along the whole project is, 0..1: every bar counts up to its target, by its size. */
export function overallProgress(project: Project): number {
  let done = 0
  let total = 0
  for (const d of DISCIPLINES) {
    done += Math.min(project.progress[d], project.target[d])
    total += project.target[d]
  }
  return total > 0 ? done / total : 1
}

export function isReady(project: Project): boolean {
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

/** Sum of (value × fit) across features; drives the revenue bonus. */
export function featureScore(productTypeId: string, featureIds: readonly string[]): number {
  let score = 0
  for (const id of featureIds) score += getFeature(id).value * featureFit(productTypeId, id)
  return score
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
export function featureReach(productTypeId: string, featureIds: readonly string[]): number {
  return 1 + FEATURE_REACH_BONUS * featureScore(productTypeId, featureIds)
}

/** Users a release of this project at `quality` can reach: the type's audience, scaled by everything about it. */
export function computeReach(project: Project, quality: number, reputation: number, demand: number): number {
  const type = getProductType(project.productTypeId)
  const reputationBonus = 1 + REPUTATION_REACH_BONUS * reputation
  const scale = PROJECT_SIZES[project.size].reach * project.hype
  return type.audience * (quality / 100) ** 2 * demand * featureReach(project.productTypeId, project.featureIds) * reputationBonus * scale
}
