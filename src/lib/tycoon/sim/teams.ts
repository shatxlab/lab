import { getFeature } from '@/lib/tycoon/data/features'
import { COMPLIANCE_FEATURE } from '@/lib/tycoon/data/regions'
import { FRESH_DAYS, KEEP_FRESH_SHARE, POLISH_BUG_RISK, PROJECT_SIZES, TEAM_IDLE_DAYS, UPDATE_MAX_FEATURES, UPDATE_MIN_AGE_DAYS } from './balance'
import { logEntry } from './journal'
import { getOffice, hasEuropeOffice, officeName, productInWork, teamOf } from './offices'
import { euShareOf, lastReleaseDay } from './products'
import { shipProject, startLocalisation, startUpdate } from './project'
import { isReady } from './scoring'
import { featureLock } from './unlocks'
import { DIRECTIONS, fail, OK, type Direction, type GameState, type Office, type Product, type Result } from './types'

/** What each direction means, for the player. */
export const DIRECTION_INFO: Record<Direction, { name: string; blurb: string }> = {
  grow: { name: 'Grow', blurb: 'Ships the features you queue for it, one release after another' },
  polish: { name: 'Polish', blurb: 'Fixes most of the open bugs with every release, and ships fewer new ones' },
  keep: { name: 'Keep it running', blurb: 'Only a cheap maintenance release when it is about to go stale' },
  expand: { name: 'Expand to Europe', blurb: "Meets Europe's data rules, then localises it; after that, grows it" },
}

/** What a team does when nobody has said: keep its product fresh. */
export const DEFAULT_DIRECTION: Direction = 'keep'

/** The product a floor looks after, if it still exists. */
export function ownedProduct(state: GameState, office: Office): Product | undefined {
  return office.productId === undefined ? undefined : state.products.find((p) => p.id === office.productId)
}

/** The floor whose team looks after this product, if any. */
export function ownerOf(state: GameState, productId: number): Office | undefined {
  return state.offices.find((o) => o.productId === productId)
}

/** Puts a floor's team on a product (taking it from whoever had it), or with `null` frees the team. */
export function assignProduct(state: GameState, officeId: number, productId: number | null): Result {
  const office = getOffice(state, officeId)
  if (!office) return fail('Unknown office')
  if (productId === null) {
    delete office.productId
    return OK
  }
  if (!state.products.some((p) => p.id === productId)) return fail('Unknown product')
  for (const other of state.offices) if (other.productId === productId) delete other.productId
  office.productId = productId
  office.direction ??= DEFAULT_DIRECTION
  return OK
}

export function setDirection(state: GameState, officeId: number, direction: Direction): Result {
  const office = getOffice(state, officeId)
  if (!office) return fail('Unknown office')
  if (!DIRECTIONS.includes(direction)) return fail('Unknown direction')
  office.direction = direction
  return OK
}

/** Why these features can't be queued for the product's next release, or null when they can. */
export function queueBlocker(state: GameState, product: Product, featureIds: readonly string[]): string | null {
  if (featureIds.length > UPDATE_MAX_FEATURES) return `At most ${UPDATE_MAX_FEATURES} features in a release`
  if (new Set(featureIds).size !== featureIds.length) return 'Duplicate feature'
  for (const id of featureIds) {
    const feature = getFeature(id)
    if (product.featureIds.includes(id)) return `${feature.name} is already in ${product.name}`
    const lock = featureLock(state, feature)
    if (lock) return `${feature.name} is locked: ${lock}`
  }
  return null
}

/** Sets the features the product's next release will add; an empty list clears the queue. */
export function queueFeatures(state: GameState, productId: number, featureIds: readonly string[]): Result {
  const product = state.products.find((p) => p.id === productId)
  if (!product) return fail('Unknown product')
  const blocker = queueBlocker(state, product, featureIds)
  if (blocker) return fail(blocker)
  if (featureIds.length === 0) delete product.nextFeatures
  else product.nextFeatures = [...featureIds]
  return OK
}

/** The day the team's next release may start, by its direction: as soon as an update is allowed, or near the end of the fresh time for one kept running. */
export function nextReleaseDay(state: GameState, office: Office, product: Product): number {
  const direction = office.direction ?? DEFAULT_DIRECTION
  const last = lastReleaseDay(product)
  const soonest = last + UPDATE_MIN_AGE_DAYS
  const keep = last + Math.round(FRESH_DAYS * PROJECT_SIZES[product.size].life * KEEP_FRESH_SHARE)
  const wait = direction === 'keep' ? keep : soonest
  return Math.max(wait, (office.idleSince ?? state.day) + TEAM_IDLE_DAYS)
}

/** What the team will do next with its product, in a few words, for the panel. */
export function nextReleasePlan(state: GameState, office: Office, product: Product): string {
  const direction = office.direction ?? DEFAULT_DIRECTION
  if (direction === 'expand' && euShareOf(product) === 0 && hasEuropeOffice(state)) {
    return product.featureIds.includes(COMPLIANCE_FEATURE) ? 'localise it for Europe' : `add ${getFeature(COMPLIANCE_FEATURE).name} for Europe's data rules`
  }
  if (direction === 'polish') return 'a polishing release'
  const queued = product.nextFeatures ?? []
  if ((direction === 'grow' || direction === 'expand') && queued.length > 0) return `a release with ${queued.map((id) => getFeature(id).name).join(', ')}`
  return direction === 'keep' ? 'a maintenance release' : 'a maintenance release (queue features to grow it)'
}

/** Starts the team's next release of its product, as its direction says. */
function startRelease(state: GameState, office: Office, product: Product): Result {
  const direction = office.direction ?? DEFAULT_DIRECTION
  if (direction === 'expand' && euShareOf(product) === 0 && hasEuropeOffice(state)) {
    if (!product.featureIds.includes(COMPLIANCE_FEATURE)) {
      if (featureLock(state, getFeature(COMPLIANCE_FEATURE)) === null) return mark(startUpdate(state, product.id, [COMPLIANCE_FEATURE], office.id), office)
    } else {
      return mark(startLocalisation(state, product.id, office.id), office)
    }
  }
  if (direction === 'polish') {
    const result = mark(startUpdate(state, product.id, [], office.id), office)
    if (result.ok && office.project) {
      office.project.polishes = true
      office.project.bugRisk *= POLISH_BUG_RISK
    }
    return result
  }
  const queued = direction === 'keep' ? [] : (product.nextFeatures ?? []).filter((id) => !product.featureIds.includes(id))
  const result = mark(startUpdate(state, product.id, queued.slice(0, UPDATE_MAX_FEATURES), office.id), office)
  if (result.ok && queued.length > 0) delete product.nextFeatures
  return result
}

/** Marks the release just started as the team's own, so it ships by itself. */
function mark(result: Result, office: Office): Result {
  if (result.ok && office.project) office.project.byTeam = true
  return result
}

/**
 * One day for the teams that look after products: a release that is done ships, and a team that has been out
 * of work for a few days starts the next one its direction calls for. The garage is left alone: there the
 * player is hunting for a hit and paying the rent with client work.
 */
export function teamDay(state: GameState): void {
  for (const office of state.offices) {
    if (office.productId !== undefined && !ownedProduct(state, office)) delete office.productId
    const project = office.project
    if (project) {
      delete office.idleSince
      if (project.byTeam && project.kind === 'update' && isReady(project)) {
        const name = project.name
        if (shipProject(state, undefined, office.id).ok) {
          state.events.push({ type: 'notice', text: `${officeName(state, office)} shipped a release of ${name}.` })
          logEntry(state, 'team.release', `${officeName(state, office)} shipped ${name}`, { office: officeName(state, office) })
        }
      }
      continue
    }
    office.idleSince ??= state.day
    const product = ownedProduct(state, office)
    if (!product || office.kind === 'garage' || teamOf(state, office).length === 0 || productInWork(state, product.id)) continue
    if (state.day < nextReleaseDay(state, office, product)) continue
    startRelease(state, office, product)
  }
}
