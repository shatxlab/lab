import { DAYS_PER_MONTH, EXIT_BASE_MULTIPLE, EXIT_FIRST_OFFER_DAYS, EXIT_GAP_DAYS, EXIT_MAX_RAISES, EXIT_MIN_INCOME, EXIT_RAISE_PER_DECLINE, EXIT_WINDOW_DAYS } from './balance'
import { trailingIncome } from './economy'
import { logEntry, runSummary } from './journal'
import { canBeSold } from './offices'
import { lastReleaseDay } from './products'
import { standings } from './rivals'
import { fail, OK, type GameState, type Result } from './types'

/** What `multiple` years of what the studio earns come to, a little more for a good name. */
function valuation(state: GameState, multiple: number): number {
  const reputation = 1 + state.reputation / 200
  return trailingIncome(state) * DAYS_PER_MONTH * 12 * multiple * reputation
}

/** What a buyer would pay now: years of what the studio earns, a slightly better multiple each time you turn one down. */
export function buyoutPrice(state: GameState): number {
  const raises = Math.min(state.exit.declined, EXIT_MAX_RAISES)
  return Math.round(valuation(state, EXIT_BASE_MULTIPLE + EXIT_RAISE_PER_DECLINE * raises) / 1000) * 1000
}

/** What the studio is worth today: the cash, plus what a buyer would pay at the base multiple. The same yardstick for every ending. */
export function studioWorth(state: GameState): number {
  return Math.round(Math.max(0, state.money) + valuation(state, EXIT_BASE_MULTIPLE))
}

/** Days until buyers lose interest, or null before the first offer or once they have. */
export function offerWindowLeft(state: GameState): number | null {
  if (state.exit.firstDay === null || state.exit.closed) return null
  return Math.max(0, state.exit.firstDay + EXIT_WINDOW_DAYS - state.day)
}

/**
 * Once a small studio (the garage, or one rented floor: `canBeSold`) has a hit that has earned for a few months, a bigger company makes an offer now and then; turned down, it comes
 * back a little better. Buyers lose interest for good `EXIT_WINDOW_DAYS` after the first offer.
 */
export function exitDay(state: GameState): void {
  if (state.exit.pending) {
    if (!canBeSold(state)) state.exit.pending = null
    return
  }
  if (!canBeSold(state) || state.signatureId === null || state.exit.closed) return
  if (state.exit.firstDay !== null && state.day - state.exit.firstDay > EXIT_WINDOW_DAYS) {
    state.exit.closed = true
    state.events.push({ type: 'notice', text: 'Buyers have moved on: nobody is interested in buying the studio any more.' })
    logEntry(state, 'exit.closed', 'Buyers lost interest', { declined: state.exit.declined })
    return
  }
  if (state.day < state.exit.nextDay || trailingIncome(state) < EXIT_MIN_INCOME) return
  const hit = state.products.find((p) => p.id === state.signatureId)
  if (state.exit.firstDay === null && hit && state.day - lastReleaseDay(hit) < EXIT_FIRST_OFFER_DAYS) return
  const buyer = standings(state).find((s) => s.id !== 0)
  state.exit.firstDay ??= state.day
  state.exit.pending = { price: buyoutPrice(state), bidder: buyer?.name ?? 'A bigger company' }
  state.events.push({ type: 'offer' })
  logEntry(state, 'exit.offer', `${state.exit.pending.bidder} offered to buy the studio`, { price: state.exit.pending.price, declinedBefore: state.exit.declined })
}

/** Sells the studio for the offered price: the run ends here. */
export function acceptBuyout(state: GameState): Result {
  const offer = state.exit.pending
  if (!offer || !canBeSold(state)) return fail('No offer to accept')
  state.money += offer.price
  state.exit.pending = null
  state.gameOver = true
  // The money is the studio now: nothing left to value.
  state.ending = { kind: 'sold', day: state.day, price: offer.price, bidder: offer.bidder, worth: Math.round(state.money) }
  logEntry(state, 'end.sold', `Sold the studio to ${offer.bidder}`, { price: offer.price, worth: state.ending.worth, ...runSummary(state) })
  return OK
}

/** Turns the offer down; another comes later, and it will be a little better. */
export function declineBuyout(state: GameState): Result {
  const offer = state.exit.pending
  if (!offer) return fail('No offer to decline')
  state.exit.pending = null
  state.exit.declined += 1
  state.exit.nextDay = state.day + EXIT_GAP_DAYS
  logEntry(state, 'exit.declined', `Turned down ${offer.bidder}`, { price: offer.price })
  return OK
}

/** Ends the run on your own terms: nothing is sold, and the studio is judged by what it is worth. */
export function retireStudio(state: GameState): Result {
  if (state.gameOver) return fail('The run is over')
  state.exit.pending = null
  state.gameOver = true
  state.ending = { kind: 'retired', day: state.day, worth: studioWorth(state) }
  logEntry(state, 'end.retired', 'Retired from the company', { worth: state.ending.worth, ...runSummary(state) })
  return OK
}
