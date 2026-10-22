import { describe, expect, it } from 'vitest'
import { COMPLIANCE_FEATURE, EU_COMPLAINT_FACTOR } from '@/lib/tycoon/data/regions'
import { BREAKS_MORALE, BUG_COMPLAINT_REPUTATION, BUG_COMPLAINTS, POLISH_FIX_SHARE, STANDUP_BUG_RISK, STANDUP_MORALE, TEAM_IDLE_DAYS } from '@/lib/tycoon/sim/balance'
import { teamSpeed } from '@/lib/tycoon/sim/careers'
import { openOffice } from '@/lib/tycoon/sim/offices'
import { bugFactor, productsDay } from '@/lib/tycoon/sim/products'
import { shipProject, startProject } from '@/lib/tycoon/sim/project'
import { moraleTarget } from '@/lib/tycoon/sim/staff'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { assignProduct, ownerOf, queueBlocker, queueFeatures, setDirection, setRoutine, teamDay } from '@/lib/tycoon/sim/teams'
import { DISCIPLINES, type GameState } from '@/lib/tycoon/sim/types'
import { workDay } from '@/lib/tycoon/sim/work'
import { makeEmployee, makeProduct, makeState } from './helpers'

/** A floor of four looking after a product last released long ago. */
function floorWithProduct(): GameState {
  const state = makeState([
    makeEmployee(1, { design: 70, engineering: 70, qa: 70 }),
    makeEmployee(2, { design: 70, engineering: 70, qa: 70 }),
    makeEmployee(3, { design: 70, engineering: 70, qa: 70 }),
  ])
  state.offices[0].kind = 'office'
  state.day = 1000
  state.money = 10_000_000
  state.products = [makeProduct({ id: 50, name: 'Atlas', featureIds: ['accounts'], releaseDay: 500, bugs: 40 })]
  assignProduct(state, state.offices[0].id, 50)
  return state
}

/** The first floor's project, read fresh (a plain property read would stay narrowed to what a test last set). */
const projectOf = (state: GameState) => state.offices[0].project

/** Runs the team for `days`: work, then what the team does about it. */
function run(state: GameState, days: number): void {
  for (let i = 0; i < days; i++) {
    state.day += 1
    workDay(state)
    teamDay(state)
  }
}

describe('a floor that looks after a product', () => {
  it('takes on the product it launches', () => {
    const state = makeState([makeEmployee(1, { design: 60, engineering: 60, qa: 60 })])
    state.offices[0].kind = 'office'
    startProject(state, 'web_app', ['accounts'])
    for (const d of DISCIPLINES) state.offices[0].project!.progress[d] = state.offices[0].project!.target[d]
    shipProject(state)
    expect(ownerOf(state, state.products[0].id)?.id).toBe(state.offices[0].id)
  })

  it('waits a few days out of work, then starts its next release by itself, and ships it when it is done', () => {
    const state = floorWithProduct()
    teamDay(state)
    expect(state.offices[0].project).toBeNull()
    run(state, TEAM_IDLE_DAYS)
    const project = state.offices[0].project
    expect(project?.byTeam).toBe(true)
    expect(project?.parentId).toBe(50)
    run(state, 400)
    expect(state.products[0].updates.length).toBeGreaterThan(0)
    expect(state.journal.some((e) => e.kind === 'team.release')).toBe(true)
  })

  it('grows the product with the features queued for it, and keeps it fresh when nothing is', () => {
    const state = floorWithProduct()
    setDirection(state, state.offices[0].id, 'grow')
    expect(queueFeatures(state, 50, ['dark_mode', 'search']).ok).toBe(true)
    run(state, TEAM_IDLE_DAYS + 1)
    expect(state.offices[0].project?.featureIds).toEqual(['dark_mode', 'search'])
    expect(state.products[0].nextFeatures).toBeUndefined()
    state.offices[0].project = null
    delete state.offices[0].idleSince
    run(state, TEAM_IDLE_DAYS + 1)
    expect(projectOf(state)?.featureIds).toEqual([])
  })

  it('refuses to queue what the product has, too much, or what is locked', () => {
    const state = floorWithProduct()
    const product = state.products[0]
    expect(queueBlocker(state, product, ['accounts'])).toMatch(/already in/)
    expect(queueBlocker(state, product, ['dark_mode', 'search', 'payments'])).toMatch(/At most/)
    expect(queueBlocker(state, product, ['agents'])).toMatch(/locked/)
  })

  it('polishing fixes most of the open bugs when it ships', () => {
    const state = floorWithProduct()
    setDirection(state, state.offices[0].id, 'polish')
    run(state, TEAM_IDLE_DAYS + 1)
    const project = state.offices[0].project!
    expect(project.polishes).toBe(true)
    const before = state.products[0].bugs
    for (const d of DISCIPLINES) project.progress[d] = project.target[d]
    teamDay(state)
    expect(state.products[0].bugs).toBeCloseTo(before * (1 - POLISH_FIX_SHARE), 0)
  })

  it("expanding meets Europe's data rules first, then localises", () => {
    const state = floorWithProduct()
    state.stage = 3
    expect(openOffice(state, 'eu').ok).toBe(true)
    setDirection(state, state.offices[0].id, 'expand')
    run(state, TEAM_IDLE_DAYS + 1)
    expect(state.offices[0].project?.featureIds).toEqual([COMPLIANCE_FEATURE])
    state.products[0].featureIds.push(COMPLIANCE_FEATURE)
    state.offices[0].project = null
    delete state.offices[0].idleSince
    run(state, TEAM_IDLE_DAYS + 1)
    expect(projectOf(state)?.localises).toBe(true)
  })

  it('leaves the garage alone, and moves the product when another floor takes it', () => {
    const state = floorWithProduct()
    state.offices[0].kind = 'garage'
    run(state, 30)
    expect(state.offices[0].project).toBeNull()
    state.offices[0].kind = 'office'
    state.stage = 3
    openOffice(state, 'us')
    expect(assignProduct(state, state.offices[1].id, 50).ok).toBe(true)
    expect(state.offices[0].productId).toBeUndefined()
    expect(ownerOf(state, 50)?.id).toBe(state.offices[1].id)
  })

  it('forgets a product that is gone, and keeps everything in a save', () => {
    const state = floorWithProduct()
    setDirection(state, state.offices[0].id, 'grow')
    setRoutine(state, state.offices[0].id, 'standup', true)
    queueFeatures(state, 50, ['dark_mode'])
    const restored = deserialize(serialize(state))!
    expect(restored.offices[0]).toMatchObject({ productId: 50, direction: 'grow', standup: true })
    expect(restored.products[0].nextFeatures).toEqual(['dark_mode'])
    state.products = []
    teamDay(state)
    expect(state.offices[0].productId).toBeUndefined()
  })
})

describe('routines', () => {
  it('a stand-up speeds the floor up and ships fewer bugs, but costs a little morale; breaks the other way round', () => {
    const state = floorWithProduct()
    const office = state.offices[0]
    const person = state.employees[0]
    const speed = teamSpeed(state, office)
    const morale = moraleTarget(state, person)
    setRoutine(state, office.id, 'standup', true)
    expect(teamSpeed(state, office)).toBeGreaterThan(speed)
    expect(moraleTarget(state, person)).toBe(morale - STANDUP_MORALE)
    run(state, TEAM_IDLE_DAYS + 1)
    expect(office.project?.bugRisk).toBeCloseTo(STANDUP_BUG_RISK)
    setRoutine(state, office.id, 'standup', false)
    setRoutine(state, office.id, 'breaks', true)
    expect(teamSpeed(state, office)).toBeLessThan(speed)
    expect(moraleTarget(state, person)).toBe(morale + BREAKS_MORALE)
  })
})

describe("Europe's stricter rules", () => {
  it('European users put up with fewer bugs', () => {
    const product = makeProduct({ bugs: 20 })
    expect(bugFactor(product, 'eu')).toBeLessThan(bugFactor(product, 'us'))
  })

  it('public complaints about a product sold in Europe cost more reputation', () => {
    const state = makeState()
    state.reputation = 50
    state.products = [makeProduct({ bugs: BUG_COMPLAINTS - 0.01, users: 50_000, reach: 50_000, euShare: 0.3, euUsers: 15_000, quality: 10 })]
    productsDay(state)
    expect(state.reputation).toBe(50 - BUG_COMPLAINT_REPUTATION * EU_COMPLAINT_FACTOR)
  })
})
