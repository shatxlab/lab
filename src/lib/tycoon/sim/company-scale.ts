import { getProductType } from '@/lib/tycoon/data/productTypes'
import type { GameState } from './types'

/** New paid companies only. Compare professional customers with the original Web App's public base price,
 * not current revenue/cash, monetisation upgrades or temporary deals. Consumer thresholds never rise.
 * Standard/legacy rules remain exact; selecting a founding focus without shipping a hit grants nothing. */
export function companyTrafficGoal(state: GameState, original: number, typeId?: string): number {
  const id = typeId ?? state.products.find((p) => p.id === state.signatureId)?.productTypeId
  if (!state.founding || !id || original === 0) return original
  const price = getProductType(id).revenuePerUser
  return Math.max(1, Math.ceil(original * Math.min(1, .3 / price)))
}
const traffic: Record<string, number> = { hit_200k: 200000, hit_1m: 1000000, hit_3m: 3000000, hit_10m: 10000000 }
export function companyGoalLabel(state: GameState, goal: { id: string; label: string }): string {
  const base = traffic[goal.id], target = base && companyTrafficGoal(state, base)
  if (!base || target === base) return goal.label
  const hit = state.products.find((p) => p.id === state.signatureId)
  return `Grow your hit to ${target.toLocaleString('en-US')} ${getProductType(hit!.productTypeId).userNoun} (product-family scale)`
}
