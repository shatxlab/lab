import { describe, expect, it } from 'vitest'
import { SIDE_PRODUCT_LIMIT } from '@/lib/tycoon/sim/balance'
import { garageProducts, keepBlocker, moveOut } from '@/lib/tycoon/sim/offices'
import { createInitialState } from '@/lib/tycoon/sim/state'
import type { GameState } from '@/lib/tycoon/sim/types'
import { makeProduct } from './helpers'

function garageWithProducts(): GameState {
  const state = createInitialState(5)
  state.offices[0].kind = 'garage'
  state.stage = 2
  state.money = 100_000
  state.rivals = []
  state.rivalProducts = []
  state.reputation = 40
  state.products = [
    makeProduct({ id: 1, hit: true, users: 40_000, reach: 40_000 }),
    makeProduct({ id: 2, users: 900, reach: 900 }),
    makeProduct({ id: 3, users: 800, reach: 800 }),
    makeProduct({ id: 4, users: 30, reach: 30 }),
  ]
  state.signatureId = 1
  return state
}

describe('moving out with the hit', () => {
  it('keeps the hit and the chosen side products and sells the rest without a penalty', () => {
    const state = garageWithProducts()
    expect(garageProducts(state).map((p) => p.id)).toEqual([2, 3, 4])
    expect(moveOut(state, [3]).ok).toBe(true)
    expect(state.products.map((p) => p.id)).toEqual([1, 3])
    expect(state.products.find((p) => p.id === 3)?.role).toBe('side')
    expect(state.products.find((p) => p.id === 1)?.role).toBeUndefined()
    expect(state.retired.map((r) => r.id).sort()).toEqual([2, 4])
    expect(state.reputation).toBe(40)
  })

  it('keeps nothing by default', () => {
    const state = garageWithProducts()
    expect(moveOut(state).ok).toBe(true)
    expect(state.products.map((p) => p.id)).toEqual([1])
  })

  it('allows at most the side limit, and only garage products', () => {
    const state = garageWithProducts()
    expect(SIDE_PRODUCT_LIMIT).toBe(2)
    expect(keepBlocker(state, [2, 3, 4])).toMatch(/at most 2/)
    expect(keepBlocker(state, [1])).toMatch(/garage only/)
    expect(moveOut(state, [2, 3, 4]).ok).toBe(false)
    expect(state.products).toHaveLength(4)
    expect(state.offices[0].kind).toBe('garage')
  })
})
