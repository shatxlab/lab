import { describe, expect, it } from 'vitest'
import { STAGES } from '@/lib/tycoon/data/stages'
import {
  CONTRACT_ABANDON_REPUTATION,
  CONTRACT_BOARD,
  CONTRACT_DEPOSIT,
  CONTRACT_LATE_PAY,
  CONTRACT_NEW_MAX_DAYS,
  CONTRACT_OFFERS,
  EU_OFFICE_COST,
  HIT_MAX_CHANCE,
  HIT_REACH,
  MAX_OFFICES,
  MOVE_OUT_COST,
  OFFICE_KINDS,
} from '@/lib/tycoon/sim/balance'
import { abandonContract, acceptContract, contractsDay, payPerPoint, refreshContracts } from '@/lib/tycoon/sim/contracts'
import { estimateDays } from '@/lib/tycoon/sim/work'
import { monthlyBurn } from '@/lib/tycoon/sim/economy'
import { hire } from '@/lib/tycoon/sim/hiring'
import { deskCount, moveOut, moveOutBlocker, newOfficeCost, openOffice, openOfficeBlocker, staffOf, transfer } from '@/lib/tycoon/sim/offices'
import { estimateReach } from '@/lib/tycoon/sim/lifecycle'
import { hitBreakdown, hitChance, projectQuality, shipProject, startProject } from '@/lib/tycoon/sim/project'
import { checkStage, stageComplete } from '@/lib/tycoon/sim/stages'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { advanceDay, drainEvents } from '@/lib/tycoon/sim/tick'
import { DISCIPLINES, type GameState } from '@/lib/tycoon/sim/types'
import { workDay } from '@/lib/tycoon/sim/work'
import { createStore } from '@/lib/tycoon/store'
import { makeEmployee, makeProduct, makeState } from './helpers'

const finish = (state: GameState, office = 0) => {
  const project = state.offices[office].project!
  for (const d of DISCIPLINES) project.progress[d] = project.target[d]
}

/** A studio of two good all-rounders, out of the garage and established, with money to spend. */
function grownStudio(): GameState {
  const state = makeState([makeEmployee(1, { design: 50, engineering: 50, qa: 50 }), makeEmployee(2, { design: 50, engineering: 50, qa: 50 })])
  state.offices[0].kind = 'office'
  state.stage = 3
  state.money = 1_000_000
  return state
}

describe('the garage and offices', () => {
  it('start the studio in a four-desk garage', () => {
    const state = makeState()
    expect(state.offices).toHaveLength(1)
    expect(state.offices[0].kind).toBe('garage')
    expect(deskCount(state)).toBe(OFFICE_KINDS.garage.desks)
  })

  it('let the studio move out once it is an indie studio and can pay for it', () => {
    const state = makeState([makeEmployee(1)])
    state.money = MOVE_OUT_COST
    expect(moveOutBlocker(state)).toBe('The studio is not ready yet')
    state.stage = 1
    expect(moveOutBlocker(state)).toBe('Have a breakout hit first')
    state.signatureId = 1
    expect(moveOut(state).ok).toBe(true)
    expect(state.money).toBe(0)
    expect(state.offices[0].kind).toBe('office')
    expect(deskCount(state)).toBe(OFFICE_KINDS.office.desks)
    expect(monthlyBurn(state)).toBe(state.employees[0].salary + OFFICE_KINDS.office.rent)
    expect(moveOutBlocker(state)).toBe('Already in an office')
  })

  it('open more offices later, each dearer than the last, up to the limit', () => {
    const state = grownStudio()
    state.stage = 2
    expect(openOfficeBlocker(state)).toBe('The studio is not ready yet')
    state.stage = 3
    state.money = 5_000_000
    expect(newOfficeCost(state)).toBe(EU_OFFICE_COST)
    expect(openOffice(state).ok).toBe(true)
    const third = newOfficeCost(state)
    expect(openOffice(state).ok).toBe(true)
    expect(newOfficeCost(state)).toBeGreaterThan(third)
    while (openOffice(state).ok);
    expect(state.offices).toHaveLength(MAX_OFFICES)
    expect(new Set(state.offices.map((o) => o.theme)).size).toBe(MAX_OFFICES)
    expect(openOfficeBlocker(state)).toBe('No more offices available')

    const garage = grownStudio()
    garage.offices[0].kind = 'garage'
    expect(openOfficeBlocker(garage)).toBe('Move out of the garage first')
  })

  it('run a project per office at the same time, each with its own team', () => {
    const state = grownStudio()
    openOffice(state)
    state.offices[1].region = 'us' // people can only move within a region
    const [hq, second] = state.offices
    expect(startProject(state, 'web_app', [], 'small', second.id)).toEqual({ ok: false, reason: 'Hire someone first' })
    expect(transfer(state, 2, second.id).ok).toBe(true)
    expect(transfer(state, 2, second.id)).toEqual({ ok: false, reason: 'Already there' })
    expect(startProject(state, 'web_app', [], 'small', hq.id).ok).toBe(true)
    expect(startProject(state, 'mobile_app', [], 'small', second.id).ok).toBe(false) // mobile needs reputation
    expect(startProject(state, 'web_app', ['accounts'], 'small', second.id).ok).toBe(true)

    state.dayWork = []
    workDay(state)
    expect(DISCIPLINES.some((d) => hq.project!.progress[d] > 0)).toBe(true)
    expect(DISCIPLINES.some((d) => second.project!.progress[d] > 0)).toBe(true)
    expect(state.dayWork.map((w) => w.employeeId).sort()).toEqual([1, 2])

    finish(state, 1)
    expect(shipProject(state, undefined, second.id).ok).toBe(true)
    expect(second.project).toBeNull()
    expect(hq.project).not.toBeNull()
  })

  it('hire into the chosen office, or the first with room', () => {
    const state = grownStudio()
    openOffice(state)
    state.offices[1].region = 'us'
    const second = state.offices[1]
    expect(hire(state, state.candidates[0].id, second.id).ok).toBe(true)
    expect(staffOf(state, second)).toHaveLength(1)
    state.offices[0].kind = 'garage' // four desks, two taken
    while (state.candidates.length > 0 && hire(state, state.candidates[0].id, state.offices[0].id).ok);
    expect(staffOf(state, state.offices[0])).toHaveLength(OFFICE_KINDS.garage.desks)
    expect(staffOf(state, second).length).toBeGreaterThan(1) // the overflow went next door
  })

  it('refuse a transfer into a full office', () => {
    const state = makeState([makeEmployee(1), makeEmployee(2), makeEmployee(3), makeEmployee(4)])
    state.offices[0].kind = 'office'
    state.stage = 3
    state.money = 1_000_000
    openOffice(state)
    state.offices[1].region = 'us'
    state.offices[1].kind = 'garage'
    for (const id of [1, 2, 3, 4]) transfer(state, id, state.offices[1].id)
    state.employees.push({ ...makeEmployee(5), officeId: state.offices[0].id })
    expect(transfer(state, 5, state.offices[1].id)).toEqual({ ok: false, reason: 'No free desk there' })
  })

  it('save and load with every office, its project and who works where', () => {
    const state = grownStudio()
    openOffice(state)
    transfer(state, 2, state.offices[1].id)
    startProject(state, 'web_app', [], 'small', state.offices[1].id)
    const restored = deserialize(serialize(state))!
    expect(restored.offices).toEqual(state.offices)
    expect(restored.employees.map((e) => e.officeId)).toEqual(state.employees.map((e) => e.officeId))
  })
})

describe('client contracts', () => {
  it('are on offer from the start, sized to the studio', () => {
    const state = makeState([makeEmployee(1, { design: 40, engineering: 40, qa: 40 })])
    refreshContracts(state)
    expect(state.contracts).toHaveLength(CONTRACT_OFFERS)
    const small = state.contracts.map((c) => DISCIPLINES.reduce((sum, d) => sum + c.target[d], 0))
    for (let i = 2; i <= 6; i++) state.employees.push({ ...makeEmployee(i, { design: 40, engineering: 40, qa: 40 }) })
    state.offices[0].kind = 'office'
    refreshContracts(state)
    const big = state.contracts.map((c) => DISCIPLINES.reduce((sum, d) => sum + c.target[d], 0))
    expect(Math.max(...big)).toBeGreaterThan(Math.max(...small))
    for (const offer of state.contracts) expect(offer.days).toBeGreaterThan(0)

    const before = state.contracts.map((c) => c.id)
    for (let i = 0; i < 40; i++) advanceDay(state)
    expect(state.contracts.map((c) => c.id)).not.toEqual(before)
  })

  it('are sized by the slowest discipline, so every offer can be finished in time', () => {
    const lopsided = makeState([makeEmployee(1, { design: 5, engineering: 70, qa: 10 }), makeEmployee(2, { design: 5, engineering: 60, qa: 10 })])
    for (let round = 0; round < 12; round++) {
      refreshContracts(lopsided)
      for (const offer of lopsided.contracts) expect(estimateDays(lopsided, offer.target), `${offer.title}`).toBeLessThanOrEqual(offer.days)
    }
  })

  it('suit the team: an engineering-only team is not offered a brand refresh', () => {
    const state = makeState([makeEmployee(1, { design: 0, engineering: 80, qa: 20 })])
    const titles = new Set<string>()
    for (let round = 0; round < 40; round++) {
      refreshContracts(state)
      for (const offer of state.contracts) titles.add(offer.title)
    }
    expect(titles.has('a brand refresh')).toBe(false)
    expect(titles.size).toBeGreaterThan(1)
  })

  it('come to the board one at a time, up to a limit, and go elsewhere after a while', () => {
    const state = makeState([makeEmployee(1, { design: 40, engineering: 40, qa: 40 })])
    state.contracts = []
    state.nextOfferDay = 0
    const sizes: number[] = []
    for (let i = 0; i < 120; i++) {
      state.day += 1
      contractsDay(state)
      sizes.push(state.contracts.length)
    }
    expect(Math.max(...sizes)).toBe(CONTRACT_BOARD)
    expect(sizes.findIndex((n) => n > 0)).toBeLessThanOrEqual(CONTRACT_NEW_MAX_DAYS)
    // Never more than one new job a day, and a gap of at least a week between them.
    for (let i = 1; i < sizes.length; i++) expect(sizes[i] - sizes[i - 1]).toBeLessThanOrEqual(1)

    const old = state.contracts[0]
    state.day = old.expiresDay! + 1
    state.nextOfferDay = state.day + 100
    contractsDay(state)
    expect(state.contracts.some((c) => c.id === old.id)).toBe(false)
  })

  it('an older save with jobs that never expire still loads and works', () => {
    const state = makeState([makeEmployee(1)])
    delete state.contracts[0].expiresDay
    delete state.nextOfferDay
    const restored = deserialize(serialize(state))!
    contractsDay(restored)
    expect(restored.contracts.some((c) => c.id === state.contracts[0].id)).toBe(true)
  })

  it('pay more per point to a studio with a name', () => {
    const state = makeState()
    const unknown = payPerPoint(state)
    state.reputation = 80
    expect(payPerPoint(state)).toBeGreaterThan(unknown * 1.5)
  })

  it('pay on delivery, on time in full, and count toward the journey', () => {
    const state = makeState([makeEmployee(1, { design: 50, engineering: 50, qa: 50 })])
    const offer = state.contracts[0]
    const before = state.money
    expect(acceptContract(state, offer.id).ok).toBe(true)
    expect(state.money).toBe(before + Math.round(offer.pay * CONTRACT_DEPOSIT)) // the deposit
    expect(state.contracts.some((c) => c.id === offer.id)).toBe(false)
    const project = state.offices[0].project!
    expect(project).toMatchObject({ kind: 'contract', contract: { client: offer.client, pay: offer.pay, dueDay: state.day + offer.days, deposit: Math.round(offer.pay * CONTRACT_DEPOSIT) } })
    expect(shipProject(state)).toEqual({ ok: false, reason: 'Client work has nothing to ship' })

    const money = state.money
    finish(state)
    workDay(state)
    expect(state.offices[0].project).toBeNull()
    // Half came when the job was taken; the rest comes now.
    expect(state.money).toBe(money + offer.pay - Math.round(offer.pay * CONTRACT_DEPOSIT))
    expect(state.contractsDone).toBe(1)
    expect(drainEvents(state).some((e) => e.type === 'notice' && e.text.startsWith(`Delivered to ${offer.client}`))).toBe(true)
  })

  it('pay less when late, with a warning the day the deadline passes', () => {
    const state = makeState([makeEmployee(1, { design: 50, engineering: 50, qa: 50 })])
    const offer = state.contracts[0]
    acceptContract(state, offer.id)
    state.day = state.offices[0].project!.contract!.dueDay + 1
    workDay(state)
    expect(drainEvents(state).some((e) => e.type === 'notice' && e.text.includes('late'))).toBe(true)
    const money = state.money
    finish(state)
    workDay(state)
    // The late total is half the price, and the client has already advanced that much.
    expect(state.money).toBe(money + Math.max(0, Math.round(offer.pay * CONTRACT_LATE_PAY) - Math.round(offer.pay * CONTRACT_DEPOSIT)))
  })

  it('cost reputation and give the deposit back when dropped', () => {
    const state = makeState([makeEmployee(1)])
    state.reputation = 10
    const money = state.money
    acceptContract(state, state.contracts[0].id)
    expect(state.money).toBeGreaterThan(money)
    expect(abandonContract(state).ok).toBe(true)
    expect(state.money).toBe(money)
    expect(state.offices[0].project).toBeNull()
    expect(state.reputation).toBe(10 - CONTRACT_ABANDON_REPUTATION)
    expect(abandonContract(state).ok).toBe(false)
  })

  it('stop at the target: there is nothing to polish', () => {
    const state = makeState([makeEmployee(1, { design: 90, engineering: 90, qa: 90 })])
    acceptContract(state, state.contracts[0].id)
    const project = state.offices[0].project!
    for (let i = 0; i < 400 && state.offices[0].project; i++) {
      workDay(state)
      for (const d of DISCIPLINES) expect(project.progress[d]).toBeLessThanOrEqual(project.target[d])
    }
    expect(state.offices[0].project).toBeNull()
  })
})

describe('breakout hits', () => {
  it('explain their chance: the shown factors multiply out to it', () => {
    const state = makeState([makeEmployee(1, { design: 50, engineering: 50, qa: 50 })])
    startProject(state, 'web_app', [])
    const project = state.offices[0].project!
    state.launchesSinceHit = 3
    state.market.web_app = 1.2
    const b = hitBreakdown(state, project, 85, 'medium')
    expect(b.capped).toBe(false)
    expect(b.misses).toBe(3)
    expect(b.chance).toBeCloseTo(b.base * b.quality * b.market * b.buzz, 10)
    expect(b.chance).toBe(hitChance(state, project, 85, 'medium'))
    expect(hitBreakdown(state, project, 60).chance).toBe(0)
    state.launchesSinceHit = 100
    expect(hitBreakdown(state, project, 95, 'large').capped).toBe(true)
  })

  it('need a good product, and get likelier with quality, buzz, a hot market and every miss', () => {
    const state = makeState([makeEmployee(1, { design: 50, engineering: 50, qa: 50 })])
    startProject(state, 'web_app', [])
    const project = state.offices[0].project!
    expect(hitChance(state, project, 69)).toBe(0)
    const base = hitChance(state, project, 80)
    expect(base).toBeGreaterThan(0)
    expect(hitChance(state, project, 95)).toBeGreaterThan(base)
    expect(hitChance(state, project, 80, 'large')).toBeGreaterThan(hitChance(state, project, 80, 'small'))
    state.market.web_app = 1.4
    expect(hitChance(state, project, 80)).toBeGreaterThan(base)
    state.market.web_app = 1
    state.launchesSinceHit = 5
    expect(hitChance(state, project, 80)).toBeGreaterThan(base * 3)
    state.launchesSinceHit = 100
    expect(hitChance(state, project, 100, 'large')).toBe(HIT_MAX_CHANCE)
  })

  it('reach far more people, become the signature product, and reset the odds', () => {
    // Try seeds until a good launch breaks out, then compare it with the same launch that didn't.
    for (let seed = 1; seed < 400; seed++) {
      const state = makeState([makeEmployee(1, { design: 60, engineering: 60, qa: 60 })], seed)
      state.launchesSinceHit = 12
      startProject(state, 'web_app', [])
      for (const d of DISCIPLINES) state.offices[0].project!.progress[d] = state.offices[0].project!.target[d] * 1.3
      const before = structuredClone(state)
      shipProject(state)
      const product = state.products[0]
      if (!product.hit) {
        expect(state.launchesSinceHit).toBe(13)
        continue
      }
      expect(state.signatureId).toBe(product.id)
      expect(state.launchesSinceHit).toBe(0)
      expect(state.events.some((e) => e.type === 'breakout' && e.productId === product.id)).toBe(true)
      // Against the same launch without the luck (give or take the market's few percent of noise).
      const project = before.offices[0].project!
      const ratio = product.reach / estimateReach(before, project, projectQuality(before, project))
      expect(ratio).toBeGreaterThan(HIT_REACH.small * 0.94)
      expect(ratio).toBeLessThan(HIT_REACH.small * 1.06)
      return
    }
    throw new Error('no seed gave a hit')
  })

  it('open the breakout dialog after the result through the store', () => {
    for (let seed = 1; seed < 400; seed++) {
      const state = makeState([makeEmployee(1, { design: 60, engineering: 60, qa: 60 })], seed)
      state.launchesSinceHit = 15
      const store = createStore(state, 0)
      store.startProject('web_app', [])
      for (const d of DISCIPLINES) state.offices[0].project!.progress[d] = state.offices[0].project!.target[d] * 1.3
      store.shipProject()
      if (!state.products[0].hit) continue
      expect(store.dialog.value).toMatchObject({ kind: 'result' })
      store.closeDialog()
      expect(store.dialog.value).toEqual({ kind: 'breakout', productId: state.products[0].id })
      return
    }
    throw new Error('no seed gave a hit')
  })
})

describe('the journey', () => {
  it('starts in the garage and has goals for every stage but the last', () => {
    expect(makeState().stage).toBe(0)
    for (const stage of STAGES) expect(stage.goals.length, stage.id).toBeGreaterThan(0)
  })

  it('never ends the last stage: its goals are marks to chase, not a gate', () => {
    const state = makeState([makeEmployee(1)])
    state.stage = STAGES.length - 1
    state.products = Array.from({ length: 3 }, (_, i) => makeProduct({ id: i + 1, size: 'flagship' }))
    expect(STAGES.at(-1)!.goals.some((g) => g.check(state))).toBe(true)
    expect(stageComplete(state)).toBe(false)
  })

  it('moves on when every goal of the stage is met, once, and says so', () => {
    const state = makeState([makeEmployee(1)])
    expect(stageComplete(state)).toBe(false)
    state.shippedCount = 3
    state.products.push(makeProduct({ users: 5000 }))
    expect(stageComplete(state)).toBe(false) // no client jobs yet
    state.contractsDone = 2
    expect(stageComplete(state)).toBe(false)
    state.contractsDone = 3
    expect(stageComplete(state)).toBe(true)
    checkStage(state)
    expect(state.stage).toBe(1)
    expect(state.events).toContainEqual({ type: 'stage', stage: 1 })
    checkStage(state)
    expect(state.stage).toBe(1) // the indie goals are not met yet
  })

  it('needs the move and a hit to become a breakout studio', () => {
    const state = makeState([makeEmployee(1)])
    state.stage = 1
    state.offices[0].kind = 'office'
    expect(stageComplete(state)).toBe(false)
    state.products.push(makeProduct({ id: 7, hit: true }))
    state.signatureId = 7
    expect(stageComplete(state)).toBe(true)
  })

  it('shows a stage dialog through the store', () => {
    const state = makeState([makeEmployee(1)])
    state.shippedCount = 3
    state.contractsDone = 3
    state.products.push(makeProduct({ users: 5000 }))
    const store = createStore(state, 1)
    for (let i = 0; i < 10 && store.dialog.value === null; i++) store.tick(2000)
    expect(store.dialog.value).toEqual({ kind: 'stage', stage: 1 })
  })
})
