import { describe, expect, it } from 'vitest'
import { AUDIENCES, audienceFor, audiencesOf } from '@/lib/tycoon/data/audiences'
import { FEATURES } from '@/lib/tycoon/data/features'
import { PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import { revenueForUsers } from '@/lib/tycoon/sim/products'
import { projectQuality, shipProject, startProject } from '@/lib/tycoon/sim/project'
import { audienceFeedback, computeReach, featureScore } from '@/lib/tycoon/sim/scoring'
import { DISCIPLINES } from '@/lib/tycoon/sim/types'
import { makeEmployee, makeState } from './helpers'

describe('audience data', () => {
  it('gives every product type two or three audiences, with known features and sane numbers', () => {
    const features = new Set(FEATURES.map((f) => f.id))
    for (const type of PRODUCT_TYPES) expect([2, 3]).toContain(audiencesOf(type.id).length)
    for (const a of AUDIENCES) {
      expect(a.blurb.length).toBeGreaterThan(20)
      expect(a.reach * a.pay).toBeGreaterThan(0.8)
      expect(a.reach * a.pay).toBeLessThan(1.4)
      for (const [id, weight] of Object.entries(a.likes)) {
        expect(features.has(id)).toBe(true)
        expect(weight).toBeGreaterThan(0)
      }
    }
    expect(new Set(AUDIENCES.map((a) => a.id)).size).toBe(AUDIENCES.length)
  })

  it('fall back to a neutral audience when none is named', () => {
    const none = audienceFor('web_app')
    expect([none.reach, none.pay, Object.keys(none.likes).length]).toEqual([1, 1, 0])
    expect(audienceFor('web_app', 'dev_hackers').reach).toBe(1)
  })
})

describe('an audience', () => {
  it('is chosen for a new product, defaults to the type\'s first, and must belong to the type', () => {
    const state = makeState([makeEmployee(1)])
    expect(startProject(state, 'web_app', [], 'small', undefined, 'dev_hackers')).toEqual({ ok: false, reason: 'Unknown audience' })
    expect(startProject(state, 'web_app', [], 'small', undefined, 'web_teams').ok).toBe(true)
    expect(state.offices[0].project?.audienceId).toBe('web_teams')
    const other = makeState([makeEmployee(1)])
    startProject(other, 'web_app', [])
    expect(other.offices[0].project?.audienceId).toBe('web_consumers')
  })

  it('scales reach and pay: the wide audience is bigger, the narrow one pays more per user', () => {
    const state = makeState([makeEmployee(1)])
    startProject(state, 'web_app', [])
    const project = state.offices[0].project!
    const reachFor = (audienceId: string) => computeReach({ ...project, audienceId }, 80, 0, 1)
    expect(reachFor('web_consumers')).toBeGreaterThan(reachFor('web_teams'))
    expect(revenueForUsers('web_app', 1000, 'web_teams')).toBeGreaterThan(revenueForUsers('web_app', 1000, 'web_consumers'))
  })

  it('values the features it likes more', () => {
    expect(featureScore('web_app', ['payments'], 'web_business')).toBeGreaterThan(featureScore('web_app', ['payments'], 'web_consumers'))
  })

  it('passes from the project to the launched product', () => {
    const state = makeState([makeEmployee(1, { design: 60, engineering: 60, qa: 60 })])
    state.money = 100_000
    startProject(state, 'web_app', ['payments'], 'small', undefined, 'web_business')
    for (const d of DISCIPLINES) state.offices[0].project!.progress[d] = state.offices[0].project!.target[d] * 1.2
    expect(projectQuality(state, state.offices[0].project!)).toBeGreaterThan(0)
    expect(shipProject(state).ok).toBe(true)
    expect(state.products[0].audienceId).toBe('web_business')
  })
})

describe('feedback', () => {
  it('names what they loved, what left them cold, and what they wished for', () => {
    const feedback = audienceFeedback('web_app', 'web_business', ['payments', 'dark_mode', 'onboarding'])
    expect(feedback.loved).toEqual(['In-app payments'])
    expect(feedback.shrugged).toEqual(['Dark mode'])
    expect(feedback.missed).toContain('User accounts')
    expect(feedback.missed).not.toContain('In-app payments')
  })

  it('has nothing to say for an unknown audience', () => {
    expect(audienceFeedback('web_app', undefined, ['payments'])).toEqual({ loved: [], shrugged: [], missed: [] })
  })
})
