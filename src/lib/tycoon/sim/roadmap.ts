import { getCompanion } from '@/lib/tycoon/data/companions'
import { ALL_ITEMS, getWorkItem, type WorkItem } from '@/lib/tycoon/data/workstreams'
import { formatCount } from '@/lib/tycoon/format'
import { companionBlocker } from './companions'
import { activeProjects } from './offices'
import { euShareOf } from './products'
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
    const item = getWorkItem(id)
    if (!item) return fail('Unknown item')
    if ((product.built ?? []).includes(id)) return fail(`${item.name} is built already`)
  }
  if (itemIds.length === 0) delete product.roadmap
  else product.roadmap = [...itemIds]
  return OK
}

/** The item a floor on `workstream` takes next: the highest on the roadmap for it that is on offer and that no floor is building. */
export function nextItem(state: GameState, product: Product, workstream: Workstream): WorkItem | undefined {
  const inWork = new Set(activeProjects(state).flatMap(({ project }) => (project.itemId ? [project.itemId] : [])))
  for (const id of product.roadmap ?? []) {
    const item = getWorkItem(id)
    if (!item || item.workstream !== workstream || inWork.has(id) || itemBlocker(state, product, item)) continue
    return item
  }
  return undefined
}
