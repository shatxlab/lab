import { DAYS_PER_MONTH, EXIT_BASE_MULTIPLE, EXIT_GAP_DAYS, EXIT_MIN_INCOME, EXIT_RAISE_PER_DECLINE, EXIT_MAX_RAISES } from './balance'
import { dailyIncome } from './economy'
import { logEntry, runSummary } from './journal'
import { inGarage } from './offices'
import { standings } from './rivals'
import { fail, OK, type GameState, type Result } from './types'

/** What a buyer would pay now: years of what the studio earns, a better multiple each time you turn one down. */
export function buyoutPrice(state: GameState): number {
  const raises = Math.min(state.exit.declined, EXIT_MAX_RAISES)
  const multiple = EXIT_BASE_MULTIPLE + EXIT_RAISE_PER_DECLINE * raises
  const reputation = 1 + state.reputation / 200
  return Math.round((dailyIncome(state) * DAYS_PER_MONTH * 12 * multiple * reputation) / 1000) * 1000
}

/** Once the garage has a hit that earns, a bigger company makes an offer now and then; turned down, it comes back better. */
export function exitDay(state: GameState): void {
  if (state.exit.pending) {
    if (!inGarage(state)) state.exit.pending = null
    return
  }
  if (!inGarage(state) || state.signatureId === null) return
  if (state.day < state.exit.nextDay || dailyIncome(state) < EXIT_MIN_INCOME) return
  const buyer = standings(state).find((s) => s.id !== 0)
  state.exit.pending = { price: buyoutPrice(state), bidder: buyer?.name ?? 'A bigger company' }
  state.events.push({ type: 'offer' })
  logEntry(state, 'exit.offer', `${state.exit.pending.bidder} offered to buy the studio`, { price: state.exit.pending.price, declinedBefore: state.exit.declined })
}

/** Sells the studio for the offered price: the run ends here. */
export function acceptBuyout(state: GameState): Result {
  const offer = state.exit.pending
  if (!offer || !inGarage(state)) return fail('No offer to accept')
  state.money += offer.price
  state.exit.pending = null
  state.gameOver = true
  state.ending = { kind: 'sold', day: state.day, price: offer.price, bidder: offer.bidder }
  logEntry(state, 'end.sold', `Sold the studio to ${offer.bidder}`, { price: offer.price, ...runSummary(state) })
  return OK
}

/** Turns the offer down; another comes later, and it will be better. */
export function declineBuyout(state: GameState): Result {
  const offer = state.exit.pending
  if (!offer) return fail('No offer to decline')
  state.exit.pending = null
  state.exit.declined += 1
  state.exit.nextDay = state.day + EXIT_GAP_DAYS
  logEntry(state, 'exit.declined', `Turned down ${offer.bidder}`, { price: offer.price })
  return OK
}
