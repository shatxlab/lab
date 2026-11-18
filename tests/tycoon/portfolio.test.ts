import { describe, expect, it } from 'vitest'
import { GARAGE_PRODUCT_LIMIT, GROW_MIN_AGE_DAYS, NEW_PRODUCT_GAP_DAYS, PORTFOLIO_LIMIT, PROJECT_SIZES } from '@/lib/tycoon/sim/balance'
import { growBlocker, newProductBlocker, nextSize } from '@/lib/tycoon/sim/lifecycle'
import { growTarget, projectTarget, shipProject, startProject, startUpdate } from '@/lib/tycoon/sim/project'
import { DISCIPLINES, type GameState } from '@/lib/tycoon/sim/types'
import { makeEmployee, makeProduct, makeState } from './helpers'

/** A studio in a real office with `count` live products and a free office. */
function officeWith(count: number): GameState {
  const state = makeState([makeEmployee(1, { design: 50, engineering: 50, qa: 50 })])
  state.offices[0].kind = 'office'
  state.stage = 5
  state.day = 2000
  state.money = 1_000_000
  state.products = Array.from({ length: count }, (_, i) => makeProduct({ id: 10 + i, name: `P${i}`, releaseDay: 100, reach: 20_000, users: 20_000, updates: [{ day: 1900 }] }))
  return state
}

describe('the portfolio', () => {
  it(`holds ${GARAGE_PRODUCT_LIMIT} live products in the garage, counting one being made: retire one to try another`, () => {
    const state = makeState([makeEmployee(1, { design: 50, engineering: 50, qa: 50 })])
    state.products = Array.from({ length: GARAGE_PRODUCT_LIMIT - 1 }, (_, i) => makeProduct({ id: 10 + i, name: `P${i}` }))
    expect(newProductBlocker(state)).toBeNull()
    expect(startProject(state, 'web_app', []).ok).toBe(true)
    expect(newProductBlocker(state)).toContain('retire one first')
  })

  it(`holds ${PORTFOLIO_LIMIT} products, counting one being made, outside the garage`, () => {
    const state = officeWith(PORTFOLIO_LIMIT)
    expect(startProject(state, 'web_app', []).ok).toBe(false)
    state.products.pop()
    state.lastNewProductDay = -10_000
    expect(startProject(state, 'web_app', []).ok).toBe(true)
    // The project in the making takes the last slot.
    expect(newProductBlocker(state)).toContain('full')
  })

  it('lets a new product start only once a year once there are a few', () => {
    const state = officeWith(3)
    state.lastNewProductDay = state.day - 10
    expect(newProductBlocker(state)).toContain('One new product a year')
    state.lastNewProductDay = state.day - NEW_PRODUCT_GAP_DAYS
    expect(newProductBlocker(state)).toBeNull()
    expect(startProject(state, 'web_app', []).ok).toBe(true)
    expect(state.lastNewProductDay).toBe(state.day)
    const few = officeWith(2)
    few.lastNewProductDay = few.day - 10
    expect(newProductBlocker(few)).toBeNull()
  })

  it('does not limit updates', () => {
    const state = officeWith(PORTFOLIO_LIMIT)
    expect(startUpdate(state, 10, []).ok).toBe(true)
  })
})

describe('growing a product', () => {
  it('goes one size at a time, and costs what the extra scale adds', () => {
    expect(nextSize('small')).toBe('medium')
    expect(nextSize('large')).toBe('flagship')
    expect(nextSize('flagship')).toBeNull()
    const grow = growTarget('web_app', [], 'small', 'medium')
    const fresh = projectTarget('web_app', [], 'new', 'medium')
    for (const d of DISCIPLINES) {
      expect(grow[d]).toBeGreaterThan(0)
      expect(grow[d]).toBeLessThan(fresh[d])
    }
  })

  it('needs an established product and a size the studio can build', () => {
    const state = officeWith(1)
    const product = state.products[0]
    const office = state.offices[0]
    product.size = 'flagship'
    expect(growBlocker(state, office, product)).toContain('as big')
    product.size = 'small'
    product.releaseDay = state.day - 10
    expect(growBlocker(state, office, product)).toContain('Too young')
    product.releaseDay = state.day - GROW_MIN_AGE_DAYS
    product.updates = [{ day: state.day - 5 }]
    state.day += UPDATE_WAIT
    expect(growBlocker(state, office, product)).toBeNull()
    expect(growBlocker({ ...state, stage: 0 }, office, { ...product, size: 'large' })).toContain('Flagship projects need')
  })

  it('ships as a bigger product with the reach to match', () => {
    const state = officeWith(1)
    const product = state.products[0]
    product.size = 'small'
    product.releaseDay = state.day - 400
    product.updates = [{ day: state.day - 100 }]
    const reachBefore = product.reach
    expect(startUpdate(state, product.id, [], 1, true).ok).toBe(true)
    const project = state.offices[0].project!
    expect(project.grows).toBe('medium')
    for (const d of DISCIPLINES) project.progress[d] = project.target[d]
    expect(shipProject(state).ok).toBe(true)
    expect(product.size).toBe('medium')
    expect(product.reach).toBeGreaterThanOrEqual((reachBefore * PROJECT_SIZES.medium.reach) / PROJECT_SIZES.small.reach)
    expect(state.products).toHaveLength(1)
  })

  it('growing does not make a hit by itself: a product takes off on its fit', () => {
    const state = officeWith(1)
    const product = state.products[0]
    product.size = 'small'
    product.releaseDay = state.day - 400
    startUpdate(state, product.id, [], 1, true)
    for (const d of DISCIPLINES) state.offices[0].project!.progress[d] = state.offices[0].project!.target[d] * 1.3
    shipProject(state)
    expect(product.size).toBe('medium')
    expect(product.fit).toBeGreaterThan(0)
  })
})

const UPDATE_WAIT = 60
