import { describe, expect, it } from 'vitest'
import { SPEC_DECIDE_DAYS, TEAM_IDLE_DAYS } from '@/lib/tycoon/sim/balance'
import { chooseRequirement, clarityOf, discardSpec, propose, specDays } from '@/lib/tycoon/sim/cycle'
import { bumped, formatVersion, versionOf } from '@/lib/tycoon/sim/releases'
import { shipProject } from '@/lib/tycoon/sim/project'
import { assignProduct, teamDay } from '@/lib/tycoon/sim/teams'
import { specDay } from '@/lib/tycoon/sim/cycle'
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
    specDay(state)
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
    expect(specDays(100)).toBeLessThan(specDays(10))
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

describe('the cycle', () => {
  it('writes a spec, waits for the player, builds the choice and ships a named version', () => {
    const state = floor([analyst(3, 80), analyst(4, 80, 'pm')])
    const office = state.offices[0]
    run(state, TEAM_IDLE_DAYS + 1)
    expect(office.spec?.phase).toBe('writing')
    run(state, office.spec!.days + 1)
    expect(office.spec?.phase).toBe('choose')
    expect(office.spec!.proposals).toHaveLength(3)
    expect(office.project).toBeNull()

    const index = office.spec!.proposals.findIndex((p) => p.kind === 'feature')
    expect(index).toBeGreaterThanOrEqual(0)
    const picked = office.spec!.proposals[index]
    expect(chooseRequirement(state, office.id, index).ok).toBe(true)
    expect(office.spec).toBeUndefined()
    expect(office.project?.featureIds).toEqual([picked.id])
    expect(office.project?.name).toContain('Atlas 1.1')

    const reach = state.products[0].reach
    for (const d of DISCIPLINES) office.project!.progress[d] = office.project!.target[d]
    expect(shipProject(state).ok).toBe(true)
    const product = state.products[0]
    expect(product.version).toEqual([1, 1, 0])
    expect(product.releases).toHaveLength(1)
    expect(product.releases![0]).toMatchObject({ version: '1.1.0', reachBefore: reach })
    expect(product.releases![0].reachAfter).toBeGreaterThan(reach)
  })

  it('a vague spec makes a bigger, buggier build than a clear one', () => {
    const clear = floor([analyst(3, 100), analyst(4, 100, 'pm')])
    const vague = floor([analyst(3, 0)])
    const build = (state: GameState) => {
      const office = state.offices[0]
      run(state, TEAM_IDLE_DAYS + 1)
      run(state, office.spec!.days + 1)
      office.spec!.proposals = [{ kind: 'polish', id: 'polish', why: '' }]
      expect(chooseRequirement(state, office.id, 0).ok).toBe(true)
      return office.project!
    }
    const a = build(clear)
    const b = build(vague)
    expect(b.target.engineering).toBeGreaterThan(a.target.engineering)
    expect(b.bugRisk).toBeGreaterThan(a.bugRisk)
  })

  it('the product manager chooses when the player does not', () => {
    const state = floor([analyst(3, 80), analyst(4, 80, 'pm')])
    const office = state.offices[0]
    run(state, TEAM_IDLE_DAYS + 1)
    run(state, office.spec!.days + 1)
    expect(office.spec?.phase).toBe('choose')
    run(state, SPEC_DECIDE_DAYS + 1)
    expect(office.spec).toBeUndefined()
    expect(office.project?.spec).toBeDefined()
  })

  it('a spec can be sent back, and a floor with nobody to read the product only keeps it fresh', () => {
    const state = floor([analyst(3, 80), analyst(4, 80, 'pm')])
    const office = state.offices[0]
    run(state, TEAM_IDLE_DAYS + 1)
    run(state, office.spec!.days + 1)
    expect(discardSpec(state, office.id).ok).toBe(true)
    expect(office.spec?.phase).toBe('writing')

    const alone = floor([])
    run(alone, TEAM_IDLE_DAYS + 1)
    expect(alone.offices[0].spec).toBeUndefined()
  })
})
