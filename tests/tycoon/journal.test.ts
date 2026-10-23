import { describe, expect, it } from 'vitest'
import { createStore } from '@/lib/tycoon/store'
import { exportJournal, JOURNAL_LIMIT, logEntry } from '@/lib/tycoon/sim/journal'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { advance } from '@/lib/tycoon/sim/tick'
import { DAYS_PER_MONTH } from '@/lib/tycoon/sim/balance'
import { DISCIPLINES } from '@/lib/tycoon/sim/types'
import { makeProduct } from './helpers'

describe('the run log', () => {
  it('starts empty and gets a snapshot every month', () => {
    const state = createInitialState(5)
    expect(state.journal).toEqual([])
    advance(state, DAYS_PER_MONTH * 3)
    const months = state.journal.filter((e) => e.kind === 'month')
    expect(months).toHaveLength(3)
    expect(months[0].data).toMatchObject({ employees: 2, offices: 1 })
    expect(months[0].cash).toBeTypeOf('number')
  })

  it('records the player\'s decisions with what they saw', () => {
    const state = createInitialState(5)
    state.offices[0].kind = 'garage' // room to hire
    state.money = 100_000
    const store = createStore(state)
    expect(store.startProject('web_app', []).ok).toBe(true)
    const started = state.journal.find((e) => e.kind === 'project.start')
    expect(started?.text).toContain('Web')
    expect(started?.data).toMatchObject({ type: 'web_app', office: expect.any(String) })

    const candidate = state.candidates[0]
    const before = state.journal.length
    expect(store.hire(candidate.id).ok).toBe(true)
    const hired = state.journal[before]
    expect(hired.kind).toBe('hire')
    expect(hired.text).toContain(candidate.name)
    expect(hired.data).toMatchObject({ salary: Math.round(candidate.salary) })
  })

  it('lists each product with what it earns a day in the month snapshot', () => {
    const state = createInitialState(5)
    state.products.push(makeProduct({ id: 40, name: 'Atlas', users: 30_000, reach: 30_000 }))
    advance(state, DAYS_PER_MONTH)
    const month = state.journal.find((e) => e.kind === 'month')!
    const line = (month.data?.productList as string[])[0]
    expect(line).toMatch(/^Atlas \(web_app, small, \d+ users, \$\d+\/day, quality \d+/)
    expect(Number(/\$(\d+)\/day/.exec(line)![1])).toBeGreaterThan(0)
  })

  it('leaves a failed command out', () => {
    const state = createInitialState(5)
    const store = createStore(state)
    expect(store.hire(-1).ok).toBe(false)
    expect(state.journal).toEqual([])
  })

  it('survives a save, caps its length, and exports with a summary', () => {
    const state = createInitialState(5)
    logEntry(state, 'x', 'one')
    expect(deserialize(serialize(state))?.journal).toHaveLength(1)
    for (let i = 0; i < JOURNAL_LIMIT + 10; i++) logEntry(state, 'x', String(i))
    expect(state.journal).toHaveLength(JOURNAL_LIMIT)
    const exported = JSON.parse(exportJournal(state))
    expect(exported.summary).toMatchObject({ ended: false, offices: 1 })
    expect(exported.journal).toHaveLength(JOURNAL_LIMIT)
  })

  it('loads a save from before the log existed', () => {
    const raw = JSON.parse(serialize(createInitialState(5)))
    delete raw.journal
    expect(deserialize(JSON.stringify(raw))?.journal).toEqual([])
  })
})

describe('the run log and launches', () => {
  it('logs a launch that takes off as a hit, and one that does not as none', () => {
    const launch = (features: string[]) => {
      const state = createInitialState(3)
      state.offices[0].kind = 'garage'
      state.money = 100_000
      state.rivals = []
      state.rivalProducts = []
      const store = createStore(state)
      expect(store.startProject('web_app', features, 'small', undefined, 'web_business').ok).toBe(true)
      const project = state.offices[0].project!
      for (const d of DISCIPLINES) project.progress[d] = project.target[d] * 1.5
      expect(store.shipProject().ok).toBe(true)
      const result = state.journal.find((e) => e.kind === 'ship.result')!
      expect(result.data?.hit).toBe(state.products[0].hit)
      return state
    }
    const hit = launch(['payments', 'accounts', 'analytics', 'search', 'cloud_sync'])
    expect(hit.products[0].hit).toBe(true)
    expect(hit.journal.some((e) => e.kind === 'hit')).toBe(true)
    const miss = launch([])
    expect(miss.products[0].hit).toBe(false)
    expect(miss.journal.some((e) => e.kind === 'hit')).toBe(false)
  })
})
