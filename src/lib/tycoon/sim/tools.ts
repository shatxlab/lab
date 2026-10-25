import { itemEffects } from '@/lib/tycoon/data/workstreams'
import { agentEffects } from './agents'
import type { GameState } from './types'

type ToolHolder = Pick<GameState, 'products' | 'signatureId'> & Partial<Pick<GameState, 'agents' | 'day' | 'employees' | 'billSpike'>>

/** What the studio's internal tools add up to: the tools are built items of the hit, and go with it. The AI agents add theirs on top. */
export function toolEffects(state: ToolHolder): ReturnType<typeof itemEffects> {
  const hit = state.products.find((p) => p.id === state.signatureId)
  const items = itemEffects(hit ?? {})
  if (!state.agents || state.day === undefined || !state.employees) return items
  const agents = agentEffects({ agents: state.agents, day: state.day, employees: state.employees, billSpike: state.billSpike })
  return { ...items, speed: items.speed + agents.speed, fixes: items.fixes + agents.fixes, insight: items.insight + agents.insight, upkeep: items.upkeep + agents.upkeep }
}

/** What the tools and agents cost to keep running, per day. */
export const toolUpkeep = (state: ToolHolder): number => toolEffects(state).upkeep
