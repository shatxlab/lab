import { describe, expect, it } from 'vitest'
import { FOUNDER_PAY_SHARE } from '@/lib/tycoon/sim/balance'
import { fire, salaryOf } from '@/lib/tycoon/sim/hiring'
import { createInitialState } from '@/lib/tycoon/sim/state'
import { advance } from '@/lib/tycoon/sim/tick'

describe('founders', () => {
  it('are the two people the studio starts with', () => {
    const state = createInitialState(5)
    expect(state.employees.filter((e) => e.founder)).toHaveLength(2)
  })

  it('draw a share of the market pay and cannot be fired', () => {
    const state = createInitialState(5)
    const founder = state.employees.find((e) => e.founder)!
    const full = salaryOf({ ...founder, founder: false }, state.day)
    expect(salaryOf(founder, state.day)).toBeLessThanOrEqual(Math.round(full * FOUNDER_PAY_SHARE) + 50)
    expect(fire(state, founder.id).ok).toBe(false)
    expect(state.employees).toContain(founder)
  })

  it('stay through a long run, whatever their morale', () => {
    const state = createInitialState(5)
    state.money = 1e12
    for (const e of state.employees) e.morale = 0
    advance(state, 360 * 6)
    expect(state.employees.filter((e) => e.founder)).toHaveLength(2)
  })
})
