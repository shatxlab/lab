import { describe, expect, it } from 'vitest'
import { moveOut, moveOutBlocker, moveOutProductBlocker } from '@/lib/tycoon/sim/offices'
import { salePrice } from '@/lib/tycoon/sim/sunset'
import { startUpdate } from '@/lib/tycoon/sim/project'
import { MOVE_OUT_COST, OFFICE_UPGRADE_MORALE } from '@/lib/tycoon/sim/balance'
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

describe('choosing the office product', () => {
  it('requires an explicit selection even when there is only one hit', () => {
    const state = garageWithProducts()
    const before = structuredClone(state)
    expect(moveOutProductBlocker(state)).toMatch(/Choose/)
    expect(moveOut(state).ok).toBe(false)
    expect(state).toEqual(before)
  })

  it('can choose a later hit and automatically sells or retires every other product without penalties', () => {
    const state = garageWithProducts()
    state.products[2].hit = true
    state.products[2].role = 'side'
    state.products[0].users = 300_000
    state.rivals = createInitialState(8).rivals
    const sale = salePrice(state.products[0])
    const morale = state.employees.map((e) => e.morale)
    expect(moveOut(state, 3).ok).toBe(true)
    expect(state.signatureId).toBe(3)
    expect(state.offices[0].productId).toBe(3)
    expect(state.products.map((p) => p.id)).toEqual([3])
    expect(state.products[0].role).toBeUndefined()
    expect(state.retired).toEqual([
      expect.objectContaining({ id: 1, outcome: 'sold', price: sale }),
      expect.objectContaining({ id: 2, outcome: 'retired', price: 0 }),
      expect.objectContaining({ id: 4, outcome: 'retired', price: 0 }),
    ])
    expect(state.employees.map((e) => e.morale)).toEqual(morale.map((m) => Math.min(100, m + OFFICE_UPGRADE_MORALE)))
    expect(state.rivalProducts).toContainEqual(expect.objectContaining({ id: 1, users: 300_000 }))
    expect(state.reputation).toBe(40)
    expect(state.money).toBe(100_000 - MOVE_OUT_COST + sale)
  })

  it('waits for an update to a disposable product without partially selling or spending', () => {
    const state = garageWithProducts()
    state.day = 100
    expect(startUpdate(state, 2, []).ok).toBe(true)
    const before = structuredClone(state)
    expect(moveOutProductBlocker(state, 1)).toMatch(/Finish the update/)
    expect(moveOut(state, 1).ok).toBe(false)
    expect(state).toEqual(before)
    state.offices[0].project = null
    expect(moveOut(state, 1).ok).toBe(true)
    expect(state.products.map((p) => p.id)).toEqual([1])
  })

  it('can move while the chosen product is being updated', () => {
    const state = garageWithProducts()
    state.day = 100
    expect(startUpdate(state, 1, []).ok).toBe(true)
    const project = state.offices[0].project
    expect(moveOut(state, 1).ok).toBe(true)
    expect(state.offices[0].project).toBe(project)
    expect(state.products.map((p) => p.id)).toEqual([1])
  })

  it('rejects nonexistent and non-hit choices without changing anything', () => {
    for (const id of [2, 999]) {
      const state = garageWithProducts()
      const before = structuredClone(state)
      expect(moveOut(state, id).ok).toBe(false)
      expect(state).toEqual(before)
    }
  })

  it('does not let a stale first-hit ID unlock an empty office', () => {
    const state = garageWithProducts()
    state.products = []
    expect(moveOutBlocker(state)).toBe('Have a live breakout hit first')
    expect(moveOut(state, 1).ok).toBe(false)
    expect(state.offices[0].kind).toBe('garage')
  })

  it('allows another live hit after the original hit was sold or retired', () => {
    const state = garageWithProducts()
    state.products = [makeProduct({ id: 3, hit: true })]
    expect(moveOutBlocker(state)).toBeNull()
    expect(moveOut(state, 1).ok).toBe(false)
    expect(moveOut(state, 3).ok).toBe(true)
    expect(state.signatureId).toBe(3)
  })
})
