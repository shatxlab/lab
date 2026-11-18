import { describe, expect, it } from 'vitest'
import { ERAS } from '@/lib/tycoon/data/eras'
import { NEWCOMERS, RIVALS } from '@/lib/tycoon/data/rivals'
import { rivalArrives, rivalsArrive, rivalsDay } from '@/lib/tycoon/sim/rivals'
import { createInitialState } from '@/lib/tycoon/sim/state'
import { advance, drainEvents } from '@/lib/tycoon/sim/tick'
import { dayOfEra, makeProduct } from './helpers'

describe('the competition', () => {
  it('starts with the established studios, the rest of the ten move in later; names are unique', () => {
    const state = createInitialState(2)
    const early = RIVALS.filter((r) => r.arrivesYear === undefined).length
    expect(state.rivals).toHaveLength(early)
    expect(early).toBeLessThan(10)
    expect(new Set(state.rivals.map((r) => r.name)).size).toBe(early)
    expect(new Set(state.rivals.map((r) => r.id)).size).toBe(early)
    expect(state.rivalProducts.length).toBeGreaterThan(8)
    expect(RIVALS).toHaveLength(10)
  })

  it('welcomes a new studio at the start of each of the later eras, once', () => {
    const state = createInitialState(2)
    const era = Number(Object.keys(NEWCOMERS)[0])
    const base = state.rivals.length
    expect(era).toBeLessThan(ERAS.length)
    rivalArrives(state, era)
    expect(state.rivals).toHaveLength(base + 1)
    expect(state.rivals.at(-1)!.name).toBe(NEWCOMERS[era]!.name)
    expect(drainEvents(state).some((e) => e.type === 'notice' && e.text.includes(NEWCOMERS[era]!.name))).toBe(true)
    rivalArrives(state, era)
    expect(state.rivals).toHaveLength(base + 1)
    rivalArrives(state, 0) // no newcomer in the first era
    expect(state.rivals).toHaveLength(base + 1)
  })

  it('gets its newcomers through a normal run, one per era', () => {
    const state = createInitialState(3)
    state.money = 1e12 // an idle studio would go bankrupt long before the last era
    advance(state, dayOfEra(ERAS.length - 1) + 5)
    // Hand-written newcomers for the early eras, generated ones for the rest: one for every era after the first.
    expect(state.rivals.length).toBe(RIVALS.length + ERAS.length - 1)
  }, 20_000)

  it('studios move in as their year comes, and never twice', () => {
    const state = createInitialState(4)
    const early = state.rivals.length
    state.day = 12 * 30 * 7
    rivalsArrive(state, true)
    expect(state.rivals).toHaveLength(RIVALS.length)
    rivalsArrive(state, true)
    expect(state.rivals).toHaveLength(RIVALS.length)
    expect(early).toBeLessThan(RIVALS.length)
  })

  it('only announces a launch that touches you: a hit, or a type you build', () => {
    const state = createInitialState(6)
    state.products = []
    const rival = state.rivals[0]
    const noise = () => {
      rival.nextLaunchDay = state.day
      rivalsDay(state)
      return drainEvents(state).filter((e) => e.type === 'notice')
    }
    // Launch until we see a launch that is not a hit: it is silent while we have no products.
    for (let i = 0; i < 60; i++) {
      const before = state.rivalProducts.length
      const notices = noise()
      const launched = state.rivalProducts[state.rivalProducts.length - 1]
      expect(state.rivalProducts.length).toBe(before + 1)
      if (!launched.hit) expect(notices).toEqual([])
    }
    // With a product of every type live, every launch is news.
    state.products = ['web_app', 'mobile_app', 'dev_tool', 'game', 'saas_platform', 'ai_product', 'cloud_platform'].map((id, i) => makeProduct({ id: 700 + i, productTypeId: id }))
    expect(noise()).toHaveLength(1)
  })
})
