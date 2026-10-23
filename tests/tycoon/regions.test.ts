import { describe, expect, it } from 'vitest'
import { EU_PAY, EU_TYPE_SIZE } from '@/lib/tycoon/data/regions'
import { COMPLIANCE_FEATURE } from '@/lib/tycoon/data/regions'
import { EU_OFFICE_COST, EU_WAGE, LAUNCH_ADOPTERS, NEW_OFFICE_COST, REGION_OFFICE_LIMIT, RIVAL_ABROAD } from '@/lib/tycoon/sim/balance'
import { generateEmployee, hire, hiringOffice, refreshCandidates, salaryFor, salaryOf } from '@/lib/tycoon/sim/hiring'
import { localiseBlocker } from '@/lib/tycoon/sim/lifecycle'
import { floorOf, hasEuropeOffice, newOfficeCost, officeName, officesIn, openOffice, openOfficeBlocker, openableRegions, regionOf, transfer } from '@/lib/tycoon/sim/offices'
import { euGain, startLocalisation, shipProject } from '@/lib/tycoon/sim/project'
import {
  marketCrowding,
  marketKey,
  marketWeights,
  productRevenue,
  reachIn,
  revenueForUsers,
  saturate,
  targetUsers,
  targetUsersIn,
  usersIn,
} from '@/lib/tycoon/sim/products'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { advance, drainEvents } from '@/lib/tycoon/sim/tick'
import { makeEmployee, makeProduct, makeState } from './helpers'

const team = () => [makeEmployee(1, { design: 60, engineering: 60, qa: 60 }), makeEmployee(2, { design: 60, engineering: 60, qa: 60 })]

/** An established studio with its European office open. */
function withEurope() {
  const state = makeState(team())
  state.offices[0].kind = 'office'
  state.stage = 4
  state.money = 5_000_000
  state.day = 800
  openOffice(state)
  return state
}

describe('offices in two regions', () => {
  it('start in the US; Europe is a building of its own, offered first, and costs much more', () => {
    const state = makeState(team())
    state.offices[0].kind = 'office'
    state.stage = 4
    state.money = 5_000_000
    expect(regionOf(state.offices[0])).toBe('us')
    expect(openableRegions(state)).toEqual(['eu', 'us'])
    expect(newOfficeCost(state, 'us')).toBe(NEW_OFFICE_COST)
    expect(EU_OFFICE_COST).toBeGreaterThan(NEW_OFFICE_COST * 2)
    const money = state.money
    expect(openOffice(state).ok).toBe(true)
    expect(state.money).toBe(money - EU_OFFICE_COST)
    expect(state.offices[1].region).toBe('eu')
    expect(hasEuropeOffice(state)).toBe(true)
  })

  it('grow each building floor by floor, up to its limit', () => {
    const state = withEurope()
    state.money = 1e9
    expect(openableRegions(state).sort()).toEqual(['eu', 'us'])
    while (officesIn(state, 'us').length < REGION_OFFICE_LIMIT) expect(openOffice(state, 'us').ok).toBe(true)
    expect(openableRegions(state)).toEqual(['eu'])
    expect(openOfficeBlocker(state, 'us')).toBe(`HQ has all its ${REGION_OFFICE_LIMIT} floors`)
    while (officesIn(state, 'eu').length < REGION_OFFICE_LIMIT) expect(openOffice(state, 'eu').ok).toBe(true)
    expect(officesIn(state, 'eu')).toHaveLength(REGION_OFFICE_LIMIT)
    expect(openOfficeBlocker(state)).toBe('Both buildings are full')
  })

  it('are named for the building and, once it has more than one, the floor', () => {
    const state = withEurope()
    expect(state.offices.map((o) => officeName(state, o))).toEqual(['HQ', 'Europe'])
    openOffice(state, 'us')
    openOffice(state, 'eu')
    expect(state.offices.map((o) => officeName(state, o))).toEqual(['HQ 1', 'Europe 1', 'HQ 2', 'Europe 2'])
    expect(state.offices.map((o) => floorOf(state, o))).toEqual([1, 1, 2, 2])
  })

  it('keep people in their region: a move across is refused, working on the other team is not', () => {
    const state = withEurope()
    const result = transfer(state, 1, state.offices[1].id)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/other region/)
    expect(state.employees[0].officeId).toBe(state.offices[0].id)
  })

  it('load as US offices from an older save', () => {
    const state = makeState(team())
    const raw = JSON.parse(serialize(state))
    delete raw.offices[0].region
    const loaded = deserialize(JSON.stringify(raw))!
    expect(regionOf(loaded.offices[0])).toBe('us')
  })
})

describe('hiring in two regions', () => {
  it('has a US pool, and a European one once there is an office to hire into', () => {
    const state = makeState(team())
    refreshCandidates(state)
    expect(state.candidates.every((c) => (c.region ?? 'us') === 'us')).toBe(true)
    const us = state.candidates.length
    const eu = withEurope()
    refreshCandidates(eu)
    expect(eu.candidates.length).toBe(us * 2)
    expect(eu.candidates.filter((c) => c.region === 'eu')).toHaveLength(us)
  })

  it('pays people in Europe a little less', () => {
    const skills = { design: 40, engineering: 60, qa: 30 }
    expect(salaryFor(skills, 'none', 1, 0, 1, 0, 'eu')).toBeLessThan(salaryFor(skills, 'none', 1, 0, 1, 0, 'us'))
    expect(salaryFor(skills, 'none', 1, 0, 1, 0, 'eu')).toBeGreaterThan(salaryFor(skills, 'none', 1, 0, 1, 0, 'us') * (EU_WAGE - 0.05))
    const state = makeState()
    const person = generateEmployee(state, 'developer', 'eu')
    expect(person.region).toBe('eu')
    expect(salaryOf(person, 0)).toBe(person.salary)
    const same = { ...person, region: undefined }
    expect(salaryOf(same, 0)).toBeGreaterThan(person.salary)
  })

  it('puts a European hire in a European office, and a US hire in a US one, whatever office was asked for', () => {
    const state = withEurope()
    refreshCandidates(state)
    const euCandidate = state.candidates.find((c) => c.region === 'eu')!
    expect(hire(state, euCandidate.id, state.offices[0].id).ok).toBe(true)
    expect(state.employees.find((e) => e.id === euCandidate.id)!.officeId).toBe(state.offices[1].id)
    const usCandidate = state.candidates.find((c) => (c.region ?? 'us') === 'us')!
    expect(hire(state, usCandidate.id, state.offices[1].id).ok).toBe(true)
    expect(state.employees.find((e) => e.id === usCandidate.id)!.officeId).toBe(state.offices[0].id)
    expect(hiringOffice(state, undefined, 'eu')!.region).toBe('eu')
  })

  it('cannot hire a European candidate with no European desk free', () => {
    const state = withEurope()
    refreshCandidates(state)
    const euCandidate = state.candidates.find((c) => c.region === 'eu')!
    state.offices[1].kind = 'garage'
    for (let i = 0; i < 4; i++) state.employees.push({ ...makeEmployee(50 + i), officeId: state.offices[1].id })
    expect(hire(state, euCandidate.id).ok).toBe(false)
  })
})

describe('markets in two regions', () => {
  const live = (over = {}) => makeProduct({ id: 70, reach: 20_000, users: 20_000, releaseDay: 790, ...over })

  it('are the US only for a product that has not been localised', () => {
    const product = live()
    expect(reachIn(product, 'us')).toBe(20_000)
    expect(reachIn(product, 'eu')).toBe(0)
    expect(usersIn(product, 'us')).toBe(20_000)
    expect(usersIn(product, 'eu')).toBe(0)
  })

  it('split a localised product’s reach and users between them', () => {
    const product = live({ euShare: 0.25, euUsers: 3000 })
    expect(reachIn(product, 'eu')).toBeCloseTo(5000, 6)
    expect(reachIn(product, 'us')).toBeCloseTo(15000, 6)
    expect(usersIn(product, 'eu')).toBe(3000)
    expect(usersIn(product, 'us')).toBe(17_000)
  })

  it('have a size of their own: Europe is a smaller market for each type', () => {
    expect(saturate('web_app', 1e9, 'eu')).toBeCloseTo(saturate('web_app', 1e9, 'us') * EU_TYPE_SIZE.web_app, 6)
    expect(saturate('web_app', 100, 'eu')).toBeLessThan(saturate('web_app', 100, 'us') + 1e-9)
  })

  it('have crowding of their own: a crowded US does not crowd Europe', () => {
    const state = withEurope()
    state.products = [live({ id: 71, reach: 90_000, users: 90_000 }), live({ id: 72, reach: 90_000, users: 90_000 })]
    expect(marketCrowding(state, 'web_app', 'us')).toBeGreaterThan(0.3)
    expect(marketCrowding(state, 'web_app', 'eu')).toBe(0)
    expect(marketWeights(state).get(marketKey('web_app', 'eu')) ?? 0).toBe(0)
    state.products[0].euShare = 0.4
    state.products[0].euUsers = 1000
    expect(marketCrowding(state, 'web_app', 'eu')).toBeGreaterThan(0)
  })

  it('weigh a rival in full at home and a little abroad', () => {
    const state = withEurope()
    state.rivals = [{ ...createInitialState(4).rivals[0], id: 900, region: 'eu' }]
    state.rivalProducts = [{ id: 901, rivalId: 900, name: 'Rival', productTypeId: 'web_app', size: 'small', quality: 80, releaseDay: 790, updatedDay: 790, reach: 60_000, users: 60_000, hit: false }]
    const home = marketCrowding(state, 'web_app', 'eu')
    const abroad = marketCrowding(state, 'web_app', 'us')
    expect(home).toBeGreaterThan(abroad)
    expect(abroad).toBeGreaterThan(0)
    expect(abroad / home).toBeLessThan(RIVAL_ABROAD * 2.5)
  })

  it('move a product’s users toward the target in each market on their own', () => {
    const state = withEurope()
    const product = live({ euShare: 0.3, euUsers: 0, users: 14_000 })
    state.products = [product]
    const us = targetUsersIn(state, product, 'us')
    const eu = targetUsersIn(state, product, 'eu')
    expect(eu).toBeGreaterThan(0)
    expect(targetUsers(state, product)).toBeCloseTo(us + eu, 6)
    advance(state, 30)
    expect(usersIn(product, 'eu')).toBeGreaterThan(0)
    expect(product.users).toBeCloseTo(usersIn(product, 'us') + usersIn(product, 'eu'), 6)
  })

  it('pay in Europe a little less per user', () => {
    expect(revenueForUsers('web_app', 1000, undefined, 'eu')).toBeCloseTo(revenueForUsers('web_app', 1000) * EU_PAY, 10)
    const product = live({ euShare: 0.5, euUsers: 10_000 })
    expect(productRevenue(product)).toBeCloseTo(revenueForUsers('web_app', 10_000) + revenueForUsers('web_app', 10_000, undefined, 'eu'), 10)
  })
})

describe('localising a product', () => {
  const ready = () => {
    const state = withEurope()
    state.products = [makeProduct({ id: 70, name: 'Anchor', reach: 20_000, users: 18_000, releaseDay: 500, updates: [{ day: 760 }], featureIds: ['accounts', COMPLIANCE_FEATURE] })]
    return state
  }

  it("needs Europe's data rules met first: the compliance feature", () => {
    const state = ready()
    state.products[0].featureIds = ['accounts']
    expect(localiseBlocker(state, state.offices[0], state.products[0])).toMatch(/data rules/)
  })

  it('needs an office in Europe, and a product that is not already there', () => {
    const state = ready()
    state.offices.splice(1, 1)
    expect(localiseBlocker(state, state.offices[0], state.products[0])).toBe('Needs an office in Europe')
    const eu = ready()
    expect(localiseBlocker(eu, eu.offices[0], eu.products[0])).toBeNull()
    eu.products[0].euShare = 0.2
    expect(localiseBlocker(eu, eu.offices[0], eu.products[0])).toBe('Already in Europe')
  })

  it('is a maintenance-sized project that costs its budget', () => {
    const state = ready()
    const money = state.money
    expect(startLocalisation(state, 70).ok).toBe(true)
    const project = state.offices[0].project!
    expect(project.localises).toBe(true)
    expect(project.kind).toBe('update')
    expect(project.featureIds).toEqual([])
    expect(state.money).toBeLessThan(money)
    expect(startLocalisation(state, 70).ok).toBe(false)
  })

  it('opens the market on shipping: reach grows, users arrive as a launch’s do', () => {
    const state = ready()
    const product = state.products[0]
    const before = product.reach
    startLocalisation(state, 70)
    const project = state.offices[0].project!
    project.progress = { ...project.target }
    expect(shipProject(state).ok).toBe(true)
    expect(product.euShare).toBeGreaterThan(0)
    expect(product.euShare).toBeLessThan(1)
    expect(product.reach).toBeGreaterThan(before)
    expect(reachIn(product, 'us')).toBeGreaterThanOrEqual(before * 0.99)
    expect(product.euUsers).toBeCloseTo(reachIn(product, 'eu') * LAUNCH_ADOPTERS, 6)
    expect(product.users).toBeGreaterThan(18_000)
    expect(drainEvents(state).some((e) => e.type === 'notice' && e.text.includes('Europe'))).toBe(true)
  })

  it('gains what Europe is worth for that type and those features', () => {
    const product = makeProduct({ featureIds: [], productTypeId: 'web_app' })
    expect(euGain(product)).toBeCloseTo(EU_TYPE_SIZE.web_app, 6)
    const private_ = makeProduct({ featureIds: ['encryption'], productTypeId: 'saas_platform' })
    const plain = makeProduct({ featureIds: ['api'], productTypeId: 'saas_platform' })
    expect(euGain(private_) / euGain(plain)).toBeGreaterThan(0.95)
    expect(euGain(makeProduct({ featureIds: ['encryption', 'data_residency'], productTypeId: 'cloud_platform' }))).toBeGreaterThan(euGain(makeProduct({ featureIds: [], productTypeId: 'cloud_platform' })))
  })

  it('survives a save', () => {
    const state = ready()
    state.products[0].euShare = 0.3
    state.products[0].euUsers = 4000
    const loaded = deserialize(serialize(state))!
    expect(loaded.products[0].euShare).toBe(0.3)
    expect(loaded.products[0].euUsers).toBe(4000)
    startLocalisation(state, 70)
  })
})
