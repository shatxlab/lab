import { describe, expect, it } from 'vitest'
import { SALE_HIT_BONUS, SALE_HIT_REPUTATION_PENALTY, SALE_MIN_INCOME, SALE_MORALE_PENALTY, SALE_REPUTATION_PENALTY } from '@/lib/tycoon/sim/balance'
import { startFix } from '@/lib/tycoon/sim/fixes'
import { productRevenue } from '@/lib/tycoon/sim/products'
import { startUpdate } from '@/lib/tycoon/sim/project'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { salePrice, sunsetBlocker, sunsetOutcome, sunsetProduct } from '@/lib/tycoon/sim/sunset'
import { drainEvents } from '@/lib/tycoon/sim/tick'
import type { GameState } from '@/lib/tycoon/sim/types'
import { createStore } from '@/lib/tycoon/store'
import { makeEmployee, makeProduct, richState } from './helpers'

/** A studio with a big product (id 60) and a small one (id 61), and a rival to buy. */
function portfolio(): GameState {
  const state = richState()
  state.offices[0].project = null
  state.products = [
    makeProduct({ id: 60, name: 'Giant', reach: 400_000, users: 300_000, totalRevenue: 90_000, bugs: 3 }),
    makeProduct({ id: 61, name: 'Tiny', reach: 8_000, users: 800, totalRevenue: 700, bugs: 2 }),
  ]
  const rival = createInitialState(5).rivals[0]
  state.rivals = [rival]
  return state
}

describe('retiring and selling products', () => {
  it('retires a small product for free, and sells a big one', () => {
    const state = portfolio()
    expect(sunsetOutcome(state.products[1])).toBe('retired')
    expect(sunsetOutcome(state.products[0])).toBe('sold')
    // By what it earns, not by its users: a few cloud customers pay more than many game players.
    const enough = (SALE_MIN_INCOME * 30) / 9
    expect(sunsetOutcome(makeProduct({ productTypeId: 'saas_platform', users: enough }))).toBe('sold')
    expect(sunsetOutcome(makeProduct({ productTypeId: 'saas_platform', users: enough - 1 }))).toBe('retired')
    expect(sunsetOutcome(makeProduct({ productTypeId: 'web_app', users: 100_000 }))).toBe('sold')
    expect(sunsetOutcome(makeProduct({ productTypeId: 'game', users: 90_000 }))).toBe('retired')
  })

  it('retiring costs nothing: no money, no morale, no reputation', () => {
    const state = portfolio()
    const { money, reputation } = state
    const morale = state.employees.map((e) => e.morale)
    expect(sunsetProduct(state, 61).ok).toBe(true)
    expect(state.products.map((p) => p.id)).toEqual([60])
    expect(state.money).toBe(money)
    expect(state.reputation).toBe(reputation)
    expect(state.employees.map((e) => e.morale)).toEqual(morale)
    expect(state.rivalProducts.some((p) => p.id === 61)).toBe(false)
    expect(state.retired).toEqual([expect.objectContaining({ id: 61, name: 'Tiny', outcome: 'retired', price: 0, buyer: null, users: 800 })])
  })

  it('a sale pays a year of income, goes to a rival with its users, and costs morale and reputation', () => {
    const state = portfolio()
    const product = state.products[0]
    const price = salePrice(product)
    expect(price).toBeGreaterThan(productRevenue(product) * 30 * 6)
    const { money, reputation } = state
    const morale = state.employees[0].morale
    expect(sunsetProduct(state, 60).ok).toBe(true)

    expect(state.money).toBe(money + price)
    expect(state.reputation).toBe(reputation - SALE_REPUTATION_PENALTY)
    expect(state.employees[0].morale).toBeLessThan(morale)
    expect(state.employees[0].morale).toBeCloseTo(morale - SALE_MORALE_PENALTY)
    const bought = state.rivalProducts.find((p) => p.id === 60)!
    expect(bought).toMatchObject({ rivalId: state.rivals[0].id, name: 'Giant', users: product.users, reach: product.reach })
    expect(state.retired[0]).toMatchObject({ outcome: 'sold', price, buyer: state.rivals[0].name })
    expect(drainEvents(state).some((e) => e.type === 'notice' && e.text.includes(`sold to ${state.rivals[0].name}`))).toBe(true)
  })

  it('selling a hit pays more and costs the studio more', () => {
    const normal = portfolio()
    const hit = portfolio()
    hit.products[0].hit = true
    expect(salePrice(hit.products[0])).toBeCloseTo(salePrice(normal.products[0]) * SALE_HIT_BONUS, -3)
    const reputation = hit.reputation
    sunsetProduct(hit, 60)
    expect(hit.reputation).toBe(reputation - SALE_HIT_REPUTATION_PENALTY)
  })

  it('a buggy product sells for less', () => {
    const clean = portfolio()
    const buggy = portfolio()
    buggy.products[0].bugs = 600
    expect(salePrice(buggy.products[0])).toBeLessThan(salePrice(clean.products[0]))
  })

  it('still works with no rival left to buy it: the money comes, nobody is named', () => {
    const state = portfolio()
    state.rivals = []
    const money = state.money
    expect(sunsetProduct(state, 60).ok).toBe(true)
    expect(state.money).toBeGreaterThan(money)
    expect(state.retired[0].buyer).toBeNull()
    expect(state.rivalProducts).toEqual([])
  })

  it('is blocked while an update is being built, but not while a pair is fixing it', () => {
    const state = portfolio()
    state.employees.push(makeEmployee(104, { qa: 60 }, 2000, 'tester'))
    expect(startFix(state, 60, 100, 104).ok).toBe(true)
    expect(sunsetBlocker(state, state.products[0])).toBeNull()
    expect(sunsetProduct(state, 60).ok).toBe(true)
    expect(state.fixes).toEqual([]) // the job stopped with the product

    expect(startUpdate(state, 61, ['dark_mode']).ok).toBe(true)
    expect(sunsetBlocker(state, state.products[0])).toBe('An update is in progress')
    expect(sunsetProduct(state, 61)).toEqual({ ok: false, reason: 'An update is in progress' })
    expect(state.products.map((p) => p.id)).toEqual([61])
    expect(sunsetProduct(state, 999)).toEqual({ ok: false, reason: 'Unknown product' })
  })

  it('keeps the studio\'s signature hit valid after it is sold', () => {
    const state = portfolio()
    state.products[0].hit = true
    state.signatureId = 60
    sunsetProduct(state, 60)
    expect(state.signatureId).toBe(60)
    const restored = deserialize(serialize(state))!
    expect(restored.retired).toEqual(state.retired)
    expect(restored.signatureId).toBe(60)
    const raw = JSON.parse(serialize(state))
    raw.signatureId = 424242
    expect(deserialize(JSON.stringify(raw))).toBeNull()
  })

  it('runs through the store', () => {
    const store = createStore(portfolio(), 0)
    expect(store.sunsetProduct(61).ok).toBe(true)
    expect(store.toasts.value.some((t) => t.text === 'Tiny was retired.')).toBe(true)
    expect(store.sunsetProduct(61).ok).toBe(false)
  })
})
