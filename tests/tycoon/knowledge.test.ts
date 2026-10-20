import { describe, expect, it } from 'vitest'
import {
  KNOWLEDGE_PER_DAY,
  KNOWLEDGE_PRODUCT_HALF,
  KNOWLEDGE_PRODUCT_MAX,
  KNOWLEDGE_TYPE_HALF,
  KNOWLEDGE_TYPE_MAX,
} from '@/lib/tycoon/sim/balance'
import { knowledgeSpeed, learn, productDays, topExpertise, typeDays } from '@/lib/tycoon/sim/knowledge'
import { startProject } from '@/lib/tycoon/sim/project'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { advance } from '@/lib/tycoon/sim/tick'
import { dailyContribution, estimateDays, expectedContribution, subjectOf } from '@/lib/tycoon/sim/work'
import { makeEmployee, makeProduct, makeState } from './helpers'

const web = { typeId: 'web_app', productId: 7 }

describe('knowledge', () => {
  it('starts at nothing and is learned a day at a time, for the type and the product', () => {
    const person = makeEmployee(1, { engineering: 50 })
    expect(typeDays(person, 'web_app')).toBe(0)
    learn(person, web)
    learn(person, web)
    learn(person, { typeId: 'web_app', productId: 8 })
    expect(typeDays(person, 'web_app')).toBe(3 * KNOWLEDGE_PER_DAY)
    expect(productDays(person, 7)).toBe(2 * KNOWLEDGE_PER_DAY)
    expect(productDays(person, 8)).toBe(KNOWLEDGE_PER_DAY)
  })

  it('learns the type but no product from client work', () => {
    const person = makeEmployee(1)
    learn(person, null)
    expect(person.knowledge).toBeUndefined()
    learn(person, { typeId: 'web_app', productId: null })
    expect(typeDays(person, 'web_app')).toBe(1)
    expect(person.knowledge!.products).toEqual({})
  })

  it('makes no difference to a newcomer, then a little to someone who knows the type, then more with the product', () => {
    const person = makeEmployee(1)
    expect(knowledgeSpeed(person, web)).toBe(1)
    expect(knowledgeSpeed(person, null)).toBe(1)
    person.knowledge = { types: { web_app: KNOWLEDGE_TYPE_HALF }, products: {} }
    expect(knowledgeSpeed(person, web)).toBeCloseTo(1 + KNOWLEDGE_TYPE_MAX / 2, 10)
    person.knowledge.products['7'] = KNOWLEDGE_PRODUCT_HALF
    expect(knowledgeSpeed(person, web)).toBeCloseTo(1 + KNOWLEDGE_TYPE_MAX / 2 + KNOWLEDGE_PRODUCT_MAX / 2, 10)
    expect(knowledgeSpeed(person, { typeId: 'game', productId: 7 })).toBeCloseTo(1 + KNOWLEDGE_PRODUCT_MAX / 2, 10)
  })

  it('never passes the maximum, however long they work', () => {
    const person = makeEmployee(1)
    person.knowledge = { types: { web_app: 1e9 }, products: { '7': 1e9 } }
    expect(knowledgeSpeed(person, web)).toBeLessThanOrEqual(1 + KNOWLEDGE_TYPE_MAX + KNOWLEDGE_PRODUCT_MAX)
    expect(knowledgeSpeed(person, web)).toBeGreaterThan(1 + KNOWLEDGE_TYPE_MAX + KNOWLEDGE_PRODUCT_MAX - 0.001)
  })

  it('speeds up expected and daily output, and the estimate for a job', () => {
    const state = makeState([makeEmployee(1, { design: 40, engineering: 40, qa: 40 })])
    const person = state.employees[0]
    const plain = expectedContribution(person, state, web).engineering
    person.knowledge = { types: { web_app: 1000 }, products: { '7': 1000 } }
    expect(expectedContribution(person, state, web).engineering).toBeGreaterThan(plain)
    expect(expectedContribution(person, state, { typeId: 'game', productId: null }).engineering).toBeCloseTo(plain, 10)
    expect(expectedContribution(person, state).engineering).toBeCloseTo(plain, 10)
    const target = { design: 100, engineering: 100, qa: 100 }
    expect(estimateDays(state, target, state.offices[0], web)).toBeLessThan(estimateDays(state, target, state.offices[0]))
    expect(dailyContribution(person, state, web).engineering).toBeGreaterThan(0)
  })

  it('names a project’s subject: the product it is, or the one it updates, none for client work', () => {
    const state = makeState([makeEmployee(1, { design: 40, engineering: 40, qa: 40 })])
    startProject(state, 'web_app', [])
    const project = state.offices[0].project!
    expect(subjectOf(project)).toEqual({ typeId: 'web_app', productId: project.id })
    expect(subjectOf({ ...project, kind: 'update', parentId: 42 })).toEqual({ typeId: 'web_app', productId: 42 })
    expect(subjectOf({ ...project, kind: 'contract' })).toBeNull()
  })

  it('builds up in the people who work on a project, day by day', () => {
    const state = makeState([makeEmployee(1, { design: 40, engineering: 40, qa: 40 }), makeEmployee(2, { design: 40, engineering: 40, qa: 40 })])
    startProject(state, 'web_app', [])
    const id = state.offices[0].project!.id
    advance(state, 10)
    for (const person of state.employees) {
      expect(typeDays(person, 'web_app')).toBe(10)
      expect(productDays(person, id)).toBe(10)
    }
  })

  it('does not build while someone is training and does no work', () => {
    const state = makeState([makeEmployee(1, { design: 40, engineering: 40, qa: 40 })])
    startProject(state, 'web_app', [])
    state.employees[0].training = { discipline: 'qa', finishDay: 50 }
    advance(state, 5)
    expect(state.employees[0].knowledge).toBeUndefined()
  })

  it('goes away with the person and survives a save', () => {
    const state = makeState([makeEmployee(1, { design: 40, engineering: 40, qa: 40 })])
    state.employees[0].knowledge = { types: { web_app: 12 }, products: { '3': 4 } }
    const loaded = deserialize(serialize(state))!
    expect(loaded.employees[0].knowledge).toEqual({ types: { web_app: 12 }, products: { '3': 4 } })
    const raw = JSON.parse(serialize(state))
    raw.employees[0].knowledge = { types: { web_app: 'lots' }, products: {} }
    expect(deserialize(JSON.stringify(raw))).toBeNull()
  })

  it('lists what a person knows best, with the product’s name', () => {
    const state = makeState([makeEmployee(1)])
    state.products.push(makeProduct({ id: 7, name: 'Nimbus' }))
    const person = state.employees[0]
    expect(topExpertise(state, person)).toEqual([])
    person.knowledge = { types: { web_app: 50, game: 5 }, products: { '7': 30, '99': 2 } }
    const rows = topExpertise(state, person)
    expect(rows.map((r) => [r.kind, r.name, r.days])).toEqual([
      ['type', 'web_app', 50],
      ['product', 'Nimbus', 30],
      ['type', 'game', 5],
      ['product', 'a past product', 2],
    ])
    expect(topExpertise(state, person, 2)).toHaveLength(2)
  })
})
