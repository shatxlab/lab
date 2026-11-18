import { describe, expect, it } from 'vitest'
import { PLAN_RESEARCH_CLARITY, PLAN_RESEARCH_DAYS, RELEASE_MIN_DAYS } from '@/lib/tycoon/sim/balance'
import { awaitingChoice, cardText, chooseCard, clarityOf, planDay, propose, researchPlan, researchPlanBlocker } from '@/lib/tycoon/sim/cycle'
import { bumped, formatVersion, versionOf } from '@/lib/tycoon/sim/releases'
import { clarityReach, shipProject } from '@/lib/tycoon/sim/project'
import { assignProduct, teamDay } from '@/lib/tycoon/sim/teams'
import { DISCIPLINES, type Employee, type GameState } from '@/lib/tycoon/sim/types'
import { workDay } from '@/lib/tycoon/sim/work'
import { makeEmployee, makeProduct, makeState } from './helpers'

function analyst(id: number, analysis: number, role: 'analyst' | 'pm' = 'analyst'): Employee {
  return { ...makeEmployee(id, {}, 0, role), analysis }
}

function floor(readers: Employee[], productTypeId = 'game'): GameState {
  const state = makeState([
    makeEmployee(1, { design: 70, engineering: 70, qa: 70 }),
    makeEmployee(2, { design: 70, engineering: 70, qa: 70 }),
    ...readers,
  ])
  state.offices[0].kind = 'office'
  state.day = 1000
  state.money = 10_000_000
  state.products = [makeProduct({ id: 50, name: 'Atlas', productTypeId, featureIds: [], releaseDay: 500, users: 300_000, reach: 400_000, hit: true, bugs: 10, fit: 80 })]
  state.signatureId = 50
  assignProduct(state, state.offices[0].id, 50)
  return state
}

function run(state: GameState, days: number): void {
  for (let i = 0; i < days; i++) {
    state.day += 1
    workDay(state)
    teamDay(state)
    planDay(state)
  }
}

describe('versions', () => {
  it('a major resets the rest, a minor resets the patch', () => {
    expect(formatVersion(bumped([1, 2, 3], 'major'))).toBe('2.0.0')
    expect(formatVersion(bumped([1, 2, 3], 'minor'))).toBe('1.3.0')
    expect(formatVersion(bumped([1, 2, 3], 'patch'))).toBe('1.2.4')
    expect(versionOf({})).toEqual([1, 0, 0])
  })
})

describe('clarity', () => {
  it('grows with the analysts and the product manager, and is capped without a product manager', () => {
    const none = floor([])
    const junior = floor([analyst(3, 10)])
    const sharp = floor([analyst(3, 90)])
    const withPm = floor([analyst(3, 90), analyst(4, 90, 'pm')])
    expect(clarityOf(none, none.offices[0])).toBe(0)
    expect(clarityOf(sharp, sharp.offices[0])).toBeGreaterThan(clarityOf(junior, junior.offices[0]))
    expect(clarityOf(withPm, withPm.offices[0])).toBeGreaterThan(clarityOf(sharp, sharp.offices[0]))
    expect(clarityOf(sharp, sharp.offices[0])).toBeLessThanOrEqual(70)
  })
})

describe('proposals follow the product', () => {
  it('a game is offered game features, a dev tool developer ones', () => {
    const game = floor([analyst(3, 90, 'pm')], 'game')
    const tool = floor([analyst(3, 90, 'pm')], 'dev_tool')
    const ids = (s: GameState) => propose(s, s.products[0], 100).filter((p) => p.kind === 'feature').map((p) => p.id)
    const forGame = ids(game)
    expect(forGame.length).toBeGreaterThan(0)
    expect(propose(game, game.products[0], 100)).toHaveLength(3)
    expect([...forGame, ...ids(tool)].every((id) => id !== 'cli' || ids(tool).includes(id))).toBe(true)
    expect(forGame).not.toContain('cli')
  })

  it('a full server asks for scale first', () => {
    const state = floor([analyst(3, 90, 'pm')])
    state.products[0].users = 590_000
    state.products[0].built = ['load_balancer'] // 600k capacity with the base: nearly full
    state.products[0].reach = 700_000
    const first = propose(state, state.products[0], 100)
    expect(first.some((p) => p.kind === 'item' && p.id === 'db_sharding')).toBe(true)
  })
})

describe('the plan', () => {
  it('stops for the player, deals cards with their effect and cost, and never chooses by itself', () => {
    const state = floor([analyst(3, 80), analyst(4, 80, 'pm')])
    run(state, 1)
    expect(awaitingChoice(state)).toBe(true)
    const cards = state.plan!.cards
    expect(cards.filter((c) => c.kind !== 'deep' && c.kind !== 'strike')).toHaveLength(3)
    for (const card of cards) {
      const text = cardText(state, state.products[0], card, state.plan!.clarity)
      expect(text.effect).not.toBe('')
      expect(text.cost).toMatch(/\d/)
    }
    run(state, 200)
    expect(awaitingChoice(state)).toBe(true)
    expect(state.offices[0].project).toBeNull()
  })

  it('builds the chosen card and ships a named version', () => {
    const state = floor([analyst(3, 80), analyst(4, 80, 'pm')])
    const office = state.offices[0]
    run(state, 1)
    const index = state.plan!.cards.findIndex((c) => c.kind === 'feature')
    const picked = state.plan!.cards[index]
    expect(chooseCard(state, index).ok).toBe(true)
    expect(state.plan).toBeUndefined()
    expect(awaitingChoice(state)).toBe(false)
    expect(office.project?.featureIds).toEqual([picked.id])
    expect(office.project?.name).toContain('Atlas 1.1')
    expect(office.project?.spec?.promise).toBeTruthy()

    const reach = state.products[0].reach
    for (const d of DISCIPLINES) office.project!.progress[d] = office.project!.target[d]
    expect(shipProject(state).ok).toBe(true)
    const product = state.products[0]
    expect(product.version).toEqual([1, 1, 0])
    expect(product.releases![0]).toMatchObject({ version: '1.1.0', reachBefore: reach })
    expect(product.releases![0].reachAfter).toBeGreaterThan(reach)
  })

  it('a card promises the reach and the fit the release delivers', () => {
    const state = floor([analyst(3, 80), analyst(4, 80, 'pm')])
    const office = state.offices[0]
    run(state, 1)
    const index = state.plan!.cards.findIndex((c) => c.kind === 'feature')
    const text = cardText(state, state.products[0], state.plan!.cards[index], state.plan!.clarity).effect
    expect(chooseCard(state, index).ok).toBe(true)
    for (const d of DISCIPLINES) office.project!.progress[d] = office.project!.target[d]
    const quality = state.products[0].quality
    expect(shipProject(state).ok).toBe(true)
    const note = state.products[0].releases![0]
    expect(text).toContain(`+${Math.round((note.reachAfter / note.reachBefore - 1) * 100)}% reach`)
    if (Math.round(note.fitAfter) !== 80) expect(text).toContain(`→ ${Math.round(note.fitAfter)}`)
    expect(state.products[0].quality).toBeGreaterThanOrEqual(quality)
  })

  it('a vague plan makes a bigger, buggier build, but never shrinks reach', () => {
    const build = (state: GameState) => {
      run(state, 1)
      state.plan!.cards = [{ kind: 'polish', id: 'polish', why: '' }]
      expect(chooseCard(state, 0).ok).toBe(true)
      return state.offices[0].project!
    }
    const clear = build(floor([analyst(3, 100), analyst(4, 100, 'pm')]))
    const vague = build(floor([analyst(3, 0)]))
    expect(vague.scope).toBeGreaterThan(clear.scope!)
    expect(vague.bugRisk).toBeGreaterThan(clear.bugRisk)
    expect(clarityReach(0)).toBe(1)
    expect(clarityReach(100)).toBeGreaterThan(1)
  })

  it('analysts research only when the player sends them: days pass and the plan comes back clearer', () => {
    const state = floor([analyst(3, 40)])
    run(state, 1)
    const before = state.plan!.clarity
    expect(researchPlan(state).ok).toBe(true)
    expect(awaitingChoice(state)).toBe(false)
    run(state, PLAN_RESEARCH_DAYS)
    expect(awaitingChoice(state)).toBe(true)
    expect(state.plan!.clarity).toBe(before + PLAN_RESEARCH_CLARITY)
    expect(state.plan!.cards.length).toBeGreaterThan(0)

    const nobody = floor([])
    run(nobody, 1)
    expect(researchPlanBlocker(nobody)).toMatch(/analyst/)
  })

  it('always offers more servers when they are nearly full', () => {
    for (let seed = 0; seed < 10; seed++) {
      const state = floor([analyst(3, 10)])
      state.rng = seed + 1
      state.products[0].users = 590_000
      state.products[0].built = ['load_balancer']
      state.products[0].reach = 700_000
      expect(propose(state, state.products[0], 5).some((p) => p.kind === 'item' && p.id === 'db_sharding')).toBe(true)
    }
  })

  it('deep work is a card: while it runs there is no release, and the next plan comes when it ends', () => {
    const state = floor([{ ...analyst(3, 80), founder: true }])
    run(state, 1)
    state.plan!.cards = [{ kind: 'deep', id: 'signature', why: '' }]
    expect(chooseCard(state, 0).ok).toBe(true)
    expect(state.plan).toBeUndefined()
    expect(state.deepWork?.kind).toBe('signature')
    run(state, 3)
    expect(state.plan).toBeUndefined()
    delete state.deepWork
    run(state, 1)
    expect(awaitingChoice(state)).toBe(true)
  })
})

describe('a bigger company', () => {
  /** A hit with `floors` full floors of equal people, ready to build a card. */
  function company(floors: number): GameState {
    const state = floor([analyst(90, 80, 'pm')])
    for (let i = 1; i < floors; i++) {
      const office = { ...state.offices[0], id: 100 + i, project: null }
      state.offices.push(office)
      state.employees.push({ ...makeEmployee(200 + 2 * i, { design: 70, engineering: 70, qa: 70 }), officeId: office.id }, { ...makeEmployee(201 + 2 * i, { design: 70, engineering: 70, qa: 70 }), officeId: office.id })
    }
    run(state, 1)
    state.plan!.cards = [{ kind: 'polish', id: 'polish', why: '' }]
    return state
  }

  function daysToBuild(state: GameState): number {
    expect(chooseCard(state, 0).ok).toBe(true)
    const start = state.day
    while (state.offices.some((o) => o.project) && state.day < start + 1000) run(state, 1)
    return state.day - start
  }

  it('never builds a release in a blink', () => {
    expect(daysToBuild(company(1))).toBeGreaterThanOrEqual(RELEASE_MIN_DAYS - 3)
    expect(daysToBuild(company(4))).toBeGreaterThanOrEqual(RELEASE_MIN_DAYS - 3)
  })

  it('every free floor works on the one release, and bugs do not grow with the company', () => {
    const one = company(1)
    const three = company(3)
    expect(chooseCard(one, 0).ok).toBe(true)
    expect(chooseCard(three, 0).ok).toBe(true)
    expect(three.offices.filter((o) => o.project)).toHaveLength(1)
    expect(three.offices[0].project!.target.engineering).toBeGreaterThan(one.offices[0].project!.target.engineering)
    expect(three.offices[0].project!.scope).toBeCloseTo(one.offices[0].project!.scope!)
    run(three, 1)
    expect(three.dayWork.length).toBe(6)
  })
})
