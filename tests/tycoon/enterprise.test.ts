import { describe, expect, it } from 'vitest'
import { ENTERPRISE_BOARD, ENTERPRISE_PAY_DAYS, LICENSE_LIMIT, LICENSE_SHARE } from '@/lib/tycoon/sim/balance'
import { acceptContract, contractsDay, enterpriseCandidates, ENTERPRISE_RESEARCH, isEnterprise } from '@/lib/tycoon/sim/contracts'
import { dailyIncome } from '@/lib/tycoon/sim/economy'
import { LICENSING_RESEARCH, licenseBlocker, licenseIncome, licensedCount, setLicensed } from '@/lib/tycoon/sim/licensing'
import { productRevenue } from '@/lib/tycoon/sim/products'
import { sunsetProduct } from '@/lib/tycoon/sim/sunset'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { advance, drainEvents } from '@/lib/tycoon/sim/tick'
import { interest } from '@/lib/tycoon/sim/products'
import { subjectOf } from '@/lib/tycoon/sim/work'
import { makeEmployee, makeProduct, makeState } from './helpers'

const team = () => [1, 2, 3].map((id) => makeEmployee(id, { design: 60, engineering: 60, qa: 60 }))

/** An office with a Large product that earns well, and Enterprise sales researched. */
function enterpriseState() {
  const state = makeState(team())
  state.offices[0].kind = 'office'
  state.day = 800
  state.research.done.push(ENTERPRISE_RESEARCH)
  state.products.push(makeProduct({ id: 30, name: 'Anchor', size: 'large', releaseDay: 600, users: 40_000, reach: 40_000, updates: [{ day: 790 }] }))
  return state
}

describe('enterprise contracts', () => {
  it('need Enterprise sales, and a big product to be about', () => {
    const state = enterpriseState()
    state.research.done = []
    contractsDay(state)
    expect(state.contracts.some(isEnterprise)).toBe(false)
    state.research.done.push(ENTERPRISE_RESEARCH)
    state.products[0].size = 'medium'
    contractsDay(state)
    expect(state.contracts.some(isEnterprise)).toBe(false)
    state.products[0].size = 'large'
    contractsDay(state)
    expect(state.contracts.filter(isEnterprise)).toHaveLength(1)
  })

  it('are about one of your products, and pay by what it earns', () => {
    const state = enterpriseState()
    contractsDay(state)
    const offer = state.contracts.find(isEnterprise)!
    expect(offer.productId).toBe(30)
    expect(offer.title).toContain('Anchor')
    expect(offer.expiresDay).toBeGreaterThan(state.day)
    expect(offer.pay).toBeGreaterThanOrEqual(Math.round(productRevenue(state.products[0]) * ENTERPRISE_PAY_DAYS * 0.9 / 500) * 500 - 500)
  })

  it('come one at a time per product, a few at once, and not too often', () => {
    const state = enterpriseState()
    state.products.push(makeProduct({ id: 31, name: 'Second', size: 'flagship', releaseDay: 600, users: 40_000, reach: 40_000 }))
    state.products.push(makeProduct({ id: 32, name: 'Third', size: 'flagship', releaseDay: 600, users: 40_000, reach: 40_000 }))
    contractsDay(state)
    expect(state.contracts.filter(isEnterprise)).toHaveLength(1)
    contractsDay(state)
    expect(state.contracts.filter(isEnterprise)).toHaveLength(1)
    state.day = state.nextEnterpriseDay!
    contractsDay(state)
    expect(state.contracts.filter(isEnterprise)).toHaveLength(2)
    state.day = state.nextEnterpriseDay!
    contractsDay(state)
    expect(state.contracts.filter(isEnterprise).length).toBeLessThanOrEqual(ENTERPRISE_BOARD)
    const ids = state.contracts.filter(isEnterprise).map((c) => c.productId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('leave the board with the product, and when they run out', () => {
    const state = enterpriseState()
    contractsDay(state)
    const offer = state.contracts.find(isEnterprise)!
    state.day = offer.expiresDay! + 1
    contractsDay(state)
    expect(state.contracts.some((c) => c.id === offer.id)).toBe(false)

    const other = enterpriseState()
    contractsDay(other)
    other.products = []
    contractsDay(other)
    expect(other.contracts.some(isEnterprise)).toBe(false)
  })

  it('are taken like any job and block other work on the product', () => {
    const state = enterpriseState()
    contractsDay(state)
    const offer = state.contracts.find(isEnterprise)!
    const money = state.money
    expect(acceptContract(state, offer.id).ok).toBe(true)
    expect(state.money).toBeGreaterThan(money)
    const project = state.offices[0].project!
    expect(project.kind).toBe('contract')
    expect(project.parentId).toBe(30)
    expect(project.contract!.productId).toBe(30)
    expect(subjectOf(project)).toEqual({ typeId: 'web_app', productId: 30 })
    expect(enterpriseCandidates(state)).toHaveLength(0)
    expect(sunsetProduct(state, 30)).toEqual({ ok: false, reason: 'An update is in progress' })
  })

  it('are no longer offered for a product another team is working on', () => {
    const state = enterpriseState()
    contractsDay(state)
    const offer = state.contracts.find(isEnterprise)!
    state.offices[0].project = { ...state.offices[0].project!, id: 999, kind: 'update', parentId: 30, name: 'Anchor', productTypeId: 'web_app', size: 'large', featureIds: [], target: { design: 1, engineering: 1, qa: 1 }, progress: { design: 0, engineering: 0, qa: 0 }, startDay: 0, readyNotified: false, hype: 1, alphaOffered: false, bugRisk: 1, contract: null } as never
    expect(acceptContract(state, offer.id).ok).toBe(false)
  })

  it('refresh the product when delivered, and pay the rest', () => {
    const state = enterpriseState()
    state.products[0].updates = []
    state.products[0].releaseDay = 100
    contractsDay(state)
    const offer = state.contracts.find(isEnterprise)!
    acceptContract(state, offer.id)
    const staleBefore = interest(state.products[0], state.day)
    expect(staleBefore).toBeLessThan(1)
    const project = state.offices[0].project!
    project.progress = { ...project.target }
    const money = state.money
    const reputation = state.reputation
    advance(state, 1)
    expect(state.offices[0].project).toBeNull()
    expect(state.money).toBeGreaterThan(money)
    expect(state.reputation).toBeGreaterThan(reputation)
    expect(state.products[0].updates).toHaveLength(1)
    expect(interest(state.products[0], state.day)).toBe(1)
    expect(drainEvents(state).some((e) => e.type === 'notice' && e.text.includes('fresh again'))).toBe(true)
  })

  it('survive a save', () => {
    const state = enterpriseState()
    contractsDay(state)
    const loaded = deserialize(serialize(state))!
    expect(loaded.contracts.find(isEnterprise)!.productId).toBe(30)
    expect(loaded.nextEnterpriseDay).toBe(state.nextEnterpriseDay)
    acceptContract(state, state.contracts.find(isEnterprise)!.id)
    expect(deserialize(serialize(state))!.offices[0].project!.contract!.productId).toBe(30)
  })
})

describe('licensing', () => {
  const licensable = () => {
    const state = makeState(team())
    state.offices[0].kind = 'office'
    state.day = 800
    state.research.done.push(LICENSING_RESEARCH)
    state.products.push(makeProduct({ id: 40, name: 'Giant', size: 'flagship', releaseDay: 700, updates: [{ day: 790 }], users: 50_000, reach: 50_000 }))
    return state
  }

  it('needs the research, a Flagship and a free licence', () => {
    const state = licensable()
    const product = state.products[0]
    state.research.done = []
    expect(licenseBlocker(state, product)).toBe('Research the Licensing programme first')
    state.research.done.push(LICENSING_RESEARCH)
    product.size = 'large'
    expect(licenseBlocker(state, product)).toBe('Only a Flagship can be licensed')
    product.size = 'flagship'
    expect(licenseBlocker(state, product)).toBeNull()
    expect(setLicensed(state, 40, true).ok).toBe(true)
    expect(licenseBlocker(state, product)).toBe('Already licensed')
    for (let i = 0; i < LICENSE_LIMIT; i++) state.products.push(makeProduct({ id: 50 + i, size: 'flagship', licensed: true }))
    expect(licensedCount(state)).toBeGreaterThan(LICENSE_LIMIT - 1)
    state.products[0].licensed = undefined
    expect(setLicensed(state, 40, true).ok).toBe(false)
  })

  it('pays a share of the product’s income on top while it is fresh', () => {
    const state = licensable()
    const product = state.products[0]
    const own = productRevenue(product)
    expect(licenseIncome(state, product)).toBe(0)
    setLicensed(state, 40, true)
    expect(licenseIncome(state, product)).toBeCloseTo(own * LICENSE_SHARE, 6)
    expect(dailyIncome(state)).toBeCloseTo(own + own * LICENSE_SHARE, 6)
  })

  it('shrinks as the product goes stale or buggy', () => {
    const state = licensable()
    const product = state.products[0]
    setLicensed(state, 40, true)
    const fresh = licenseIncome(state, product)
    state.day += 2000
    expect(licenseIncome(state, product)).toBeLessThan(fresh / 2)
    state.day = 800
    product.bugs = 5000
    expect(licenseIncome(state, product)).toBeLessThan(fresh / 2)
  })

  it('lands in the bank and the product’s total each day', () => {
    const state = licensable()
    state.products[0].users = 50_000
    setLicensed(state, 40, true)
    const money = state.money
    const total = state.products[0].totalRevenue
    advance(state, 1)
    const earned = state.products[0].totalRevenue - total
    expect(earned).toBeGreaterThan(productRevenue(state.products[0]) * 0.9)
    expect(state.money).toBeGreaterThan(money - 1000)
  })

  it('can be ended, and survives a save', () => {
    const state = licensable()
    expect(setLicensed(state, 40, false)).toEqual({ ok: false, reason: 'Not licensed' })
    expect(setLicensed(state, 404, true).ok).toBe(false)
    setLicensed(state, 40, true)
    expect(deserialize(serialize(state))!.products[0].licensed).toBe(true)
    expect(setLicensed(state, 40, false).ok).toBe(true)
    expect(state.products[0].licensed).toBeUndefined()
  })
})
