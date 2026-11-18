import { describe, expect, it } from 'vitest'
import { IPO_PROFIT_DAYS, IPO_REVENUE, IPO_USERS } from '@/lib/tycoon/sim/balance'
import { profitDay } from '@/lib/tycoon/sim/economy'
import { goPublic, ipoBlocker, ipoValuation, studioWorth } from '@/lib/tycoon/sim/exit'
import { changeOfGuard, you } from '@/lib/tycoon/sim/founding'
import { title } from '@/lib/tycoon/sim/careers'
import { insightRate } from '@/lib/tycoon/sim/insight'
import { openOffice } from '@/lib/tycoon/sim/offices'
import { STAGES } from '@/lib/tycoon/data/stages'
import { createInitialState } from '@/lib/tycoon/sim/state'
import { generateAnalyst } from '@/lib/tycoon/sim/hiring'
import { makeProduct } from './helpers'
import type { GameState } from '@/lib/tycoon/sim/types'

function globalStudio(): GameState {
  const state = createInitialState(12)
  state.offices[0].kind = 'office'
  state.stage = STAGES.length - 1
  state.money = 50_000_000
  state.products = [makeProduct({ id: 3, hit: true, users: IPO_USERS + 1, reach: IPO_USERS * 2, productTypeId: 'saas_platform' })]
  state.signatureId = 3
  state.lifetimeRevenue = IPO_REVENUE + 1
  state.profitDays = IPO_PROFIT_DAYS
  return state
}

describe('going public', () => {
  it('needs the global stage and everything it asks, and says what is missing', () => {
    const state = globalStudio()
    expect(ipoBlocker(state)).toBeNull()
    state.profitDays = 10
    expect(ipoBlocker(state)).toMatch(/profit/)
    state.profitDays = IPO_PROFIT_DAYS
    state.stage = 4
    expect(ipoBlocker(state)).toBe('The company is not global yet')
    expect(goPublic(state).ok).toBe(false)
    expect(state.gameOver).toBe(false)
  })

  it('ends the run at a higher valuation than a buyer would pay', () => {
    const state = globalStudio()
    state.incomeAverage = 500_000
    expect(ipoValuation(state)).toBeGreaterThan(studioWorth(state))
    expect(goPublic(state).ok).toBe(true)
    expect(state.gameOver).toBe(true)
    expect(state.ending).toMatchObject({ kind: 'ipo', worth: ipoValuation({ ...state, gameOver: false }) })
    expect(state.journal.some((e) => e.kind === 'end.ipo')).toBe(true)
    expect(goPublic(state).ok).toBe(false)
  })

  it('counts the days in profit in a row', () => {
    const state = globalStudio()
    state.profitDays = 0
    profitDay(state)
    profitDay(state)
    expect(state.profitDays).toBe(2)
    state.money = 0
    state.products = []
    state.employees.forEach((e) => (e.salary = 1_000_000))
    profitDay(state)
    expect(state.profitDays).toBe(0)
  })
})

describe('the change of guard in Europe', () => {
  it('makes you CEO, your friend CTO and your best analyst the hit’s product manager', () => {
    const state = createInitialState(12)
    state.offices[0].kind = 'office'
    state.stage = 4
    state.money = 1e9
    const analyst = { ...generateAnalyst(state), officeId: state.offices[0].id, analysis: 90 }
    const weaker = { ...generateAnalyst(state), id: analyst.id + 1, officeId: state.offices[0].id, analysis: 40 }
    state.employees.push(analyst, weaker)
    const me = you(state)!
    const friend = state.employees.find((e) => e.founder && e !== me)!
    expect(openOffice(state, 'us').ok).toBe(true)
    expect(me.title).toBeUndefined()
    expect(openOffice(state, 'eu').ok).toBe(true)
    expect(me.title).toBe('CEO')
    expect(title(me)).toBe('CEO')
    expect(friend.title).toBe('CTO')
    expect(analyst.role).toBe('pm')
    expect(weaker.role).toBe('analyst')
    expect(insightRate(state)).toBeGreaterThan(0)
    // The CEO gathers no insight any more.
    state.employees = [me]
    expect(insightRate(state)).toBe(0)
    // And it happens once.
    changeOfGuard(state)
    expect(state.events.filter((e) => e.type === 'notice' && e.text.includes('CEO')).length).toBe(1)
  })
})
