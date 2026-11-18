import { describe, expect, it } from 'vitest'
import { FEATURES } from '@/lib/tycoon/data/features'
import { getStage } from '@/lib/tycoon/data/stages'
import { assignOperation, initialiseOperations } from '@/lib/tycoon/sim/operations'
import { scaleRequirements } from '@/lib/tycoon/sim/scale-readiness'
import { stageProgress, stageComplete, checkStage } from '@/lib/tycoon/sim/stages'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { ipoBlocker } from '@/lib/tycoon/sim/exit'
import { IPO_PROFIT_DAYS, IPO_REVENUE, IPO_USERS } from '@/lib/tycoon/sim/balance'
import { stage0Fixture } from './stage0-fixtures'
import { makeEmployee, makeState } from './helpers'

function setup(stage = 3) {
  const s = stage0Fixture('europe')
  initialiseOperations(s)
  s.stage = stage
  const p = s.products[0]
  p.users = 200_000
  p.featureIds = FEATURES.filter((f) => f.suits.includes(p.productTypeId)).map((f) => f.id)
  p.fit = p.peakFit = p.quality = 95
  p.bugs = p.pendingBugs = 0
  p.built = ['load_balancer', 'db_sharding', 'cdn', 'multi_cluster']
  return s
}
const requirement = (s: ReturnType<typeof setup>, id: string) => scaleRequirements(s).find((r) => r.id === id)!

describe('concrete company-scale readiness', () => {
  it('shares exactly the same live requirements with chapter advancement', () => {
    const s = setup()
    expect(stageProgress(s).some((g) => g.id === 'team_12')).toBe(false)
    expect(scaleRequirements(s).every((r) => r.met)).toBe(true)
    expect(stageComplete(s)).toBe(true)
    s.products[0].built = ['load_balancer']
    s.products[0].built = []
    expect(stageComplete(s)).toBe(false)
    expect(stageProgress(s).find((g) => g.id === 'first_scale')?.met).toBe(false)
  })

  it('uses current chapter capacity, not cash or premature future-scale obligations', () => {
    const s = setup(4)
    s.money = 1e12
    s.products[0].built = []
    expect(requirement(s, 'scale_capacity').progress).toContain('/ 1,000,000')
    expect(requirement(s, 'scale_capacity').met).toBe(false)
    s.stage = 5
    expect(requirement(s, 'scale_capacity').progress).toContain('/ 3,000,000')
  })

  it('does not gate headquarters expansion on care coverage that needs the second floor', () => {
    const s = setup(3)
    s.products[0].bugs = 500
    expect(scaleRequirements(s).map((r) => r.id)).not.toContain('shared_reliability')
    expect(scaleRequirements(s).map((r) => r.id)).not.toContain('operating_health')
    expect(stageComplete(s)).toBe(true)
    s.stage = 4
    expect(requirement(s, 'operating_health').met).toBe(false)
    expect(requirement(s, 'shared_reliability').met).toBe(false)
  })

  it('accepts a compact effective team rather than requiring twelve desks or senior titles', () => {
    const s = setup(), id = s.offices[0].id
    s.employees = [makeEmployee(s.nextId++, { design: 95, engineering: 95, qa: 95 })]
    s.employees[0].officeId = id
    s.employees[0].level = 0
    expect(requirement(s, 'delivery_capacity').met).toBe(true)
    expect(requirement(s, 'productive_floors').met).toBe(true)
    expect(stageComplete(s)).toBe(true)
  })

  it('does not combine incomplete floors into one imaginary delivery team', () => {
    const s = setup(), [a, b] = s.offices
    s.employees = [makeEmployee(s.nextId++, { engineering: 100 }), makeEmployee(s.nextId++, { design: 100, qa: 100 })]
    s.employees[0].officeId = a.id
    s.employees[1].officeId = b.id
    expect(requirement(s, 'delivery_capacity').met).toBe(false)
    s.employees[1].officeId = a.id
    expect(requirement(s, 'delivery_capacity').met).toBe(true)
  })

  it('uses actual release cadence rather than accepting a token amount of every skill', () => {
    const s = setup()
    s.employees = [makeEmployee(s.nextId++, { design: 0.01, engineering: 0.01, qa: 0.01 })]
    s.employees[0].officeId = s.offices[0].id
    expect(requirement(s, 'delivery_capacity').met).toBe(false)
    expect(requirement(s, 'delivery_capacity').progress).toMatch(/days.*freshness window/)
  })

  it('does not double-count delivery workers who are supplying a standing responsibility', () => {
    const s = setup()
    for (const office of s.offices) expect(assignOperation(s, office.id, { kind: 'standing', productId: s.signatureId!, service: 'reliability' }).ok).toBe(true)
    expect(requirement(s, 'delivery_capacity').met).toBe(false)
    assignOperation(s, s.offices[0].id, { kind: 'idle' }, true)
    expect(requirement(s, 'delivery_capacity').met).toBe(true)
  })

  it('does not credit empty floors or training-only teams as effective capacity', () => {
    const s = setup(4)
    s.employees = s.employees.filter((e) => e.officeId === s.offices[0].id)
    expect(requirement(s, 'productive_floors').met).toBe(false)
    for (const employee of s.employees) employee.training = { discipline: 'engineering', finishDay: s.day + 30 }
    expect(requirement(s, 'delivery_capacity').met).toBe(false)
    expect(requirement(s, 'productive_floors').progress).toContain('0 / 2')
  })

  it('requires effective reliability coverage, and recovers after reallocation without deleting history', () => {
    const s = setup(4)
    s.products[0].bugs = 60
    expect(requirement(s, 'shared_reliability').met).toBe(false)
    assignOperation(s, s.offices[1].id, { kind: 'standing', productId: s.signatureId!, service: 'reliability' })
    expect(requirement(s, 'shared_reliability').met).toBe(true)
    expect(requirement(s, 'delivery_capacity').met).toBe(true)
    const loaded = deserialize(serialize(s))!
    expect(scaleRequirements(loaded)).toEqual(scaleRequirements(s))
  })

  it('warns on freshness/bugs/fit and allows recovery without a permanent failure flag', () => {
    const s = setup(4), p = s.products[0]
    p.fit = 40
    expect(requirement(s, 'operating_health').met).toBe(false)
    p.fit = 95; p.releaseDay = s.day - 2000; p.updates = []
    expect(requirement(s, 'operating_health').met).toBe(false)
    p.releaseDay = s.day; p.bugs = 1_000_000
    expect(requirement(s, 'operating_health').met).toBe(false)
    p.bugs = 0
    expect(requirement(s, 'operating_health').met).toBe(true)
  })

  it('requires effective regional capacity rather than an empty European shell', () => {
    const s = setup(5)
    s.employees = s.employees.filter((e) => e.officeId !== s.offices[1].id)
    expect(requirement(s, 'europe_capacity').met).toBe(false)
    const analyst = makeEmployee(s.nextId++, {}, 0, 'analyst')
    analyst.analysis = 80; analyst.officeId = s.offices[1].id; analyst.region = 'eu'
    s.employees.push(analyst)
    expect(requirement(s, 'europe_capacity').met).toBe(true)
  })

  it('does not revoke an earned chapter or retroactively remove old IPO eligibility', () => {
    const s = setup(6)
    s.products[0].users = IPO_USERS + 1
    s.lifetimeRevenue = IPO_REVENUE + 1
    s.profitDays = IPO_PROFIT_DAYS
    s.products[0].fit = 0
    s.employees = []
    expect(scaleRequirements(s)).toEqual([])
    expect(ipoBlocker(s)).toBeNull()
    checkStage(s)
    expect(s.stage).toBe(6)
    const loaded = deserialize(serialize(s))!
    expect(loaded.stage).toBe(6)
    expect(ipoBlocker(loaded)).toBeNull()
  })

  it('keeps pre-hit/legacy stage checks and all earned content unchanged, without consuming RNG', () => {
    const legacy = makeState()
    expect(scaleRequirements(legacy)).toEqual([])
    expect(stageProgress(legacy).map((g) => g.id)).toEqual(getStage(legacy.stage).goals.map((g) => g.id))
    const s = setup(), before = serialize(s)
    stageProgress(s); scaleRequirements(s)
    expect(serialize(s)).toBe(before)
  })
})
