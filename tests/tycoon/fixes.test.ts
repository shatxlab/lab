import { describe, expect, it } from 'vitest'
import { AUTO_FIX_DENSITY, POINTS_PER_BUG } from '@/lib/tycoon/sim/balance'
import {
  availableFixers,
  clearOnCall,
  estimateFixDays,
  fixBlocker,
  fixesDay,
  fixTarget,
  onCallBlocker,
  setOnCall,
  startFix,
  stopFix,
} from '@/lib/tycoon/sim/fixes'
import { fixingIds, workersOf } from '@/lib/tycoon/sim/offices'
import { bugDensity } from '@/lib/tycoon/sim/products'
import { startProject } from '@/lib/tycoon/sim/project'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { advanceDay, drainEvents } from '@/lib/tycoon/sim/tick'
import { type GameState } from '@/lib/tycoon/sim/types'
import { teamRate, workDay } from '@/lib/tycoon/sim/work'
import { createStore } from '@/lib/tycoon/store'
import { makeEmployee, makeProduct, richState } from './helpers'

const DEV = 100
const TESTER = 104

/** A studio with no project, four developers, a tester and one live product with `bugs` open. */
function buggyStudio(bugs = 20): GameState {
  const state = richState()
  state.offices[0].project = null
  state.employees.push(makeEmployee(TESTER, { qa: 60 }, 2000, 'tester'))
  state.products = [makeProduct({ id: 50, name: 'Atlas', releaseDay: state.day - 30, bugs })]
  return state
}

/** One day of the pair's work (the fix part of a day only). */
function fixDay(state: GameState): void {
  state.day += 1
  state.dayWork = []
  fixesDay(state)
}

describe('bug-fixing pairs', () => {
  it('need points for every bug open now: engineering from the developer, QA from the tester, no design', () => {
    const state = buggyStudio(12.7)
    expect(startFix(state, 50, DEV, TESTER).ok).toBe(true)
    const [fix] = state.fixes
    expect(fix).toMatchObject({ productId: 50, developerId: DEV, testerId: TESTER, bugs: 12, bugsFixed: 0, auto: false })
    expect(fix.target).toEqual(fixTarget(12))
    expect(fix.target.design).toBe(0)
    expect(fix.target.engineering).toBeGreaterThan(fix.target.qa)
    expect(fix.target.engineering + fix.target.qa).toBeCloseTo(12 * POINTS_PER_BUG, -1)
  })

  it('refuse the wrong roles, a busy or training person, a clean product and an unknown one', () => {
    const state = buggyStudio()
    expect(startFix(state, 50, DEV, 101).ok).toBe(false) // 101 is a developer, not a tester
    expect(startFix(state, 50, TESTER, TESTER)).toEqual({ ok: false, reason: 'Pick a developer' })
    expect(startFix(state, 999, DEV, TESTER).ok).toBe(false)
    expect(startFix(state, 50, 12345, TESTER).ok).toBe(false)

    state.employees.find((e) => e.id === DEV)!.training = { discipline: 'engineering', finishDay: 999 }
    expect(startFix(state, 50, DEV, TESTER).ok).toBe(false)
    state.employees.find((e) => e.id === DEV)!.training = null

    expect(startFix(state, 50, DEV, TESTER).ok).toBe(true)
    expect(startFix(state, 50, 101, TESTER)).toEqual({ ok: false, reason: 'Already being fixed' })
    state.products.push(makeProduct({ id: 51, name: 'Beta', bugs: 9 }))
    expect(startFix(state, 51, 101, TESTER)).toEqual({ ok: false, reason: 'Test 104 is already fixing bugs' })

    const clean = buggyStudio(0.6)
    expect(fixBlocker(clean, clean.products[0])).toBe('No bugs to fix')
  })

  it('need a free developer and a free tester, and say which is missing', () => {
    const noTester = buggyStudio()
    noTester.employees = noTester.employees.filter((e) => e.role !== 'tester')
    expect(fixBlocker(noTester, noTester.products[0])).toBe('Needs a free tester')
    const noDeveloper = buggyStudio()
    noDeveloper.employees = noDeveloper.employees.filter((e) => e.role !== 'developer')
    expect(fixBlocker(noDeveloper, noDeveloper.products[0])).toBe('Needs a free developer')
    expect(fixBlocker(buggyStudio(), buggyStudio().products[0])).toBeNull()
  })

  it('take the pair off their office project; everyone else keeps building it', () => {
    const state = buggyStudio()
    const office = state.offices[0]
    const before = teamRate(state, office)
    startFix(state, 50, DEV, TESTER)
    expect(fixingIds(state)).toEqual(new Set([DEV, TESTER]))
    expect(workersOf(state, office).map((e) => e.id)).not.toContain(DEV)
    expect(workersOf(state, office)).toHaveLength(state.employees.length - 2)
    expect(teamRate(state, office).engineering).toBeLessThan(before.engineering)

    startProject(state, 'web_app', [])
    state.dayWork = []
    workDay(state)
    expect(state.dayWork.map((w) => w.employeeId)).not.toContain(DEV)
    expect(state.dayWork.map((w) => w.employeeId)).not.toContain(TESTER)
  })

  it('fix bugs as the bars fill, count each person for their own discipline, and end on their own', () => {
    const state = buggyStudio(10)
    startFix(state, 50, DEV, TESTER)
    const product = state.products[0]
    let days = 0
    while (state.fixes.length > 0 && days < 100) {
      fixDay(state)
      days += 1
      const [fix] = state.fixes
      if (fix) {
        expect(product.bugs).toBeCloseTo(10 - fix.bugsFixed)
        expect(fix.progress.engineering).toBeLessThanOrEqual(fix.target.engineering)
        expect(fix.progress.qa).toBeLessThanOrEqual(fix.target.qa)
        expect(fix.progress.design).toBe(0)
      }
    }
    expect(state.fixes).toEqual([])
    expect(product.bugs).toBe(0)
    expect(state.bugsFixed).toBe(10)
    expect(drainEvents(state).some((e) => e.type === 'notice' && e.text === 'Atlas: 10 bugs fixed.')).toBe(true)
  })

  it('show only the discipline each person works in, tinted as fixing', () => {
    const state = buggyStudio()
    startFix(state, 50, DEV, TESTER)
    fixDay(state)
    const developer = state.dayWork.find((w) => w.employeeId === DEV)!
    const tester = state.dayWork.find((w) => w.employeeId === TESTER)!
    expect(developer).toMatchObject({ fixing: true })
    expect(developer.points.engineering).toBeGreaterThan(0)
    expect(developer.points.qa).toBe(0)
    expect(tester.points.qa).toBeGreaterThan(0)
    expect(tester.points.engineering).toBe(0)
  })

  it('teach the pair: their own discipline grows while they fix', () => {
    const state = buggyStudio(40)
    startFix(state, 50, DEV, TESTER)
    const developer = state.employees.find((e) => e.id === DEV)!
    const tester = state.employees.find((e) => e.id === TESTER)!
    const [engineering, qa] = [developer.skills.engineering, tester.skills.qa]
    for (let i = 0; i < 5; i++) fixDay(state)
    expect(developer.skills.engineering).toBeGreaterThan(engineering)
    expect(tester.skills.qa).toBeGreaterThan(qa)
  })

  it('estimate how long a pair needs, better people faster', () => {
    const state = buggyStudio()
    const developer = state.employees.find((e) => e.id === DEV)!
    const tester = state.employees.find((e) => e.id === TESTER)!
    const slow = estimateFixDays(state, 30, developer, tester)
    expect(Number.isFinite(slow)).toBe(true)
    tester.skills.qa = 100
    developer.skills.engineering = 100
    expect(estimateFixDays(state, 30, developer, tester)).toBeLessThan(slow)
    tester.skills.qa = 0
    expect(estimateFixDays(state, 30, developer, tester)).toBe(Infinity)
  })

  it('can stop early and keep what was fixed', () => {
    const state = buggyStudio(30)
    startFix(state, 50, DEV, TESTER)
    for (let i = 0; i < 5; i++) fixDay(state)
    const [fix] = state.fixes
    const fixed = fix.bugsFixed
    expect(fixed).toBeGreaterThan(0)
    expect(stopFix(state, fix.id).ok).toBe(true)
    expect(state.fixes).toEqual([])
    expect(state.products[0].bugs).toBeCloseTo(30 - fixed)
    expect(stopFix(state, fix.id).ok).toBe(false)
    expect(availableFixers(state, 'tester').map((e) => e.id)).toContain(TESTER)
  })

  it('end quietly if the product or one of the pair is gone', () => {
    const gone = buggyStudio()
    startFix(gone, 50, DEV, TESTER)
    gone.products = []
    fixDay(gone)
    expect(gone.fixes).toEqual([])

    const quit = buggyStudio()
    startFix(quit, 50, DEV, TESTER)
    quit.employees = quit.employees.filter((e) => e.id !== TESTER)
    fixDay(quit)
    expect(quit.fixes).toEqual([])
  })

  it('survive a save, and a job pointing at someone who is not there is rejected', () => {
    const state = buggyStudio()
    startFix(state, 50, DEV, TESTER)
    fixDay(state)
    const restored = deserialize(serialize(state))!
    expect(restored.fixes).toEqual(state.fixes)

    const raw = JSON.parse(serialize(state))
    raw.fixes[0].testerId = 12345
    expect(deserialize(JSON.stringify(raw))).toBeNull()
  })

  it('run through the store, with a toast when stopped', () => {
    const state = buggyStudio()
    const store = createStore(state, 0)
    expect(store.startFix(50, DEV, TESTER).ok).toBe(true)
    expect(store.speed.value).toBe(1)
    expect(store.startFix(50, 101, TESTER).ok).toBe(false)
    expect(store.stopFix(state.fixes[0].id).ok).toBe(true)
    expect(store.toasts.value.some((t) => t.text.startsWith('Stopped fixing Atlas'))).toBe(true)
  })
})

describe('Incident management', () => {
  /** A studio with the research done and a buggy product. */
  function onCallStudio(bugs = 20): GameState {
    const state = buggyStudio(bugs)
    state.research.done.push('incident_management')
    return state
  }

  it('needs the research before anyone can be put on call', () => {
    const state = buggyStudio()
    expect(onCallBlocker(state, DEV, TESTER)).toBe('Research Incident management first')
    expect(setOnCall(state, DEV, TESTER).ok).toBe(false)
    expect(setOnCall(onCallStudio(), DEV, TESTER).ok).toBe(true)
  })

  it('wants a developer and a tester, and can be stood down', () => {
    const state = onCallStudio()
    expect(setOnCall(state, DEV, 101).ok).toBe(false)
    expect(setOnCall(state, DEV, TESTER).ok).toBe(true)
    expect(state.onCall).toEqual({ developerId: DEV, testerId: TESTER })
    expect(clearOnCall(state).ok).toBe(true)
    expect(state.onCall).toBeNull()
    expect(clearOnCall(state).ok).toBe(false)
  })

  it('keeps the on-call people out of manual jobs', () => {
    const state = onCallStudio()
    setOnCall(state, DEV, TESTER)
    expect(availableFixers(state, 'developer').map((e) => e.id)).not.toContain(DEV)
    expect(startFix(state, 50, DEV, TESTER).ok).toBe(false)
  })

  it('starts a fix on its own once a product is buggy enough, and the pair is back on the project when done', () => {
    const state = onCallStudio(5 * AUTO_FIX_DENSITY)
    setOnCall(state, DEV, TESTER)
    expect(bugDensity(state.products[0])).toBeGreaterThanOrEqual(AUTO_FIX_DENSITY)
    fixDay(state)
    expect(state.fixes).toHaveLength(1)
    expect(state.fixes[0]).toMatchObject({ productId: 50, developerId: DEV, testerId: TESTER, auto: true })
    while (state.fixes.length > 0) fixDay(state)
    expect(workersOf(state, state.offices[0]).map((e) => e.id)).toContain(DEV)
    expect(state.products[0].bugs).toBeLessThan(AUTO_FIX_DENSITY)
  })

  it('stays out of the way while products are clean enough, working on the office project', () => {
    const state = onCallStudio(2)
    setOnCall(state, DEV, TESTER)
    fixDay(state)
    expect(state.fixes).toEqual([])
    expect(workersOf(state, state.offices[0]).map((e) => e.id)).toContain(TESTER)
  })

  it('picks the buggiest product, one job per product', () => {
    const state = onCallStudio(5 * AUTO_FIX_DENSITY)
    state.products.push(makeProduct({ id: 51, name: 'Beta', bugs: 9 * AUTO_FIX_DENSITY }))
    setOnCall(state, DEV, TESTER)
    fixDay(state)
    expect(state.fixes.map((f) => f.productId)).toEqual([51])
  })

  it('ends the arrangement, with a notice, when one of the pair leaves', () => {
    const state = onCallStudio(5 * AUTO_FIX_DENSITY)
    setOnCall(state, DEV, TESTER)
    state.employees = state.employees.filter((e) => e.id !== DEV)
    fixDay(state)
    expect(state.onCall).toBeNull()
    expect(state.fixes).toEqual([])
    expect(drainEvents(state).some((e) => e.type === 'notice' && e.text.includes('on-call'))).toBe(true)
  })

  it('runs inside a normal day', () => {
    const state = onCallStudio(5 * AUTO_FIX_DENSITY)
    setOnCall(state, DEV, TESTER)
    advanceDay(state)
    expect(state.fixes).toHaveLength(1)
  })

  it('survives a save', () => {
    const state = onCallStudio()
    setOnCall(state, DEV, TESTER)
    expect(deserialize(serialize(state))!.onCall).toEqual(state.onCall)
    const raw = JSON.parse(serialize(state))
    raw.onCall.testerId = 424242
    expect(deserialize(JSON.stringify(raw))).toBeNull()
  })
})
