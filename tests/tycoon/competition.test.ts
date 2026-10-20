import { describe, expect, it } from 'vitest'
import { ERAS, eraAt, eraIndexAt, eraPhrase, expectedFeatures } from '@/lib/tycoon/data/eras'
import { NEWCOMERS, RIVALS } from '@/lib/tycoon/data/rivals'
import { PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import { ACQUISITION_FLOOR, ACQUISITION_STAGE, MARKET_CAP } from '@/lib/tycoon/sim/balance'
import {
  acquire,
  acquisitionBlocker,
  acquisitionPrice,
  freshStudioName,
  generatedNewcomer,
  newcomerFor,
  playerRank,
  rankingDay,
  standings,
} from '@/lib/tycoon/sim/rivals'
import { settledUsers, marketCrowding, marketWeights, saturate, targetUsers } from '@/lib/tycoon/sim/products'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { createInitialState } from '@/lib/tycoon/sim/state'
import { drainEvents } from '@/lib/tycoon/sim/tick'
import { dayOfEra, makeProduct, makeState } from './helpers'

/** A studio at the top of the journey with the early rivals, ready to buy one. */
function giantState(seed = 21) {
  const state = createInitialState(seed)
  state.stage = ACQUISITION_STAGE
  state.money = 1e9
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
    state.acquiredIncome = 1e9
    rankingDay(state)
    rankingDay(state)
    expect(state.daysAtTop).toBe(2)
    state.acquiredIncome = 0
    rankingDay(state)
    expect(state.daysAtTop).toBe(0)
    state.acquiredIncome = 1e9
    state.stage = ACQUISITION_STAGE - 1
    rankingDay(state)
    expect(state.daysAtTop).toBe(0)
  })
})

describe('buying a rival', () => {
  it('costs many days of its income, never less than the floor', () => {
    const state = giantState()
    const rival = state.rivals[0]
    expect(acquisitionPrice(state, rival)).toBeGreaterThanOrEqual(ACQUISITION_FLOOR)
    rival.business = 0
    state.rivalProducts = state.rivalProducts.filter((p) => p.rivalId !== rival.id)
    expect(acquisitionPrice(state, rival)).toBe(ACQUISITION_FLOOR)
    rival.business = 1e6
    expect(acquisitionPrice(state, rival)).toBeGreaterThan(ACQUISITION_FLOOR)
  })

  it('needs the industry leader stage and the money', () => {
    const state = giantState()
    const rival = state.rivals[0]
    expect(acquisitionBlocker(state, rival)).toBeNull()
    state.money = 0
    expect(acquisitionBlocker(state, rival)).toBe('Not enough money')
    state.money = 1e9
    state.stage = ACQUISITION_STAGE - 1
    expect(acquisitionBlocker(state, rival)).toBe('Only an industry leader can buy a rival')
    const result = acquire(state, rival.id)
    expect(result.ok).toBe(false)
    expect(state.rivals).toContain(rival)
  })

  it('refuses a studio that does not exist', () => {
    const state = giantState()
    const result = acquire(state, 99_999)
    expect(result).toEqual({ ok: false, reason: 'Unknown studio' })
  })

  it('takes the studio off the market, pays for it and brings its products over with their users', () => {
    const state = giantState()
    const rival = state.rivals[0]
    const theirs = state.rivalProducts.filter((p) => p.rivalId === rival.id)
    expect(theirs.length).toBeGreaterThan(0)
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
    for (const p of theirs) {
      const mine = state.products.find((q) => q.id === p.id)!
      expect(mine.name).toBe(p.name)
      expect(mine.users).toBe(p.users)
      expect(mine.reach).toBe(p.reach)
      expect(mine.hit).toBe(p.hit)
      expect(mine.bugs).toBeGreaterThan(0)
    }
    expect(drainEvents(state).some((e) => e.type === 'notice' && e.text.includes(rival.name))).toBe(true)
  })

  it('survives a save round trip with the studio gone and its products yours', () => {
    const state = giantState()
    const rival = state.rivals[0]
    acquire(state, rival.id)
    const loaded = deserialize(serialize(state))
    expect(loaded).not.toBeNull()
    expect(loaded!.rivals.some((r) => r.id === rival.id)).toBe(false)
    expect(loaded!.products.map((p) => p.id).sort()).toEqual(state.products.map((p) => p.id).sort())
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
