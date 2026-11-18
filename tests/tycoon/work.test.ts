import { describe, expect, it } from 'vitest'
import { OVERSHOOT_CAP, POINTS_PER_SKILL, WORK_VARIANCE } from '@/lib/tycoon/sim/balance'
import { startProject } from '@/lib/tycoon/sim/project'
import { advanceDay, drainEvents } from '@/lib/tycoon/sim/tick'
import { makeEmployee, makeState } from './helpers'

describe('workDay', () => {
  it('adds points within the variance band, scaled by skill', () => {
    const state = makeState([makeEmployee(100, { engineering: 50 })])
    startProject(state, 'web_app', [])
    advanceDay(state)

    const expected = 50 * POINTS_PER_SKILL
    const got = state.offices[0].project!.progress.engineering
    expect(got).toBeGreaterThanOrEqual(expected * (1 - WORK_VARIANCE))
    expect(got).toBeLessThanOrEqual(expected * (1 + WORK_VARIANCE))
    expect(state.dayWork).toHaveLength(1)
    expect(state.dayWork[0].points.engineering).toBeCloseTo(got)
  })

  it('does nothing without an active project', () => {
    const state = makeState([makeEmployee(100, { engineering: 50 })])
    advanceDay(state)
    expect(state.dayWork).toEqual([])
    expect(state.employees[0].skills.engineering).toBe(50)
  })

  it('caps progress at the overshoot limit and stops skill growth there', () => {
    const state = makeState([makeEmployee(100, { design: 100, engineering: 100, qa: 100 })])
    startProject(state, 'web_app', [])
    for (let i = 0; i < 200; i++) advanceDay(state)

    const project = state.offices[0].project!
    expect(project.progress.engineering).toBeCloseTo(project.target.engineering * OVERSHOOT_CAP)

    const skillBefore = state.employees[0].skills.engineering
    advanceDay(state)
    expect(state.employees[0].skills.engineering).toBe(skillBefore)
  })

  it('grows skills only in disciplines actually worked on', () => {
    const state = makeState([makeEmployee(100, { engineering: 40 })])
    startProject(state, 'web_app', [])
    advanceDay(state)
    expect(state.employees[0].skills.engineering).toBeGreaterThan(40)
    expect(state.employees[0].skills.design).toBe(0)
  })

  it('fires projectReady exactly once', () => {
    const state = makeState([makeEmployee(100, { design: 80, engineering: 80, qa: 80 })])
    startProject(state, 'web_app', [])
    const events = []
    for (let i = 0; i < 60; i++) {
      advanceDay(state)
      events.push(...drainEvents(state))
    }
    expect(events.filter((e) => e.type === 'projectReady')).toHaveLength(1)
  })
})
