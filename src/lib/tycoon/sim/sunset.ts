import { formatMoney } from '../format'
import { DAYS_PER_MONTH, REPUTATION_MAX, SALE_HIT_BONUS, SALE_HIT_REPUTATION_PENALTY, SALE_MIN_USERS, SALE_MONTHS, SALE_MORALE_PENALTY, SALE_REPUTATION_PENALTY } from './balance'
import { productInWork } from './offices'
import { bugFactor, productRevenue } from './products'
import { adjustMorale } from './morale'
import { rand } from './rng'
import { fail, OK, type GameState, type Product, type Result, type Rival } from './types'

/** What happens to a product that is switched off: a big one is sold, a small one just retired. */
export function sunsetOutcome(product: Product): 'sold' | 'retired' {
  return product.users >= SALE_MIN_USERS ? 'sold' : 'retired'
}

/** What a buyer would pay now: a year of its income, more for a hit, less while it is buggy. */
export function salePrice(product: Product): number {
  const worth = productRevenue(product) * DAYS_PER_MONTH * SALE_MONTHS * (product.hit ? SALE_HIT_BONUS : 1) * (0.6 + 0.4 * bugFactor(product))
  return Math.max(500, Math.round(worth / 500) * 500)
}

/** Why this product can't be sold or retired now, or null when it can. */
export function sunsetBlocker(state: GameState, product: Product): string | null {
  return productInWork(state, product.id) ? 'An update is in progress' : null
}

/** The rival that takes it over: one that builds this kind of product if there is one, and the more reputable the likelier. */
function buyerFor(state: GameState, product: Product): Rival | undefined {
  const liked = state.rivals.filter((r) => r.focus.includes(product.productTypeId))
  const pool = liked.length > 0 ? liked : state.rivals
  const total = pool.reduce((sum, r) => sum + 10 + r.reputation, 0)
  let roll = rand(state) * total
  return pool.find((r) => (roll -= 10 + r.reputation) < 0) ?? pool[pool.length - 1]
}

/**
 * Takes a product off the portfolio. Below the user threshold it is simply retired: free, no consequences.
 * Above it, a rival buys it: you are paid, it joins that rival's products with its users, and the team
 * and the studio's name take a small hit. A bug-fixing job on it stops.
 */
export function sunsetProduct(state: GameState, productId: number): Result {
  const product = state.products.find((p) => p.id === productId)
  if (!product) return fail('Unknown product')
  const blocker = sunsetBlocker(state, product)
  if (blocker) return fail(blocker)

  state.fixes = state.fixes.filter((f) => f.productId !== product.id)
  state.products = state.products.filter((p) => p.id !== product.id)
  const outcome = sunsetOutcome(product)
  const price = outcome === 'sold' ? salePrice(product) : 0
  const buyer = outcome === 'sold' ? buyerFor(state, product) : undefined

  state.retired.push({
    id: product.id,
    name: product.name,
    productTypeId: product.productTypeId,
    size: product.size,
    hit: product.hit,
    releaseDay: product.releaseDay,
    endDay: state.day,
    users: Math.round(product.users),
    totalRevenue: product.totalRevenue,
    outcome,
    price,
    buyer: buyer?.name ?? null,
  })

  if (outcome === 'retired') {
    state.events.push({ type: 'notice', text: `${product.name} was retired.` })
    return OK
  }
  state.money += price
  adjustMorale(state, -SALE_MORALE_PENALTY)
  const penalty = product.hit ? SALE_HIT_REPUTATION_PENALTY : SALE_REPUTATION_PENALTY
  state.reputation = Math.max(0, Math.min(REPUTATION_MAX, state.reputation - penalty))
  if (buyer) {
    state.rivalProducts.push({
      id: product.id,
      rivalId: buyer.id,
      name: product.name,
      productTypeId: product.productTypeId,
      size: product.size,
      quality: product.quality,
      releaseDay: product.releaseDay,
      updatedDay: state.day,
      reach: product.reach,
      users: product.users,
      hit: product.hit,
    })
  }
  state.events.push({
    type: 'notice',
    text: `${product.name} was sold${buyer ? ` to ${buyer.name}` : ''}: ${formatMoney(price)} in the bank, and the team is a little sad to see it go.`,
    sound: 'deal',
  })
  return OK
}
