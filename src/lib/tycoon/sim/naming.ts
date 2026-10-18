import { PRODUCT_PREFIXES, PRODUCT_WORDS } from '@/lib/tycoon/data/names'
import { pick } from './rng'
import type { GameState } from './types'

const SINGLE_TRIES = 12

/** Every product name in play or in the record: yours, retired ones, projects underway and the rivals'. */
function takenNames(state: GameState): Set<string> {
  const names = [
    ...state.products.map((p) => p.name),
    ...state.retired.map((p) => p.name),
    ...state.rivalProducts.map((p) => p.name),
    ...state.offices.flatMap((o) => (o.project ? [o.project.name] : [])),
  ]
  return new Set(names.map((n) => n.toLowerCase()))
}

/**
 * A product name nobody else has used. A single word while there are free ones, then a two-word name
 * ("Quiet Harbor") once the single words start running out, so a long game never repeats itself.
 */
export function freshProductName(state: GameState): string {
  const taken = takenNames(state)
  for (let i = 0; i < SINGLE_TRIES; i++) {
    const word = pick(state, PRODUCT_WORDS)
    if (!taken.has(word.toLowerCase())) return word
  }
  const free = PRODUCT_WORDS.filter((w) => !taken.has(w.toLowerCase()))
  if (free.length > PRODUCT_WORDS.length / 3) return pick(state, free)
  for (let i = 0; i < 50; i++) {
    const name = `${pick(state, PRODUCT_PREFIXES)} ${pick(state, PRODUCT_WORDS)}`
    if (!taken.has(name.toLowerCase())) return name
  }
  // 50 prefixes x 300 words is far beyond any run; this only guards against an endless loop.
  return `${pick(state, PRODUCT_WORDS)} ${taken.size}`
}
