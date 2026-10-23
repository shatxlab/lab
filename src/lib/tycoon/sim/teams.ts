import { getFeature } from '@/lib/tycoon/data/features'
import { WORKSTREAM_INFO, type WorkItem } from '@/lib/tycoon/data/workstreams'
import { COMPLIANCE_FEATURE } from '@/lib/tycoon/data/regions'
import { FRESH_DAYS, KEEP_FRESH_SHARE, POLISH_BUG_RISK, PROJECT_SIZES, TEAM_IDLE_DAYS, UPDATE_MAX_FEATURES, UPDATE_MIN_AGE_DAYS } from './balance'
import { logEntry } from './journal'
import { getOffice, hasEuropeOffice, officeName, productInWork, teamOf } from './offices'
import { euShareOf, interest, lastReleaseDay } from './products'
import { shipProject, startLocalisation, startUpdate } from './project'
import { companionsOf } from './companions'
import { nextItem } from './roadmap'
import { isReady } from './scoring'
import { featureLock } from './unlocks'
import { DISCIPLINES, fail, OK, WORKSTREAMS, type GameState, type Office, type Product, type Result, type Workstream } from './types'

/** What a floor works on when nobody has said: the product's queued features, or else keeping it fresh. */
export const DEFAULT_WORKSTREAM: Workstream = 'features'

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
  office.workstream ??= DEFAULT_WORKSTREAM
  return OK
}

export function setWorkstream(state: GameState, officeId: number, workstream: Workstream): Result {
  const office = getOffice(state, officeId)
  if (!office) return fail('Unknown office')
  if (!WORKSTREAMS.includes(workstream)) return fail('Unknown workstream')
  office.workstream = workstream
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

/** What a floor's next release is, by its workstream: nothing ('idle') when its stream has no work for the product. */
export type ReleasePlan =
  | { kind: 'compliance' | 'localise' | 'polish' | 'features' | 'maintenance' }
  | { kind: 'item'; item: WorkItem }
  | { kind: 'care'; product: Product }
  | { kind: 'idle'; why: string }

export function releasePlan(state: GameState, office: Office, product: Product): ReleasePlan {
  const stream = office.workstream ?? DEFAULT_WORKSTREAM
  if (stream === 'features') return (product.nextFeatures ?? []).some((id) => !product.featureIds.includes(id)) ? { kind: 'features' } : { kind: 'maintenance' }
  if (stream === 'europe') {
    if (euShareOf(product) === 0) {
      if (!hasEuropeOffice(state)) return { kind: 'idle', why: 'Needs an office in Europe' }
      if (!product.featureIds.includes(COMPLIANCE_FEATURE)) {
        return featureLock(state, getFeature(COMPLIANCE_FEATURE)) === null ? { kind: 'compliance' } : { kind: 'idle', why: "Europe's data rules are locked" }
      }
      return { kind: 'localise' }
    }
  }
  const item = nextItem(state, product, stream)
  if (item) return { kind: 'item', item }
  if (stream === 'companions') {
    const needy = companionsOf(state).filter((p) => !productInWork(state, p.id)).sort((a, b) => interest(a, state.day) - interest(b, state.day))[0]
    if (needy && interest(needy, state.day) < 1) return { kind: 'care', product: needy }
  }
  if (stream === 'quality') return { kind: 'polish' }
  return { kind: 'idle', why: `Nothing on the roadmap for ${WORKSTREAM_INFO[stream].name}` }
}

/** The day the team's next release may start: as soon as an update is allowed, or for plain upkeep near the end of the fresh time. */
export function nextReleaseDay(state: GameState, office: Office, product: Product): number {
  const plan = releasePlan(state, office, product)
  if (plan.kind === 'idle') return Number.MAX_SAFE_INTEGER
  const last = lastReleaseDay(product)
  const soonest = last + UPDATE_MIN_AGE_DAYS
  const keep = last + Math.round(FRESH_DAYS * PROJECT_SIZES[product.size].life * KEEP_FRESH_SHARE)
  return Math.max(plan.kind === 'maintenance' ? keep : soonest, (office.idleSince ?? state.day) + TEAM_IDLE_DAYS)
}

/** What the team will do next with its product, in a few words, for the panel. */
export function nextReleasePlan(state: GameState, office: Office, product: Product): string {
  const plan = releasePlan(state, office, product)
  switch (plan.kind) {
    case 'compliance':
      return `add ${getFeature(COMPLIANCE_FEATURE).name} for Europe's data rules`
    case 'localise':
      return 'localise it for Europe'
    case 'polish':
      return 'a polishing release'
    case 'features':
      return `a release with ${(product.nextFeatures ?? []).map((id) => getFeature(id).name).join(', ')}`
    case 'item':
      return plan.item.name
    case 'care':
      return `look after ${plan.product.name}`
    case 'idle':
      return plan.why
    default:
      return 'a maintenance release (queue features to grow it)'
  }
}

/** Starts the team's next release of its product, as its workstream says. */
function startRelease(state: GameState, office: Office, product: Product): Result {
  const plan = releasePlan(state, office, product)
  switch (plan.kind) {
    case 'idle':
      return fail(plan.why)
    case 'compliance':
      return mark(startUpdate(state, product.id, [COMPLIANCE_FEATURE], office.id, false, true), office)
    case 'localise':
      return mark(startLocalisation(state, product.id, office.id, true), office)
    case 'polish': {
      const result = mark(startUpdate(state, product.id, [], office.id, false, true), office)
      if (result.ok && office.project) {
        office.project.polishes = true
        office.project.bugRisk *= POLISH_BUG_RISK
      }
      return result
    }
    case 'item': {
      const result = mark(startUpdate(state, product.id, [], office.id, false, true), office)
      if (result.ok && office.project) {
        office.project.itemId = plan.item.id
        for (const d of DISCIPLINES) office.project.target[d] *= plan.item.work
      }
      return result
    }
    case 'care':
      return mark(startUpdate(state, plan.product.id, [], office.id, false, true), office)
    case 'features': {
      const queued = (product.nextFeatures ?? []).filter((id) => !product.featureIds.includes(id))
      const result = mark(startUpdate(state, product.id, queued.slice(0, UPDATE_MAX_FEATURES), office.id, false, true), office)
      if (result.ok && queued.length > 0) delete product.nextFeatures
      return result
    }
    default:
      return mark(startUpdate(state, product.id, [], office.id, false, true), office)
  }
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
    if (!product || office.kind !== 'office' || teamOf(state, office).length === 0 || productInWork(state, product.id, true)) continue
    if (state.day < nextReleaseDay(state, office, product)) continue
    startRelease(state, office, product)
  }
}
