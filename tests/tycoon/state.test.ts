import { describe, expect, it } from 'vitest'
import { startProject } from '@/lib/tycoon/sim/project'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { advance } from '@/lib/tycoon/sim/tick'

function play(seed: number) {
  const state = createInitialState(seed)
  startProject(state, 'web_app', ['accounts'])
  advance(state, 40)
  return state
}

describe('determinism', () => {
  it('same seed gives identical state; different seeds diverge', () => {
    expect(play(7)).toEqual(play(7))
    expect(play(7)).not.toEqual(play(8))
  })
})

describe('createInitialState', () => {
  it('starts with a developer, a designer, a hire pool, and no project', () => {
    const state = createInitialState(1)
    expect(state.employees.map((e) => e.role).sort()).toEqual(['designer', 'developer'])
    expect(state.candidates.length).toBeGreaterThan(0)
    expect(state.offices[0].project).toBeNull()
    expect(state.day).toBe(0)
  })

  it('gives every person a unique id', () => {
    const state = createInitialState(1)
    const ids = [...state.employees, ...state.candidates].map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('serialize / deserialize', () => {
  it('round-trips a mid-game state and the restored game continues identically', () => {
    const original = play(3)
    const restored = deserialize(serialize(original))!
    expect(restored).toEqual({ ...original, dayWork: [], events: [] })

    advance(original, 25)
    advance(restored, 25)
    // The event queue is transient (the store drains it daily); everything else must match.
    expect({ ...restored, events: [] }).toEqual({ ...original, events: [] })
  })

  it('rejects states with missing fields, unknown content, or out-of-range values', () => {
    const base = JSON.parse(serialize(play(3))) as Record<string, unknown>
    const mutate = (change: (s: Record<string, any>) => void) => {
      const copy = structuredClone(base) as Record<string, any>
      change(copy)
      return deserialize(JSON.stringify(copy))
    }
    expect(mutate(() => {})).not.toBeNull()
    expect(mutate((s) => delete s.money)).toBeNull()
    expect(mutate((s) => (s.money = 'lots'))).toBeNull()
    expect(mutate((s) => (s.stage = 99))).toBeNull()
    expect(mutate((s) => (s.stage = 0.5))).toBeNull()
    expect(mutate((s) => (s.offices = []))).toBeNull()
    expect(mutate((s) => (s.offices[0].kind = 'castle'))).toBeNull()
    expect(mutate((s) => (s.employees[0].officeId = 999))).toBeNull()
    expect(mutate((s) => (s.contracts[0].pay = 'lots'))).toBeNull()
    expect(mutate((s) => (s.signatureId = 999))).toBeNull()
    expect(mutate((s) => (s.employees = {}))).toBeNull()
    expect(mutate((s) => (s.employees[0].role = 'wizard'))).toBeNull()
    expect(mutate((s) => (s.employees[0].skills.qa = null))).toBeNull()
    expect(mutate((s) => (s.offices[0].project.productTypeId = 'hologram'))).toBeNull()
    expect(mutate((s) => s.offices[0].project.featureIds.push('teleporter'))).toBeNull()
    expect(mutate((s) => (s.offices[0].project = undefined))).toBeNull()
  })

  it('rejects garbage and other versions', () => {
    expect(deserialize('not json')).toBeNull()
    expect(deserialize('42')).toBeNull()
    expect(deserialize('null')).toBeNull()
    expect(deserialize(JSON.stringify({ ...createInitialState(1), version: 999 }))).toBeNull()
  })
})
