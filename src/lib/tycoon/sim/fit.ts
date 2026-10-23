import { audienceFor } from '@/lib/tycoon/data/audiences'
import { FEATURES, getFeature } from '@/lib/tycoon/data/features'
import {
  FIT_BAND_MAX,
  FIT_BAND_MIN,
  FIT_BASE,
  FIT_BUG_PRESSURE,
  FIT_MISSING_PRESSURE,
  FIT_RECOVERY,
  FIT_RIVAL_PRESSURE,
  FIT_STALE_PRESSURE,
  HIT_RETENTION_FLOOR,
  FIT_QUALITY_FLOOR,
  FIT_QUALITY_FULL,
  FIT_SHRUG_PENALTY,
  FIT_TAKEOFF,
  HIT_REACH,
  HIT_REPUTATION,
  MARKET_COLD,
  REPUTATION_MAX,
  TAKEOFF_MAX_CROWDING,
  UNDISCOVERED_FIT_FLOOR,
  UNDISCOVERED_REACH,
} from './balance'
import { readingSkill } from './insight'
import { marketDemand } from './market'
import { companionPressure } from './companions'
import { itemEffects } from '@/lib/tycoon/data/workstreams'
import { bugFactor, crowdingAround, expectationFactor, interest, missingFeatures } from './products'
import { SHRUGGED_AT } from './scoring'
import { featureLock } from './unlocks'
import type { GameState, Product } from './types'

/**
 * Product–market fit: how well a product suits the people it is for, 0 to 100. It is earned release by release:
 * every feature its audience loves counts for something, by how much they love it and what it is worth to them;
 * a feature they shrug at adds nothing. Quality holds it back below a polished product, and features the era takes
 * for granted pull it down while they are missing. Past `FIT_TAKEOFF`, in a market that is not cold or crowded,
 * the product takes off: it becomes a hit. Until then it only reaches the few who go looking (`UNDISCOVERED_REACH`).
 */

/** What a feature is worth to an audience that loves it: its value, by how much more than nothing they love it. */
function love(productTypeId: string, audienceId: string | undefined, featureId: string): number {
  const likes = audienceFor(productTypeId, audienceId).likes[featureId] ?? 1
  return getFeature(featureId).value * Math.max(0, likes - 1)
}

/** The most an audience can love a product of this type: everything they love among what the studio can build now (research opens more). */
export function bestLove(state: GameState, productTypeId: string, audienceId: string | undefined): number {
  return FEATURES.filter((f) => f.suits.includes(productTypeId) && featureLock(state, f) === null).reduce((sum, f) => sum + love(productTypeId, audienceId, f.id), 0)
}

/** How many of these features the audience shrugs at: clutter to them, and there is no taking a feature out again. */
export function shruggedCount(productTypeId: string, audienceId: string | undefined, featureIds: readonly string[]): number {
  const likes = audienceFor(productTypeId, audienceId).likes
  return featureIds.filter((id) => (likes[id] ?? 1) <= SHRUGGED_AT).length
}

/** How much of what the audience loves these features give them, 0..1, less a little for each they shrug at. */
export function lovedShare(state: GameState, productTypeId: string, audienceId: string | undefined, featureIds: readonly string[]): number {
  const best = bestLove(state, productTypeId, audienceId)
  // A product for nobody in particular has nobody to love it.
  const got = best <= 0 ? 0 : featureIds.reduce((sum, id) => sum + love(productTypeId, audienceId, id), 0) / best
  return Math.max(0, Math.min(1, got) - FIT_SHRUG_PENALTY * shruggedCount(productTypeId, audienceId, featureIds))
}

/** What quality allows of the fit: all of it from `FIT_QUALITY_FULL`, down to `FIT_QUALITY_FLOOR` for a poor product. */
export function qualityAllowance(quality: number): number {
  return Math.min(1, Math.max(FIT_QUALITY_FLOOR, FIT_QUALITY_FLOOR + ((1 - FIT_QUALITY_FLOOR) * (quality - 40)) / (FIT_QUALITY_FULL - 40)))
}

/** What makes up a release's fit: the whole of it, the share of what the audience loves (less clutter), and what quality allows. */
export interface FitParts {
  fit: number
  loved: number
  quality: number
}

/** The fit a release with these features, for this audience, at this quality, would have. */
export function releaseFit(state: GameState, productTypeId: string, audienceId: string | undefined, featureIds: readonly string[], quality: number): FitParts {
  const loved = lovedShare(state, productTypeId, audienceId, featureIds)
  const allowed = qualityAllowance(quality)
  return { fit: Math.min(100, 100 * (FIT_BASE + (1 - FIT_BASE) * loved) * allowed), loved, quality: allowed }
}

/** The product's fit today: what its last release earned, less for what this era expects of it and it lacks. */
export function fitOf(state: GameState, product: Product): number {
  const earned = product.fit ?? releaseFit(state, product.productTypeId, product.audienceId, product.featureIds, product.quality).fit
  return earned * expectationFactor(product, state.day)
}

/** How a fit reads: cold, lukewarm, warm, or hot enough to take off. */
export function fitWord(fit: number): 'cold' | 'lukewarm' | 'warm' | 'hot' {
  if (fit >= FIT_TAKEOFF) return 'hot'
  if (fit >= 55) return 'warm'
  if (fit >= 30) return 'lukewarm'
  return 'cold'
}

/**
 * The fit as the studio can tell it: a range around the true value, as wide as its eye for users is poor. The range
 * sits a different way round the true value for every product and release, so its middle gives nothing away.
 */
export function fitRange(state: GameState, fit: number, key: number): { low: number; high: number } {
  const width = FIT_BAND_MIN + (FIT_BAND_MAX - FIT_BAND_MIN) * (1 - readingSkill(state) / 100)
  const below = width * spread(key)
  const low = Math.max(0, Math.round(fit - below))
  const high = Math.min(100, Math.round(fit + width - below))
  return { low, high }
}

/** Where in the range the true fit sits for a key, 0..1: fixed for the key, and nothing like its neighbours'. */
function spread(key: number): number {
  let h = Math.imul(key ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Which release of a product this is, as a key for its fit range. */
export const releaseKey = (product: Pick<Product, 'id' | 'updates'>): number => product.id * 64 + product.updates.length

/** The share of its reach a product gets before it takes off: a little more the better it fits. */
export function undiscovered(fit: number): number {
  return UNDISCOVERED_REACH * (UNDISCOVERED_FIT_FLOOR + (1 - UNDISCOVERED_FIT_FLOOR) * (fit / 100))
}

/** What `takeoffBlocker` says while the product itself is what holds it back. */
export const NOT_FIT_YET = 'Its fit is not there yet'

/** Why a product has not taken off, or null when it is ready to. */
export function takeoffBlocker(state: GameState, product: Product): string | null {
  if (product.hit) return 'It is already a hit'
  if (fitOf(state, product) < FIT_TAKEOFF) return NOT_FIT_YET
  if (marketDemand(state, product.productTypeId) <= MARKET_COLD) return 'The market for it is cold'
  if (crowdingAround(state, product) >= TAKEOFF_MAX_CROWDING) return 'Its market is too crowded'
  return interest(product, state.day) < 1 ? 'It has gone stale: release an update' : null
}

/**
 * The product takes off: from now on it reaches everyone it could, times a hit's reach, and the users follow over the
 * next weeks; the first becomes the studio's signature and its analyst founder its product manager.
 */
export function takeOff(state: GameState, product: Product): void {
  // A product from before fit existed was never held back, so there is nothing to give back.
  const held = product.fit === undefined ? 1 : undiscovered(product.fit)
  product.reach = (product.reach / held) * HIT_REACH[product.size]
  product.hit = true
  if (state.signatureId === null) {
    state.signatureId = product.id
    // The founder who studies users steers it from now on.
    const founder = state.employees.find((e) => e.founder && e.role === 'analyst')
    if (founder) {
      founder.role = 'pm'
      founder.level = Math.max(founder.level, 1)
      founder.levelDay = state.day
    }
  }
  state.reputation = Math.min(REPUTATION_MAX, state.reputation + HIT_REPUTATION)
  state.events.push({ type: 'breakout', productId: product.id })
}

/** What presses on a hit's fit today, in points a day, by cause. */
export interface FitPressure {
  stale: number
  bugs: number
  rivals: number
  missing: number
  companions: number
}

export function fitPressure(state: GameState, product: Product): FitPressure {
  return {
    stale: FIT_STALE_PRESSURE * (1 - interest(product, state.day)),
    bugs: FIT_BUG_PRESSURE * (1 - bugFactor(product)),
    rivals: FIT_RIVAL_PRESSURE * Math.min(3, crowdingAround(state, product)),
    missing: FIT_MISSING_PRESSURE * missingFeatures(product, state.day).length,
    companions: product.id === state.signatureId ? companionPressure(state) : 0,
  }
}

export const totalPressure = (p: FitPressure): number => p.stale + p.bugs + p.rivals + p.missing + p.companions

/** Where a hit's fit would settle with no release: nowhere above the fit its last release earned. */
export const peakFitOf = (product: Product): number => product.peakFit ?? product.fit ?? 0

/** A day of pressure on a hit: its fit sags with it, and comes back slowly when nothing presses. */
export function sagFit(state: GameState, product: Product): void {
  if (!product.hit || product.fit === undefined) return
  const pressure = totalPressure(fitPressure(state, product))
  const peak = peakFitOf(product)
  product.peakFit = peak
  product.fit = Math.max(0, Math.min(peak, pressure > 0.02 ? product.fit - pressure : product.fit + FIT_RECOVERY))
}

/**
 * The share of its users a hit keeps at its fit: all of them from the takeoff fit up, fewer below it. Work on retention
 * (the churn of its built items) wins back part of what is lost.
 */
export function retention(product: Product, bonus = 0): number {
  if (!product.hit || product.fit === undefined) return 1
  const base = HIT_RETENTION_FLOOR + (1 - HIT_RETENTION_FLOOR) * Math.min(1, product.fit / FIT_TAKEOFF)
  return base + (1 - base) * Math.min(1, itemEffects(product).churn + bonus)
}

/** Once a day: a product that fits well enough, in a market with room for it, takes off; a hit's fit feels the pressure on it. */
export function fitDay(state: GameState): void {
  for (const product of state.products) {
    if (product.hit) sagFit(state, product)
    else if (takeoffBlocker(state, product) === null) takeOff(state, product)
  }
}
