import { describe, expect, it } from 'vitest'
import { createStore } from '@/lib/tycoon/store'
import { exportJournal, JOURNAL_LIMIT, logEntry } from '@/lib/tycoon/sim/journal'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { advance } from '@/lib/tycoon/sim/tick'
import { DAYS_PER_MONTH } from '@/lib/tycoon/sim/balance'

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
