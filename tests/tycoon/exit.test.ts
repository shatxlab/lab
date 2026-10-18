import { describe, expect, it } from 'vitest'
import { BANKRUPT_AFTER_DEBT_DAYS, EXIT_GAP_DAYS, EXIT_MIN_INCOME } from '@/lib/tycoon/sim/balance'
import { checkBankruptcy, dailyIncome } from '@/lib/tycoon/sim/economy'
import { acceptBuyout, buyoutPrice, declineBuyout, exitDay } from '@/lib/tycoon/sim/exit'
import { moveOut } from '@/lib/tycoon/sim/offices'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { drainEvents } from '@/lib/tycoon/sim/tick'
import type { GameState } from '@/lib/tycoon/sim/types'
import { createStore } from '@/lib/tycoon/store'
import { makeProduct } from './helpers'

/** A garage with a hit that earns well. */
function garageWithHit(): GameState {
  const state = createInitialState(3)
  state.rivals = []
  state.rivalProducts = []
  state.products = [makeProduct({ id: 40, hit: true, users: 50_000, reach: 50_000 })]
  state.signatureId = 40
  state.day = 400
  expect(dailyIncome(state)).toBeGreaterThan(EXIT_MIN_INCOME)
  return state
}

describe('selling the studio', () => {
  it('is offered in the garage once there is a hit that earns', () => {
    const state = garageWithHit()
    exitDay(state)
    expect(state.exit.pending?.price).toBe(buyoutPrice(state))
    expect(drainEvents(state).some((e) => e.type === 'offer')).toBe(true)
  })

  it('is not offered without a hit, or without income', () => {
    const noHit = garageWithHit()
    noHit.signatureId = null
    exitDay(noHit)
    expect(noHit.exit.pending).toBeNull()
    const poor = garageWithHit()
    poor.products[0].users = 10
    exitDay(poor)
    expect(poor.exit.pending).toBeNull()
  })

  it('ends the run with the money when accepted', () => {
    const state = garageWithHit()
    exitDay(state)
    const { price } = state.exit.pending!
    const before = state.money
    expect(acceptBuyout(state).ok).toBe(true)
    expect(state.gameOver).toBe(true)
    expect(state.money).toBe(before + price)
    expect(state.ending).toMatchObject({ kind: 'sold', price })
    expect(state.journal.some((e) => e.kind === 'end.sold')).toBe(true)
  })

  it('comes back better after a no, but not at once', () => {
    const state = garageWithHit()
    exitDay(state)
    const first = state.exit.pending!.price
    expect(declineBuyout(state).ok).toBe(true)
    expect(state.exit.declined).toBe(1)
    exitDay(state)
    expect(state.exit.pending).toBeNull()
    state.day += EXIT_GAP_DAYS
    exitDay(state)
    expect(state.exit.pending!.price).toBeGreaterThan(first)
  })

  it('is gone for good once the studio has moved out', () => {
    const state = garageWithHit()
    state.stage = 1
    state.money = 1_000_000
    exitDay(state)
    expect(state.exit.pending).not.toBeNull()
    expect(moveOut(state).ok).toBe(true)
    expect(state.exit.pending).toBeNull()
    state.day += 1000
    exitDay(state)
    expect(state.exit.pending).toBeNull()
    expect(acceptBuyout(state).ok).toBe(false)
  })

  it('goes through the store, and a saved offer is still waiting after a reload', () => {
    const state = garageWithHit()
    exitDay(state)
    const reloaded = deserialize(serialize(state))!
    const store = createStore(reloaded)
    expect(store.dialog.value).toEqual({ kind: 'offer' })
    expect(store.acceptBuyout().ok).toBe(true)
    expect(store.dialog.value).toEqual({ kind: 'game-over' })
  })

  it('records a bankruptcy as the ending', () => {
    const state = createInitialState(4)
    state.money = -1
    state.debtDays = BANKRUPT_AFTER_DEBT_DAYS
    checkBankruptcy(state)
    expect(state.ending).toMatchObject({ kind: 'bankrupt' })
  })
})
