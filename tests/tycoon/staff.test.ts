import { describe, expect, it } from 'vitest'
import { getTrait, isKnownTrait, NO_TRAIT_ID, TRAITS } from '@/lib/tycoon/data/traits'
import {
  MORALE_BASE,
  MORALE_CRUNCH_DAYS,
  MORALE_NEUTRAL,
  MORALE_DEBT_PENALTY,
  OFFICE_UPGRADE_MORALE,
  OUTING_COOLDOWN_DAYS,
  OUTING_MORALE,
  TEAM_MORALE_CAP,
  TRAINING_DAYS,
  TRAINING_MAX_SKILL,
} from '@/lib/tycoon/sim/balance'
import { moveOut } from '@/lib/tycoon/sim/offices'
import { generateEmployee, salaryFor } from '@/lib/tycoon/sim/hiring'
import { adjustMorale, clampMorale, moraleSpeed } from '@/lib/tycoon/sim/morale'
import { shipProject, startProject } from '@/lib/tycoon/sim/project'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import {
  employeeSkillGain,
  employeeSpeed,
  moraleDay,
  moraleFromRelease,
  moraleTarget,
  outingBlocker,
  outingCost,
  startTraining,
  teamOuting,
  trainingCost,
  trainingDay,
  trainingGain,
} from '@/lib/tycoon/sim/staff'
import { advanceDay, drainEvents } from '@/lib/tycoon/sim/tick'
import { DISCIPLINES, type Employee } from '@/lib/tycoon/sim/types'
import { dailyContribution, teamRate, workDay } from '@/lib/tycoon/sim/work'
import { makeEmployee, makeState, richState } from './helpers'

const withTrait = (id: number, trait: string, morale = 75, skills = { design: 50, engineering: 50, qa: 50 }): Employee => ({
  ...makeEmployee(id, skills, 2000),
  trait,
  morale,
})

describe('traits', () => {
  it('have unique ids, positive weights, sane multipliers, and at least one effect each', () => {
    expect(new Set(TRAITS.map((t) => t.id)).size).toBe(TRAITS.length)
    for (const t of TRAITS) {
      expect(t.weight, t.id).toBeGreaterThan(0)
      expect(t.name.length).toBeGreaterThan(2)
      expect(t.description.length).toBeGreaterThan(10)
      const numbers = [t.allSpeed, t.skillGain, t.salary, t.teamSkillGain, ...Object.values(t.speed ?? {})].filter((n) => n !== undefined)
      for (const n of numbers) {
        expect(n, t.id).toBeGreaterThan(0.5)
        expect(n, t.id).toBeLessThan(1.7)
      }
      const effects = numbers.length + [t.moraleDrain, t.teamMorale].filter((n) => n !== undefined).length
      expect(effects, t.id).toBeGreaterThan(0)
    }
  })

  it('treat unknown ids as having no trait, and know "none" as valid', () => {
    expect(getTrait('removed_in_a_later_version').id).toBe(NO_TRAIT_ID)
    expect(isKnownTrait('fast_learner')).toBe(true)
    expect(isKnownTrait(NO_TRAIT_ID)).toBe(true)
    expect(isKnownTrait('nonsense')).toBe(false)
    expect(isKnownTrait(7)).toBe(false)
  })

  it('are handed out to new people in rough proportion to their weights', () => {
    const state = createInitialState(21)
    const counts = new Map<string, number>()
    for (let i = 0; i < 4000; i++) {
      const person = generateEmployee(state, 'developer')
      expect(isKnownTrait(person.trait)).toBe(true)
      counts.set(person.trait, (counts.get(person.trait) ?? 0) + 1)
    }
    expect(counts.size).toBe(TRAITS.length)
    const total = TRAITS.reduce((s, t) => s + t.weight, 0)
    for (const t of TRAITS) expect(counts.get(t.id)! / 4000).toBeCloseTo(t.weight / total, 1)
  })

  it('new people start with decent morale and are not training', () => {
    const state = createInitialState(4)
    for (let i = 0; i < 50; i++) {
      const person = generateEmployee(state, 'tester')
      expect(person.morale).toBeGreaterThanOrEqual(70)
      expect(person.morale).toBeLessThanOrEqual(85)
      expect(person.training).toBeNull()
    }
  })

  it('an easygoing hire asks for less salary than the same skills with no trait', () => {
    const skills = { design: 30, engineering: 60, qa: 20 }
    expect(salaryFor(skills, 'frugal')).toBeLessThan(salaryFor(skills))
    expect(salaryFor(skills, 'frugal')).toBeCloseTo(salaryFor(skills) * 0.9, -2)
    expect(salaryFor(skills, 'unknown')).toBe(salaryFor(skills))
  })
})

describe('morale and output', () => {
  it('maps morale to speed: 0.7 at the bottom, normal at the neutral point, 1.1 at the top', () => {
    expect(moraleSpeed(0)).toBeCloseTo(0.7)
    expect(moraleSpeed(MORALE_NEUTRAL)).toBeCloseTo(1)
    expect(moraleSpeed(MORALE_BASE)).toBeLessThan(1) // an idle, content team is a touch under normal
    expect(moraleSpeed(100)).toBeCloseTo(1.1)
    expect(moraleSpeed(-50)).toBeCloseTo(0.7)
    expect(moraleSpeed(500)).toBeCloseTo(1.1)
    expect(clampMorale(140)).toBe(100)
  })

  it('speed combines trait and morale; training stops work entirely', () => {
    const coder = withTrait(1, 'coder', 90)
    const coderTrait = getTrait('coder')
    expect(employeeSpeed(coder, 'engineering')).toBeCloseTo(coderTrait.speed!.engineering! * moraleSpeed(90))
    expect(employeeSpeed(coder, 'qa')).toBeCloseTo(coderTrait.speed!.qa! * moraleSpeed(90))
    expect(employeeSpeed(withTrait(2, 'workaholic'), 'design')).toBeCloseTo(getTrait('workaholic').allSpeed!)
    expect(employeeSpeed(withTrait(3, 'perfectionist'), 'qa')).toBeCloseTo(1.25)

    coder.training = { discipline: 'qa', finishDay: 99 }
    for (const d of DISCIPLINES) expect(employeeSpeed(coder, d)).toBe(0)
  })

  it('daily contribution and the team estimate both reflect it', () => {
    const calm = makeState([withTrait(1, NO_TRAIT_ID, 75)], 8)
    const happy = makeState([withTrait(1, NO_TRAIT_ID, 100)], 8)
    const a = dailyContribution(calm.employees[0], calm)
    const b = dailyContribution(happy.employees[0], happy)
    expect(b.engineering / a.engineering).toBeCloseTo(1.1 / 1)
    expect(teamRate(happy).engineering / teamRate(calm).engineering).toBeCloseTo(1.1)
  })

  it('a person in training adds nothing to the project and learns nothing from it', () => {
    const state = makeState([withTrait(1, NO_TRAIT_ID)], 3)
    startProject(state, 'web_app', [])
    state.employees[0].training = { discipline: 'qa', finishDay: 50 }
    const skill = state.employees[0].skills.engineering
    workDay(state)
    expect(state.offices[0].project!.progress).toEqual({ design: 0, engineering: 0, qa: 0 })
    expect(state.employees[0].skills.engineering).toBe(skill)
  })

  it('traits change how fast skills grow, for the person and for their colleagues', () => {
    const solo = makeState([withTrait(1, 'fast_learner')])
    expect(employeeSkillGain(solo, solo.employees[0])).toBeCloseTo(getTrait('fast_learner').skillGain!)

    const mentoring = getTrait('mentor').teamSkillGain!
    const team = makeState([withTrait(1, NO_TRAIT_ID), withTrait(2, 'mentor'), withTrait(3, 'mentor')])
    expect(employeeSkillGain(team, team.employees[0])).toBeCloseTo(mentoring * mentoring)
    expect(employeeSkillGain(team, team.employees[1])).toBeCloseTo(mentoring) // not their own mentoring
  })
})

describe('morale target and drift', () => {
  it('is the base for a content team, lifted by team players up to a cap', () => {
    const state = makeState([withTrait(1, NO_TRAIT_ID)])
    expect(moraleTarget(state, state.employees[0])).toBe(MORALE_BASE)

    state.employees.push(withTrait(2, 'team_player'))
    expect(moraleTarget(state, state.employees[0])).toBe(MORALE_BASE + 3)
    expect(moraleTarget(state, state.employees[1])).toBe(MORALE_BASE) // not for themselves

    for (let id = 3; id < 8; id++) state.employees.push(withTrait(id, 'team_player'))
    expect(moraleTarget(state, state.employees[0])).toBe(MORALE_BASE + TEAM_MORALE_CAP)
  })

  it('falls in steps during a long crunch, and with debt', () => {
    const state = richState()
    state.employees = [withTrait(1, NO_TRAIT_ID)]
    const person = state.employees[0]
    const project = state.offices[0].project!
    const at = (daysIn: number) => {
      state.day = project.startDay + daysIn
      return moraleTarget(state, person)
    }
    expect(at(MORALE_CRUNCH_DAYS)).toBe(MORALE_BASE)
    expect(at(MORALE_CRUNCH_DAYS + 1)).toBe(MORALE_BASE - 8)
    expect(at(MORALE_CRUNCH_DAYS + 31)).toBe(MORALE_BASE - 16)
    expect(at(MORALE_CRUNCH_DAYS + 61)).toBe(MORALE_BASE - 24)
    expect(at(1000)).toBe(MORALE_BASE - 24) // capped

    state.money = -1
    expect(at(1000)).toBe(MORALE_BASE - 24 - MORALE_DEBT_PENALTY)
  })

  it('drifts toward the target and never leaves 0-100', () => {
    // Starting just above the quitting line, so nobody walks out on the way up.
    const state = makeState([withTrait(1, NO_TRAIT_ID, 31)])
    for (let i = 0; i < 100; i++) moraleDay(state)
    expect(state.employees[0].morale).toBeCloseTo(MORALE_BASE, 0)

    state.employees[0].morale = 100
    for (let i = 0; i < 100; i++) moraleDay(state)
    expect(state.employees[0].morale).toBeCloseTo(MORALE_BASE, 0)

    adjustMorale(state, -500)
    expect(state.employees[0].morale).toBe(0)
    adjustMorale(state, 500)
    expect(state.employees[0].morale).toBe(100)
  })

  it('burns out workaholics only while a project is running', () => {
    const idle = makeState([withTrait(1, 'workaholic')])
    for (let i = 0; i < 200; i++) moraleDay(idle)
    expect(idle.employees[0].morale).toBeCloseTo(MORALE_BASE, 0)

    const busy = richState()
    busy.employees = [withTrait(1, 'workaholic')]
    for (let i = 0; i < 200; i++) moraleDay(busy)
    expect(busy.employees[0].morale).toBeLessThan(MORALE_BASE - 5)
    expect(busy.employees[0].morale).toBeGreaterThan(MORALE_BASE - 20)
  })

  it('adjusts one person or everyone', () => {
    const state = makeState([withTrait(1, NO_TRAIT_ID), withTrait(2, NO_TRAIT_ID)])
    adjustMorale(state, 10, 2)
    expect(state.employees.map((e) => e.morale)).toEqual([75, 85])
    adjustMorale(state, -5)
    expect(state.employees.map((e) => e.morale)).toEqual([70, 80])
  })
})

describe('releases, outings and upgrades', () => {
  it('a good release lifts the team and a bad one drags it down; updates count for half', () => {
    const state = makeState([withTrait(1, NO_TRAIT_ID)])
    moraleFromRelease(state, 90)
    expect(state.employees[0].morale).toBe(81)
    moraleFromRelease(state, 20)
    expect(state.employees[0].morale).toBe(73)
    moraleFromRelease(state, 55) // middling: no change
    expect(state.employees[0].morale).toBe(73)
    moraleFromRelease(state, 90, 0.5)
    expect(state.employees[0].morale).toBe(76)
  })

  it('shipping a product moves morale', () => {
    const state = makeState([makeEmployee(1, { design: 60, engineering: 60, qa: 60 })], 5)
    startProject(state, 'web_app', [])
    for (const d of DISCIPLINES) state.offices[0].project!.progress[d] = state.offices[0].project!.target[d] * 1.5
    shipProject(state)
    expect(state.employees[0].morale).toBeGreaterThan(75)
  })

  it('a team outing costs a slice of payroll, lifts everyone, and has a cooldown', () => {
    const state = richState()
    const cost = outingCost(state)
    expect(cost).toBeGreaterThanOrEqual(400)
    const money = state.money
    expect(teamOuting(state).ok).toBe(true)
    expect(state.money).toBe(money - cost)
    expect(state.employees.every((e) => e.morale === 75 + OUTING_MORALE)).toBe(true)

    expect(outingBlocker(state)).toBe(`Again in ${OUTING_COOLDOWN_DAYS} days`)
    expect(teamOuting(state).ok).toBe(false)
    state.day += OUTING_COOLDOWN_DAYS
    expect(outingBlocker(state)).toBeNull()
  })

  it('refuses an outing the studio cannot afford or without a team', () => {
    const poor = richState()
    poor.money = 10
    expect(outingBlocker(poor)).toBe('Not enough money')
    expect(outingBlocker(makeState([]))).toBe('Nobody to take')
  })

  it('moving out of the garage cheers everyone up', () => {
    const state = makeState([withTrait(1, NO_TRAIT_ID)])
    state.money = 100_000
    state.stage = 2
    state.signatureId = 1
    expect(moveOut(state).ok).toBe(true)
    expect(state.employees[0].morale).toBe(75 + OFFICE_UPGRADE_MORALE)
  })
})

describe('unhappiness and quitting', () => {
  it('warns once when morale drops below the unhappy line', () => {
    const state = makeState([withTrait(1, NO_TRAIT_ID, 45)])
    adjustMorale(state, -10)
    expect(state.events.filter((e) => e.type === 'notice' && e.text.includes('unhappy'))).toHaveLength(1)
    adjustMorale(state, -10) // already below: no second warning
    expect(state.events.filter((e) => e.type === 'notice')).toHaveLength(1)
  })

  it('someone kept miserable eventually quits; the team feels it', () => {
    const state = makeState([withTrait(1, NO_TRAIT_ID), withTrait(2, NO_TRAIT_ID)], 7)
    let days = 0
    while (state.employees.length === 2 && days < 600) {
      state.employees[0].morale = 5
      moraleDay(state)
      days += 1
    }
    expect(state.employees).toHaveLength(1)
    expect(state.employees[0].id).toBe(2)
    expect(drainEvents(state).some((e) => e.type === 'notice' && e.text.includes('quit'))).toBe(true)
    expect(state.employees[0].morale).toBeLessThan(75)
  })

  it('nobody quits while morale stays above the line', () => {
    const state = makeState([withTrait(1, NO_TRAIT_ID)], 7)
    for (let i = 0; i < 3000; i++) {
      state.employees[0].morale = 35
      moraleDay(state)
    }
    expect(state.employees).toHaveLength(1)
  })
})

describe('training', () => {
  const skilled = () => makeState([withTrait(1, NO_TRAIT_ID, 75, { design: 30, engineering: 60, qa: 20 })])

  it('costs more for stronger skills and gives less for them', () => {
    const [a] = skilled().employees
    expect(trainingCost(a, 'engineering')).toBeGreaterThan(trainingCost(a, 'qa'))
    expect(trainingGain(a, 'qa')).toBeGreaterThan(trainingGain(a, 'engineering'))
    expect(trainingGain(a, 'qa')).toBeGreaterThan(0)
  })

  it('charges, takes the person off work for the course, then pays out the skill and some morale', () => {
    const state = skilled()
    const person = state.employees[0]
    const cost = trainingCost(person, 'qa')
    const gain = trainingGain(person, 'qa')
    const money = state.money
    expect(startTraining(state, 1, 'qa').ok).toBe(true)
    expect(state.money).toBe(money - cost)
    expect(person.training).toEqual({ discipline: 'qa', finishDay: state.day + TRAINING_DAYS })

    state.day += TRAINING_DAYS - 1
    trainingDay(state)
    expect(person.training).not.toBeNull()

    state.day += 1
    trainingDay(state)
    expect(person.training).toBeNull()
    expect(person.skills.qa).toBeCloseTo(20 + gain)
    expect(person.morale).toBe(80)
    expect(state.events.some((e) => e.type === 'notice' && e.text.includes('finished training'))).toBe(true)
  })

  it('refuses unknown people, double bookings, experts, and an empty wallet without changing anything', () => {
    const state = skilled()
    expect(startTraining(state, 99, 'qa')).toEqual({ ok: false, reason: 'Employee not found' })

    state.employees[0].skills.design = TRAINING_MAX_SKILL + 1
    expect(startTraining(state, 1, 'design')).toEqual({ ok: false, reason: 'Already an expert' })

    state.money = 5
    expect(startTraining(state, 1, 'qa')).toEqual({ ok: false, reason: 'Not enough money' })

    state.money = 50_000
    startTraining(state, 1, 'qa')
    const before = structuredClone(state)
    expect(startTraining(state, 1, 'design')).toEqual({ ok: false, reason: 'Already training' })
    expect(state).toEqual(before)
  })

  it('never pushes a skill past 100', () => {
    const state = skilled()
    state.employees[0].skills.qa = 91
    startTraining(state, 1, 'qa')
    state.day += TRAINING_DAYS
    trainingDay(state)
    expect(state.employees[0].skills.qa).toBeLessThanOrEqual(100)
  })

  it('runs through the daily tick', () => {
    const state = skilled()
    state.money = 50_000
    startTraining(state, 1, 'qa')
    for (let i = 0; i < TRAINING_DAYS; i++) advanceDay(state)
    expect(state.employees[0].training).toBeNull()
    expect(state.employees[0].skills.qa).toBeGreaterThan(20)
  })
})

describe('saving staff data', () => {
  it('keeps traits, morale, training and the outing cooldown', () => {
    const state = richState()
    state.employees[0].trait = 'mentor'
    state.employees[0].morale = 41.5
    state.money = 90_000
    startTraining(state, state.employees[1].id, 'engineering')
    teamOuting(state)
    const restored = deserialize(serialize(state))!
    expect(restored.employees).toEqual(state.employees)
    expect(restored.candidates).toEqual(state.candidates)
    expect(restored.lastOutingDay).toBe(state.lastOutingDay)
  })

  it('rejects malformed staff fields', () => {
    const base = JSON.parse(serialize(richState()))
    const bad = (change: (s: Record<string, any>) => void) => {
      const copy = structuredClone(base)
      change(copy)
      return deserialize(JSON.stringify(copy))
    }
    expect(bad((s) => (s.employees[0].morale = 'high'))).toBeNull()
    expect(bad((s) => (s.employees[0].trait = 'wizard'))).toBeNull()
    expect(bad((s) => (s.employees[0].training = { discipline: 'magic', finishDay: 3 }))).toBeNull()
    expect(bad((s) => (s.employees[0].training = { discipline: 'qa', finishDay: 'soon' }))).toBeNull()
    expect(bad((s) => (s.lastOutingDay = 'never'))).toBeNull()
  })
})
