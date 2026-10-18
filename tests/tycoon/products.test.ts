import { describe, expect, it } from 'vitest'
import { getRandomEvent } from '@/lib/tycoon/data/events'
import {
  BUG_COMPLAINT_REPUTATION,
  BUG_COMPLAINTS,
  BUG_LEAK_FLOOR,
  BUG_PRONE_MAX,
  BUG_PRONE_MIN,
  BUG_SURFACE_RATE,
  BUG_TOLERANCE,
  FRESH_DAYS,
  MARKET_CAP,
  MATURITY_MAX_UPDATES,
  OVERSHOOT_CAP,
  PROJECT_SIZES,
  STALE_DAYS,
  USER_DECLINE,
} from '@/lib/tycoon/sim/balance'
import {
  bugFactor,
  bugProneness,
  bugsFoundPerDay,
  interest,
  nextUsers,
  productRevenue,
  productsDay,
  releaseBugs,
  saturate,
  surfaceBugs,
  targetUsers,
} from '@/lib/tycoon/sim/products'
import { shipProject, startProject, startUpdate } from '@/lib/tycoon/sim/project'
import { advanceDay, drainEvents } from '@/lib/tycoon/sim/tick'
import { DISCIPLINES, type GameState } from '@/lib/tycoon/sim/types'
import { makeEmployee, makeProduct, makeState, richState } from './helpers'

/** A studio with no project and one live product with `bugs` open. */
function buggyStudio(bugs = 20): GameState {
  const state = richState()
  state.offices[0].project = null
  state.products = [makeProduct({ id: 50, name: 'Atlas', releaseDay: state.day - 30, bugs })]
  return state
}

describe('users', () => {
  it('grow slowly, then faster by word of mouth, never past the target', () => {
    let users = 100
    const steps: number[] = []
    for (let day = 0; day < 200; day++) {
      const next = nextUsers(users, 10_000)
      steps.push(next - users)
      users = next
      expect(users).toBeLessThanOrEqual(10_000)
    }
    expect(steps[30]).toBeGreaterThan(steps[0])
    expect(steps[199]).toBeLessThan(steps[30])
    expect(users).toBeGreaterThan(9_000)
  })

  it('drift away slowly once the target falls below them', () => {
    expect(nextUsers(10_000, 5_000)).toBeCloseTo(10_000 - 5_000 * USER_DECLINE)
    expect(nextUsers(0, 0)).toBe(0)
  })

  it('aim for the reach while the product is fresh and bug-free, less as it goes stale or buggy', () => {
    const state = makeState()
    const product = makeProduct({ reach: 10_000, releaseDay: 0 })
    state.products.push(product)
    state.day = FRESH_DAYS
    // Alone in its market, nothing holds it back but the market's size.
    expect(targetUsers(state, product)).toBeCloseTo(saturate('web_app', 10_000))
    expect(saturate('web_app', 10_000)).toBeGreaterThan(9_000)
    expect(interest(product, FRESH_DAYS + STALE_DAYS)).toBeCloseTo(Math.exp(-1))
    product.updates.push({ day: 200 })
    expect(interest(product, 250)).toBe(1) // an update makes it fresh again

    product.bugs = BUG_TOLERANCE
    state.day = 250
    expect(bugFactor(product)).toBeCloseTo(0.5)
    expect(targetUsers(state, product)).toBeCloseTo(saturate('web_app', 5_000))
  })

  it('fade slower the more updates a product has had, up to a limit', () => {
    const fading = (updates: number) => {
      const product = makeProduct({ releaseDay: 0, updates: Array.from({ length: updates }, () => ({ day: 0 })) })
      return interest(product, FRESH_DAYS + STALE_DAYS)
    }
    expect(fading(0)).toBeCloseTo(Math.exp(-1))
    expect(fading(2)).toBeGreaterThan(fading(0))
    expect(fading(MATURITY_MAX_UPDATES + 5)).toBeCloseTo(fading(MATURITY_MAX_UPDATES))
  })

  it('pay their type\'s monthly price, a thirtieth each day', () => {
    expect(productRevenue(makeProduct({ productTypeId: 'saas_platform', users: 300 }))).toBeCloseTo((300 * 9) / 30)
  })
})

describe('the market cap', () => {
  it('leaves small products alone and keeps the biggest within a few times the audience', () => {
    const cap = 16_500 * MARKET_CAP
    expect(saturate('web_app', 1000) / 1000).toBeGreaterThan(0.99)
    expect(saturate('web_app', cap * 10)).toBeLessThan(cap)
    expect(saturate('web_app', cap * 10)).toBeGreaterThan(cap * 0.99)
  })
})

describe('bugs', () => {
  it('ship in proportion to the work, fewer the more QA there was, never none', () => {
    const state = makeState([makeEmployee(1, { design: 50, engineering: 50, qa: 50 })])
    startProject(state, 'web_app', ['accounts'])
    const project = state.offices[0].project!
    const at = (qa: number) => {
      project.progress.qa = project.target.qa * qa
      return releaseBugs(project)
    }
    expect(at(0)).toBeGreaterThan(at(0.5))
    expect(at(0.5)).toBeGreaterThan(at(1))
    expect(at(1)).toBeGreaterThan(at(OVERSHOOT_CAP))
    expect(at(OVERSHOOT_CAP) / at(1)).toBeCloseTo(BUG_LEAK_FLOOR)
    project.bugRisk = 1.3
    expect(at(1) / (at(1) / 1.3)).toBeCloseTo(1.3)
  })

  it('are found faster with more users and in bigger products, and not at all with none', () => {
    const small = makeProduct({ users: 2_500 })
    expect(bugsFoundPerDay(makeProduct({ users: 0 }))).toBe(0)
    expect(bugsFoundPerDay(makeProduct({ users: 10_000 }))).toBeCloseTo(bugsFoundPerDay(small) * 2)
    expect(bugsFoundPerDay(makeProduct({ size: 'large', users: 2_500 * PROJECT_SIZES.large.reach }))).toBeCloseTo(bugsFoundPerDay(small) * 4)
  })

  it('are found less in a well-made product than in a rough one', () => {
    expect(bugProneness(60)).toBe(1)
    expect(bugProneness(0)).toBe(BUG_PRONE_MAX)
    expect(bugProneness(100)).toBe(BUG_PRONE_MIN)
    expect(bugProneness(90)).toBeLessThan(bugProneness(70))
    const rough = makeProduct({ quality: 50, users: 10_000 })
    const polished = makeProduct({ quality: 92, users: 10_000 })
    expect(bugsFoundPerDay(polished)).toBeLessThan(bugsFoundPerDay(rough) / 3)
  })

  it('shipped with an update come to light gradually, not all on the day', () => {
    const product = makeProduct({ bugs: 2, pendingBugs: 60 })
    surfaceBugs(product)
    expect(product.bugs).toBeCloseTo(2 + 60 * BUG_SURFACE_RATE)
    expect(product.pendingBugs).toBeCloseTo(60 * (1 - BUG_SURFACE_RATE))
    expect(product.bugs + product.pendingBugs).toBeCloseTo(62)
    for (let i = 0; i < 400; i++) surfaceBugs(product)
    expect(product.pendingBugs).toBe(0)
    expect(product.bugs).toBeCloseTo(62)
  })

  it('never jump by dozens in a day: a product with a big update waiting still adds only a trickle', () => {
    const state = buggyStudio(5)
    const product = state.products[0]
    product.pendingBugs = 70
    const before = product.bugs
    productsDay(state)
    expect(product.bugs - before).toBeLessThan(5)
  })

  it('cost reputation once, with a warning, when users start complaining in public', () => {
    const state = buggyStudio(BUG_COMPLAINTS - 0.01)
    const reputation = state.reputation
    productsDay(state)
    expect(state.reputation).toBe(reputation - BUG_COMPLAINT_REPUTATION)
    expect(drainEvents(state).some((e) => e.type === 'notice' && e.text.includes('complaining'))).toBe(true)
    productsDay(state)
    expect(state.reputation).toBe(reputation - BUG_COMPLAINT_REPUTATION)
  })

  it('make an outage possible; a clean catalogue has none', () => {
    const outage = getRandomEvent('server_outage')!
    expect(outage.when(buggyStudio(3))).toBe(false)
    expect(outage.when(buggyStudio(20))).toBe(true)
  })
})

describe('a live catalogue over time', () => {
  it('earns while fresh, loses users as it goes stale, and an update brings them back', () => {
    const state = makeState([makeEmployee(1, { design: 50, engineering: 50, qa: 50 })], 5)
    state.money = 1_000_000
    startProject(state, 'web_app', ['accounts'])
    for (const d of DISCIPLINES) state.offices[0].project!.progress[d] = state.offices[0].project!.target[d] * 1.2
    shipProject(state)
    const product = state.products[0]
    for (let i = 0; i < 120; i++) advanceDay(state)
    const peak = product.users
    for (let i = 0; i < 240; i++) advanceDay(state)
    expect(product.users).toBeLessThan(peak * 0.6)

    product.bugs = 0
    startUpdate(state, product.id, [])
    for (const d of DISCIPLINES) state.offices[0].project!.progress[d] = state.offices[0].project!.target[d] * 1.2
    shipProject(state)
    const low = product.users
    for (let i = 0; i < 90; i++) advanceDay(state)
    expect(product.users).toBeGreaterThan(low * 1.3)
  })
})
