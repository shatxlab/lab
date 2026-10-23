import { describe, expect, it } from 'vitest'
import { getRandomEvent } from '@/lib/tycoon/data/events'
import { ALPHA_PROGRESS, CAMPAIGNS, FRESH_DAYS, MORALE_BASE, MORALE_CRUNCH_DAYS, PROJECT_SIZES } from '@/lib/tycoon/sim/balance'
import { describePendingEvent, resolveRandomEvent, rollRandomEvent } from '@/lib/tycoon/sim/events'
import { startFix } from '@/lib/tycoon/sim/fixes'
import { campaignCost, estimateReach } from '@/lib/tycoon/sim/lifecycle'
import { interest, productRevenue, productsDay, revenueForUsers } from '@/lib/tycoon/sim/products'
import { projectQuality, projectTarget, shipProject, startProject, startUpdate } from '@/lib/tycoon/sim/project'
import { crunchDays, moraleTarget } from '@/lib/tycoon/sim/staff'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { DISCIPLINES, PROJECT_SIZE_IDS, type GameState, type ProjectSize } from '@/lib/tycoon/sim/types'
import { makeEmployee, makeProduct, makeState, richState } from './helpers'

/** A studio in the biggest office, so every size is open. */
function studio(seed = 5): GameState {
  const state = makeState([makeEmployee(1, { design: 50, engineering: 50, qa: 50 })], seed)
  state.offices[0].kind = 'office'
  state.stage = 3
  state.money = 1_000_000
  return state
}

function finish(state: GameState): void {
  const project = state.offices[0].project!
  for (const d of DISCIPLINES) project.progress[d] = project.target[d]
}

/** Ships a finished `size` web app and returns the state afterwards. */
function shipped(size: ProjectSize, seed = 5): GameState {
  const state = studio(seed)
  startProject(state, 'web_app', ['accounts'], size)
  finish(state)
  shipProject(state)
  return state
}

describe('project sizes', () => {
  it('multiply all the work, base and features alike', () => {
    const small = projectTarget('web_app', ['accounts'])
    for (const size of PROJECT_SIZE_IDS) {
      const target = projectTarget('web_app', ['accounts'], 'new', size)
      for (const d of DISCIPLINES) expect(target[d]).toBeCloseTo(small[d] * PROJECT_SIZES[size].work)
    }
  })

  it('open up with a real office, and the flagship with a hit behind the studio', () => {
    const state = studio()
    state.offices[0].kind = 'garage'
    expect(startProject(state, 'web_app', [], 'large')).toEqual({ ok: false, reason: 'Large projects need a real office' })
    state.offices[0].kind = 'office'
    state.stage = 2
    expect(startProject(state, 'web_app', [], 'flagship')).toEqual({ ok: false, reason: 'Flagship projects need a studio at the "First floor" stage' })
    expect(startProject(state, 'web_app', [], 'large').ok).toBe(true)
    expect(state.offices[0].project?.size).toBe('large')

    const garage = studio()
    garage.offices[0].kind = 'garage'
    expect(startProject(garage, 'web_app', [], 'medium').ok).toBe(true)
  })

  it('default to Small, which is exactly the game as it was', () => {
    const state = studio()
    startProject(state, 'web_app', ['accounts'])
    expect(state.offices[0].project?.size).toBe('small')
    expect(state.offices[0].project?.target).toEqual(projectTarget('web_app', ['accounts']))
  })

  it('scale the reach and the reputation, and keep users interested longer', () => {
    const small = shipped('small')
    const big = shipped('flagship')
    const [a, b] = [small.products[0], big.products[0]]
    expect(b.size).toBe('flagship')
    expect(b.reach / a.reach).toBeCloseTo(PROJECT_SIZES.flagship.reach, 6)
    expect(big.reputation / small.reputation).toBeCloseTo(PROJECT_SIZES.flagship.reputation, 6)

    // A month after a Small product goes stale, the bigger one is still fresh.
    const later = FRESH_DAYS + 30
    expect(interest(a, later)).toBeLessThan(1)
    expect(interest(b, later)).toBe(1)
  })

  it('pay about the same per unit of work, even left alone', () => {
    const lifetime = (size: ProjectSize) => {
      const state = shipped(size)
      const product = state.products[0]
      let total = 0
      for (let day = 0; day < 3000; day++) {
        state.day += 1
        productsDay(state)
        total += productRevenue(product)
      }
      return total / PROJECT_SIZES[size].work
    }
    const small = lifetime('small')
    for (const size of PROJECT_SIZE_IDS) {
      expect(lifetime(size) / small, size).toBeGreaterThan(0.9)
      expect(lifetime(size) / small, size).toBeLessThan(1.1)
    }
  })

  it('pass on to updates, which are scaled the same way', () => {
    const state = shipped('large')
    const product = state.products[0]
    state.day = 100
    expect(startUpdate(state, product.id, ['search']).ok).toBe(true)
    expect(state.offices[0].project?.size).toBe('large')
    expect(state.offices[0].project?.target).toEqual(projectTarget('web_app', ['search'], 'update', 'large'))
  })

  it('price launch campaigns from what the product would earn from everyone it could reach, at any size', () => {
    const state = studio()
    startProject(state, 'web_app', ['accounts'], 'flagship')
    finish(state)
    const quality = projectQuality(state, state.offices[0].project!)
    const reach = estimateReach(state, state.offices[0].project!, quality, false)
    const price = campaignCost(state, state.offices[0].project!, quality, 'large')
    expect(price).toBeCloseTo(revenueForUsers('web_app', reach, state.offices[0].project!.audienceId) * CAMPAIGNS.large.costDays, -2)
    const money = state.money
    shipProject(state, 'large')
    expect(money - state.money).toBe(price)
  })

  it('let a player in debt launch without a campaign, but not buy one', () => {
    const state = studio()
    startProject(state, 'web_app', ['accounts'], 'small')
    finish(state)
    state.money = -500
    expect(shipProject(state, 'small').ok).toBe(false)
    expect(state.offices[0].project).not.toBeNull()
    expect(shipProject(state).ok).toBe(true)
    expect(state.money).toBe(-500)
  })

  it('give bigger projects longer before the crunch sets in', () => {
    expect(crunchDays('small')).toBe(MORALE_CRUNCH_DAYS)
    const state = richState()
    state.employees = [makeEmployee(1)]
    const project = state.offices[0].project!
    for (const size of PROJECT_SIZE_IDS) {
      project.size = size
      state.day = project.startDay + crunchDays(size)
      expect(moraleTarget(state, state.employees[0]), size).toBe(MORALE_BASE)
      state.day += 1
      expect(moraleTarget(state, state.employees[0]), size).toBeLessThan(MORALE_BASE)
    }
    expect(crunchDays('flagship')).toBeGreaterThan(crunchDays('large'))
  })
})

describe('development events', () => {
  /** A Medium project at `share` of its work, with no other event in the way. */
  function midway(share: number, size: ProjectSize = 'medium'): GameState {
    const state = studio()
    startProject(state, 'web_app', ['accounts'], size)
    for (const d of DISCIPLINES) state.offices[0].project!.progress[d] = state.offices[0].project!.target[d] * share
    return state
  }

  it('offer the alpha checkpoint once, halfway through a Medium or bigger new product', () => {
    const early = midway(ALPHA_PROGRESS - 0.05)
    rollRandomEvent(early)
    expect(early.pendingEvent).toBeNull()

    const state = midway(ALPHA_PROGRESS)
    rollRandomEvent(state)
    expect(state.pendingEvent?.id).toBe('alpha_preview')
    resolveRandomEvent(state, 2)
    rollRandomEvent(state)
    expect(state.pendingEvent?.id).not.toBe('alpha_preview')

    const small = midway(0.9, 'small')
    for (let i = 0; i < 5; i++) rollRandomEvent(small)
    expect(small.pendingEvent?.id).not.toBe('alpha_preview')
  })

  it('let the alpha buy users with money, or users and fewer bugs with more work', () => {
    const press = midway(0.5)
    rollRandomEvent(press)
    const money = press.money
    resolveRandomEvent(press, 0)
    expect(press.offices[0].project!.hype).toBeCloseTo(1.15)
    expect(press.money).toBeLessThan(money)

    const alpha = midway(0.5)
    const target = { ...alpha.offices[0].project!.target }
    rollRandomEvent(alpha)
    resolveRandomEvent(alpha, 1)
    expect(alpha.offices[0].project!.hype).toBeCloseTo(1.08)
    expect(alpha.offices[0].project!.bugRisk).toBeCloseTo(0.8)
    expect(alpha.offices[0].project!.target.design).toBeGreaterThan(target.design)
    expect(alpha.offices[0].project!.target.engineering).toBe(target.engineering)
  })

  it('carry hype into the reach', () => {
    const plain = studio()
    startProject(plain, 'web_app', [], 'medium')
    finish(plain)
    const hyped = structuredClone(plain)
    hyped.offices[0].project!.hype = 1.2
    shipProject(plain)
    shipProject(hyped)
    expect(hyped.products[0].reach / plain.products[0].reach).toBeCloseTo(1.2, 6)
  })

  it('trade work against users when the scope creeps', () => {
    const state = richState()
    const before = { ...state.offices[0].project!.target }
    state.pendingEvent = { id: 'scope_creep', data: {} }
    const view = describePendingEvent(state)!
    expect(view.choices.map((c) => c.label)).toEqual(['Add it', 'Stick to the plan'])
    resolveRandomEvent(state, 0)
    for (const d of DISCIPLINES) expect(state.offices[0].project!.target[d]).toBeGreaterThan(before[d])
    expect(state.offices[0].project!.hype).toBeCloseTo(1.12)
  })

  it('are only offered while something is being built', () => {
    const state = richState()
    for (const id of ['scope_creep', 'crunch_offer', 'rival_announcement', 'tech_debt']) {
      expect(getRandomEvent(id)!.when(state), id).toBe(true)
      const done = structuredClone(state)
      finish(done)
      expect(getRandomEvent(id)!.when(done), id).toBe(false)
    }
  })

  it('leave a bug-fixing pair alone: they are not an office project', () => {
    const state = richState()
    state.offices[0].project = null
    state.employees.push(makeEmployee(104, { qa: 60 }, 2000, 'tester'))
    expect(startFix(state, 900, 100, 104).ok).toBe(true)
    for (const id of ['scope_creep', 'rival_announcement', 'tech_debt', 'crunch_offer']) expect(getRandomEvent(id)!.when(state), id).toBe(false)
  })

  it('let tech debt ship as bugs instead of costing work', () => {
    const state = richState()
    state.pendingEvent = { id: 'tech_debt', data: {} }
    resolveRandomEvent(state, 1)
    expect(state.offices[0].project!.bugRisk).toBeCloseTo(1.3)
  })
})

describe('saving sizes', () => {
  it('rejects an unknown size', () => {
    const state = richState()
    state.products.push(makeProduct({ id: 77, size: 'huge' as ProjectSize }))
    expect(deserialize(serialize(state))).toBeNull()
  })
})
