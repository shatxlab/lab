import { describe, expect, it } from 'vitest'
import { DAYS_PER_MONTH } from '@/lib/tycoon/sim/balance'
import { companionBlocker, companionEffects, companionsDay, companionsOf, freeSlots, launchCompanion } from '@/lib/tycoon/sim/companions'
import { getCompanion } from '@/lib/tycoon/data/companions'
import { dailyIncome, productIncome } from '@/lib/tycoon/sim/economy'
import { fitPressure } from '@/lib/tycoon/sim/fit'
import { insightRate } from '@/lib/tycoon/sim/insight'
import { itemBlocker, nextItem, setRoadmap } from '@/lib/tycoon/sim/roadmap'
import { toolEffects, toolUpkeep } from '@/lib/tycoon/sim/tools'
import { getWorkItem } from '@/lib/tycoon/data/workstreams'
import type { GameState } from '@/lib/tycoon/sim/types'
import { makeProduct, makeState } from './helpers'

function studio(): GameState {
  const state = makeState()
  state.offices[0].kind = 'office'
  state.day = 3000
  state.products = [makeProduct({ id: 7, name: 'Atlas', hit: true, users: 2_000_000, reach: 3_000_000, fit: 85, releaseDay: 2990 })]
  state.signatureId = 7
  state.offices[0].productId = 7
  return state
}

describe('companion products', () => {
  it('suit some hits, take a slot, and cannot be launched twice', () => {
    const state = studio()
    expect(companionBlocker(state, getCompanion('mobile_app')!)).toBeNull()
    expect(companionBlocker(state, getCompanion('creator_tool')!)).toMatch(/does not suit/i)
    const launched = launchCompanion(state, 'mobile_app')!
    expect(launched.role).toBe('reach')
    expect(launched.users).toBeGreaterThan(0)
    expect(freeSlots(state)).toBe(1)
    expect(companionBlocker(state, getCompanion('mobile_app')!)).toBe('Already launched')
    expect(launchCompanion(state, 'pro_addon')).not.toBeNull()
    expect(freeSlots(state)).toBe(0)
    expect(companionBlocker(state, getCompanion('integrations')!)).toMatch(/slots are taken/)
  })

  it('side products fill the slots too', () => {
    const state = studio()
    state.products.push(makeProduct({ id: 8, role: 'side' }), makeProduct({ id: 9, role: 'side' }))
    expect(freeSlots(state)).toBe(0)
    expect(launchCompanion(state, 'mobile_app')).toBeNull()
  })

  it('a healthy companion helps the hit and a neglected one costs it fit', () => {
    const state = studio()
    launchCompanion(state, 'mobile_app')
    launchCompanion(state, 'pro_addon')
    const effects = companionEffects(state)
    expect(effects.reach).toBeGreaterThan(0)
    expect(effects.retention).toBeGreaterThan(0)
    expect(productIncome(state, state.products[0])).toBeGreaterThan(state.products[0].users * 0)
    for (const c of companionsOf(state)) c.releaseDay = 0 // years stale
    expect(companionEffects(state)).toEqual({ reach: 0, retention: 0, pay: 0 })
    expect(fitPressure(state, state.products[0]).companions).toBeGreaterThan(0)
  })

  it('follows the hit while a floor looks after it, and is left to fade otherwise', () => {
    const state = studio()
    const c = launchCompanion(state, 'mobile_app')!
    c.reach = 1
    state.day = DAYS_PER_MONTH * 100
    companionsDay(state)
    expect(c.reach).toBe(1)
    state.offices[0].workstream = 'companions'
    companionsDay(state)
    expect(c.reach).toBeGreaterThan(1000)
  })

  it('companion launches wait on the roadmap for users and a free slot', () => {
    const state = studio()
    const item = getWorkItem('companion:mobile_app')!
    expect(item.workstream).toBe('companions')
    expect(itemBlocker(state, state.products[0], item)).toBeNull()
    state.products[0].users = 1000
    expect(itemBlocker(state, state.products[0], item)).toMatch(/users/)
    state.products[0].users = 2_000_000
    setRoadmap(state, 7, ['companion:mobile_app'])
    expect(nextItem(state, state.products[0], 'companions')?.id).toBe('companion:mobile_app')
  })
})

describe('internal tools', () => {
  it('add up for the hit, cost upkeep and make the studio better', () => {
    const state = studio()
    const before = { insight: insightRate(state), income: dailyIncome(state) }
    expect(toolUpkeep(state)).toBe(0)
    state.products[0].built = ['analytics_pipeline', 'ci_pipeline']
    expect(toolEffects(state).insight).toBe(1.5)
    expect(toolEffects(state).speed).toBeCloseTo(0.1)
    expect(toolUpkeep(state)).toBe(140)
    expect(insightRate(state)).toBeCloseTo(before.insight + 1.5)
    expect(dailyIncome(state)).toBe(before.income) // tools earn nothing
  })
})
