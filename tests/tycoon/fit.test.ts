import { describe, expect, it } from 'vitest'
import {
  FIT_BASE,
  FIT_QUALITY_FLOOR,
  FIT_SHRUG_PENALTY,
  FIT_TAKEOFF,
  HIT_MARKET_SCALE,
  HIT_REACH,
  MARKET_CAP,
  PIVOT_KEEP,
  TAKEOFF_MAX_CROWDING,
} from '@/lib/tycoon/sim/balance'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import {
  bestLove,
  fitDay,
  fitOf,
  fitRange,
  fitWord,
  lovedShare,
  NOT_FIT_YET,
  qualityAllowance,
  releaseFit,
  releaseKey,
  takeoffBlocker,
  undiscovered,
} from '@/lib/tycoon/sim/fit'
import { generateAnalyst } from '@/lib/tycoon/sim/hiring'
import { pivotBlocker, shipProject, startPivot, startProject, startUpdate } from '@/lib/tycoon/sim/project'
import { crowdingAround, saturate } from '@/lib/tycoon/sim/products'
import { DISCIPLINES, type GameState, type Product } from '@/lib/tycoon/sim/types'
import { createStore } from '@/lib/tycoon/store'
import { dayOfEra, makeEmployee, makeProduct, makeState } from './helpers'

/** Everything small businesses love in a web app, as far as the studio can build it at the start. */
const ALL_LOVED = ['payments', 'accounts', 'analytics', 'search', 'cloud_sync']

/** A garage with a strong all-rounder and you, the founder analyst, and the market to itself. */
function garage(): GameState {
  const state = makeState([makeEmployee(1, { design: 80, engineering: 80, qa: 80 })])
  state.employees.push({ ...generateAnalyst(state), officeId: state.offices[0].id, founder: true, analysis: 40 })
  return state
}

/** Builds and ships a small web app for small businesses with these features, finished well past its targets. */
function launch(state: GameState, features: readonly string[]): Product {
  expect(startProject(state, 'web_app', features, 'small', undefined, 'web_business').ok).toBe(true)
  const project = state.offices[0].project!
  for (const d of DISCIPLINES) project.progress[d] = project.target[d] * 1.5
  expect(shipProject(state).ok).toBe(true)
  return state.products.at(-1)!
}

/** Finishes the office's update or pivot and ships it. */
function release(state: GameState): void {
  const project = state.offices[0].project!
  for (const d of DISCIPLINES) project.progress[d] = project.target[d] * 1.5
  expect(shipProject(state).ok).toBe(true)
}

describe('product–market fit', () => {
  it('grows with each feature the audience loves, by how much and what it is worth to them', () => {
    const state = garage()
    const share = (features: string[]) => lovedShare(state, 'web_app', 'web_business', features)
    expect(share([])).toBe(0)
    expect(share(['payments'])).toBeGreaterThan(share(['accounts']))
    expect(share(['payments', 'accounts'])).toBeGreaterThan(share(['payments']))
    expect(share(ALL_LOVED)).toBe(1)
  })

  it('costs a little for each feature they shrug at, which can never be taken out again', () => {
    const state = garage()
    const loved = lovedShare(state, 'web_app', 'web_business', ['payments'])
    expect(lovedShare(state, 'web_app', 'web_business', ['payments', 'dark_mode'])).toBeCloseTo(loved - FIT_SHRUG_PENALTY, 10)
    expect(lovedShare(state, 'web_app', 'web_business', ['payments', 'notifications'])).toBe(loved) // neither loved nor shrugged
  })

  it('is nothing for a product meant for nobody in particular', () => {
    expect(lovedShare(garage(), 'web_app', undefined, ['payments', 'accounts'])).toBe(0)
  })

  it('measures against everything the audience loves that the studio can build: research opens more', () => {
    const state = garage()
    const before = bestLove(state, 'web_app', 'web_consumers')
    state.research.done.push('ml_foundations')
    expect(bestLove(state, 'web_app', 'web_consumers')).toBeGreaterThan(before)
  })

  it('needs quality: full from 90, down to a floor for a poor product', () => {
    expect(qualityAllowance(95)).toBe(1)
    expect(qualityAllowance(90)).toBe(1)
    expect(qualityAllowance(70)).toBeLessThan(qualityAllowance(85))
    expect(qualityAllowance(10)).toBe(FIT_QUALITY_FLOOR)
    const state = garage()
    expect(releaseFit(state, 'web_app', 'web_business', ALL_LOVED, 90).fit).toBe(100)
    expect(releaseFit(state, 'web_app', 'web_business', [], 90).fit).toBeCloseTo(100 * FIT_BASE, 10)
    expect(releaseFit(state, 'web_app', 'web_business', ALL_LOVED, 60).fit).toBeLessThan(FIT_TAKEOFF)
  })

  it('sags while the product lacks what a later era takes for granted', () => {
    const state = garage()
    const product = makeProduct({ audienceId: 'web_business', featureIds: ['payments'], fit: 60 })
    expect(fitOf(state, product)).toBe(60)
    state.day = dayOfEra(5)
    expect(fitOf(state, product)).toBeLessThan(60)
  })

  it('reads in words: cold, lukewarm, warm, and hot from the takeoff line', () => {
    expect([fitWord(10), fitWord(40), fitWord(60), fitWord(FIT_TAKEOFF)]).toEqual(['cold', 'lukewarm', 'warm', 'hot'])
  })
})

describe('reading the fit', () => {
  it('is a range around the true fit, narrower the sharper the eye for users', () => {
    const state = garage()
    const analyst = state.employees.find((e) => e.role === 'analyst')!
    analyst.analysis = 20
    const blurry = fitRange(state, 50, 7)
    analyst.analysis = 95
    const sharp = fitRange(state, 50, 7)
    for (const range of [blurry, sharp]) {
      expect(range.low).toBeLessThanOrEqual(50)
      expect(range.high).toBeGreaterThanOrEqual(50)
    }
    expect(sharp.high - sharp.low).toBeLessThan(blurry.high - blurry.low)
  })

  it('sits the same way round the true fit for a release, and differently for the next', () => {
    const state = garage()
    expect(fitRange(state, 50, 7)).toEqual(fitRange(state, 50, 7))
    const offsets = new Set(Array.from({ length: 8 }, (_, key) => fitRange(state, 50, key).low))
    expect(offsets.size).toBeGreaterThan(3)
    const product = makeProduct({ id: 3 })
    const before = releaseKey(product)
    product.updates.push({ day: 1 })
    expect(releaseKey(product)).not.toBe(before)
  })
})

describe('taking off', () => {
  it('holds a product that has not taken off to the few who find it, more the better it fits', () => {
    expect(undiscovered(80)).toBeGreaterThan(undiscovered(20))
    expect(undiscovered(100)).toBeLessThan(1)
  })

  it('happens at launch to a product that fits, in a market with room: a hit, the signature, and you its product manager', () => {
    const state = garage()
    const founder = state.employees.find((e) => e.founder)!
    const product = launch(state, ALL_LOVED)
    expect(product.fit).toBeGreaterThanOrEqual(FIT_TAKEOFF)
    expect(product.hit).toBe(true)
    expect(state.signatureId).toBe(product.id)
    expect(state.events).toContainEqual({ type: 'breakout', productId: product.id })
    expect(founder.role).toBe('pm')

    const plain = garage()
    plain.rng = state.rng
    const other = launch(plain, ['payments'])
    expect(other.hit).toBe(false)
    expect(takeoffBlocker(plain, other)).toBe(NOT_FIT_YET)
  })

  it('reaches everyone it could, times a hit’s reach, and the users follow over the weeks after', () => {
    const state = garage()
    const product = launch(state, ALL_LOVED)
    const users = product.users
    expect(product.users).toBeLessThan(product.reach * 0.1)
    fitDay(state)
    expect(product.users).toBe(users) // nothing jumps: they arrive as with any launch
    // Against the same launch held back: the reach it was given back, times a hit's.
    const held = garage()
    held.market.web_app = 0.5 // too cold to take off
    const same = launch(held, ALL_LOVED)
    expect(same.hit).toBe(false)
    expect(product.reach / same.reach).toBeGreaterThan((HIT_REACH.small / undiscovered(same.fit!)) * 1.5)
  })

  it('waits for a cold market to warm, and for a crowded one to clear', () => {
    const state = garage()
    state.market.web_app = 0.5
    const product = launch(state, ALL_LOVED)
    expect(takeoffBlocker(state, product)).toBe('The market for it is cold')
    state.market.web_app = 1
    state.rivalProducts.push(
      ...Array.from({ length: 4 }, (_, i) => ({
        id: 900 + i,
        rivalId: 1,
        name: `R${i}`,
        productTypeId: 'web_app',
        size: 'large' as const,
        quality: 90,
        releaseDay: state.day,
        updatedDay: state.day,
        reach: 1e6,
        users: 1e5,
        hit: false,
      })),
    )
    expect(crowdingAround(state, product)).toBeGreaterThanOrEqual(TAKEOFF_MAX_CROWDING)
    expect(takeoffBlocker(state, product)).toBe('Its market is too crowded')
    fitDay(state)
    expect(product.hit).toBe(false)
    state.rivalProducts = []
    fitDay(state)
    expect(product.hit).toBe(true)
  })

  it('does not happen to a stale product: an update brings it back', () => {
    const state = garage()
    state.market.web_app = 0.5
    const product = launch(state, ALL_LOVED)
    state.market.web_app = 1
    state.day += 1000
    expect(takeoffBlocker(state, product)).toBe('It has gone stale: release an update')
  })

  it('can come from an update that adds what the audience loves', () => {
    const state = garage()
    const product = launch(state, ['payments', 'accounts'])
    expect(product.hit).toBe(false)
    const fit = product.fit!
    const reach = product.reach
    state.day += 30
    expect(startUpdate(state, product.id, ['analytics', 'search']).ok).toBe(true)
    release(state)
    expect(product.fit).toBeGreaterThan(fit)
    expect(product.reach).toBeGreaterThan(reach)
    expect(product.hit).toBe(true)
  })

  it('opens the breakout dialog after the launch result, through the store', () => {
    const state = garage()
    const store = createStore(state, 0)
    store.startProject('web_app', ALL_LOVED, 'small', undefined, 'web_business')
    for (const d of DISCIPLINES) state.offices[0].project!.progress[d] = state.offices[0].project!.target[d] * 1.5
    store.shipProject()
    expect(store.dialog.value).toMatchObject({ kind: 'result' })
    store.closeDialog()
    expect(store.dialog.value).toEqual({ kind: 'breakout', productId: state.products[0].id })
  })

  it('lets a hit hold a bigger market than anything else', () => {
    const cap = getProductType('web_app').audience * MARKET_CAP
    expect(saturate('web_app', 1e9)).toBeCloseTo(cap, 0)
    expect(saturate('web_app', 1e9, 'us', true)).toBeCloseTo(cap * HIT_MARKET_SCALE, 0)
  })
})

describe('pivoting', () => {
  it('points a product at another audience of its type, once, and never a hit', () => {
    const state = garage()
    const product = launch(state, ['payments', 'dark_mode'])
    const office = state.offices[0]
    expect(pivotBlocker(state, office, product, 'web_business')).toBe('It is already for them')
    expect(pivotBlocker(state, office, product, 'dev_hackers')).toBe('Unknown audience')
    expect(pivotBlocker(state, office, product, 'web_consumers')).toContain('Wait')
    state.day += 30
    expect(pivotBlocker(state, office, product, 'web_consumers')).toBeNull()
    expect(pivotBlocker(state, office, { ...product, pivoted: true }, 'web_consumers')).toBe('It has pivoted once already')
    expect(pivotBlocker(state, office, { ...product, hit: true }, 'web_consumers')).toBe('A hit has found its people')
  })

  it('keeps what is built, counts it for the new audience, and starts again as a launch with a few of its users', () => {
    const state = garage()
    state.market.web_app = 0.5 // nothing takes off here: this is about the pivot
    const product = launch(state, ['payments', 'dark_mode'])
    state.day += 200
    product.users = 1000
    const features = [...product.featureIds]
    const store = createStore(state, 0)
    expect(store.pivot(product.id, 'web_consumers').ok).toBe(true)
    expect(state.offices[0].project).toMatchObject({ kind: 'update', pivotsTo: 'web_consumers', featureIds: [] })
    release(state)
    expect(product.audienceId).toBe('web_consumers')
    expect(product.featureIds).toEqual(features)
    expect(product.users).toBeCloseTo(1000 * PIVOT_KEEP, 6)
    expect(product.releaseDay).toBe(state.day)
    expect(product.pivoted).toBe(true)
    // Dark mode, a shrug for small businesses, is what everyday users love.
    expect(product.fit).toBeCloseTo(releaseFit(state, 'web_app', 'web_consumers', features, product.quality).fit, 6)
    expect(startPivot(state, product.id, 'web_teams').ok).toBe(false)
  })
})
