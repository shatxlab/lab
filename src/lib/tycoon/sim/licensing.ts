import { LICENSE_LIMIT, LICENSE_SHARE } from './balance'
import { bugFactor, interest, productRevenue } from './products'
import { fail, OK, type GameState, type Product, type Result } from './types'
import { isResearched } from './unlocks'

/** The research that lets a studio license a Flagship. */
export const LICENSING_RESEARCH = 'licensing'

export function licensedCount(state: GameState): number {
  return state.products.filter((p) => p.licensed).length
}

/** Why this product can't be licensed now, or null when it can. */
export function licenseBlocker(state: GameState, product: Product): string | null {
  if (product.licensed) return 'Already licensed'
  if (!isResearched(state, LICENSING_RESEARCH)) return 'Research the Licensing programme first'
  if (product.size !== 'flagship') return 'Only a Flagship can be licensed'
  return licensedCount(state) >= LICENSE_LIMIT ? `At most ${LICENSE_LIMIT} products can be licensed` : null
}

/** What a licensed product pays per day on top of its own users: a share of its income, only while it is kept up (fresh and with few bugs). */
export function licenseIncome(state: GameState, product: Product): number {
  if (!product.licensed) return 0
  return productRevenue(product) * LICENSE_SHARE * interest(product, state.day) * bugFactor(product)
}

/** Licenses a product to other companies, or takes the licence back. */
export function setLicensed(state: GameState, productId: number, licensed: boolean): Result {
  const product = state.products.find((p) => p.id === productId)
  if (!product) return fail('Unknown product')
  if (!licensed) {
    if (!product.licensed) return fail('Not licensed')
    delete product.licensed
    return OK
  }
  const blocker = licenseBlocker(state, product)
  if (blocker) return fail(blocker)
  product.licensed = true
  return OK
}
