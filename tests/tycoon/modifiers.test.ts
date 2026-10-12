import { describe, expect, it } from 'vitest'
import { dailyIncome, revenueDay } from '@/lib/tycoon/sim/economy'
import { addModifier, hasModifier, pruneModifiers, statMultiplier } from '@/lib/tycoon/sim/modifiers'
import { advanceDay } from '@/lib/tycoon/sim/tick'
import { dailyContribution } from '@/lib/tycoon/sim/work'
import { makeEmployee, makeState, richState } from './helpers'

describe('modifiers', () => {
  it('multiplies active modifiers on the same stat and ignores other stats', () => {
    const state = makeState()
    expect(statMultiplier(state, 'revenue')).toBe(1)
    addModifier(state, { source: 'a', stat: 'revenue', mult: 1.5, days: 10 })
    addModifier(state, { source: 'b', stat: 'revenue', mult: 0.5, days: 10 })
    addModifier(state, { source: 'c', stat: 'workSpeed', mult: 2, days: 10 })
    expect(statMultiplier(state, 'revenue')).toBeCloseTo(0.75)
    expect(statMultiplier(state, 'workSpeed')).toBe(2)
  })

  it('stops applying on the expiry day and is pruned', () => {
    const state = makeState()
    addModifier(state, { source: 'deal', stat: 'revenue', mult: 0.85, days: 5 })
    expect(hasModifier(state, 'deal')).toBe(true)
    state.day += 4
    expect(statMultiplier(state, 'revenue')).toBeCloseTo(0.85)
    state.day += 1
    expect(statMultiplier(state, 'revenue')).toBe(1)
    expect(hasModifier(state, 'deal')).toBe(false)
    expect(state.modifiers).toHaveLength(1)
    pruneModifiers(state)
    expect(state.modifiers).toHaveLength(0)
  })

  it('a revenue modifier scales daily income and what is actually earned', () => {
    const plain = richState()
    const boosted = richState()
    addModifier(boosted, { source: 'viral', stat: 'revenue', mult: 1.5, days: 10 })
    expect(dailyIncome(boosted)).toBeCloseTo(dailyIncome(plain) * 1.5)

    const before = boosted.money
    revenueDay(boosted)
    const earned = boosted.money - before
    const plainBefore = plain.money
    revenueDay(plain)
    expect(earned).toBeCloseTo((plain.money - plainBefore) * 1.5)
  })

  it('a work-speed modifier scales what employees contribute', () => {
    const normal = makeState([makeEmployee(1, { engineering: 50 })], 4)
    const slowed = makeState([makeEmployee(1, { engineering: 50 })], 4)
    addModifier(slowed, { source: 'hardware', stat: 'workSpeed', mult: 0.75, days: 8 })
    const a = dailyContribution(normal.employees[0], normal)
    const b = dailyContribution(slowed.employees[0], slowed)
    expect(b.engineering).toBeCloseTo(a.engineering * 0.75)
  })

  it('advancing days removes expired modifiers', () => {
    const state = richState()
    addModifier(state, { source: 'outage', stat: 'revenue', mult: 0.6, days: 3 })
    for (let i = 0; i < 4; i++) advanceDay(state)
    expect(state.modifiers.some((m) => m.source === 'outage')).toBe(false)
  })
})
