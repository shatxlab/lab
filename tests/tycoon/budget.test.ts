import { describe, expect, it } from 'vitest'
import { BUDGET_PER_POINT, BUDGET_RESERVE_DAYS, DAYS_PER_MONTH, START_MONEY } from '@/lib/tycoon/sim/balance'
import { monthlyBurn } from '@/lib/tycoon/sim/economy'
import { budgetBlocker, growTarget, projectBudget, projectTarget, startProject, startUpdate } from '@/lib/tycoon/sim/project'
import { createInitialState } from '@/lib/tycoon/sim/state'
import { makeEmployee, makeProduct, makeState } from './helpers'

const team = () => [makeEmployee(100, { design: 60, engineering: 60, qa: 60 }), makeEmployee(101, { design: 60, engineering: 60, qa: 60 })]

describe('a project budget', () => {
  it('is a price per point of work, rounded to $50', () => {
    const target = projectTarget('web_app', [], 'new', 'small')
    const points = target.design + target.engineering + target.qa
    expect(projectBudget(target)).toBe(Math.round((points * BUDGET_PER_POINT) / 50) * 50)
    expect(projectBudget({ design: 0, engineering: 0, qa: 0 })).toBe(0)
  })

  it('grows with the size of the product', () => {
    const small = projectBudget(projectTarget('web_app', ['accounts'], 'new', 'small'))
    const medium = projectBudget(projectTarget('web_app', ['accounts'], 'new', 'medium'))
    expect(Math.abs(medium - small * 2)).toBeLessThanOrEqual(50)
  })

  it('is more than the garage starts with once a small product has a couple of features', () => {
    const features = projectBudget(projectTarget('web_app', ['accounts', 'search'], 'new', 'small'))
    expect(features).toBeGreaterThan(START_MONEY)
  })

  it('is paid when a new product starts', () => {
    const state = makeState(team())
    state.money = 100_000
    const budget = projectBudget(projectTarget('web_app', ['accounts'], 'new', 'small'))
    expect(startProject(state, 'web_app', ['accounts']).ok).toBe(true)
    expect(state.money).toBe(100_000 - budget)
  })

  it('stops a project the studio cannot pay for, and leaves the bank and the office alone', () => {
    const state = createInitialState(3)
    state.money = 1000
    const result = startProject(state, 'web_app', ['accounts', 'search'])
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain('Not enough money')
    expect(state.money).toBe(1000)
    expect(state.offices[0].project).toBeNull()
  })

  it('keeps a month of wages in the bank after paying', () => {
    const state = makeState(team())
    const budget = projectBudget(projectTarget('web_app', [], 'new', 'small'))
    const cushion = (monthlyBurn(state) / DAYS_PER_MONTH) * BUDGET_RESERVE_DAYS
    state.money = budget + cushion - 100
    expect(budgetBlocker(state, budget)).not.toBeNull()
    expect(startProject(state, 'web_app', []).ok).toBe(false)
    state.money = budget + cushion + 100
    expect(budgetBlocker(state, budget)).toBeNull()
    expect(startProject(state, 'web_app', []).ok).toBe(true)
    expect(state.money).toBeGreaterThanOrEqual(cushion)
  })

  it('is not needed for nothing', () => {
    const state = makeState(team())
    state.money = 0
    expect(budgetBlocker(state, 0)).toBeNull()
  })

  it('is paid to grow a product, on the extra work, and not for an ordinary update', () => {
    const state = makeState(team())
    state.offices[0].kind = 'office'
    state.day = 700
    state.money = 500_000
    state.products.push(makeProduct({ id: 40, releaseDay: 0, updates: [{ day: 680 }] }))
    const update = startUpdate(state, 40, ['accounts'])
    expect(update).toEqual({ ok: true })
    expect(state.money).toBe(500_000)
    state.offices[0].project = null

    const budget = projectBudget(growTarget('web_app', ['accounts'], 'small', 'medium'))
    expect(budget).toBeGreaterThan(0)
    expect(startUpdate(state, 40, ['accounts'], undefined, true)).toEqual({ ok: true })
    expect(state.money).toBe(500_000 - budget)
  })

  it('stops a growth the bank cannot cover', () => {
    const state = makeState(team())
    state.offices[0].kind = 'office'
    state.day = 700
    state.money = 500
    state.products.push(makeProduct({ id: 40, releaseDay: 0, updates: [{ day: 680 }] }))
    const result = startUpdate(state, 40, [], undefined, true)
    expect(result.ok).toBe(false)
    expect(state.offices[0].project).toBeNull()
    expect(state.money).toBe(500)
  })
})
