import { describe, expect, it } from 'vitest'
import { eraPhrase, ERAS } from '@/lib/tycoon/data/eras'
import { FEATURES } from '@/lib/tycoon/data/features'
import { PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import { BRANCHES, getResearch, RESEARCH, unlocksOf } from '@/lib/tycoon/data/research'
import { dailyIncome, monthlyBurn, monthlySalaries } from '@/lib/tycoon/sim/economy'
import { generateEmployee } from '@/lib/tycoon/sim/hiring'
import { updateMarket } from '@/lib/tycoon/sim/market'
import { statMultiplier } from '@/lib/tycoon/sim/modifiers'
import { projectQuality, startProject, unlockedProductTypes } from '@/lib/tycoon/sim/project'
import { completionText, researchBlocker, researchDay, researchDaysLeft, startResearch } from '@/lib/tycoon/sim/research'
import { computeQuality } from '@/lib/tycoon/sim/scoring'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { advanceDay, drainEvents } from '@/lib/tycoon/sim/tick'
import { DISCIPLINES, type GameState } from '@/lib/tycoon/sim/types'
import { featureLock, isResearched, productTypeLock } from '@/lib/tycoon/sim/unlocks'
import { dailyContribution, teamRate, workDay } from '@/lib/tycoon/sim/work'
import { createStore } from '@/lib/tycoon/store'
import { dayOfEra, makeEmployee, makeState, richState } from './helpers'

const finish = (state: GameState, ...ids: string[]) => state.research.done.push(...ids)
/** The multiplier a research gives on its first effect, so tuning the data doesn't break these tests. */
const effectOf = (id: string) => getResearch(id)!.effects[0].mult

describe('research data', () => {
  it('has unique ids, valid branches, and positive costs and durations', () => {
    expect(new Set(RESEARCH.map((n) => n.id)).size).toBe(RESEARCH.length)
    const branches = new Set(BRANCHES.map((b) => b.id))
    for (const node of RESEARCH) {
      expect(branches.has(node.branch)).toBe(true)
      expect(node.cost).toBeGreaterThan(0)
      expect(node.days).toBeGreaterThan(0)
      expect(node.description.length).toBeGreaterThan(10)
    }
  })

  it('has prerequisites that exist and no cycles', () => {
    for (const node of RESEARCH) {
      for (const id of node.requires) expect(getResearch(id), `${node.id} requires ${id}`).toBeDefined()
      expect(node.requires).not.toContain(node.id)
    }
    // Repeatedly "finish" anything whose prerequisites are done; a cycle would leave something stuck.
    const done = new Set<string>()
    for (let pass = 0; pass < RESEARCH.length; pass++) {
      for (const node of RESEARCH) if (node.requires.every((id) => done.has(id))) done.add(node.id)
    }
    expect(done.size).toBe(RESEARCH.length)
  })

  it('does something: every node has an effect or unlocks content', () => {
    for (const node of RESEARCH) {
      const { features, productTypes, abilities } = unlocksOf(node.id)
      expect(node.effects.length + features.length + productTypes.length + abilities.length, node.id).toBeGreaterThan(0)
    }
  })

  it('names an era in a sentence the way the player knows it', () => {
    expect(ERAS.map(eraPhrase)).toEqual(['the web years', 'the app boom', 'the cloud years', 'the AI wave', 'the platform age', 'the trust years', 'the agent era', 'the spatial years', 'the sovereign cloud'])
  })

  it('gates content only on research that exists', () => {
    for (const item of [...FEATURES, ...PRODUCT_TYPES]) {
      if (item.requiresResearch) expect(getResearch(item.requiresResearch), item.id).toBeDefined()
    }
  })

  it('every feature suits at least one product type, and every type has features that fit', () => {
    const typeIds = new Set(PRODUCT_TYPES.map((t) => t.id))
    for (const f of FEATURES) {
      expect(f.suits.length).toBeGreaterThan(0)
      expect(f.suits.every((id) => typeIds.has(id)), f.id).toBe(true)
    }
    for (const t of PRODUCT_TYPES) expect(FEATURES.filter((f) => f.suits.includes(t.id)).length).toBeGreaterThanOrEqual(5)
  })
})

describe('starting and finishing research', () => {
  it('charges the cost, schedules the finish day, and counts days down', () => {
    const state = richState()
    const node = getResearch('ci_pipeline')!
    const money = state.money
    expect(startResearch(state, node.id).ok).toBe(true)
    expect(state.money).toBe(money - node.cost)
    expect(state.research.active).toEqual({ id: node.id, finishDay: state.day + node.days })
    expect(researchDaysLeft(state)).toBe(node.days)
    state.day += 5
    expect(researchDaysLeft(state)).toBe(node.days - 5)
  })

  it('refuses unknown, unaffordable, locked, busy, and repeated research without changing anything', () => {
    const state = richState()
    expect(startResearch(state, 'nope').ok).toBe(false)
    expect(startResearch(state, 'ml_foundations')).toEqual({ ok: false, reason: 'Not until the AI wave' })
    state.day = dayOfEra(3)
    expect(startResearch(state, 'ml_foundations')).toEqual({ ok: false, reason: 'Needs CI pipeline' })

    state.money = 100
    expect(startResearch(state, 'ci_pipeline')).toEqual({ ok: false, reason: 'Not enough money' })
    state.money = 100_000
    expect(startResearch(state, 'ci_pipeline').ok).toBe(true)

    const before = structuredClone(state)
    expect(startResearch(state, 'ci_pipeline')).toEqual({ ok: false, reason: 'In progress' })
    expect(startResearch(state, 'marketing_dept')).toEqual({ ok: false, reason: 'Busy with other research' })
    expect(state).toEqual(before)

    finish(state, 'marketing_dept')
    state.research.active = null
    expect(startResearch(state, 'marketing_dept')).toEqual({ ok: false, reason: 'Done' })
  })

  it('needs all prerequisites, not just one', () => {
    const state = richState()
    state.day = dayOfEra(2)
    finish(state, 'ci_pipeline')
    const node = getResearch('cloud_infra')!
    expect(researchBlocker(state, node)).toBe('Needs Test automation')
    finish(state, 'test_automation')
    expect(researchBlocker(state, node)).toBeNull()
  })

  it('completes on its finish day, once, with a notice that says what it unlocked', () => {
    const state = richState()
    startResearch(state, 'ci_pipeline')
    const finishDay = state.research.active!.finishDay

    state.day = finishDay - 1
    researchDay(state)
    expect(isResearched(state, 'ci_pipeline')).toBe(false)

    state.day = finishDay
    researchDay(state)
    researchDay(state)
    expect(state.research.done.filter((id) => id === 'ci_pipeline')).toHaveLength(1)
    expect(state.research.active).toBeNull()
    expect(state.events.filter((e) => e.type === 'notice' && e.text.includes('CI pipeline'))).toHaveLength(1)
  })

  it('finishes through the daily tick', () => {
    const state = richState()
    startResearch(state, 'ux_research')
    for (let i = 0; i < 25; i++) advanceDay(state)
    expect(isResearched(state, 'ux_research')).toBe(true)
    drainEvents(state)
  })

  it('names the product types and features a completion unlocks', () => {
    const text = completionText(getResearch('ml_foundations')!)
    expect(text).toContain('Machine learning')
    expect(text).toContain('AI Product')
    expect(text).toContain('Voice interface')
  })
})

describe('what research does', () => {
  it('speeds up one discipline', () => {
    const plain = makeState([makeEmployee(1, { design: 50, engineering: 50, qa: 50 })], 4)
    const fast = makeState([makeEmployee(1, { design: 50, engineering: 50, qa: 50 })], 4)
    finish(fast, 'ux_research')
    const a = dailyContribution(plain.employees[0], plain)
    const b = dailyContribution(fast.employees[0], fast)
    expect(b.design).toBeCloseTo(a.design * effectOf('ux_research'))
    expect(b.engineering).toBeCloseTo(a.engineering)
    expect(b.qa).toBeCloseTo(a.qa)
  })

  it('shows up in the team-rate estimate the new-project dialog uses', () => {
    const state = makeState([makeEmployee(1, { engineering: 60 })])
    const before = teamRate(state).engineering
    finish(state, 'ci_pipeline')
    expect(teamRate(state).engineering).toBeCloseTo(before * effectOf('ci_pipeline'))
  })

  it('raises quality, capped at 100', () => {
    const state = richState()
    const project = state.offices[0].project!
    for (const d of DISCIPLINES) project.progress[d] = project.target[d] * 1.2
    const plain = projectQuality(state, project)
    expect(plain).toBeCloseTo(computeQuality(project))
    finish(state, 'design_system', 'ux_research', 'beta_program', 'test_automation')
    expect(projectQuality(state, project)).toBeCloseTo(Math.min(100, plain * effectOf('design_system') * effectOf('beta_program')))
    for (const d of DISCIPLINES) project.progress[d] = project.target[d] * 1.5
    expect(projectQuality(state, project)).toBeLessThanOrEqual(100)
  })

  it('cuts wages but not rent', () => {
    const state = richState()
    const rentOnly = monthlyBurn(state) - monthlySalaries(state)
    const payroll = monthlySalaries(state)
    finish(state, 'payroll_automation')
    expect(monthlySalaries(state)).toBeCloseTo(payroll * effectOf('payroll_automation'))
    expect(monthlyBurn(state) - monthlySalaries(state)).toBeCloseTo(rentOnly)
  })

  it('stacks revenue bonuses', () => {
    const state = richState()
    const income = dailyIncome(state)
    finish(state, 'marketing_dept', 'brand_partnerships')
    const both = effectOf('marketing_dept') * effectOf('brand_partnerships')
    expect(dailyIncome(state)).toBeCloseTo(income * both)
    expect(statMultiplier(state, 'revenue')).toBeCloseTo(both)
  })

  it('grows skills faster', () => {
    const grow = (research: boolean) => {
      const state = makeState([makeEmployee(1, { engineering: 40 })], 6)
      if (research) finish(state, 'ci_pipeline', 'code_review')
      startProject(state, 'web_app', [])
      workDay(state)
      return state.employees[0].skills.engineering - 40
    }
    // ci_pipeline also speeds engineering up, so more points are applied: expect at least the skill-gain bonus.
    expect(grow(true)).toBeGreaterThan(grow(false) * effectOf('code_review'))
  })

  it('brings better candidates', () => {
    let better = 0
    for (let seed = 1; seed <= 30; seed++) {
      const a = createInitialState(seed)
      const b = createInitialState(seed)
      finish(b, 'recruiting_network')
      const x = generateEmployee(a, 'developer').skills.engineering
      const y = generateEmployee(b, 'developer').skills.engineering
      expect(y).toBeGreaterThanOrEqual(x)
      if (y > x) better += 1
    }
    expect(better).toBeGreaterThan(20)
  })
})

describe('locked content', () => {
  it('explains why a product type or feature is locked', () => {
    const state = makeState()
    const ai = PRODUCT_TYPES.find((t) => t.id === 'ai_product')!
    expect(productTypeLock(state, ai)).toBe('Not until the AI wave')
    state.day = dayOfEra(3)
    expect(productTypeLock(state, ai)).toBe('Reputation 70 · Research: Machine learning')
    state.reputation = 80
    expect(productTypeLock(state, ai)).toBe('Research: Machine learning')
    finish(state, 'ml_foundations')
    expect(productTypeLock(state, ai)).toBeNull()

    const voice = FEATURES.find((f) => f.id === 'voice')!
    const fresh = makeState()
    expect(featureLock(fresh, voice)).toBe('Research: Machine learning')
    finish(fresh, 'ml_foundations')
    expect(featureLock(fresh, voice)).toBeNull()
  })

  it('keeps research-gated types out of the unlocked list until both reputation and research are there', () => {
    const state = makeState([makeEmployee(1)])
    state.reputation = 100
    state.day = dayOfEra(3)
    expect(unlockedProductTypes(state).map((t) => t.id)).not.toContain('ai_product')
    finish(state, 'ml_foundations')
    expect(unlockedProductTypes(state).map((t) => t.id)).toContain('ai_product')
    expect(unlockedProductTypes(state).map((t) => t.id)).not.toContain('cloud_platform')
  })

  it('startProject rejects locked features and types, and accepts them once researched', () => {
    const state = makeState([makeEmployee(1, { engineering: 50 })])
    state.reputation = 100
    state.money = 1_000_000
    state.day = dayOfEra(3)
    expect(startProject(state, 'web_app', ['voice'])).toEqual({
      ok: false,
      reason: 'Voice interface is locked: Research: Machine learning',
    })
    expect(startProject(state, 'ai_product', []).ok).toBe(false)
    expect(state.offices[0].project).toBeNull()

    finish(state, 'ml_foundations')
    expect(startProject(state, 'ai_product', ['voice', 'ml_recs']).ok).toBe(true)
  })

  it('market news never mentions types the player cannot build yet', () => {
    const texts: string[] = []
    for (let seed = 1; seed <= 400; seed++) {
      const state = createInitialState(seed)
      state.reputation = 100 // reputation is enough, research is not
      for (let m = 0; m < 12; m++) updateMarket(state)
      for (const e of state.events) if (e.type === 'notice') texts.push(e.text)
    }
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.some((t) => t.includes('AI Product') || t.includes('Cloud Platform'))).toBe(false)
  })
})

describe('saving with research', () => {
  it('keeps finished and active research', () => {
    const state = richState()
    finish(state, 'ci_pipeline')
    startResearch(state, 'code_review')
    const restored = deserialize(serialize(state))!
    expect(restored.research).toEqual(state.research)
  })

  it('drops research this build does not know', () => {
    const raw = JSON.parse(serialize(richState()))
    raw.research = { done: ['ci_pipeline', 'removed_later'], active: { id: 'also_removed', finishDay: 9 } }
    expect(deserialize(JSON.stringify(raw))!.research).toEqual({ done: ['ci_pipeline'], active: null })
  })

  it('drops unusable research entries but rejects a broken active one', () => {
    const raw = JSON.parse(serialize(richState()))
    raw.research = { done: [3, null, 'ci_pipeline'], active: null }
    expect(deserialize(JSON.stringify(raw))!.research.done).toEqual(['ci_pipeline'])

    raw.research = { done: [], active: { id: 'ci_pipeline', finishDay: 'soon' } }
    expect(deserialize(JSON.stringify(raw))).toBeNull()
  })
})

describe('store', () => {
  it('starts research and publishes the change; failures change nothing', () => {
    const store = createStore(richState(), 0)
    const version = store.version.value
    expect(store.startResearch('ci_pipeline').ok).toBe(true)
    expect(store.version.value).toBeGreaterThan(version)

    const after = store.version.value
    expect(store.startResearch('marketing_dept').ok).toBe(false)
    expect(store.version.value).toBe(after)
  })
})
