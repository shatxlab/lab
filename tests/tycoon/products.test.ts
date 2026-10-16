import { describe, expect, it } from 'vitest'
import { getRandomEvent } from '@/lib/tycoon/data/events'
import {
  BUG_COMPLAINT_REPUTATION,
  BUG_COMPLAINTS,
  BUG_LEAK_FLOOR,
  BUG_TOLERANCE,
  FRESH_DAYS,
  MARKET_CAP,
  OVERSHOOT_CAP,
  POINTS_PER_BUG,
  PROJECT_SIZES,
  USER_DECLINE,
} from '@/lib/tycoon/sim/balance'
import { fixBlocker, fixTarget, startFix, stopFix } from '@/lib/tycoon/sim/fixes'
import {
  bugFactor,
  bugsFoundPerDay,
  interest,
  nextUsers,
  productRevenue,
  productsDay,
  releaseBugs,
  saturate,
  targetUsers,
} from '@/lib/tycoon/sim/products'
import { shipProject, startProject, startUpdate } from '@/lib/tycoon/sim/project'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { advanceDay, drainEvents } from '@/lib/tycoon/sim/tick'
import { DISCIPLINES, type GameState } from '@/lib/tycoon/sim/types'
import { workDay } from '@/lib/tycoon/sim/work'
import { createStore } from '@/lib/tycoon/store'
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
    expect(interest(product, FRESH_DAYS + 90)).toBeCloseTo(Math.exp(-1))
    product.updates.push({ day: 200 })
    expect(interest(product, 250)).toBe(1) // an update makes it fresh again

    product.bugs = BUG_TOLERANCE
    state.day = 250
    expect(bugFactor(product)).toBeCloseTo(0.5)
    expect(targetUsers(state, product)).toBeCloseTo(saturate('web_app', 5_000))
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

describe('bug-fixing sprints', () => {
  it('need points for every bug open now, mostly engineering and QA', () => {
    const state = buggyStudio(12.7)
    expect(startFix(state, 50).ok).toBe(true)
    const project = state.offices[0].project!
    expect(project).toMatchObject({ kind: 'fix', parentId: 50, name: 'Atlas', bugs: 12, bugsFixed: 0, featureIds: [] })
    expect(project.target).toEqual(fixTarget(12))
    const total = DISCIPLINES.reduce((sum, d) => sum + project.target[d], 0)
    expect(total).toBeCloseTo(12 * POINTS_PER_BUG, -1)
    expect(project.target.engineering).toBeGreaterThan(project.target.qa)
    expect(project.target.qa).toBeGreaterThan(project.target.design)
  })

  it('refuse a product with no bugs, a busy studio, an empty office or an unknown product', () => {
    const clean = buggyStudio(0.6)
    expect(fixBlocker(clean, clean.offices[0], clean.products[0])).toBe('No bugs to fix')
    const busy = buggyStudio()
    startProject(busy, 'web_app', [])
    expect(startFix(busy, 50)).toEqual({ ok: false, reason: 'A project is in progress' })
    const empty = buggyStudio()
    empty.employees = []
    expect(startFix(empty, 50)).toEqual({ ok: false, reason: 'Hire someone first' })
    expect(startFix(buggyStudio(), 999).ok).toBe(false)
  })

  it('fix bugs as the bars fill, credit the workers, and end on their own', () => {
    const state = buggyStudio(10)
    startFix(state, 50)
    const product = state.products[0]
    let days = 0
    while (state.offices[0].project && days < 100) {
      state.day += 1
      state.dayWork = []
      workDay(state)
      days += 1
      if (state.offices[0].project) {
        expect(product.bugs).toBeCloseTo(10 - state.offices[0].project.bugsFixed)
        for (const d of DISCIPLINES) expect(state.offices[0].project.progress[d]).toBeLessThanOrEqual(state.offices[0].project.target[d]) // no polish past the target
      }
    }
    expect(state.offices[0].project).toBeNull()
    expect(product.bugs).toBe(0)
    expect(state.bugsFixed).toBe(10)
    const events = drainEvents(state)
    expect(events.some((e) => e.type === 'notice' && e.text === 'Atlas: 10 bugs fixed.')).toBe(true)
    expect(events.some((e) => e.type === 'projectReady')).toBe(false)
  })

  it('can stop early and keep what was fixed; there is nothing to ship', () => {
    const state = buggyStudio(30)
    startFix(state, 50)
    expect(shipProject(state)).toEqual({ ok: false, reason: 'Bug fixing has nothing to ship' })
    for (let i = 0; i < 5; i++) workDay(state)
    const fixed = state.offices[0].project!.bugsFixed
    expect(fixed).toBeGreaterThan(0)
    expect(stopFix(state).ok).toBe(true)
    expect(state.offices[0].project).toBeNull()
    expect(state.products[0].bugs).toBeCloseTo(30 - fixed)
    expect(stopFix(state).ok).toBe(false)
  })

  it('end quietly if the product disappears', () => {
    const state = buggyStudio()
    startFix(state, 50)
    state.products = []
    workDay(state)
    expect(state.offices[0].project).toBeNull()
  })

  it('survive a save, and a sprint on a missing product is rejected', () => {
    const state = buggyStudio()
    startFix(state, 50)
    workDay(state)
    const restored = deserialize(serialize(state))!
    expect(restored.offices[0].project).toEqual(state.offices[0].project)
    expect(restored.bugsFixed).toBe(state.bugsFixed)

    const raw = JSON.parse(serialize(state))
    raw.offices[0].project.parentId = 12345
    expect(deserialize(JSON.stringify(raw))).toBeNull()
  })

  it('run through the store: starting closes dialogs and unpauses, stopping posts a toast', () => {
    const state = buggyStudio()
    const store = createStore(state, 0)
    store.openDialog({ kind: 'studio' })
    expect(store.startFix(50).ok).toBe(true)
    expect(store.dialog.value).toBeNull()
    expect(store.speed.value).toBe(1)
    expect(store.startFix(50).ok).toBe(false)
    expect(store.stopFix().ok).toBe(true)
    expect(store.toasts.value.some((t) => t.text.startsWith('Stopped fixing Atlas'))).toBe(true)
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
