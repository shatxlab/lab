import { RELEASE_NOTES_KEPT } from './balance'
import type { Bump, Product, ReleaseNote } from './types'

/** The version a product is at: 1.0.0 at launch, and for products saved before versions existed. */
export function versionOf(product: Pick<Product, 'version'>): [number, number, number] {
  return product.version ?? [1, 0, 0]
}

export const formatVersion = (version: readonly number[]): string => version.join('.')

/** The version after a release that moves `bump`: a major resets the rest, a minor resets the patch. */
export function bumped(version: readonly [number, number, number], bump: Bump): [number, number, number] {
  const [major, minor, patch] = version
  if (bump === 'major') return [major + 1, 0, 0]
  return bump === 'minor' ? [major, minor + 1, 0] : [major, minor, patch + 1]
}

/** The version the product's next release of this size would get, for plans and panels. */
export const nextVersion = (product: Product, bump: Bump): string => formatVersion(bumped(versionOf(product), bump))

/** How a release with no spec moves the version: a patch for upkeep, a minor when it adds features or a roadmap item. */
export const bumpFor = (featureCount: number, hasItem: boolean): Bump => (featureCount > 0 || hasItem ? 'minor' : 'patch')

/** What a note says in a line: the version, what it was, and what it did to the product. */
export function describeRelease(product: Pick<Product, 'name'>, note: ReleaseNote): string {
  const reach = note.reachBefore > 0 ? Math.round((note.reachAfter / note.reachBefore - 1) * 100) : 0
  const fit = Math.round(note.fitAfter - note.fitBefore)
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`)
  return `${product.name} ${note.version}${note.title ? ` "${note.title}"` : ''}: reach ${sign(reach)}%, fit ${sign(fit)}`
}

/** Appends a note to the product's history, keeping the last few. */
export function addNote(product: Product, note: ReleaseNote): void {
  product.releases = [...(product.releases ?? []), note].slice(-RELEASE_NOTES_KEPT)
}
