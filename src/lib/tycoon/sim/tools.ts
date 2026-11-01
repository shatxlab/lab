import { itemEffects } from '@/lib/tycoon/data/workstreams'
import type { GameState } from './types'

type ToolHolder = Pick<GameState, 'products' | 'signatureId'>

/** What the studio's internal tools add up to: the tools are built items of the hit, and go with it. */
export function toolEffects(state: ToolHolder): ReturnType<typeof itemEffects> {
  return itemEffects(state.products.find((p) => p.id === state.signatureId) ?? {})
}

/** What the tools cost to keep running, per day. */
export const toolUpkeep = (state: ToolHolder): number => toolEffects(state).upkeep
