import { strikeBackPreview } from '../../src/lib/tycoon/sim/nemesis'
import { monthlyBurn } from '../../src/lib/tycoon/sim/economy'
import { operating } from '../../src/lib/tycoon/sim/services'
import type { GameState } from '../../src/lib/tycoon/sim/types'

/** Explicit optimistic bot choice, never a simulation-side automatic response or subsidy.
 * Keep the old four-campaign-cost requirement and the parallel bot's six-month burn reserve.
 * Rivalry spending must not cannibalise the operating runway needed for the next floor.
 */
export function operatingRivalResponse(state: GameState) {
  if (!operating(state)) return null
  const preview = strikeBackPreview(state)
  if (!preview || preview.blocker || preview.ratio <= preview.threshold) return null
  return state.money > 4 * preview.cost && state.money - preview.cost >= 6 * monthlyBurn(state) ? preview : null
}
