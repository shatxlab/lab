import { describe, expect, it } from 'vitest'
import { INCOME_AVERAGE_DAYS, LEADER_STAGE, TOP_SLIP_DAYS } from '@/lib/tycoon/sim/balance'
import { dailyIncome, revenueDay, trailingIncome } from '@/lib/tycoon/sim/economy'
import { rankingDay, standings } from '@/lib/tycoon/sim/rivals'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { makeProduct, makeState } from './helpers'

describe('the ranking goes by income over months, not a day', () => {
  it('a short spike in income moves the average only a little', () => {
    const state = makeState()
    state.products = [makeProduct({ users: 10_000 })]
    revenueDay(state)
    const steady = trailingIncome(state)
    expect(steady).toBeCloseTo(dailyIncome(state))
    state.products[0].users = 100_000
    for (let i = 0; i < 5; i++) revenueDay(state)
    expect(trailingIncome(state)).toBeLessThan(steady * 1.8)
    expect(trailingIncome(state)).toBeGreaterThan(steady)
    for (let i = 0; i < INCOME_AVERAGE_DAYS * 6; i++) revenueDay(state)
    expect(trailingIncome(state) / dailyIncome(state)).toBeGreaterThan(0.99)
  })

  it('shows your studio at its average income', () => {
    const state = makeState()
    state.products = [makeProduct({ users: 10_000 })]
    state.incomeAverage = 1234
    expect(standings(state).find((s) => s.id === 0)?.revenue).toBe(1234)
  })

  it('a day off the top costs a few days at the top, not all of them', () => {
    const state = makeState()
    state.stage = LEADER_STAGE
    state.incomeAverage = 1e9
    for (let i = 0; i < 100; i++) rankingDay(state)
    expect(state.daysAtTop).toBe(100)
    state.incomeAverage = 0
    state.rivals = [{ ...createInitialState(1).rivals[0], business: 1e6 }]
    rankingDay(state)
    expect(state.daysAtTop).toBe(100 - TOP_SLIP_DAYS)
  })

  it('keeps the average in a save, and older saves start from today', () => {
    const state = makeState()
    state.incomeAverage = 777
    expect(deserialize(serialize(state))?.incomeAverage).toBe(777)
    const old = makeState()
    delete old.incomeAverage
    expect(trailingIncome(deserialize(serialize(old))!)).toBe(dailyIncome(old))
  })
})
