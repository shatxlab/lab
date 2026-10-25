import { describe, expect, it } from 'vitest'
import { DEEP_BASE_CHANCE } from '@/lib/tycoon/sim/balance'
import { deepWorkBlocker, deepWorkChance, deepWorkDay, startDeepWork } from '@/lib/tycoon/sim/deepwork'
import { resolveRandomEvent } from '@/lib/tycoon/sim/events'
import { friendMonth } from '@/lib/tycoon/sim/friend'
import { you } from '@/lib/tycoon/sim/founding'
import { insightRate } from '@/lib/tycoon/sim/insight'
import { nemesisMonth, nemesisRival } from '@/lib/tycoon/sim/nemesis'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { makeProduct } from './helpers'
import type { GameState } from '@/lib/tycoon/sim/types'

function hq(): GameState {
  const state = createInitialState(51)
  state.day = 2000
  state.hitDay = 1000
  state.offices[0].kind = 'office'
  state.products = [makeProduct({ id: 3, hit: true, users: 60_000, reach: 90_000, productTypeId: 'fintech_app', fit: 70, bugs: 20 })]
  state.signatureId = 3
  state.incomeAverage = 20_000
  state.money = 1_000_000
  return state
}

function run(state: GameState, days: number): void {
  for (let i = 0; i < days; i++) {
    state.day += 1
    deepWorkDay(state)
    if (state.pendingEvent) resolveRandomEvent(state, 0)
  }
}

describe('deep work', () => {
  it('needs a hit, an office, nothing else on, and a rival to study one', () => {
    const state = hq()
    expect(deepWorkBlocker(state, 'signature')).toBeNull()
    expect(deepWorkBlocker(state, 'study')).toMatch(/rival/)
    expect(deepWorkBlocker(state, 'nope')).toMatch(/Unknown/)
    state.offices[0].kind = 'garage'
    expect(deepWorkBlocker(state, 'signature')).toMatch(/hit and an office/)
    state.offices[0].kind = 'office'
    expect(startDeepWork(state, 'signature').ok).toBe(true)
    expect(deepWorkBlocker(state, 'rewrite')).toMatch(/already/)
    nemesisMonth(state)
    state.deepWork = undefined
    state.hitDay = 0
    nemesisMonth(state)
    expect(deepWorkBlocker(state, 'study')).toBeNull()
  })

  it('takes your insight while you are at it, and gives it back after', () => {
    const state = hq()
    const free = insightRate(state)
    expect(free).toBeGreaterThan(0)
    startDeepWork(state, 'signature')
    expect(insightRate(state)).toBeLessThan(free)
    state.deepWork = undefined
    expect(insightRate(state)).toBe(free)
  })

  it('asks halfway how to go on, and what you choose moves the odds', () => {
    const state = hq()
    startDeepWork(state, 'signature')
    const steady = deepWorkChance(state)
    expect(steady).toBeGreaterThanOrEqual(DEEP_BASE_CHANCE)
    run(state, 22)
    expect(state.pendingEvent).toBeNull()
    state.day += 1
    deepWorkDay(state)
    expect(state.pendingEvent?.id).toBe('deep_work_checkpoint')
    expect(resolveRandomEvent(state, 1).ok).toBe(true) // bold
    expect(deepWorkChance(state)).toBeLessThan(steady)
    state.deepWork!.helped = true
    expect(deepWorkChance(state)).toBeGreaterThan(steady - 0.2)
  })

  it('a friend close enough can pair with you, a contractor costs money, a distant friend cannot', () => {
    const state = hq()
    friendMonth(state)
    state.pendingEvent = null
    startDeepWork(state, 'rewrite')
    state.friendArc!.bond = 20
    state.deepWork!.startDay = state.day - 30
    deepWorkDay(state)
    expect((state as GameState).pendingEvent?.id).toBe('deep_work_checkpoint')
    expect(resolveRandomEvent(state, 3).ok).toBe(false)
    const money = state.money
    expect(resolveRandomEvent(state, 2).ok).toBe(true)
    expect(state.money).toBeLessThan(money)
    expect(state.deepWork!.helped).toBe(true)

    const close = hq()
    friendMonth(close)
    close.pendingEvent = null
    startDeepWork(close, 'rewrite')
    close.friendArc!.bond = 80
    close.deepWork!.startDay = close.day - 30
    deepWorkDay(close)
    expect(resolveRandomEvent(close, 3).ok).toBe(true)
    expect(close.friendArc!.bond).toBe(84)
  })

  it('ends in a result and a sharper you, whichever way it goes', () => {
    let wins = 0
    let losses = 0
    for (let seed = 1; seed <= 40 && (wins === 0 || losses === 0); seed++) {
      const state = hq()
      state.rng = seed
      const me = you(state)!
      const before = me.skills.design
      startDeepWork(state, 'signature')
      run(state, 46)
      expect(state.deepWork).toBeUndefined()
      expect(me.skills.design).toBeGreaterThan(before)
      if (state.journal.some((e) => e.kind === 'deepwork.done')) wins++
      else losses++
    }
    expect(wins).toBeGreaterThan(0)
    expect(losses).toBeGreaterThan(0)
  })

  it('each piece of work does what it says when it works out', () => {
    const win = (id: string, setup?: (s: GameState) => void) => {
      const state = hq()
      setup?.(state)
      startDeepWork(state, id)
      state.deepWork!.startDay = state.day - 100
      state.deepWork!.checkpointDone = true
      state.deepWork!.helped = true
      state.rng = 1
      const you0 = you(state)!
      you0.skills.design = you0.skills.engineering = you0.analysis = 100
      deepWorkDay(state)
      return state
    }
    const sig = win('signature')
    expect(sig.products[0].fit).toBeGreaterThanOrEqual(68)
    const rewrite = win('rewrite')
    expect(rewrite.products[0].bugs).toBeLessThanOrEqual(26)
    const story = win('story')
    expect(story.reputation).toBeGreaterThanOrEqual(0)
    const study = win('study', (s) => {
      s.hitDay = 0
      nemesisMonth(s)
    })
    expect(nemesisRival(study)!.ratio!).toBeLessThanOrEqual(1.2)
  })

  it('survives a save', () => {
    const state = hq()
    startDeepWork(state, 'story')
    expect(deserialize(serialize(state))!.deepWork).toEqual(state.deepWork)
  })
})
