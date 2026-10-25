import { getCompanion } from '@/lib/tycoon/data/companions'
import { getFeature } from '@/lib/tycoon/data/features'
import { COMPLIANCE_FEATURE } from '@/lib/tycoon/data/regions'
import { ALL_ITEMS, getWorkItem, type WorkItem } from '@/lib/tycoon/data/workstreams'
import { formatCount } from '@/lib/tycoon/format'
import { companionBlocker } from './companions'
import { activeProjects, hasEuropeOffice } from './offices'
import { euShareOf } from './products'
import { featureLock } from './unlocks'
import { fail, OK, type GameState, type Product, type Result, type Workstream } from './types'

/** How many items a roadmap holds. */
export const ROADMAP_LIMIT = 12

/** Why this item is not on offer for the product yet, or null when it is. */
export function itemBlocker(state: GameState, product: Product, item: WorkItem): string | null {
  if ((product.built ?? []).includes(item.id)) return 'Built already'
  if (item.companionId) {
    const companion = getCompanion(item.companionId)
    if (!companion) return 'Unknown companion'
    if (product.users < item.minUsers) return `From ${formatCount(item.minUsers)} users`
    return companionBlocker(state, companion)
  }
  if (item.workstream === 'europe' && euShareOf(product) === 0) return 'Localise the product for Europe first'
  if (product.users < item.minUsers) return `From ${formatCount(item.minUsers)} users`
  return null
}

/** The items the product could still build, in the order the data lists them. */
export function availableItems(product: Product): WorkItem[] {
  return ALL_ITEMS.filter((item) => !(product.built ?? []).includes(item.id))
}

/** Sets the ranked list of items the product's floors work through; the first is built first. */
export function setRoadmap(state: GameState, productId: number, itemIds: readonly string[]): Result {
  const product = state.products.find((p) => p.id === productId)
  if (!product) return fail('Unknown product')
  if (itemIds.length > ROADMAP_LIMIT) return fail(`At most ${ROADMAP_LIMIT} items on a roadmap`)
  if (new Set(itemIds).size !== itemIds.length) return fail('Duplicate item')
  for (const id of itemIds) {
    if (isStepId(id)) continue
    const item = getWorkItem(id)
    if (!item) return fail('Unknown item')
    if ((product.built ?? []).includes(id)) return fail(`${item.name} is built already`)
  }
  if (itemIds.length === 0) delete product.roadmap
  else product.roadmap = [...itemIds]
  return OK
}

/**
 * The rows of a roadmap that are not items: the release of the features queued for the product, and the two steps that open
 * Europe. They sit in the list among the items, so one order says what gets done first.
 */
export const STEP_IDS = ['features', 'compliance', 'localise'] as const
export type StepId = (typeof STEP_IDS)[number]

export const isStepId = (id: string): id is StepId => (STEP_IDS as readonly string[]).includes(id)

export const STEP_INFO: Record<StepId, { name: string; blurb: string; workstream: Workstream }> = {
  features: { name: 'Feature release', blurb: 'Ships the features you queued for the next release', workstream: 'features' },
  compliance: { name: "Europe's data rules", blurb: "Adds what Europe's data rules ask for: the first step into the market", workstream: 'europe' },
  localise: { name: 'Localise for Europe', blurb: 'Opens the product to European users', workstream: 'europe' },
}

/** What a floor builds next from a roadmap. */
export type RoadmapStep = { kind: 'item'; item: WorkItem } | { kind: StepId }

/** Why this step is not on offer for the product yet, or null when it is. */
export function stepBlocker(state: GameState, product: Product, id: StepId): string | null {
  switch (id) {
    case 'features':
      return (product.nextFeatures ?? []).some((f) => !product.featureIds.includes(f)) ? null : 'No features queued'
    case 'compliance':
      if (euShareOf(product) > 0 || product.featureIds.includes(COMPLIANCE_FEATURE)) return 'Done already'
      if (!hasEuropeOffice(state)) return 'Needs an office in Europe'
      return featureLock(state, getFeature(COMPLIANCE_FEATURE)) === null ? null : "Europe's data rules are locked"
    case 'localise':
      if (euShareOf(product) > 0) return 'Done already'
      if (!hasEuropeOffice(state)) return 'Needs an office in Europe'
      return product.featureIds.includes(COMPLIANCE_FEATURE) ? null : "Meet Europe's data rules first"
  }
}

/** The name and the stream of a roadmap row, an item or a step. */
export function rowInfo(id: string): { name: string; blurb: string; workstream: Workstream } | undefined {
  if (isStepId(id)) return STEP_INFO[id]
  const item = getWorkItem(id)
  return item && { name: item.name, blurb: item.blurb, workstream: item.workstream }
}

/** Why a roadmap row is waiting, or null when a floor could take it. */
export function rowBlocker(state: GameState, product: Product, id: string): string | null {
  if (isStepId(id)) return stepBlocker(state, product, id)
  const item = getWorkItem(id)
  return item ? itemBlocker(state, product, item) : 'Unknown item'
}

/** True while some floor is building this row. */
function rowInWork(state: GameState, id: string): boolean {
  return activeProjects(state).some(({ project }) => {
    if (id === 'compliance') return project.featureIds.includes(COMPLIANCE_FEATURE)
    if (id === 'localise') return project.localises === true
    return project.itemId === id
  })
}

/** The floor building this row now, if any. */
export function builderOf(state: GameState, id: string) {
  return activeProjects(state).find(({ project }) => (id === 'compliance' ? project.featureIds.includes(COMPLIANCE_FEATURE) : id === 'localise' ? project.localises === true : project.itemId === id))?.office
}

/**
 * What a floor takes next from the roadmap: the first row, in the order the player set, that is on offer and that no floor is
 * building. A floor with the default focus ('features', which means anything) takes any row; one with a focus takes only the
 * rows of that stream. The 'features' row never goes to a focused floor.
 */
export function nextStep(state: GameState, product: Product, focus: Workstream): RoadmapStep | undefined {
  for (const id of product.roadmap ?? []) {
    if (rowInWork(state, id) || rowBlocker(state, product, id)) continue
    const info = rowInfo(id)
    if (!info) continue
    if (focus !== 'features' && info.workstream !== focus) continue
    if (isStepId(id)) return { kind: id }
    return { kind: 'item', item: getWorkItem(id)! }
  }
  return undefined
}

/** The item a floor with this focus takes next, if it is an item. */
export function nextItem(state: GameState, product: Product, workstream: Workstream): WorkItem | undefined {
  const step = nextStep(state, product, workstream)
  return step?.kind === 'item' ? step.item : undefined
}
