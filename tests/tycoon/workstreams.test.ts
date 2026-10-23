import { describe, expect, it } from 'vitest'
import { TEAM_IDLE_DAYS } from '@/lib/tycoon/sim/balance'
import { itemEffects } from '@/lib/tycoon/data/workstreams'
import { nextItem, setRoadmap } from '@/lib/tycoon/sim/roadmap'
import { openOffice } from '@/lib/tycoon/sim/offices'
import { shipProject } from '@/lib/tycoon/sim/project'
import { deserialize, serialize, STATE_VERSION } from '@/lib/tycoon/sim/state'
import { assignProduct, nextReleaseDay, releasePlan, setWorkstream, teamDay } from '@/lib/tycoon/sim/teams'
import { DISCIPLINES, type GameState } from '@/lib/tycoon/sim/types'
import { workDay } from '@/lib/tycoon/sim/work'
import { makeEmployee, makeProduct, makeState } from './helpers'

function hitFloor(): GameState {
  const state = makeState([
    makeEmployee(1, { design: 70, engineering: 70, qa: 70 }),
    makeEmployee(2, { design: 70, engineering: 70, qa: 70 }),
    makeEmployee(3, { design: 70, engineering: 70, qa: 70 }),
  ])
  state.offices[0].kind = 'office'
  state.day = 1000
  state.money = 10_000_000
  state.products = [makeProduct({ id: 50, name: 'Atlas', featureIds: ['accounts'], releaseDay: 500, users: 300_000, reach: 400_000, hit: true, bugs: 10, fit: 80 })]
  state.signatureId = 50
  assignProduct(state, state.offices[0].id, 50)
  return state
}

function run(state: GameState, days: number): void {
  for (let i = 0; i < days; i++) {
    state.day += 1
    workDay(state)
    teamDay(state)
  }
}

describe('the roadmap and the workstreams', () => {
  it('a floor takes the highest roadmap item for its workstream that is on offer', () => {
    const state = hitFloor()
    const product = state.products[0]
    expect(setRoadmap(state, 50, ['enterprise_deals', 'cdn', 'db_sharding', 'load_balancer']).ok).toBe(true)
    setWorkstream(state, state.offices[0].id, 'scale')
    // 300k users: the CDN is not on offer yet, the sharded database is.
    expect(nextItem(state, product, 'scale')?.id).toBe('db_sharding')
    expect(nextItem(state, product, 'monetisation')).toBeUndefined() // enterprise deals wait for 2M users
  })

  it('builds an item, which counts, leaves the roadmap and does its work', () => {
    const state = hitFloor()
    const product = state.products[0]
    setRoadmap(state, 50, ['paid_plans', 'onboarding_flow'])
    setWorkstream(state, state.offices[0].id, 'growth')
    run(state, TEAM_IDLE_DAYS + 1)
    expect(state.offices[0].project?.itemId).toBe('onboarding_flow')
    const reach = product.reach
    for (const d of DISCIPLINES) state.offices[0].project!.progress[d] = state.offices[0].project!.target[d]
    expect(shipProject(state).ok).toBe(true)
    expect(product.built).toEqual(['onboarding_flow'])
    expect(product.roadmap).toEqual(['paid_plans'])
    expect(product.reach).toBeGreaterThan(reach)
    expect(itemEffects(product).churn).toBeCloseTo(0.05)
  })

  it('a floor with nothing to build for its workstream waits, and says why', () => {
    const state = hitFloor()
    setWorkstream(state, state.offices[0].id, 'monetisation')
    expect(releasePlan(state, state.offices[0], state.products[0]).kind).toBe('idle')
    expect(nextReleaseDay(state, state.offices[0], state.products[0])).toBe(Number.MAX_SAFE_INTEGER)
    run(state, 60)
    expect(state.offices[0].project).toBeNull()
  })

  it('refuses unknown, repeated or built items', () => {
    const state = hitFloor()
    expect(setRoadmap(state, 50, ['nope']).ok).toBe(false)
    expect(setRoadmap(state, 50, ['cdn', 'cdn']).ok).toBe(false)
    state.products[0].built = ['cdn']
    expect(setRoadmap(state, 50, ['cdn']).ok).toBe(false)
  })

  it('a new floor works on the hit, on a stream no other floor has', () => {
    const state = hitFloor()
    state.stage = 4
    state.offices[0].workstream = 'features'
    expect(openOffice(state, 'us').ok).toBe(true)
    expect(state.offices[1]).toMatchObject({ productId: 50, workstream: 'quality' })
    expect(openOffice(state, 'eu').ok).toBe(true)
    expect(state.offices[2]).toMatchObject({ productId: 50, workstream: 'europe' })
  })

  it('upgrades a version 6 save: directions become workstreams', () => {
    const state = hitFloor()
    state.offices[0].workstream = 'quality'
    const raw = JSON.parse(serialize(state))
    raw.version = 6
    delete raw.offices[0].workstream
    raw.offices[0].direction = 'polish'
    const restored = deserialize(JSON.stringify(raw))!
    expect(restored.version).toBe(STATE_VERSION)
    expect(restored.offices[0].workstream).toBe('quality')
    expect('direction' in restored.offices[0]).toBe(false)
  })
})
