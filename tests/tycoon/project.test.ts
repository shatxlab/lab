import { describe, expect, it } from 'vitest'
import { WORK_SCALE } from '@/lib/tycoon/sim/balance'
import { projectTarget, shipProject, startProject, unlockedProductTypes } from '@/lib/tycoon/sim/project'
import { advance, advanceDay, drainEvents } from '@/lib/tycoon/sim/tick'
import { makeEmployee, makeState } from './helpers'

const strongTeam = () => [
  makeEmployee(100, { design: 60, engineering: 60, qa: 60 }),
  makeEmployee(101, { design: 60, engineering: 60, qa: 60 }),
]

describe('startProject', () => {
  it('creates a project with base target plus feature costs', () => {
    const state = makeState(strongTeam())
    state.money = 100_000
    expect(startProject(state, 'web_app', ['accounts', 'search']).ok).toBe(true)
    expect(state.offices[0].project?.target).toEqual(projectTarget('web_app', ['accounts', 'search']))
    expect(state.offices[0].project!.target.engineering).toBe((90 + 20 + 25) * WORK_SCALE)
  })

  it.each([
    ['unknown type', 'nope', []],
    ['locked type', 'saas_platform', []],
    ['unknown feature', 'web_app', ['nope']],
    ['duplicate feature', 'web_app', ['accounts', 'accounts']],
    ['too many features', 'web_app', ['accounts', 'search', 'cloud_sync', 'dark_mode', 'payments', 'onboarding']],
  ])('rejects %s', (_label, typeId, features) => {
    const state = makeState(strongTeam())
    expect(startProject(state, typeId, features).ok).toBe(false)
    expect(state.offices[0].project).toBeNull()
  })

  it('rejects a second project and an empty team', () => {
    const state = makeState(strongTeam())
    startProject(state, 'web_app', [])
    expect(startProject(state, 'web_app', []).ok).toBe(false)

    const empty = makeState([])
    expect(startProject(empty, 'web_app', []).ok).toBe(false)
  })

  it('unlocks product types with reputation', () => {
    const state = makeState(strongTeam())
    expect(unlockedProductTypes(state).map((t) => t.id)).toEqual(['web_app'])
    state.reputation = 25
    expect(unlockedProductTypes(state).map((t) => t.id)).toEqual(['web_app', 'mobile_app', 'dev_tool'])
  })
})

describe('shipProject', () => {
  it('fails without a project', () => {
    expect(shipProject(makeState(strongTeam())).ok).toBe(false)
  })

  it('ships a finished project, emits an event, and starts earning', () => {
    const state = makeState(strongTeam())
    startProject(state, 'web_app', ['accounts'])
    for (let i = 0; i < 100 && !state.events.some((e) => e.type === 'projectReady'); i++) advanceDay(state)
    expect(state.events.some((e) => e.type === 'projectReady')).toBe(true)

    expect(shipProject(state).ok).toBe(true)
    expect(state.offices[0].project).toBeNull()
    expect(state.products).toHaveLength(1)
    expect(state.shippedCount).toBe(1)
    expect(drainEvents(state).some((e) => e.type === 'shipped')).toBe(true)

    advance(state, 20)
    expect(state.products[0].totalRevenue).toBeGreaterThan(0)
    expect(state.lifetimeRevenue).toBeCloseTo(state.products[0].totalRevenue)
  })

  it('scores a rushed ship lower than a finished one', () => {
    const rushed = makeState(strongTeam())
    startProject(rushed, 'web_app', [])
    advance(rushed, 3)
    shipProject(rushed)

    const finished = makeState(strongTeam())
    startProject(finished, 'web_app', [])
    for (let i = 0; i < 100 && !finished.offices[0].project!.readyNotified; i++) advanceDay(finished)
    shipProject(finished)

    expect(rushed.products[0].quality).toBeLessThan(finished.products[0].quality)
    expect(rushed.reputation).toBeLessThan(finished.reputation)
  })
})
