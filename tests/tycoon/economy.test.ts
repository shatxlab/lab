import { describe, expect, it } from 'vitest'
import {
  BANKRUPT_AFTER_DEBT_DAYS,
  CANDIDATE_COUNT,
  CANDIDATE_REFRESH_DAYS,
  DAYS_PER_MONTH,
  OFFICE_KINDS,
} from '@/lib/tycoon/sim/balance'
import { monthlyBurn } from '@/lib/tycoon/sim/economy'
import { fire, hire, hireCost, ROLES } from '@/lib/tycoon/sim/hiring'
import { advance, advanceDay, drainEvents } from '@/lib/tycoon/sim/tick'
import { makeEmployee, makeState } from './helpers'

describe('costs', () => {
  it('charges salaries and rent daily', () => {
    const state = makeState([makeEmployee(100, {}, 3000), makeEmployee(101, {}, 3000)])
    const before = state.money
    advanceDay(state)
    const burn = (6000 + OFFICE_KINDS.garage.rent) / DAYS_PER_MONTH
    expect(monthlyBurn(state)).toBe(6000 + OFFICE_KINDS.garage.rent)
    expect(before - state.money).toBeCloseTo(burn)
  })
})

describe('bankruptcy', () => {
  it('triggers after BANKRUPT_AFTER_DEBT_DAYS consecutive days in debt, once', () => {
    const state = makeState([makeEmployee(100, {}, 3000)])
    state.money = -1
    advance(state, BANKRUPT_AFTER_DEBT_DAYS - 1)
    expect(state.gameOver).toBe(false)
    advanceDay(state)
    expect(state.gameOver).toBe(true)
    expect(drainEvents(state).filter((e) => e.type === 'bankrupt')).toHaveLength(1)

    const day = state.day
    advanceDay(state)
    expect(state.day).toBe(day)
  })

  it('resets the debt counter when money turns positive', () => {
    const state = makeState([makeEmployee(100, {}, 0)])
    state.money = -1
    advance(state, 5)
    expect(state.debtDays).toBe(5)
    state.money = 1000
    advanceDay(state)
    expect(state.debtDays).toBe(0)
  })
})

describe('hiring', () => {
  it('moves a candidate onto the payroll and charges the signing fee', () => {
    const state = makeState([])
    const candidate = state.candidates[0]
    const before = state.money
    expect(hire(state, candidate.id).ok).toBe(true)
    expect(state.employees).toContain(candidate)
    expect(state.candidates).not.toContain(candidate)
    expect(state.money).toBe(before - hireCost(candidate))
  })

  it('refuses when out of desks or money, or for unknown ids', () => {
    const state = makeState([makeEmployee(100), makeEmployee(101), makeEmployee(102), makeEmployee(103)])
    expect(hire(state, state.candidates[0].id)).toEqual({ ok: false, reason: 'No free desks' })

    const broke = makeState([])
    broke.money = 0
    expect(hire(broke, broke.candidates[0].id).ok).toBe(false)
    expect(hire(broke, -1).ok).toBe(false)
  })

  it('fires employees', () => {
    const state = makeState([makeEmployee(100)])
    expect(fire(state, 100).ok).toBe(true)
    expect(state.employees).toHaveLength(0)
    expect(fire(state, 100).ok).toBe(false)
  })

  it('refreshes the pool every CANDIDATE_REFRESH_DAYS with every role present', () => {
    const state = makeState([])
    const first = state.candidates.map((c) => c.id)
    advance(state, CANDIDATE_REFRESH_DAYS)
    expect(state.candidates).toHaveLength(CANDIDATE_COUNT)
    expect(state.candidates.some((c) => first.includes(c.id))).toBe(false)
    for (const role of ROLES) expect(state.candidates.some((c) => c.role === role)).toBe(true)
  })
})
