import { describe, expect, it, vi } from 'vitest'
import { cashRunwayDays, dailyIncome, netPerDay } from '@/lib/tycoon/sim/economy'
import { deskCount } from '@/lib/tycoon/sim/offices'
import { startProject } from '@/lib/tycoon/sim/project'
import { advance } from '@/lib/tycoon/sim/tick'
import { estimateDays, teamRate } from '@/lib/tycoon/sim/work'
import { createStore, MS_PER_DAY } from '@/lib/tycoon/store'
import { makeEmployee, makeProduct, makeState, richState } from './helpers'

const strongTeam = () => [
  makeEmployee(100, { design: 60, engineering: 60, qa: 60 }),
  makeEmployee(101, { design: 60, engineering: 60, qa: 60 }),
]

/** Feeds `days` worth of 1x real time as small frames. */
function tickDays(store: ReturnType<typeof createStore>, days: number): void {
  for (let i = 0; i < days * 6; i++) store.tick(MS_PER_DAY / 6)
}

/** Ticks in small frames until the project is ready (or `maxDays` pass). */
function runUntilDialog(store: ReturnType<typeof createStore>, maxDays = 200): void {
  for (let i = 0; i < maxDays * 6 && store.dialog.value === null; i++) store.tick(MS_PER_DAY / 6)
}

describe('store.tick', () => {
  it('does not advance while paused', () => {
    const store = createStore(makeState(strongTeam()), 0)
    tickDays(store, 2)
    expect(store.state.day).toBe(0)
  })

  it('advances one day per MS_PER_DAY at 1x and scales with speed', () => {
    const slow = createStore(makeState(strongTeam()), 1)
    tickDays(slow, 1)
    expect(slow.state.day).toBe(1)

    const fast = createStore(makeState(strongTeam()), 2)
    tickDays(fast, 1)
    expect(fast.state.day).toBe(2)
  })

  it('ignores the rest of a very long frame', () => {
    const store = createStore(makeState(strongTeam()), 1)
    store.tick(60_000)
    expect(store.state.day).toBe(0)
  })

  it('bumps version only when a day passed', () => {
    const store = createStore(makeState(strongTeam()), 1)
    store.tick(10)
    expect(store.version.value).toBe(0)
    tickDays(store, 1)
    expect(store.version.value).toBeGreaterThan(0)
  })

  it('stops while a dialog is open and resumes when it closes', () => {
    const store = createStore(makeState(strongTeam()), 1)
    store.openDialog({ kind: 'new-project' })
    tickDays(store, 2)
    expect(store.state.day).toBe(0)
    store.closeDialog()
    tickDays(store, 1)
    expect(store.state.day).toBe(1)
  })
})

describe('project flow', () => {
  it('starting a project closes the dialog and unpauses a paused game', () => {
    const store = createStore(makeState(strongTeam()), 0)
    store.openDialog({ kind: 'new-project' })
    expect(store.startProject('web_app', ['accounts']).ok).toBe(true)
    expect(store.dialog.value).toBeNull()
    expect(store.speed.value).toBe(1)
    expect(store.state.offices[0].project).not.toBeNull()
  })

  it('keeps the dialog open when the project is rejected', () => {
    const store = createStore(makeState(strongTeam()), 0)
    store.openDialog({ kind: 'new-project' })
    expect(store.startProject('saas_platform', []).ok).toBe(false)
    expect(store.dialog.value).toEqual({ kind: 'new-project' })
    expect(store.speed.value).toBe(0)
  })

  it('opens the ready dialog once, and ticking stays halted until it is closed', () => {
    const store = createStore(makeState(strongTeam()), 1)
    store.startProject('web_app', [])
    runUntilDialog(store)
    expect(store.dialog.value).toEqual({ kind: 'ready', officeId: store.state.offices[0].id })

    const day = store.state.day
    tickDays(store, 2)
    expect(store.state.day).toBe(day)

    store.closeDialog()
    runUntilDialog(store, 3)
    expect(store.dialog.value).toBeNull()
  })

  it('shipping opens a result dialog with the reputation change and early flag', () => {
    const store = createStore(makeState(strongTeam()), 1)
    store.startProject('web_app', [])
    runUntilDialog(store)
    const result = store.shipProject()
    expect(result.ok).toBe(true)

    const dialog = store.dialog.value
    expect(dialog?.kind).toBe('result')
    if (dialog?.kind !== 'result') return
    expect(dialog.early).toBe(false)
    expect(dialog.reputationDelta).toBeCloseTo(store.state.reputation)
    expect(store.state.products.map((p) => p.id)).toContain(dialog.productId)
    expect(store.state.offices[0].project).toBeNull()
  })

  it('flags a rushed ship as early', () => {
    const store = createStore(makeState(strongTeam()), 1)
    store.startProject('web_app', [])
    store.tick(MS_PER_DAY / 6)
    store.shipProject()
    expect(store.dialog.value).toMatchObject({ kind: 'result', early: true })
  })

  it('rejects shipping with no project', () => {
    const store = createStore(makeState(strongTeam()), 1)
    expect(store.shipProject().ok).toBe(false)
    expect(store.dialog.value).toBeNull()
  })

  it('offers an investor lifeline first, and opens game-over once it is declined', () => {
    const state = makeState([makeEmployee(100, {}, 3000)])
    state.money = -1
    const store = createStore(state, 2)
    runUntilDialog(store, 60)
    expect(store.dialog.value).toEqual({ kind: 'event' })
    expect(state.pendingEvent?.id).toBe('investor')

    expect(store.resolveEvent(1).ok).toBe(true) // "No thanks"
    runUntilDialog(store, 60)
    expect(store.dialog.value).toEqual({ kind: 'game-over' })
    expect(store.running()).toBe(false)
  })
})

describe('estimates', () => {
  it('teamRate sums skill-based output across the team', () => {
    const state = makeState([makeEmployee(1, { engineering: 50 }), makeEmployee(2, { engineering: 30, qa: 20 })])
    const rate = teamRate(state)
    expect(rate.engineering).toBeCloseTo(8)
    expect(rate.qa).toBeCloseTo(2)
    expect(rate.design).toBe(0)
  })

  it('estimateDays uses the slowest discipline and is Infinity with no output', () => {
    const state = makeState([makeEmployee(1, { design: 10, engineering: 100, qa: 10 })])
    expect(estimateDays(state, { design: 10, engineering: 100, qa: 10 })).toBe(10)
    expect(estimateDays(state, { design: 0, engineering: 50, qa: 0 })).toBe(5)

    const useless = makeState([makeEmployee(1, { engineering: 100 })])
    expect(estimateDays(useless, { design: 10, engineering: 10, qa: 10 })).toBe(Infinity)
    expect(estimateDays(makeState([]), { design: 0, engineering: 0, qa: 0 })).toBe(0)
  })

  it('dailyIncome sums what products earn today', () => {
    const state = makeState(strongTeam())
    expect(dailyIncome(state)).toBe(0)
    startProject(state, 'web_app', [])
    advance(state, 40)
    state.products.push(makeProduct({ id: 900, name: 'X', releaseDay: state.day - 3, users: 1000 }))
    expect(dailyIncome(state)).toBeGreaterThan(0)
  })
})

describe('team commands', () => {
  it('hire adds the candidate, charges the fee, and publishes the change', () => {
    const store = createStore(makeState([makeEmployee(100)]), 0)
    const candidate = store.state.candidates[0]
    const before = store.state.money
    const version = store.version.value

    expect(store.hire(candidate.id).ok).toBe(true)
    expect(store.state.employees.map((e) => e.id)).toContain(candidate.id)
    expect(store.state.money).toBe(before - candidate.salary)
    expect(store.version.value).toBeGreaterThan(version)
  })

  it('failed commands change nothing and do not bump the version', () => {
    const store = createStore(makeState([makeEmployee(100), makeEmployee(101), makeEmployee(102), makeEmployee(103)]), 0)
    const version = store.version.value
    expect(store.hire(store.state.candidates[0].id).ok).toBe(false) // the garage is full
    expect(store.fire(999).ok).toBe(false)
    store.state.money = 0
    store.state.stage = 1
    expect(store.moveOut().ok).toBe(false)
    expect(store.openOffice().ok).toBe(false)
    expect(store.version.value).toBe(version)
  })

  it('fire removes an employee; moving out and opening offices grow the desk count and show the new office', () => {
    const store = createStore(makeState([makeEmployee(100), makeEmployee(101)]), 0)
    expect(store.fire(100).ok).toBe(true)
    expect(store.state.employees).toHaveLength(1)

    store.state.money = 1_000_000
    store.state.stage = 3
    expect(store.moveOut().ok).toBe(true)
    expect(deskCount(store.state)).toBe(12)
    expect(store.openOffice().ok).toBe(true)
    expect(deskCount(store.state)).toBe(24)
    expect(store.selectedOffice.value).toBe(store.state.offices[1].id)

    // Commands go to the office on screen: the new one has nobody to start a project with.
    expect(store.startProject('web_app', []).ok).toBe(false)
    expect(store.transfer(101, store.state.offices[1].id).ok).toBe(true)
    expect(store.startProject('web_app', []).ok).toBe(true)
    expect(store.state.offices[1].project).not.toBeNull()
    expect(store.state.offices[0].project).toBeNull()
  })

  it('the result dialog lists product types the release unlocked', () => {
    const store = createStore(makeState(strongTeam()), 1)
    store.state.reputation = 9.5
    store.startProject('web_app', [])
    runUntilDialog(store)
    store.shipProject()
    expect(store.dialog.value).toMatchObject({ kind: 'result', unlocked: ['Mobile App'] })
  })

  it('reports nothing unlocked when no threshold is crossed', () => {
    const store = createStore(makeState(strongTeam()), 1)
    store.startProject('web_app', [])
    runUntilDialog(store)
    store.shipProject()
    expect(store.dialog.value).toMatchObject({ kind: 'result', unlocked: [] })
  })
})

describe('cash runway', () => {
  it('is null while income covers costs and counts down days otherwise', () => {
    const state = makeState([makeEmployee(100, {}, 3000)])
    state.money = 3000
    // burn: (3000 + 150 garage rent) / 30 = 105 per day
    expect(netPerDay(state)).toBeCloseTo(-105)
    expect(cashRunwayDays(state)).toBeCloseTo(3000 / 105)

    state.money = -50
    expect(cashRunwayDays(state)).toBe(0)

    state.products.push(makeProduct({ id: 1, name: 'Earner', quality: 90, releaseDay: state.day - 10, users: 100_000 }))
    expect(cashRunwayDays(state)).toBeNull()
  })
})

describe('random events in the store', () => {
  it('resumes on the pending event when a game is loaded', () => {
    const state = makeState(strongTeam())
    state.pendingEvent = { id: 'press', data: {} }
    const store = createStore(state, 1)
    expect(store.dialog.value).toEqual({ kind: 'event' })
    expect(store.running()).toBe(false)
  })

  it('shows the event first and the ready dialog after it, when both arrive on one day', () => {
    const state = makeState(strongTeam())
    startProject(state, 'web_app', [])
    const project = state.offices[0].project!
    project.progress = { ...project.target }
    project.progress.engineering -= 0.001 // ready on the next day's work

    const store = createStore(state, 2)
    // An event rolled during the day, as `rollRandomEvent` would leave things.
    state.pendingEvent = { id: 'press', data: {} }
    state.events.push({ type: 'randomEvent' })
    runUntilDialog(store, 5)
    expect(store.dialog.value).toEqual({ kind: 'event' })

    expect(store.resolveEvent(0).ok).toBe(true)
    expect(store.dialog.value).toEqual({ kind: 'ready', officeId: store.state.offices[0].id })
    store.closeDialog()
    expect(store.dialog.value).toBeNull()
  })

  it('turns the outcome into a toast that removes itself', () => {
    vi.useFakeTimers()
    try {
      const state = makeState(strongTeam())
      state.pendingEvent = { id: 'press', data: {} }
      const store = createStore(state, 0)
      expect(store.toasts.value).toEqual([])

      store.resolveEvent(0)
      expect(store.dialog.value).toBeNull()
      expect(store.toasts.value).toHaveLength(1)
      expect(store.toasts.value[0].text).toMatch(/congratulations/i)

      vi.advanceTimersByTime(6000)
      expect(store.toasts.value).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the dialog open when the chosen option cannot be afforded', () => {
    const state = makeState(strongTeam())
    state.pendingEvent = { id: 'hardware', data: {} }
    state.money = 10
    const store = createStore(state, 0)
    expect(store.resolveEvent(0).ok).toBe(false) // "Buy replacements"
    expect(store.dialog.value).toEqual({ kind: 'event' })
    expect(state.pendingEvent).not.toBeNull()
  })

  it('shows market news as toasts', () => {
    vi.useFakeTimers()
    try {
      const store = createStore(makeState(strongTeam()), 1)
      store.state.events.push({ type: 'notice', text: 'Web App demand is surging: +30%.' })
      store.state.day = 29 // the next day is a month boundary, but any day's events get drained
      store.tick(MS_PER_DAY / 6) // not enough for a day: nothing yet
      expect(store.toasts.value).toEqual([])
      for (let i = 0; i < 6; i++) store.tick(MS_PER_DAY / 6)
      expect(store.toasts.value.some((t) => t.text.includes('surging'))).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('staff commands', () => {
  it('training and outings charge money, publish the change, and refuse politely', () => {
    const store = createStore(richState(), 0)
    const person = store.state.employees[0]
    const version = store.version.value

    expect(store.train(person.id, 'qa').ok).toBe(true)
    expect(person.training?.discipline).toBe('qa')
    expect(store.version.value).toBeGreaterThan(version)

    expect(store.teamOuting().ok).toBe(true)
    const after = store.version.value
    expect(store.teamOuting().ok).toBe(false) // cooldown
    expect(store.train(person.id, 'design').ok).toBe(false) // already training
    expect(store.version.value).toBe(after)
  })

  it('an employee dialog can be opened and closed like any other', () => {
    const store = createStore(richState(), 1)
    store.openDialog({ kind: 'employee', id: store.state.employees[0].id })
    expect(store.running()).toBe(false)
    store.closeDialog()
    expect(store.running()).toBe(true)
  })
})
