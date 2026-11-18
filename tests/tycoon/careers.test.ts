import { describe, expect, it } from 'vitest'
import {
  LEAD_FREE_TEAM,
  LEAD_MORALE,
  LEAD_SPEED,
  LEVELS,
  MOVE_ON_YEARS,
  NO_LEAD_SPEED,
  OVERLOOKED_MORALE,
  PROMOTION_PATIENCE_DAYS,
} from '@/lib/tycoon/sim/balance'
import { careerDay, levelForSkill, needsLead, promote, promotionBlocker, teamSpeed, title } from '@/lib/tycoon/sim/careers'
import { generateEmployee, salaryFor } from '@/lib/tycoon/sim/hiring'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { moraleTarget } from '@/lib/tycoon/sim/staff'
import { drainEvents } from '@/lib/tycoon/sim/tick'
import { teamRate } from '@/lib/tycoon/sim/work'
import { createStore } from '@/lib/tycoon/store'
import { makeEmployee, makeState } from './helpers'

/** A developer with this much engineering, at `level`, who reached it on day 0. */
const dev = (id: number, engineering: number, level = 1) => ({ ...makeEmployee(id, { engineering, design: 20, qa: 20 }, 2000), level })

describe('levels', () => {
  it('start new hires at the level their skill earns, never above Senior', () => {
    expect(levelForSkill(30, 2)).toBe(0)
    expect(levelForSkill(LEVELS[1].skill, 2)).toBe(1)
    expect(levelForSkill(99, 2)).toBe(2)
    const state = makeState()
    for (let i = 0; i < 30; i++) {
      const person = generateEmployee(state, 'developer')
      expect(person.level).toBe(levelForSkill(person.skills.engineering, 2))
      expect(person.salary).toBe(salaryFor(person.skills, person.trait, person.level))
    }
  })

  it('pay more and work faster the higher they go', () => {
    const skills = { design: 20, engineering: 60, qa: 20 }
    for (let level = 1; level < LEVELS.length; level++) {
      expect(salaryFor(skills, '', level)).toBeGreaterThanOrEqual(salaryFor(skills, '', level - 1))
    }
    const junior = makeState([dev(1, 60, 0)])
    const senior = makeState([dev(1, 60, 2)])
    expect(teamRate(senior).engineering).toBeGreaterThan(teamRate(junior).engineering)
    expect(title(senior.employees[0])).toBe('Senior developer')
  })
})

describe('promotions', () => {
  it('need the skill and time at the current level', () => {
    const state = makeState([dev(1, LEVELS[2].skill - 1)])
    state.day = 1000
    expect(promotionBlocker(state, state.employees[0])).toBe(`Needs ${LEVELS[2].skill} engineering skill`)
    state.employees[0].skills.engineering = LEVELS[2].skill
    state.day = 10
    expect(promotionBlocker(state, state.employees[0])).toBe(`Ready in ${LEVELS[2].days - 10} days`)
    state.day = LEVELS[2].days
    expect(promotionBlocker(state, state.employees[0])).toBeNull()
    state.employees[0].level = 3
    expect(promotionBlocker(state, state.employees[0])).toBe('Already a Lead')
  })

  it('are announced once, raise the salary, and cheer the person up', () => {
    const state = makeState([dev(1, 70)])
    state.day = 400
    careerDay(state)
    careerDay(state)
    const notices = drainEvents(state).filter((e) => e.type === 'notice' && e.text.includes('ready to be promoted'))
    expect(notices).toHaveLength(1)
    expect(state.employees[0].readySince).toBe(400)

    const person = state.employees[0]
    const salary = person.salary
    const morale = person.morale
    expect(promote(state, 1).ok).toBe(true)
    expect(person.level).toBe(2)
    expect(person.levelDay).toBe(400)
    expect(person.readySince).toBeNull()
    expect(person.salary).toBe(salaryFor(person.skills, person.trait, 2))
    expect(person.salary).not.toBe(salary)
    expect(person.morale).toBeGreaterThan(morale)
    expect(promote(state, 1).ok).toBe(false) // just promoted: has to earn the next one
    expect(promote(state, 999).ok).toBe(false)
  })

  it('hurt morale when someone who earned one is kept waiting too long', () => {
    const state = makeState([dev(1, 70)])
    state.day = 400
    careerDay(state)
    const patient = moraleTarget(state, state.employees[0])
    state.day += PROMOTION_PATIENCE_DAYS + 1
    expect(moraleTarget(state, state.employees[0])).toBe(patient - OVERLOOKED_MORALE)
  })

  it('go through the store', () => {
    const state = makeState([dev(1, 70)])
    state.day = 400
    const store = createStore(state, 0)
    expect(store.promoteEmployee(1).ok).toBe(true)
    expect(store.toasts.value.some((t) => t.text.includes('now a senior developer'))).toBe(true)
  })
})

describe('leads', () => {
  it('slow a big team without one, and speed up and cheer a team that has one', () => {
    const team = Array.from({ length: LEAD_FREE_TEAM }, (_, i) => dev(i + 1, 50))
    const small = makeState(team)
    expect(teamSpeed(small, small.offices[0])).toBe(1)
    expect(needsLead(small, small.offices[0])).toBe(false)

    const big = makeState([...team, dev(99, 50)])
    big.offices[0].kind = 'office'
    expect(needsLead(big, big.offices[0])).toBe(true)
    expect(teamSpeed(big, big.offices[0])).toBe(NO_LEAD_SPEED)
    const before = moraleTarget(big, big.employees[0])

    big.employees[4].level = 3
    expect(needsLead(big, big.offices[0])).toBe(false)
    expect(teamSpeed(big, big.offices[0])).toBe(LEAD_SPEED)
    expect(moraleTarget(big, big.employees[0])).toBe(before + LEAD_MORALE)
  })
})

describe('moving on', () => {
  it('happens now and then to people who have been here for years, never to newcomers', () => {
    const state = makeState(Array.from({ length: 40 }, (_, i) => dev(i + 1, 50)))
    state.day = 200
    for (let i = 0; i < 400; i++) careerDay(state)
    expect(state.employees).toHaveLength(40)

    state.day = MOVE_ON_YEARS * 360 + 10
    for (let i = 0; i < 400; i++) careerDay(state)
    expect(state.employees.length).toBeLessThan(40)
    expect(drainEvents(state).some((e) => e.type === 'notice' && e.text.includes('start something of their own'))).toBe(true)
  })
})

describe('saving careers', () => {
  it('keeps levels and dates, and rejects a level that does not exist', () => {
    const state = makeState([dev(1, 70, 2)])
    state.employees[0].readySince = 5
    expect(deserialize(serialize(state))!.employees).toEqual(state.employees)
    const raw = JSON.parse(serialize(state))
    raw.employees[0].level = 9
    expect(deserialize(JSON.stringify(raw))).toBeNull()
  })
})
