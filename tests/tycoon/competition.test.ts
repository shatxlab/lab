import { describe, expect, it } from 'vitest'
import { ERAS, eraAt, eraIndexAt, eraPhrase, expectedFeatures } from '@/lib/tycoon/data/eras'
import { NEWCOMERS, RIVALS } from '@/lib/tycoon/data/rivals'
import { PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import { ABSORB_TYPE_DAYS, ABSORB_USERS_SHARE, OFFICE_KINDS, ACQUISITION_FLOOR, ACQUISITION_STAGE, LEADER_STAGE, MARKET_CAP } from '@/lib/tycoon/sim/balance'
import {
  absorbDesks,
  absorbSlots,
  acquire,
  acquisitionBlocker,
  acquisitionPrice,
  competingProducts,
  freshStudioName,
  generatedNewcomer,
  newcomerFor,
  playerRank,
  rankingDay,
  rivalProductsOf,
  standings,
} from '@/lib/tycoon/sim/rivals'
import { settledUsers, marketCrowding, marketWeights, saturate, targetUsers } from '@/lib/tycoon/sim/products'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { createInitialState } from '@/lib/tycoon/sim/state'
import { generateEmployee } from '@/lib/tycoon/sim/hiring'
import { freeDesks, openOffice } from '@/lib/tycoon/sim/offices'
import { drainEvents } from '@/lib/tycoon/sim/tick'
import { dayOfEra, makeProduct, makeState } from './helpers'

/** A studio at the top of the journey with the early rivals, ready to buy one. */
function giantState(seed = 21) {
  const state = createInitialState(seed)
  state.stage = ACQUISITION_STAGE
  state.offices[0].kind = 'office'
  state.money = 1e9
  openOffice(state) // Europe, the second: an absorbed studio takes the place of the third or fourth
  return state
}

describe('the industry ranking', () => {
  it('lists every studio, the biggest earner first, with you as id 0', () => {
    const state = giantState()
    const rows = standings(state)
    expect(rows).toHaveLength(state.rivals.length + 1)
    expect(rows.filter((r) => r.id === 0)).toHaveLength(1)
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].revenue).toBeGreaterThanOrEqual(rows[i].revenue)
  })

  it('counts a rival as its products plus its other business', () => {
    const state = giantState()
    const rival = state.rivals[0]
    const before = standings(state).find((r) => r.id === rival.id)!.revenue
    rival.business += 5000
    expect(standings(state).find((r) => r.id === rival.id)!.revenue).toBeCloseTo(before + 5000, 5)
  })

  it('names the product with the most users as a studio’s best', () => {
    const state = giantState()
    state.products = [makeProduct({ id: 50, name: 'Small fry', users: 10 }), makeProduct({ id: 51, name: 'Big fish', users: 9000 })]
    expect(standings(state).find((r) => r.id === 0)!.best).toBe('Big fish')
    state.products = []
    expect(standings(state).find((r) => r.id === 0)!.best).toBeNull()
  })

  it('puts you first once you earn more than anyone, and last with nothing', () => {
    const state = giantState()
    state.products = []
    expect(playerRank(state)).toBe(state.rivals.length + 1)
    state.acquiredIncome = 1e9
    expect(playerRank(state)).toBe(1)
  })

  it('counts consecutive days at the top only from the industry leader stage, and resets when you slip', () => {
    const state = giantState()
    state.stage = LEADER_STAGE
    state.acquiredIncome = 1e9
    rankingDay(state)
    rankingDay(state)
    expect(state.daysAtTop).toBe(2)
    state.acquiredIncome = 0
    rankingDay(state)
    expect(state.daysAtTop).toBe(0)
    state.acquiredIncome = 1e9
    state.stage = LEADER_STAGE - 1
    rankingDay(state)
    expect(state.daysAtTop).toBe(0)
  })
})

describe('absorbing a rival', () => {
  /** A US rival and an EU one. */
  const rivalIn = (state: ReturnType<typeof giantState>, region: 'us' | 'eu') => state.rivals.find((r) => (r.region ?? 'us') === region)!
  /** The hit is of the kind this rival builds, so it competes with it. */
  const withHitAgainst = (state: ReturnType<typeof giantState>, rival: ReturnType<typeof rivalIn>) => {
    const theirs = rivalProductsOf(state, rival)
    const hit = makeProduct({ id: 900, name: 'Mine', productTypeId: theirs[0].productTypeId, hit: true, users: 100_000, reach: 100_000 })
    state.products = [hit]
    state.signatureId = hit.id
    return hit
  }

  it('costs many days of its income, more for a growing studio, never less than the floor', () => {
    const state = giantState()
    const rival = state.rivals[0]
    expect(acquisitionPrice(state, rival)).toBeGreaterThanOrEqual(ACQUISITION_FLOOR)
    rival.business = 0
    state.rivalProducts = state.rivalProducts.filter((p) => p.rivalId !== rival.id)
    expect(acquisitionPrice(state, rival)).toBe(ACQUISITION_FLOOR)
    rival.business = 1e6
    rival.growth = 0
    const flat = acquisitionPrice(state, rival)
    rival.growth = 0.5
    expect(acquisitionPrice(state, rival)).toBeGreaterThan(flat)
  })

  it('needs an established company, a real office, a hit it competes with, and the money', () => {
    const state = giantState()
    const rival = rivalIn(state, 'us')
    expect(acquisitionBlocker(state, rival)).toMatch(/Needs a hit/)
    const hit = withHitAgainst(state, rival)
    expect(acquisitionBlocker(state, rival)).toBeNull()
    hit.productTypeId = PRODUCT_TYPES.find((t) => !rival.focus.includes(t.id) && !rivalProductsOf(state, rival).some((p) => p.productTypeId === t.id))!.id
    expect(acquisitionBlocker(state, rival)).toMatch(/does not compete with Mine/)
    hit.productTypeId = rivalProductsOf(state, rival)[0].productTypeId
    state.money = 0
    expect(acquisitionBlocker(state, rival)).toBe('Not enough money')
    state.money = 1e9
    state.stage = ACQUISITION_STAGE - 1
    expect(acquisitionBlocker(state, rival)).toBe('Only an established company can absorb a rival')
    expect(acquire(state, rival.id).ok).toBe(false)
    expect(state.rivals).toContain(rival)
    state.stage = ACQUISITION_STAGE
    state.offices[0].kind = 'garage'
    expect(acquisitionBlocker(state, rival)).toBe('Move out of the garage first')
  })

  it('refuses a studio that does not exist, and products that are not its own', () => {
    const state = giantState()
    expect(acquire(state, 99_999)).toEqual({ ok: false, reason: 'Unknown studio' })
    const rival = rivalIn(state, 'us')
    withHitAgainst(state, rival)
    const other = state.rivalProducts.find((p) => p.rivalId !== rival.id)!
    expect(acquire(state, rival.id, [other.id])).toEqual({ ok: false, reason: 'Those products are not theirs' })
    expect(state.rivals).toContain(rival)
  })

  it('takes the studio off the market, pays for it and moves half its competing users to the hit', () => {
    const state = giantState()
    const rival = rivalIn(state, 'us')
    const hit = withHitAgainst(state, rival)
    const competing = competingProducts(state, rival)
    const moving = Math.round(competing.reduce((sum, p) => sum + p.users, 0) * ABSORB_USERS_SHARE)
    const price = acquisitionPrice(state, rival)
    const money = state.money
    const income = state.acquiredIncome
    const reputation = state.reputation
    const others = state.rivals.length - 1
    expect(acquire(state, rival.id).ok).toBe(true)
    expect(state.money).toBe(money - price)
    expect(state.rivals).toHaveLength(others)
    expect(state.rivalProducts.some((p) => p.rivalId === rival.id)).toBe(false)
    expect(state.acquiredIncome).toBe(income + rival.business)
    expect(state.reputation).toBeGreaterThan(reputation)
    expect(hit.users).toBe(100_000 + moving)
    expect(state.products).toHaveLength(1)
    expect(drainEvents(state).some((e) => e.type === 'notice' && e.text.includes(rival.name))).toBe(true)
  })

  it('keeps the products you choose as second products, no more than there are places', () => {
    const state = giantState()
    const rival = rivalIn(state, 'us')
    withHitAgainst(state, rival)
    const theirs = rivalProductsOf(state, rival)
    expect(theirs.length).toBeGreaterThan(1)
    state.products.push(makeProduct({ id: 801, role: 'side' }))
    expect(absorbSlots(state)).toBe(1)
    expect(acquire(state, rival.id, theirs.slice(0, 2).map((p) => p.id))).toEqual({ ok: false, reason: 'You have room for 1 more second products' })
    expect(acquire(state, rival.id, [theirs[0].id]).ok).toBe(true)
    const mine = state.products.find((p) => p.id === theirs[0].id)!
    expect(mine.role).toBe('side')
    expect(mine.hit).toBe(false)
    expect(absorbSlots(state)).toBe(0)
  })

  it('brings its best people into empty desks only, and nobody when there are none', () => {
    const state = giantState()
    const rival = rivalIn(state, 'us')
    withHitAgainst(state, rival)
    const office = state.offices[0]
    state.employees = []
    expect(absorbDesks(state, rival)).toBe(OFFICE_KINDS.office.desks)
    // Leave exactly three desks empty in the US building.
    for (let i = 0; i < OFFICE_KINDS.office.desks - 3; i++) state.employees.push({ ...generateEmployee(state, 'developer', 'us'), officeId: office.id })
    const staff = state.employees.length
    expect(absorbDesks(state, rival)).toBe(3)
    expect(acquire(state, rival.id).ok).toBe(true)
    const joined = state.employees.slice(staff)
    expect(joined).toHaveLength(3)
    expect(joined.every((e) => e.officeId === office.id)).toBe(true)
    for (const person of joined) for (const type of rival.focus) expect(person.knowledge!.types[type]).toBeGreaterThanOrEqual(ABSORB_TYPE_DAYS)
    expect(freeDesks(state, office)).toBe(0)
    // Nothing free: nobody comes, but the users still move.
    const other = rivalIn(state, 'us')
    if (other.id !== rival.id) {
      withHitAgainst(state, other)
      expect(absorbDesks(state, other)).toBe(0)
      const before = state.employees.length
      expect(acquire(state, other.id).ok).toBe(true)
      expect(state.employees).toHaveLength(before)
    }
  })

  it('survives a save round trip with the studio gone and its users with the hit', () => {
    const state = giantState()
    const rival = rivalIn(state, 'eu')
    const hit = withHitAgainst(state, rival)
    acquire(state, rival.id, [])
    const loaded = deserialize(serialize(state))
    expect(loaded).not.toBeNull()
    expect(loaded!.rivals.some((r) => r.id === rival.id)).toBe(false)
    expect(loaded!.products.find((p) => p.id === hit.id)!.users).toBe(hit.users)
    expect(loaded!.acquiredIncome).toBe(state.acquiredIncome)
  })

  it('a save with rivals and their products loads back unchanged', () => {
    const state = createInitialState(8)
    const loaded = deserialize(serialize(state))!
    expect(loaded.rivals).toEqual(state.rivals)
    expect(loaded.rivalProducts).toEqual(state.rivalProducts)
  })
})

describe('eras', () => {
  it('start in order, the first at year 1', () => {
    expect(ERAS[0].startYear).toBe(1)
    for (let i = 1; i < ERAS.length; i++) expect(ERAS[i].startYear).toBeGreaterThan(ERAS[i - 1].startYear)
  })

  it('are found by day, flipping on the first day of the year they begin', () => {
    ERAS.forEach((era, i) => {
      expect(eraIndexAt(dayOfEra(i))).toBe(i)
      expect(eraAt(dayOfEra(i)).id).toBe(era.id)
      if (i > 0) expect(eraIndexAt(dayOfEra(i) - 1)).toBe(i - 1)
    })
    expect(eraIndexAt(dayOfEra(ERAS.length - 1) + 5000)).toBe(ERAS.length - 1)
  })

  it('only mention product types and features that exist', () => {
    const typeIds = PRODUCT_TYPES.map((t) => t.id)
    for (const era of ERAS) {
      for (const id of Object.keys(era.demand)) expect(typeIds).toContain(id)
      for (const id of Object.keys(era.expected)) expect(typeIds).toContain(id)
    }
  })

  it('say what users expect of a type on a given day', () => {
    expect(expectedFeatures('web_app', 0)).toEqual([])
    expect(expectedFeatures('web_app', dayOfEra(1))).toContain('accounts')
    expect(expectedFeatures('cloud_platform', dayOfEra(ERAS.length - 1))).toContain('api')
  })

  it('name themselves in mid-sentence', () => {
    expect(eraPhrase(ERAS[0])).toBe('the web years')
  })
})

describe('a crowded market', () => {
  it('is empty of others when you are alone', () => {
    const state = makeState()
    expect(marketCrowding(state, 'web_app')).toBe(0)
  })

  it('grows with the live products of the type, whoever made them', () => {
    const state = giantState()
    const type = state.rivalProducts[0].productTypeId
    const rivals = marketCrowding(state, type)
    expect(rivals).toBeGreaterThan(0)
    state.products.push(makeProduct({ id: 600, productTypeId: type, reach: 50_000, users: 50_000 }))
    expect(marketCrowding(state, type)).toBeGreaterThan(rivals)
  })

  it('ignores products of other types', () => {
    const state = makeState()
    state.products.push(makeProduct({ id: 601, productTypeId: 'game', reach: 100_000 }))
    expect(marketCrowding(state, 'web_app')).toBe(0)
    expect(marketWeights(state).get('game')).toBeGreaterThan(0)
  })

  it('lets a product share its users with the rest, so the same reach settles lower', () => {
    const alone = makeState()
    const crowded = makeState()
    crowded.products.push(makeProduct({ id: 602, productTypeId: 'web_app', reach: 80_000, users: 80_000 }))
    const mine = makeProduct({ id: 603, reach: 20_000, users: 20_000 })
    alone.products.push(mine)
    crowded.products.push({ ...mine })
    expect(targetUsers(crowded, mine)).toBeLessThan(targetUsers(alone, mine))
  })
})

describe('settledUsers', () => {
  it('is the saturated reach when the market is empty and nothing is expected', () => {
    const state = makeState()
    expect(settledUsers(state, 'web_app', [], 1000)).toBeCloseTo(saturate('web_app', 1000), 5)
  })

  it('never exceeds the market cap however big the reach', () => {
    const state = makeState()
    const type = PRODUCT_TYPES.find((t) => t.id === 'web_app')!
    expect(settledUsers(state, 'web_app', [], 1e12)).toBeLessThanOrEqual(type.audience * MARKET_CAP + 1e-6)
  })

  it('drops for each feature this era expects and the product lacks', () => {
    const state = makeState()
    state.day = dayOfEra(2)
    const missingTwo = settledUsers(state, 'web_app', [], 5000)
    const missingOne = settledUsers(state, 'web_app', ['accounts'], 5000)
    const none = settledUsers(state, 'web_app', ['accounts', 'cloud_sync'], 5000)
    expect(missingTwo).toBeLessThan(missingOne)
    expect(missingOne).toBeLessThan(none)
  })

  it('shrinks when rivals already hold the market', () => {
    const empty = makeState()
    const busy = giantState()
    const type = busy.rivalProducts[0].productTypeId
    expect(settledUsers(busy, type, [], 5000)).toBeLessThan(settledUsers(empty, type, [], 5000))
  })
})

describe('studio names', () => {
  it('never repeat a rival, a seed or a hand-written newcomer', () => {
    const state = createInitialState(12)
    const used = new Set([...state.rivals.map((r) => r.name), ...RIVALS.map((r) => r.name), ...Object.values(NEWCOMERS).map((r) => r!.name)])
    for (let i = 0; i < 200; i++) {
      const name = freshStudioName(state)
      expect(used.has(name)).toBe(false)
      used.add(name)
      state.rivals.push({ ...state.rivals[0], id: 1000 + i, name })
    }
  })

  it('give a generated newcomer a small studio aimed at the types the era wants most', () => {
    const state = createInitialState(13)
    const seed = generatedNewcomer(state, 3)
    expect(seed.size).toBe('small')
    expect(seed.products).toBe(0)
    expect(seed.focus).toHaveLength(3)
    expect(seed.focus[0]).toBe('ai_product')
    for (const id of seed.focus) expect(PRODUCT_TYPES.find((t) => t.id === id)!.era).toBeLessThanOrEqual(3)
  })

  it('use the hand-written newcomer where there is one, none in the first era', () => {
    const state = createInitialState(14)
    expect(newcomerFor(state, 0)).toBeNull()
    expect(newcomerFor(state, 1)).toBe(NEWCOMERS[1])
  })
})
