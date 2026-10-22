import { eraAt } from '@/lib/tycoon/data/eras'
import { PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import {
  MARKET_COLD,
  MARKET_HOT,
  MARKET_MAX,
  MARKET_MIN,
  MARKET_NEWS_GAP_DAYS,
  MARKET_NOISE,
  MARKET_PULL,
  MARKET_SHOCK,
  MARKET_SHOCK_CHANCE,
} from './balance'
import { rand, randRange } from './rng'
import { productTypeLock } from './unlocks'
import type { GameState } from './types'

export function initialMarket(): Record<string, number> {
  return Object.fromEntries(PRODUCT_TYPES.map((t) => [t.id, 1]))
}

export function marketDemand(state: GameState, productTypeId: string): number {
  return state.market[productTypeId] ?? 1
}

/**
 * Monthly drift: each type is pulled toward where the era wants it (1.0 unless the era favours or
 * neglects it), jostled by noise, and now and then
 * hit by a boom or bust. Tells the player when a type they can build turns hot or cold.
 */
export function updateMarket(state: GameState): void {
  for (const type of PRODUCT_TYPES) {
    const before = marketDemand(state, type.id)
    // Always draw three numbers per type so the RNG stream doesn't depend on outcomes.
    const noise = randRange(state, -MARKET_NOISE, MARKET_NOISE)
    const shockRoll = rand(state)
    const shockSign = rand(state) < 0.5 ? -1 : 1
    const shock = shockRoll < MARKET_SHOCK_CHANCE ? shockSign * MARKET_SHOCK : 0

    const center = eraAt(state.day).demand[type.id] ?? 1
    const after = Math.min(MARKET_MAX, Math.max(MARKET_MIN, before + (center - before) * MARKET_PULL + noise + shock))
    state.market[type.id] = after

    if (productTypeLock(state, type) !== null) continue
    // A market hovering at the edge would make news every month: once in a while is news enough.
    const news = state.marketNews ?? {}
    if (state.day - (news[type.id] ?? -Infinity) < MARKET_NEWS_GAP_DAYS) continue
    const percent = Math.round(Math.abs(after - 1) * 100)
    if (before < MARKET_HOT && after >= MARKET_HOT) {
      state.events.push({ type: 'notice', text: `${type.name} demand is surging: +${percent}%.` })
      state.marketNews = { ...news, [type.id]: state.day }
    } else if (before > MARKET_COLD && after <= MARKET_COLD) {
      state.events.push({ type: 'notice', text: `${type.name} demand is cooling: -${percent}%.` })
      state.marketNews = { ...news, [type.id]: state.day }
    }
  }
}
