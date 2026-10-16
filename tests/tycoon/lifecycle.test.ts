import { describe, expect, it } from 'vitest'
import { CAMPAIGNS, LAUNCH_ADOPTERS, PROMOTIONS, UPDATE_MAX_FEATURES, UPDATE_MIN_AGE_DAYS } from '@/lib/tycoon/sim/balance'
import { campaignCost, estimateReach, promotionCost, promoteProduct, updateBlocker } from '@/lib/tycoon/sim/lifecycle'
import { bugProneness, productRevenue, productsDay, releaseBugs, revenueForUsers } from '@/lib/tycoon/sim/products'
import { projectQuality, projectTarget, reachAfterUpdate, shipProject, startProject, startUpdate } from '@/lib/tycoon/sim/project'
import { featureReach } from '@/lib/tycoon/sim/scoring'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { DISCIPLINES, TIERS, type GameState } from '@/lib/tycoon/sim/types'
import { createStore } from '@/lib/tycoon/store'
import { makeEmployee, makeProduct, makeState, richState } from './helpers'

/** A studio with a project-free office and one product old enough to update. */
function studioWithProduct(): GameState {
  const state = richState()
  state.offices[0].project = null
  state.products = [makeProduct({ id: 50, name: 'Atlas', featureIds: ['accounts'], releaseDay: state.day - 30, reach: 12_000, users: 12_000 })]
  return state
}

const finishProject = (state: GameState) => {
  const project = state.offices[0].project!
  for (const d of DISCIPLINES) project.progress[d] = project.target[d]
}

/** Income from every product over the next `days`, as the users come and go. */
function earn(state: GameState, days: number): number {
  let total = 0
  for (let i = 0; i < days; i++) {
    state.day += 1
    productsDay(state)
    total += state.products.reduce((sum, p) => sum + productRevenue(p), 0)
  }
  return total
}

/** A finished, unshipped web app made by a capable studio, ready to launch. */
function readyToLaunch(): GameState {
  const state = makeState([makeEmployee(1, { design: 50, engineering: 50, qa: 50 })], 5)
  state.money = 100_000
  startProject(state, 'web_app', ['accounts'])
  finishProject(state)
  return state
}

describe('updates', () => {
  it('start a smaller project tied to the product', () => {
    const state = studioWithProduct()
    expect(startUpdate(state, 50, ['dark_mode']).ok).toBe(true)
    const project = state.offices[0].project!
    expect(project.kind).toBe('update')
    expect(project.parentId).toBe(50)
    expect(project.name).toBe('Atlas')
    expect(project.productTypeId).toBe('web_app')
    expect(project.target).toEqual(projectTarget('web_app', ['dark_mode'], 'update'))
    const full = projectTarget('web_app', ['dark_mode'])
    for (const d of DISCIPLINES) expect(project.target[d]).toBeLessThan(full[d])
  })

  it('refuse unknown products, busy studios, too-soon updates, and bad feature picks', () => {
    const state = studioWithProduct()
    expect(startUpdate(state, 999, []).ok).toBe(false)

    const tooSoon = studioWithProduct()
    tooSoon.products[0].releaseDay = tooSoon.day - 5
    expect(startUpdate(tooSoon, 50, [])).toEqual({ ok: false, reason: `Wait ${UPDATE_MIN_AGE_DAYS - 5} more days` })

    expect(startUpdate(state, 50, ['dark_mode', 'search', 'payments']).ok).toBe(false) // too many
    expect(startUpdate(state, 50, ['dark_mode', 'dark_mode']).ok).toBe(false)
    expect(startUpdate(state, 50, ['accounts'])).toEqual({ ok: false, reason: 'User accounts is already in Atlas' })
    expect(startUpdate(state, 50, ['voice'])).toMatchObject({ ok: false })
    expect(state.offices[0].project).toBeNull()

    expect(startUpdate(state, 50, []).ok).toBe(true)
    expect(startUpdate(state, 50, []).ok).toBe(false) // already running one
    expect(UPDATE_MAX_FEATURES).toBe(2)
  })

  it('wait is counted from the latest update, not just the launch', () => {
    const state = studioWithProduct()
    state.products[0].updates.push({ day: state.day - 3 })
    expect(updateBlocker(state, state.offices[0], state.products[0])).toBe(`Wait ${UPDATE_MIN_AGE_DAYS - 3} more days`)
  })

  it('renew interest, add features and reach, and ship a few bugs of their own', () => {
    const state = studioWithProduct()
    const product = state.products[0]
    product.bugs = 4
    startUpdate(state, 50, ['dark_mode'])
    finishProject(state)
    const project = structuredClone(state.offices[0].project!)
    const reach = product.reach
    const reputation = state.reputation
    const shipped = state.shippedCount
    const proneness = bugProneness(product.quality)

    expect(shipProject(state).ok).toBe(true)
    expect(product.updates).toEqual([{ day: state.day }])
    expect(product.featureIds).toEqual(['accounts', 'dark_mode'])
    // Same quality, one more feature: the reach grows by exactly what the feature adds.
    expect(product.reach / reach).toBeCloseTo(featureReach('web_app', ['accounts', 'dark_mode']) / featureReach('web_app', ['accounts']), 6)
    // The new bugs are not found yet: they come to light over the next weeks.
    expect(product.bugs).toBe(4)
    expect(product.pendingBugs).toBeCloseTo(releaseBugs(project) * proneness, 6)
    expect(state.offices[0].project).toBeNull()
    expect(state.shippedCount).toBe(shipped) // an update is not a new product
    expect(state.reputation).toBeGreaterThan(reputation)
    expect(state.events.at(-1)).toMatchObject({ type: 'shipped', productId: 50, update: true, reach: product.reach })
  })

  it('give half the reputation of a launch, and never lower the product quality or reach', () => {
    const state = studioWithProduct()
    state.products[0].quality = 95
    state.reputation = 40
    const reach = state.products[0].reach
    startUpdate(state, 50, [])
    state.offices[0].project!.progress = { design: 1, engineering: 1, qa: 1 } // a poor update
    expect(reachAfterUpdate(state.products[0], state.offices[0].project!, 10)).toBe(reach)
    shipProject(state)
    expect(state.products[0].quality).toBe(95)
    expect(state.products[0].reach).toBe(reach)
    expect(state.reputation).toBeLessThan(40)
  })

  it('pay back better than starting over: a kept-up product earns more per point than new launches', () => {
    const points = (t: Record<string, number>) => DISCIPLINES.reduce((sum, d) => sum + t[d], 0)
    const launched = readyToLaunch()
    const newPoints = points(launched.offices[0].project!.target)
    shipProject(launched)
    const perPointNew = earn(structuredClone(launched), 3000) / newPoints

    // Left alone for three years vs. updated every quarter and debugged every six weeks.
    const kept = structuredClone(launched)
    const alone = earn(launched, 1080)
    let upkeep = 0
    let total = 0
    for (let i = 0; i < 1080; i++) {
      const product = kept.products[0]
      if (kept.day % 90 === 89) {
        startUpdate(kept, product.id, [])
        upkeep += points(kept.offices[0].project!.target)
        finishProject(kept)
        shipProject(kept)
      }
      if (kept.day % 45 === 44 && product.bugs >= 5) {
        upkeep += Math.floor(product.bugs) * 6
        product.bugs -= Math.floor(product.bugs)
      }
      total += earn(kept, 1)
    }
    expect((total - alone) / upkeep).toBeGreaterThan(perPointNew)
    expect(productRevenue(kept.products[0])).toBeGreaterThan(productRevenue(launched.products[0]) * 10)
  })

  it('cannot ship if the product vanished', () => {
    const state = studioWithProduct()
    startUpdate(state, 50, [])
    state.products = []
    expect(shipProject(state)).toEqual({ ok: false, reason: 'The product to update is gone' })
    expect(state.offices[0].project).not.toBeNull()
  })
})

describe('promotions', () => {
  it('cost a few days of income at full reach, with a floor, and bigger tiers cost more', () => {
    const state = studioWithProduct()
    const product = state.products[0]
    const daily = revenueForUsers('web_app', product.reach)
    const [small, medium, large] = TIERS.map((t) => promotionCost(product, t))
    expect(small).toBeGreaterThanOrEqual(PROMOTIONS.small.costFloor)
    expect(small).toBeLessThan(medium)
    expect(medium).toBeLessThan(large)
    expect(large).toBeGreaterThanOrEqual(Math.round(daily * PROMOTIONS.large.costDays) - 50)

    product.reach = 1 // a product nobody wants still has a floor price
    expect(promotionCost(product, 'small')).toBe(PROMOTIONS.small.costFloor)
  })

  it('charge the price and bring in the tier\'s users while they run', () => {
    const state = studioWithProduct()
    const product = state.products[0]
    const cost = promotionCost(product, 'medium')
    const money = state.money
    expect(promoteProduct(state, 50, 'medium').ok).toBe(true)
    expect(state.money).toBe(money - cost)
    expect(product.boostUntil).toBe(state.day + PROMOTIONS.medium.days)
    expect(product.boostUsers * PROMOTIONS.medium.days).toBeCloseTo(product.reach * PROMOTIONS.medium.users)

    const plain = structuredClone(state)
    plain.products[0].boostUntil = 0
    earn(state, PROMOTIONS.medium.days)
    earn(plain, PROMOTIONS.medium.days)
    expect(product.users).toBeGreaterThan(plain.products[0].users * 1.1)
  })

  it('refuse a second promotion while one runs, and an unaffordable one', () => {
    const state = studioWithProduct()
    promoteProduct(state, 50, 'small')
    const before = structuredClone(state)
    expect(promoteProduct(state, 50, 'large')).toEqual({ ok: false, reason: `Promoted for ${PROMOTIONS.small.days} more days` })
    expect(state).toEqual(before)

    const poor = studioWithProduct()
    poor.money = 10
    expect(promoteProduct(poor, 50, 'small')).toEqual({ ok: false, reason: 'Not enough money' })
    expect(promoteProduct(poor, 999, 'small').ok).toBe(false)
  })

  it('pay back roughly 1.2-2x their price, on a product in its prime or past it', () => {
    for (const age of [0, 120]) {
      for (const tier of TIERS) {
        const state = studioWithProduct()
        state.products[0].releaseDay = state.day - age
        const plain = structuredClone(state)
        const cost = promotionCost(state.products[0], tier)
        promoteProduct(state, 50, tier)
        const roi = (earn(state, 400) - earn(plain, 400)) / cost
        expect(roi, `${tier} at ${age} days`).toBeGreaterThan(1.2)
        expect(roi, `${tier} at ${age} days`).toBeLessThan(2)
      }
    }
  })
})

describe('launches', () => {
  it('start with early adopters and grow along an S-curve toward the reach', () => {
    const state = readyToLaunch()
    shipProject(state)
    const product = state.products[0]
    expect(product.users).toBeCloseTo(product.reach * LAUNCH_ADOPTERS)
    const gains: number[] = []
    let last = product.users
    for (let month = 0; month < 4; month++) {
      earn(state, 30)
      gains.push(product.users - last)
      last = product.users
    }
    // Slow, then faster as word of mouth spreads, then easing off.
    expect(gains[1]).toBeGreaterThan(gains[0] * 0.9)
    expect(gains[3]).toBeLessThan(gains[1])
    expect(product.users).toBeGreaterThan(product.reach * 0.6)
    expect(product.users).toBeLessThan(product.reach)
  })
})

describe('launch campaigns', () => {
  it('are priced from the estimated reach, with a floor, and bigger tiers cost more', () => {
    const state = readyToLaunch()
    const project = state.offices[0].project!
    const quality = projectQuality(state, project)
    const [small, medium, large] = TIERS.map((t) => campaignCost(state, project, quality, t))
    expect(small).toBeLessThan(medium)
    expect(medium).toBeLessThan(large)
    expect(medium).toBeCloseTo(revenueForUsers('web_app', estimateReach(state, project, quality)) * CAMPAIGNS.medium.costDays, -2)
    expect(campaignCost(state, project, 1, 'small')).toBe(CAMPAIGNS.small.costFloor)
  })

  it('charge the displayed price and bring in their users over the first weeks', () => {
    const state = readyToLaunch()
    const price = campaignCost(state, state.offices[0].project!, projectQuality(state, state.offices[0].project!), 'medium')
    const money = state.money
    expect(shipProject(state, 'medium').ok).toBe(true)
    expect(money - state.money).toBe(price)
    const product = state.products[0]
    expect(product.boostUntil).toBe(state.day + CAMPAIGNS.medium.days)
    expect(product.boostUsers * CAMPAIGNS.medium.days).toBeCloseTo(product.reach * CAMPAIGNS.medium.users)
  })

  it('refuse an unaffordable campaign without shipping or disturbing the game', () => {
    const state = readyToLaunch()
    state.money = 5
    const before = structuredClone(state)
    expect(shipProject(state, 'large')).toEqual({ ok: false, reason: 'Not enough money for that campaign' })
    expect(state).toEqual(before) // not even the random number generator moved
  })

  it('pay back roughly 1.2-2x their price', () => {
    for (const tier of TIERS) {
      const plain = readyToLaunch()
      const boosted = structuredClone(plain)
      const cost = campaignCost(boosted, boosted.offices[0].project!, projectQuality(boosted, boosted.offices[0].project!), tier)
      shipProject(plain)
      shipProject(boosted, tier)
      const roi = (earn(boosted, 600) - earn(plain, 600)) / cost
      expect(roi, tier).toBeGreaterThan(1.2)
      expect(roi, tier).toBeLessThan(2.1)
    }
  })
})

describe('saving lifecycle data', () => {
  it('keeps users, bugs, promotions, features and an update in progress', () => {
    const state = studioWithProduct()
    state.products[0].updates.push({ day: state.day - 20 })
    state.products[0].bugs = 7.4
    promoteProduct(state, 50, 'small')
    startUpdate(state, 50, ['dark_mode'])
    const restored = deserialize(serialize(state))!
    expect(restored.products).toEqual(state.products)
    expect(restored.offices[0].project).toEqual(state.offices[0].project)
  })

  it('rejects an update project whose product does not exist, and malformed products', () => {
    const base = JSON.parse(serialize(studioWithProduct()))
    const orphan = structuredClone(base)
    orphan.offices[0].project = { ...structuredClone(richState().offices[0].project), kind: 'update', parentId: 12345 }
    expect(deserialize(JSON.stringify(orphan))).toBeNull()

    for (const change of [
      (p: Record<string, unknown>) => (p.updates = [{ day: 'soon' }]),
      (p: Record<string, unknown>) => (p.users = 'lots'),
      (p: Record<string, unknown>) => delete p.bugs,
      (p: Record<string, unknown>) => delete p.reach,
    ]) {
      const bad = structuredClone(base)
      change(bad.products[0])
      expect(deserialize(JSON.stringify(bad))).toBeNull()
    }
  })
})

describe('store', () => {
  it('starting an update closes the dialog and unpauses; promoting and campaigns go through', () => {
    const state = studioWithProduct()
    const store = createStore(state, 0)
    store.openDialog({ kind: 'new-project', updateOf: 50 })
    expect(store.startUpdate(50, ['dark_mode']).ok).toBe(true)
    expect(store.dialog.value).toBeNull()
    expect(store.speed.value).toBe(1)

    const version = store.version.value
    expect(store.promote(50, 'small').ok).toBe(true)
    expect(store.version.value).toBeGreaterThan(version)
    expect(store.promote(50, 'small').ok).toBe(false)
  })

  it('the result dialog carries the reach and the bugs the release shipped with', () => {
    const store = createStore(studioWithProduct(), 0)
    store.startUpdate(50, [])
    finishProject(store.state)
    const bugs = releaseBugs(store.state.offices[0].project!) * bugProneness(store.state.products[0].quality) // before the update can raise it
    expect(store.shipProject().ok).toBe(true)
    expect(store.dialog.value).toMatchObject({ kind: 'result', productId: 50, update: true, reach: store.state.products[0].reach })
    const dialog = store.dialog.value
    if (dialog?.kind === 'result') expect(dialog.bugs).toBeCloseTo(bugs)
  })

  it('a new product with a campaign charges through the store', () => {
    const state = makeState([makeEmployee(1, { design: 50, engineering: 50, qa: 50 })], 5)
    state.money = 50_000
    const store = createStore(state, 0)
    store.startProject('web_app', [])
    finishProject(state)
    const money = state.money
    expect(store.shipProject('small').ok).toBe(true)
    expect(state.money).toBeLessThan(money)
    expect(createInitialState(1).products).toEqual([])
  })
})
