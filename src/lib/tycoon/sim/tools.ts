import { itemEffects } from '@/lib/tycoon/data/workstreams'
import type { GameState } from './types'

/** What the studio's internal tools add up to: the tools are built items of the hit, and go with it. */
export function toolEffects(state: Pick<GameState, 'products' | 'signatureId'>): ReturnType<typeof itemEffects> {
  const hit = state.products.find((p) => p.id === state.signatureId)
  return itemEffects(hit ?? {})
}

/** What the tools cost to keep running, per day. */
export const toolUpkeep = (state: Pick<GameState, 'products' | 'signatureId'>): number => toolEffects(state).upkeep
