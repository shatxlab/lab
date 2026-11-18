import { describe, expect, it } from 'vitest'
import { BASE_CAPACITY, HOSTING_PER_USER_DAY, OUTAGE_LOAD } from '@/lib/tycoon/sim/balance'
import { costsDay, netPerDay } from '@/lib/tycoon/sim/economy'
import { productRevenue } from '@/lib/tycoon/sim/products'
import { capacityOf, growWorld, hostingCost, loadDay, loadOf } from '@/lib/tycoon/sim/scale'
import { formatCount, formatMoney } from '@/lib/tycoon/format'
import { makeProduct, makeState } from './helpers'

describe('a hit at scale', () => {
  it('holds a base number of users, plus what Scale work built', () => {
    const hit = makeProduct({ hit: true })
    expect(capacityOf(hit)).toBe(BASE_CAPACITY)
    hit.built = ['load_balancer', 'db_sharding']
    expect(capacityOf(hit)).toBe(BASE_CAPACITY + 300_000 + 1_500_000)
  })

  it('turns away users past its capacity, and a product that is not a hit is not held back', () => {
    const state = makeState()
    const hit = makeProduct({ hit: true, users: BASE_CAPACITY * 2, euUsers: BASE_CAPACITY })
    loadDay(state, hit)
    expect(hit.users).toBeLessThanOrEqual(BASE_CAPACITY)
    expect(hit.euUsers! / hit.users).toBeCloseTo(0.5)
    const small = makeProduct({ users: BASE_CAPACITY * 2 })
    loadDay(state, small)
    expect(small.users).toBe(BASE_CAPACITY * 2)
    expect(loadOf(small)).toBe(0)
  })

  it('goes down now and then once the servers are nearly full, and never when there is room', () => {
    const state = makeState()
    const roomy = makeProduct({ hit: true, users: BASE_CAPACITY * (OUTAGE_LOAD - 0.2) })
    for (let i = 0; i < 400; i++) loadDay(state, roomy)
    expect(state.events.some((e) => e.type === 'notice' && e.text.includes('went down'))).toBe(false)
    const full = makeProduct({ hit: true, users: BASE_CAPACITY })
    let outages = 0
    for (let i = 0; i < 400; i++) {
      full.users = BASE_CAPACITY
      if (loadDay(state, full)) outages += 1
    }
    expect(outages).toBeGreaterThan(0)
    expect(outages).toBeLessThan(40)
  })

  it('pays for servers by the user, and earns more per user with Monetisation work', () => {
    const state = makeState()
    state.products = [makeProduct({ hit: true, users: 100_000 })]
    expect(hostingCost(state)).toBeCloseTo(100_000 * HOSTING_PER_USER_DAY)
    const money = state.money
    costsDay(state)
    expect(money - state.money).toBeGreaterThanOrEqual(hostingCost(state))
    const before = productRevenue(state.products[0])
    state.products[0].built = ['paid_plans']
    expect(productRevenue(state.products[0])).toBeCloseTo(before * 1.5)
    expect(netPerDay(state)).toBeLessThan(productRevenue(state.products[0]))
  })

  it('finds more people while it fits, and stops when the servers are full', () => {
    const healthy = makeProduct({ hit: true, fit: 90, users: 1000 })
    growWorld(healthy)
    expect(healthy.world).toBeGreaterThan(1)
    const poor = makeProduct({ hit: true, fit: 40, users: 1000 })
    growWorld(poor)
    expect(poor.world ?? 1).toBe(1)
    const full = makeProduct({ hit: true, fit: 90, users: BASE_CAPACITY })
    growWorld(full)
    expect(full.world).toBeUndefined()
  })

  it('writes billions', () => {
    expect(formatMoney(1_250_000_000)).toBe('$1.25B')
    expect(formatCount(2_500_000_000)).toBe('2.50B')
    expect(formatMoney(2_500_000)).toBe('$2.50M')
  })
})
