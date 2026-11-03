import { describe, expect, it } from 'vitest'
import { businessOverview } from '@/lib/tycoon/sim/business'
import { workersOf } from '@/lib/tycoon/sim/offices'
import { netPerDay } from '@/lib/tycoon/sim/economy'
import { capacityOf, growWorld, worldGrowth } from '@/lib/tycoon/sim/scale'
import { stage0Fixture } from './stage0-fixtures'

describe('current business read model', () => {
  it('is pure and agrees with the charged economy', () => {
    const state = stage0Fixture('large-company')
    const before = JSON.stringify(state)
    const view = businessOverview(state)
    expect(view.net).toBeCloseTo(netPerDay(state), 8)
    expect(view.workers).toBe(new Set(state.offices.flatMap((office) => workersOf(state, office)).map((worker) => worker.id)).size)
    expect(JSON.stringify(state)).toBe(before)
  })
  it('explains full servers and weak fit without conflating them', () => {
    const state = stage0Fixture('one-floor')
    const product = state.products[0]
    product.users = capacityOf(product)
    expect(businessOverview(state).products[0].growth.rate).toBe(0)
    expect(businessOverview(state).products[0].limits.join(' ')).toContain('Servers are full')
    product.fit = 25
    expect(businessOverview(state).products[0].growth.rate).toBeLessThan(0)
    expect(businessOverview(state).products[0].limits.join(' ')).toContain('Fit is below 50')
  })
  it('shares the demand calculation with the actual world update', () => {
    const state = stage0Fixture('one-floor')
    const product = state.products[0]
    product.users = 1
    product.world = 10
    const rate = worldGrowth(product, .2).rate
    growWorld(product, .2)
    expect(product.world).toBeCloseTo(10 * (1 + rate), 12)
  })
  it('handles the cafe without inventing a hit or salary costs', () => {
    const view = businessOverview(stage0Fixture('cafe'))
    expect(view.products).toEqual([])
    expect(view.costs.salaries).toBe(0)
  })
})
