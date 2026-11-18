import { describe, expect, it } from 'vitest'
import { CAFE_EVENTS } from '@/lib/tycoon/data/events'
import { STAGES } from '@/lib/tycoon/data/stages'
import { CAFE_JOBS, GARAGE_DEPOSIT, GARAGE_READY_MONEY, OFFICE_KINDS } from '@/lib/tycoon/sim/balance'
import { pmBlocker } from '@/lib/tycoon/sim/careers'
import { monthlyBurn, monthlySalaries } from '@/lib/tycoon/sim/economy'
import { resolveRandomEvent, rollRandomEvent } from '@/lib/tycoon/sim/events'
import { foundingBlocker, foundStudio, rollPersonName, rollStudioName, studioNameOf, you } from '@/lib/tycoon/sim/founding'
import { hire } from '@/lib/tycoon/sim/hiring'
import { inCafe, inGarage, moveOutBlocker, moveToGarage, moveToGarageBlocker, officeName } from '@/lib/tycoon/sim/offices'
import { standings } from '@/lib/tycoon/sim/rivals'
import { checkStage } from '@/lib/tycoon/sim/stages'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { sizeLock } from '@/lib/tycoon/sim/unlocks'

/** A café that has done its jobs and saved up: ready for the garage. */
function readyCafe() {
  const state = createInitialState(4)
  state.contractsDone = CAFE_JOBS
  state.money = GARAGE_READY_MONEY
  return state
}

describe('the café', () => {
  it('is where a run starts: two desks, no rent but the coffee, and nobody paid', () => {
    const state = createInitialState(1)
    expect(inCafe(state)).toBe(true)
    expect(inGarage(state)).toBe(true) // still a small studio, as far as offices and products go
    expect(officeName(state, state.offices[0])).toBe('Café')
    expect(monthlySalaries(state)).toBe(0)
    expect(monthlyBurn(state)).toBe(OFFICE_KINDS.cafe.rent)
    expect(state.employees).toHaveLength(OFFICE_KINDS.cafe.desks)
  })

  it('has no desk for a hire', () => {
    const state = createInitialState(1)
    state.money = 1e6
    expect(hire(state, state.candidates[0]!.id).ok).toBe(false)
  })

  it('only takes on small products', () => {
    const state = createInitialState(1)
    expect(sizeLock(state, 'small')).toBeNull()
    expect(sizeLock(state, 'medium')).toBe('the garage')
  })

  it('moves into the garage once the jobs are done and the money is saved', () => {
    const state = createInitialState(4)
    state.money = GARAGE_READY_MONEY
    expect(moveToGarageBlocker(state)).toContain(`${CAFE_JOBS} jobs`)
    state.contractsDone = CAFE_JOBS
    state.money = GARAGE_READY_MONEY - 1
    expect(moveToGarageBlocker(state)).toContain('Save')
    expect(moveOutBlocker(state)).toBe('Move into the garage first')
    state.money = GARAGE_READY_MONEY
    expect(moveToGarage(state).ok).toBe(true)
    expect(state.offices[0].kind).toBe('garage')
    expect(state.money).toBe(GARAGE_READY_MONEY - GARAGE_DEPOSIT)
    expect(moveToGarage(state).ok).toBe(false)
  })

  it('pays the founders once they have moved, and opens the garage chapter', () => {
    const state = readyCafe()
    moveToGarage(state)
    expect(monthlySalaries(state)).toBeGreaterThan(0)
    checkStage(state)
    expect(STAGES[state.stage]!.id).toBe('garage')
    expect(state.events).toContainEqual({ type: 'stage', stage: state.stage })
  })

  it('makes room for two more people in the garage', () => {
    const state = readyCafe()
    moveToGarage(state)
    state.money = 1e6
    expect(hire(state, state.candidates[0]!.id).ok).toBe(true)
    expect(hire(state, state.candidates[0]!.id).ok).toBe(true)
    expect(hire(state, state.candidates[0]!.id).ok).toBe(false)
  })
})

describe('café events', () => {
  it('come sooner and from their own list while at the café', () => {
    const state = createInitialState(9)
    const offered: string[] = []
    for (let day = 1; day <= 120; day++) {
      state.day = day
      rollRandomEvent(state)
      if (state.pendingEvent) {
        offered.push(state.pendingEvent.id)
        state.pendingEvent = null
      }
    }
    expect(offered.length).toBeGreaterThanOrEqual(3)
    expect(offered.every((id) => CAFE_EVENTS.some((e) => e.id === id))).toBe(true)
  })

  it('the barista passes on a lead: one more job on the board', () => {
    const state = createInitialState(9)
    const before = state.contracts.length
    state.pendingEvent = { id: 'cafe_lead', data: {} }
    expect(resolveRandomEvent(state, 0).ok).toBe(true)
    expect(state.contracts).toHaveLength(before + 1)
    expect(state.contracts.at(-1)!.pay).toBeGreaterThan(0)
  })

  it('a curious regular is insight', () => {
    const state = createInitialState(9)
    state.pendingEvent = { id: 'cafe_regular', data: {} }
    resolveRandomEvent(state, 0)
    expect(state.insight).toBe(20)
  })
})

describe('founding the studio', () => {
  it('names you, the founder analyst, and the studio, which the ranking then shows', () => {
    const state = createInitialState(2)
    expect(foundStudio(state, '  Ada Byron ', 'Tiny Lamp')).toEqual({ ok: true })
    expect(you(state)!.name).toBe('Ada Byron')
    expect(you(state)!.role).toBe('analyst')
    expect(studioNameOf(state)).toBe('Tiny Lamp')
    expect(standings(state).find((s) => s.id === 0)!.name).toBe('Tiny Lamp')
  })

  it('refuses empty names, long ones, and a rival studio’s name', () => {
    const state = createInitialState(2)
    expect(foundingBlocker(state, ' ', 'Studio')).toBe('Give yourself a name')
    expect(foundingBlocker(state, 'Ada', '')).toBe('Give the studio a name')
    expect(foundingBlocker(state, 'A'.repeat(40), 'Studio')).toContain('at most')
    expect(foundingBlocker(state, 'Ada', state.rivals[0]!.name.toUpperCase())).toContain("rival's name")
    expect(foundStudio(state, '', 'Studio').ok).toBe(false)
  })

  it('rolls names with its own dice, never a taken studio name', () => {
    const seq = (values: number[]) => () => values.shift() ?? 0
    expect(rollPersonName(seq([0, 0]))).toBe(rollPersonName(seq([0, 0])))
    const first = rollStudioName([], seq([0, 0]))
    expect(rollStudioName([first], seq([0, 0, 0.5, 0.5]))).not.toBe(first)
  })

  it('lets you become a product manager without the research', () => {
    const state = createInitialState(2)
    const founder = you(state)!
    founder.level = 2
    founder.analysis = 90
    founder.levelDay = -1000
    expect(pmBlocker(state, founder)).toBeNull()
  })
})

describe('saves from before the café', () => {
  it('move up a stage, since the café is the first one now', () => {
    const state = createInitialState(3)
    state.offices[0].kind = 'garage'
    state.stage = 2
    const old = JSON.parse(serialize(state))
    old.version = 5
    old.stage = 1
    delete old.studioName
    const loaded = deserialize(JSON.stringify(old))!
    expect(loaded.stage).toBe(2)
    expect(STAGES[loaded.stage]!.id).toBe('indie')
    expect(studioNameOf(loaded)).toBe('Your studio')
  })
})
