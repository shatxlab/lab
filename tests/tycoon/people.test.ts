import { describe, expect, it } from 'vitest'
import {
  ANALYST_MAX_LEVEL,
  FEEDBACK_LOVED_DAYS,
  FEEDBACK_MISSED_DAYS,
  INSIGHT_PER_SKILL,
  PM_AFTER_DAYS,
  PM_HIT_BONUS,
  PM_INSIGHT_SHARE,
  PM_MIN_ANALYSIS,
  PM_REACH_BONUS,
  REMOTE_SPEED,
  SURVEY_COST,
} from '@/lib/tycoon/sim/balance'
import { becomePm, leadOf, needsLead, pmBlocker, pmOf, primarySkill, promotionBlocker, title } from '@/lib/tycoon/sim/careers'
import { pmHitFactor, pmReachFactor } from '@/lib/tycoon/sim/direction'
import { ANALYST_RESEARCH, generateAnalyst, hire, PM_RESEARCH, refreshCandidates, salaryFor, salaryOf } from '@/lib/tycoon/sim/hiring'
import { feedbackFor, hasAnalyst, insightDay, insightOf, insightRate, isSurveyed, surveyAudience, surveyBlocker } from '@/lib/tycoon/sim/insight'
import { assignTeam, openOffice, teamOf, teamOfficeId, transfer, workersOf } from '@/lib/tycoon/sim/offices'
import { hitBreakdown, shipProject, startProject } from '@/lib/tycoon/sim/project'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { isBuilder, type Employee, type GameState } from '@/lib/tycoon/sim/types'
import { dailyContribution, expectedContribution, workDay } from '@/lib/tycoon/sim/work'
import { advance } from '@/lib/tycoon/sim/tick'
import { makeEmployee, makeProduct, makeState } from './helpers'

const builder = (id: number, officeId = 1) => ({ ...makeEmployee(id, { design: 40, engineering: 40, qa: 40 }), officeId })

/** A studio with two offices, each with a builder, and the research for analysts and product managers. */
function twoOffices(): GameState {
  const state = makeState([builder(1)])
  state.offices[0].kind = 'office'
  state.stage = 4
  state.money = 1e7
  openOffice(state)
  state.offices[1].region = 'us' // people move between offices of one region
  state.employees.push(builder(2, state.offices[1].id))
  state.research.done.push(ANALYST_RESEARCH, PM_RESEARCH)
  return state
}

const analyst = (state: GameState, over: Partial<Employee> = {}): Employee => {
  const person = { ...generateAnalyst(state), officeId: state.offices[0].id, hiredDay: 0, levelDay: 0, trait: 'none', morale: 75, ...over }
  state.employees.push(person)
  return person
}

describe('teams across offices', () => {
  it('default to the office a person sits in', () => {
    const state = twoOffices()
    const [first, second] = state.offices
    expect(workersOf(state, first).map((e) => e.id)).toEqual([1])
    expect(workersOf(state, second).map((e) => e.id)).toEqual([2])
    expect(teamOfficeId(state, state.employees[0])).toBe(first.id)
  })

  it('can send a builder to work on the other office’s project, keeping their desk', () => {
    const state = twoOffices()
    const [first, second] = state.offices
    expect(assignTeam(state, 1, second.id).ok).toBe(true)
    expect(workersOf(state, first)).toHaveLength(0)
    expect(workersOf(state, second).map((e) => e.id).sort()).toEqual([1, 2])
    expect(state.employees[0].officeId).toBe(first.id)
    expect(teamOf(state, second)).toHaveLength(2)
  })

  it('works a little slower away from their own office', () => {
    const state = twoOffices()
    const person = state.employees[0]
    const home = expectedContribution(person, state).engineering
    assignTeam(state, 1, state.offices[1].id)
    expect(expectedContribution(person, state).engineering).toBeCloseTo(home * REMOTE_SPEED, 10)
    expect(dailyContribution(person, state).engineering).toBeGreaterThan(0)
  })

  it('puts the point on the project of the team they joined', () => {
    const state = twoOffices()
    const [first, second] = state.offices
    startProject(state, 'web_app', [], 'small', second.id)
    startProject(state, 'web_app', [], 'small', first.id)
    assignTeam(state, 1, second.id)
    workDay(state)
    const progress = (office: typeof first) => Object.values(office.project!.progress).reduce((a, b) => a + b, 0)
    expect(progress(first)).toBe(0)
    expect(progress(second)).toBeGreaterThan(0)
  })

  it('lets an office with nobody of its own run on borrowed people, and not on an empty team', () => {
    const state = twoOffices()
    const [first, second] = state.offices
    state.employees = state.employees.filter((e) => e.id !== 2)
    expect(startProject(state, 'web_app', [], 'small', second.id)).toEqual({ ok: false, reason: 'Hire someone first' })
    assignTeam(state, 1, second.id)
    expect(startProject(state, 'web_app', [], 'small', second.id).ok).toBe(true)
    expect(startProject(state, 'web_app', [], 'small', first.id).ok).toBe(false)
  })

  it('go back with null, and are reset by a move or when the office is gone', () => {
    const state = twoOffices()
    const [first, second] = state.offices
    assignTeam(state, 1, second.id)
    assignTeam(state, 1, null)
    expect(state.employees[0].teamId).toBeUndefined()
    assignTeam(state, 1, second.id)
    transfer(state, 1, second.id)
    expect(state.employees[0].teamId).toBeUndefined()
    state.employees[0].teamId = 99_999
    expect(teamOfficeId(state, state.employees[0])).toBe(second.id)
    expect(first.id).not.toBe(second.id)
  })

  it('refuse an unknown person or office, and people who do no project work', () => {
    const state = twoOffices()
    expect(assignTeam(state, 404, state.offices[0].id).ok).toBe(false)
    expect(assignTeam(state, 1, 404)).toEqual({ ok: false, reason: 'Unknown office' })
    const reader = analyst(state)
    expect(assignTeam(state, reader.id, state.offices[1].id)).toEqual({ ok: false, reason: 'They do not work on projects' })
  })

  it('survive a save', () => {
    const state = twoOffices()
    assignTeam(state, 1, state.offices[1].id)
    expect(deserialize(serialize(state))!.employees[0].teamId).toBe(state.offices[1].id)
  })
})

describe('analysts', () => {
  it('are people who read users: analysis skill, no building skill to speak of', () => {
    const state = makeState()
    const person = generateAnalyst(state)
    expect(person.role).toBe('analyst')
    expect(person.analysis).toBeGreaterThan(0)
    expect(primarySkill(person)).toBe(person.analysis)
    expect(isBuilder(person)).toBe(false)
    expect(title(person)).toMatch(/analyst$/)
    expect(person.level).toBeLessThanOrEqual(ANALYST_MAX_LEVEL)
  })

  it('show up among the candidates only once User research is done', () => {
    const state = makeState()
    refreshCandidates(state)
    expect(state.candidates.some((c) => c.role === 'analyst')).toBe(false)
    state.research.done.push(ANALYST_RESEARCH)
    refreshCandidates(state)
    expect(state.candidates.filter((c) => c.role === 'analyst')).toHaveLength(1)
  })

  it('are paid for their analysis', () => {
    const skills = { design: 10, engineering: 10, qa: 10 }
    expect(salaryFor(skills, 'none', 1, 0, 1, 60)).toBeGreaterThan(salaryFor(skills, 'none', 1, 0, 1, 0))
    const state = makeState()
    const person = generateAnalyst(state)
    expect(salaryOf(person, 0)).toBe(salaryFor(person.skills, person.trait, person.level, 0, 1, person.analysis))
  })

  it('can be hired like anyone else', () => {
    const state = makeState()
    state.research.done.push(ANALYST_RESEARCH)
    refreshCandidates(state)
    const candidate = state.candidates.find((c) => c.role === 'analyst')!
    state.money = 1e6
    expect(hire(state, candidate.id).ok).toBe(true)
    expect(state.employees.some((e) => e.id === candidate.id)).toBe(true)
  })

  it('do no project work and do not count toward needing a Lead', () => {
    const state = makeState([builder(1), builder(2), builder(3), builder(4)])
    for (let i = 0; i < 3; i++) analyst(state)
    expect(needsLead(state, state.offices[0])).toBe(false)
    startProject(state, 'web_app', [])
    workDay(state)
    expect(state.dayWork.map((w) => w.employeeId).sort()).toEqual([1, 2, 3, 4])
    expect(workersOf(state, state.offices[0])).toHaveLength(4)
  })

  it('gather insight each day, in proportion to their skill, level and mood', () => {
    const state = makeState()
    const person = analyst(state, { analysis: 50, level: 1, morale: 75 })
    const expected = 50 * INSIGHT_PER_SKILL * 1 * 1
    expect(insightOf(person)).toBeCloseTo(expected, 5)
    insightDay(state)
    expect(state.insight).toBeCloseTo(expected, 5)
    person.morale = 20
    expect(insightOf(person)).toBeLessThan(expected)
    person.morale = 75
    person.level = 2
    expect(insightOf(person)).toBeGreaterThan(expected)
    person.training = { discipline: 'qa', finishDay: 50 }
    expect(insightOf(person)).toBe(0)
  })

  it('get sharper by doing the work, slowly', () => {
    const state = makeState()
    const person = analyst(state, { analysis: 50 })
    advance(state, 30)
    expect(person.analysis).toBeGreaterThan(50)
    expect(person.analysis).toBeLessThan(52)
  })

  it('gather nothing in a studio without them', () => {
    const state = makeState([builder(1)])
    expect(hasAnalyst(state)).toBe(false)
    expect(insightRate(state)).toBe(0)
    insightDay(state)
    expect(state.insight).toBe(0)
  })
})

describe('studying an audience', () => {
  it('costs insight, needs an analyst, and is done once', () => {
    const state = makeState([builder(1)])
    state.insight = 1000
    expect(surveyBlocker(state, 'web_business')).toBe('Needs an analyst')
    analyst(state)
    state.insight = SURVEY_COST - 1
    expect(surveyBlocker(state, 'web_business')).toBe(`Needs ${SURVEY_COST} insight`)
    expect(surveyAudience(state, 'web_business').ok).toBe(false)
    state.insight = SURVEY_COST + 5
    expect(surveyAudience(state, 'web_business').ok).toBe(true)
    expect(state.insight).toBe(5)
    expect(isSurveyed(state, 'web_business')).toBe(true)
    expect(isSurveyed(state, 'web_teams')).toBe(false)
    expect(isSurveyed(state, undefined)).toBe(false)
    state.insight = 1000
    expect(surveyAudience(state, 'web_business')).toEqual({ ok: false, reason: 'Already studied' })
  })

  it('survives a save', () => {
    const state = makeState([builder(1)])
    state.surveyed.push('web_business')
    state.insight = 12.5
    const loaded = deserialize(serialize(state))!
    expect(loaded.surveyed).toEqual(['web_business'])
    expect(loaded.insight).toBe(12.5)
  })

  it('comes in over the months after a launch, unless an analyst reads it', () => {
    const state = makeState([builder(1)])
    state.day = 500
    const product = makeProduct({ id: 5, audienceId: 'web_business', featureIds: ['payments', 'dark_mode'], releaseDay: 500 })
    state.products.push(product)
    expect(feedbackFor(state, product)).toMatchObject({ loved: [], shrugged: [], missed: [], waiting: true })
    state.day = 500 + FEEDBACK_LOVED_DAYS
    expect(feedbackFor(state, product).loved).toEqual(['In-app payments'])
    expect(feedbackFor(state, product).waiting).toBe(true)
    state.day = 500 + FEEDBACK_MISSED_DAYS
    const late = feedbackFor(state, product)
    expect(late.missed.length).toBeGreaterThan(0)
    expect(late.waiting).toBe(false)
    state.day = 500
    analyst(state)
    const quick = feedbackFor(state, product)
    expect(quick.loved).toEqual(['In-app payments'])
    expect(quick.waiting).toBe(false)
  })

  it('is whole at once for an audience already studied', () => {
    const state = makeState([builder(1)])
    state.day = 500
    const product = makeProduct({ id: 5, audienceId: 'web_business', featureIds: ['payments'], releaseDay: 500 })
    state.surveyed.push('web_business')
    expect(feedbackFor(state, product).loved).toEqual(['In-app payments'])
  })
})

describe('product managers', () => {
  const readyAnalyst = (state: GameState, over: Partial<Employee> = {}) =>
    analyst(state, { level: ANALYST_MAX_LEVEL, analysis: PM_MIN_ANALYSIS + 5, levelDay: state.day - PM_AFTER_DAYS - 1, ...over })

  it('can be made from a senior analyst once Product management is researched', () => {
    const state = twoOffices()
    const junior = analyst(state, { level: 1, analysis: 90 })
    expect(pmBlocker(state, junior)).toBe('They need to be a senior analyst first')
    const senior = readyAnalyst(state)
    expect(pmBlocker(state, senior)).toBeNull()
    state.research.done = state.research.done.filter((id) => id !== PM_RESEARCH)
    expect(pmBlocker(state, senior)).toBe('Research Product management first')
    state.research.done.push(PM_RESEARCH)
    expect(becomePm(state, senior.id).ok).toBe(true)
    expect(senior.role).toBe('pm')
    expect(senior.level).toBe(1)
    expect(title(senior)).toBe('Mid product manager')
    expect(pmOf(state, state.offices[0])).toBe(senior)
  })

  it('wait for enough skill and enough time as a senior', () => {
    const state = twoOffices()
    expect(pmBlocker(state, builder(9))).toBe('Only an analyst can become a product manager')
    const weak = readyAnalyst(state, { analysis: PM_MIN_ANALYSIS - 1 })
    expect(pmBlocker(state, weak)).toBe(`Needs ${PM_MIN_ANALYSIS} analysis skill`)
    const fresh = readyAnalyst(state, { levelDay: state.day })
    expect(pmBlocker(state, fresh)).toBe(`Ready in ${PM_AFTER_DAYS} days`)
    expect(becomePm(state, fresh.id).ok).toBe(false)
    expect(becomePm(state, 404).ok).toBe(false)
  })

  it('are one to an office', () => {
    const state = twoOffices()
    const first = readyAnalyst(state)
    const second = readyAnalyst(state)
    becomePm(state, first.id)
    expect(pmBlocker(state, second)).toBe('Their office already has a product manager')
    second.officeId = state.offices[1].id
    expect(pmBlocker(state, second)).toBeNull()
  })

  it('move up Mid, Senior, Lead like anyone, and a Lead product manager is no team Lead', () => {
    const state = twoOffices()
    const person = readyAnalyst(state)
    becomePm(state, person.id)
    expect(promotionBlocker(state, person)).toMatch(/Needs 65 analysis skill|Ready in/)
    person.analysis = 90
    person.levelDay = state.day - 400
    expect(promotionBlocker(state, person)).toBeNull()
    person.level = 3
    expect(promotionBlocker(state, person)).toBe('Already a Lead')
    expect(leadOf(state, state.offices[0])).toBeUndefined()
  })

  it('stop a senior analyst being promoted the ordinary way', () => {
    const state = twoOffices()
    const senior = readyAnalyst(state)
    expect(promotionBlocker(state, senior)).toBe('A senior analyst can become a product manager')
  })

  it('give their office a better chance of a hit and a wider reach, more at higher levels', () => {
    const state = twoOffices()
    const office = state.offices[0]
    expect(pmHitFactor(state, office)).toBe(1)
    expect(pmReachFactor(state, office)).toBe(1)
    const pm = readyAnalyst(state, { analysis: 100 })
    becomePm(state, pm.id)
    const mid = pmHitFactor(state, office)
    expect(mid).toBeCloseTo(1 + PM_HIT_BONUS[1], 5)
    expect(pmReachFactor(state, office)).toBeCloseTo(1 + PM_REACH_BONUS[1], 5)
    pm.level = 3
    expect(pmHitFactor(state, office)).toBeGreaterThan(mid)
    expect(pmHitFactor(state, state.offices[1])).toBe(1)
    pm.analysis = 0
    expect(pmHitFactor(state, office)).toBeLessThan(1 + PM_HIT_BONUS[3])
    expect(pmHitFactor(state, undefined)).toBe(1)
  })

  it('show in the hit breakdown for projects of their office only', () => {
    const state = twoOffices()
    const [first, second] = state.offices
    state.employees[0].skills = { design: 90, engineering: 90, qa: 90 }
    startProject(state, 'web_app', [], 'small', first.id)
    startProject(state, 'web_app', [], 'small', second.id)
    const none = hitBreakdown(state, first.project!, 85)
    expect(none.pm).toBe(1)
    const pm = readyAnalyst(state, { analysis: 100 })
    becomePm(state, pm.id)
    const steered = hitBreakdown(state, first.project!, 85)
    expect(steered.pm).toBeGreaterThan(1)
    expect(steered.chance).toBeCloseTo(none.chance * steered.pm, 10)
    expect(hitBreakdown(state, second.project!, 85).pm).toBe(1)
  })

  it('widen the reach of a launch from their office', () => {
    const reachWith = (withPm: boolean) => {
      const state = twoOffices()
      state.employees[0].skills = { design: 90, engineering: 90, qa: 90 }
      startProject(state, 'web_app', ['accounts'])
      if (withPm) becomePm(state, readyAnalyst(state, { analysis: 100 }).id)
      const project = state.offices[0].project!
      for (const d of ['design', 'engineering', 'qa'] as const) project.progress[d] = project.target[d] * 1.2
      state.launchesSinceHit = 0
      expect(shipProject(state).ok).toBe(true)
      return state.products[0].reach
    }
    expect(reachWith(true)).toBeGreaterThan(reachWith(false))
  })

  it('gather less insight than analysts, and survive a save as product managers', () => {
    const state = twoOffices()
    const pm = readyAnalyst(state, { analysis: 80, morale: 75 })
    const asAnalyst = insightOf(pm)
    becomePm(state, pm.id)
    pm.morale = 75
    expect(insightOf(pm)).toBeLessThan(asAnalyst)
    expect(insightOf(pm) / (80 * INSIGHT_PER_SKILL)).toBeLessThanOrEqual(PM_INSIGHT_SHARE * 1.1 + 1e-9)
    const loaded = deserialize(serialize(state))!
    expect(loaded.employees.find((e) => e.id === pm.id)!.role).toBe('pm')
  })
})
