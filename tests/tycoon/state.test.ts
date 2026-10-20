import { describe, expect, it } from 'vitest'
import { startProject } from '@/lib/tycoon/sim/project'
import { createInitialState, deserialize, serialize, STATE_VERSION } from '@/lib/tycoon/sim/state'
import { advance } from '@/lib/tycoon/sim/tick'

function play(seed: number) {
  const state = createInitialState(seed)
  state.money = 100_000
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

describe('upgrading a version 3 save', () => {
  /** What a version 3 save looks like: no fixing jobs, on-call pair, past products or hidden bugs, and a bug-fixing sprint holding the office. */
  function v3(): Record<string, any> {
    const state = createInitialState(4)
    state.money = 100_000
    startProject(state, 'web_app', ['accounts'])
    state.products.push({
      id: 77, name: 'Old', productTypeId: 'web_app', size: 'small', featureIds: [], quality: 70, releaseDay: 1, reach: 1000, users: 500,
      bugs: 9, pendingBugs: 0, hit: false, totalRevenue: 10, updates: [], boostUntil: 0, boostUsers: 0,
    })
    const raw = JSON.parse(serialize(state))
    raw.version = 3
    delete raw.fixes
    delete raw.onCall
    delete raw.retired
    for (const p of raw.products) delete p.pendingBugs
    raw.rivals = raw.rivals.slice(0, 5)
    raw.rivalProducts = raw.rivalProducts.filter((p: any) => raw.rivals.some((r: any) => r.id === p.rivalId))
    return raw
  }

  it('brings the new fields, drops a sprint that held an office, and adds the new studios', () => {
    const raw = v3()
    raw.offices[0].project = {
      ...raw.offices[0].project, kind: 'fix', parentId: 77, bugs: 9, bugsFixed: 3,
    }
    const upgraded = deserialize(JSON.stringify(raw))!
    expect(upgraded).not.toBeNull()
    expect(upgraded.version).toBe(STATE_VERSION)
    expect(upgraded.offices[0].project).toBeNull()
    expect(upgraded.fixes).toEqual([])
    expect(upgraded.onCall).toBeNull()
    expect(upgraded.retired).toEqual([])
    expect(upgraded.products.every((p) => p.pendingBugs === 0)).toBe(true)
    expect(upgraded.products.find((p) => p.id === 77)!.bugs).toBe(9) // the bugs stay
    expect(upgraded.rivals.length).toBeGreaterThanOrEqual(5) // the rest move in as their years come
  })

  it('keeps an ordinary project, without the sprint fields', () => {
    const raw = v3()
    raw.offices[0].project.bugs = 0
    raw.offices[0].project.bugsFixed = 0
    const upgraded = deserialize(JSON.stringify(raw))!
    expect(upgraded.offices[0].project).not.toBeNull()
    expect(upgraded.offices[0].project).not.toHaveProperty('bugs')
  })

  it('still rejects older versions and a version 3 save with a missing field', () => {
    const raw = v3()
    raw.version = 2
    expect(deserialize(JSON.stringify(raw))).toBeNull()
    const broken = v3()
    delete broken.money
    expect(deserialize(JSON.stringify(broken))).toBeNull()
  })
})
