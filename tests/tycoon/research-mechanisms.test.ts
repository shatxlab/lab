import { describe, expect, it } from 'vitest'
import { AUDIENCES } from '@/lib/tycoon/data/audiences'
import { getResearch, RESEARCH } from '@/lib/tycoon/data/research'
import { KNOWLEDGE_HANDOVER } from '@/lib/tycoon/sim/balance'
import { fire } from '@/lib/tycoon/sim/hiring'
import { depart, KNOWLEDGE_BASE_RESEARCH } from '@/lib/tycoon/sim/knowledge'
import { researchBlocker, researchDay, startResearch, studyTargets } from '@/lib/tycoon/sim/research'
import { statMultiplier } from '@/lib/tycoon/sim/modifiers'
import { drainEvents } from '@/lib/tycoon/sim/tick'
import { dayOfEra, makeEmployee, makeState } from './helpers'

const builder = (id: number) => makeEmployee(id, { design: 40, engineering: 40, qa: 40 })

describe('research data', () => {
  it('has unique ids and only asks for research that exists', () => {
    expect(new Set(RESEARCH.map((n) => n.id)).size).toBe(RESEARCH.length)
    for (const node of RESEARCH) for (const id of node.requires) expect(getResearch(id), `${node.id} needs ${id}`).toBeDefined()
  })

  it('has no cycles: every node can be reached from the ones with no requirements', () => {
    const done = new Set<string>()
    let progressed = true
    while (progressed) {
      progressed = false
      for (const node of RESEARCH) {
        if (!done.has(node.id) && node.requires.every((id) => done.has(id))) {
          done.add(node.id)
          progressed = true
        }
      }
    }
    expect(done.size).toBe(RESEARCH.length)
  })

  it('puts the later steps of a speed line after the first, and in later eras', () => {
    for (const [first, second] of [['ci_pipeline', 'ci_pipeline_2'], ['ux_research', 'ux_research_2'], ['test_automation', 'test_automation_2']]) {
      expect(getResearch(second)!.cost).toBeGreaterThan(getResearch(first)!.cost)
      expect(getResearch(second)!.era).toBeGreaterThanOrEqual(2)
    }
    const state = makeState()
    state.research.done.push('ci_pipeline', 'code_review', 'ci_pipeline_2', 'ci_pipeline_3')
    expect(statMultiplier(state, 'engineeringSpeed')).toBeCloseTo(1.08 * 1.06 * 1.06, 10)
  })
})

describe('research gated by the studio’s stage', () => {
  it('waits for the stage, then for everything else', () => {
    const state = makeState()
    state.money = 1e7
    state.research.done.push('marketing_dept')
    const node = getResearch('user_research')!
    expect(researchBlocker(state, node)).toBe('Not until the studio is an indie studio')
    state.stage = node.stage!
    expect(researchBlocker(state, node)).toBeNull()
  })
})

describe('audience study', () => {
  const studyState = () => {
    const state = makeState([builder(1)])
    state.money = 1e7
    state.stage = 2
    state.research.done.push('marketing_dept', 'user_research')
    return state
  }

  it('lists the audiences of product types the studio can build and has not studied', () => {
    const state = studyState()
    const targets = studyTargets(state)
    expect(targets).toContain('web_business')
    const locked = AUDIENCES.find((a) => a.productTypeId === 'cloud_platform')!
    expect(targets).not.toContain(locked.id)
    state.surveyed.push('web_business')
    expect(studyTargets(state)).not.toContain('web_business')
  })

  it('needs an audience to study, and takes money and time', () => {
    const state = studyState()
    const before = state.money
    expect(startResearch(state, 'audience_study')).toEqual({ ok: false, reason: 'Pick an audience to study' })
    expect(startResearch(state, 'audience_study', 'nope').ok).toBe(false)
    expect(startResearch(state, 'audience_study', 'web_business').ok).toBe(true)
    expect(state.money).toBe(before - getResearch('audience_study')!.cost)
    expect(state.research.active).toMatchObject({ id: 'audience_study', target: 'web_business' })
  })

  it('shows the audience in full when it finishes, and can be done again', () => {
    const state = studyState()
    startResearch(state, 'audience_study', 'web_business')
    state.day = state.research.active!.finishDay
    researchDay(state)
    expect(state.surveyed).toEqual(['web_business'])
    expect(state.research.done).not.toContain('audience_study')
    expect(drainEvents(state).some((e) => e.type === 'notice' && e.text.includes('Study complete'))).toBe(true)
    expect(researchBlocker(state, getResearch('audience_study')!)).toBeNull()
    expect(startResearch(state, 'audience_study', 'web_business').ok).toBe(false)
    expect(startResearch(state, 'audience_study', 'web_teams').ok).toBe(true)
  })

  it('says so when every audience is studied', () => {
    const state = studyState()
    state.day = dayOfEra(4)
    state.reputation = 100
    state.research.done.push('ml_foundations', 'cloud_infra')
    state.surveyed.push(...AUDIENCES.map((a) => a.id))
    expect(researchBlocker(state, getResearch('audience_study')!)).toBe('Every audience is studied')
  })
})

describe('knowledge base', () => {
  const team = () => {
    const state = makeState([builder(1), builder(2), builder(3)])
    state.employees[0].knowledge = { types: { web_app: 100 }, products: { '7': 50 } }
    return state
  }

  it('is lost with the person without it', () => {
    const state = team()
    depart(state, state.employees[0])
    expect(state.employees).toHaveLength(2)
    expect(state.employees.every((e) => e.knowledge === undefined)).toBe(true)
  })

  it('stays with the team in part, split between them, once researched', () => {
    const state = team()
    state.research.done.push(KNOWLEDGE_BASE_RESEARCH)
    fire(state, 1)
    expect(state.employees).toHaveLength(2)
    for (const person of state.employees) {
      expect(person.knowledge!.types.web_app).toBeCloseTo((100 * KNOWLEDGE_HANDOVER) / 2, 10)
      expect(person.knowledge!.products['7']).toBeCloseTo((50 * KNOWLEDGE_HANDOVER) / 2, 10)
    }
  })

  it('goes to nobody when the leaver was the whole team, and never to people on other teams', () => {
    const state = team()
    state.research.done.push(KNOWLEDGE_BASE_RESEARCH)
    state.employees = [state.employees[0]]
    depart(state, state.employees[0])
    expect(state.employees).toHaveLength(0)
  })
})
