import { describe, expect, it } from 'vitest'
import { NEMESIS_BEAT_DAYS, NEMESIS_FIRST_DAYS, NEMESIS_START_RATIO } from '@/lib/tycoon/sim/balance'
import { nextChapter } from '@/lib/tycoon/sim/chapters'
import { nemesisDay, nemesisMonth, nemesisRival, nemesisStanding, strikeBack, strikeBackBlocker, strikeBackCost } from '@/lib/tycoon/sim/nemesis'
import { standings } from '@/lib/tycoon/sim/rivals'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { resolveRandomEvent } from '@/lib/tycoon/sim/events'
import { makeProduct } from './helpers'
import type { GameState } from '@/lib/tycoon/sim/types'

function studioWithHit(): GameState {
  const state = createInitialState(21)
  state.day = 1000
  state.products = [makeProduct({ id: 3, hit: true, users: 60_000, reach: 90_000, productTypeId: 'fintech_app' })]
  state.signatureId = 3
  state.hitDay = 900
  state.incomeAverage = 20_000
  return state
}

describe('the nemesis', () => {
  it('comes for the hit a while after it breaks out, once, with a founder, a story and a head start', () => {
    const state = studioWithHit()
    state.hitDay = state.day - NEMESIS_FIRST_DAYS + 10
    nemesisMonth(state)
    expect(state.nemesis).toBeUndefined()
    state.hitDay = state.day - NEMESIS_FIRST_DAYS
    nemesisMonth(state)
    const rival = nemesisRival(state)!
    expect(state.nemesis).toMatchObject({ founder: expect.any(String), story: expect.stringContaining(state.nemesis!.founder) })
    expect(rival.ratio).toBe(NEMESIS_START_RATIO)
    expect(rival.focus).toEqual(['fintech_app'])
    expect(nemesisStanding(state)!.theirs).toBeCloseTo(20_000 * NEMESIS_START_RATIO)
    const id = state.nemesis!.rivalId
    nemesisMonth(state)
    expect(state.nemesis!.rivalId).toBe(id)
    expect(standings(state).find((s) => s.id === id)!.revenue).toBeGreaterThan(23_000 - 1)
  })

  it('gains on a hit that is weak and falls back when you finish roadmap items', () => {
    const state = studioWithHit()
    state.hitDay = 0
    nemesisMonth(state)
    const rival = nemesisRival(state)!
    state.products[0].fit = 90
    const before = rival.ratio!
    nemesisMonth(state)
    expect(rival.ratio!).toBeGreaterThan(before)
    const mid = rival.ratio!
    state.products[0].built = ['test_automation', 'perf_pass']
    nemesisMonth(state)
    expect(rival.ratio!).toBeLessThan(mid)
    state.products[0].fit = 30
    state.products[0].built = state.products[0].built.slice()
    const weak = rival.ratio!
    nemesisMonth(state)
    expect(rival.ratio! - weak).toBeGreaterThan(0.09)
  })

  it('is beaten when you out-earn them by the margin for long enough, and the next comes later', () => {
    const state = studioWithHit()
    state.hitDay = 0
    nemesisMonth(state)
    nemesisRival(state)!.ratio = 0.7
    for (let i = 0; i < NEMESIS_BEAT_DAYS - 1; i++) nemesisDay(state)
    expect(state.nemesis).toBeDefined()
    nemesisDay(state)
    expect(state.nemesis).toBeUndefined()
    expect(state.nemesesBeaten).toBe(1)
    expect(state.rivals.every((r) => r.ratio === undefined)).toBe(true)
    nemesisMonth(state)
    expect(state.nemesis).toBeUndefined()
    state.day += 300
    nemesisMonth(state)
    expect(state.nemesis).toBeDefined()
  })

  it('is beaten at once when you absorb them, and a lead is lost faster than it is won', () => {
    const state = studioWithHit()
    state.hitDay = 0
    nemesisMonth(state)
    nemesisRival(state)!.ratio = 0.7
    for (let i = 0; i < 10; i++) nemesisDay(state)
    expect(state.nemesis!.leadDays).toBe(10)
    nemesisRival(state)!.ratio = 1.5
    nemesisDay(state)
    expect(state.nemesis!.leadDays).toBe(8)
    state.rivals = state.rivals.filter((r) => r.id !== state.nemesis!.rivalId)
    nemesisDay(state)
    expect(state.nemesesBeaten).toBe(1)
  })

  it('offers a poaching choice that costs a bonus to answer, or hands them the gain', () => {
    const state = studioWithHit()
    state.hitDay = 0
    nemesisMonth(state)
    const rival = nemesisRival(state)!
    for (let i = 0; i < 4; i++) state.employees.push({ ...state.employees[0], id: 900 + i, founder: false, name: `Hire ${i}` })
    state.money = 1_000_000
    state.nemesis!.nextMoveDay = state.day
    // Moves are random: run days until a poaching event is the one on screen.
    for (let i = 0; i < 400 && state.pendingEvent?.id !== 'nemesis_poach'; i++) {
      state.pendingEvent = null
      state.nemesis!.nextMoveDay = state.day
      nemesisDay(state)
    }
    expect(state.pendingEvent?.id).toBe('nemesis_poach')
    const ratio = rival.ratio!
    expect(resolveRandomEvent(state, 1).ok).toBe(true)
    expect(rival.ratio!).toBeCloseTo(ratio + 0.08, 5)
  })

  it('survives a save, and stays an ordinary studio in the next chapter', () => {
    const state = studioWithHit()
    state.hitDay = 0
    nemesisMonth(state)
    expect(deserialize(serialize(state))!.nemesis).toEqual(state.nemesis)
    state.gameOver = true
    state.ending = { kind: 'retired', day: state.day, worth: 5_000_000 }
    const next = nextChapter(state)!
    expect(next.nemesis).toBeUndefined()
    expect(next.rivals.every((r) => r.ratio === undefined)).toBe(true)
    expect(next.rivals.find((r) => r.id === state.nemesis!.rivalId)!.business).toBeGreaterThan(10_000)
  })

  it('can be struck back at for weeks of income, then not again for a while', () => {
    const state = studioWithHit()
    state.hitDay = 0
    nemesisMonth(state)
    const rival = nemesisRival(state)!
    state.money = 0
    expect(strikeBackBlocker(state)).toBe('Not enough money')
    state.money = 10_000_000
    const before = rival.ratio!
    const cost = strikeBackCost(state)
    expect(cost).toBeGreaterThan(100_000)
    expect(strikeBack(state).ok).toBe(true)
    expect(state.money).toBe(10_000_000 - cost)
    expect(rival.ratio!).toBeCloseTo(before - 0.2, 5)
    expect(strikeBackBlocker(state)).toMatch(/Wait/)
    state.day += 60
    expect(strikeBackBlocker(state)).toBeNull()
  })
})
