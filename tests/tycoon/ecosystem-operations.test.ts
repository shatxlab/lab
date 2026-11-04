import { describe, expect, it } from 'vitest'
import { getCompanion } from '@/lib/tycoon/data/companions'
import { getWorkItem } from '@/lib/tycoon/data/workstreams'
import { companionBlocker, companionCoverage, companionEffects, companionsDay, launchCompanion } from '@/lib/tycoon/sim/companions'
import { assignOperation, initialiseOperations, operationPreview, standingDay } from '@/lib/tycoon/sim/operations'
import { COMPANION_SERVICE_DEMAND, productService } from '@/lib/tycoon/sim/services'
import { itemBlocker } from '@/lib/tycoon/sim/roadmap'
import { serialize, deserialize } from '@/lib/tycoon/sim/state'
import { hostingCost } from '@/lib/tycoon/sim/scale'
import { HOSTING_PER_USER_DAY } from '@/lib/tycoon/sim/balance'
import { teamDay } from '@/lib/tycoon/sim/teams'
import { DISCIPLINES } from '@/lib/tycoon/sim/types'
import { stage0Fixture } from './stage0-fixtures'
import { dayOfEra, makeProduct } from './helpers'

function setup() {
  const s = stage0Fixture('europe')
  initialiseOperations(s)
  s.day = dayOfEra(4)
  s.products[0].productTypeId = 'data_platform'
  s.products[0].users = 500_000
  s.products[0].releaseDay = s.day
  return s
}
const care = (s: ReturnType<typeof setup>) => assignOperation(s, s.offices[0].id, { kind: 'standing', productId: s.signatureId!, service: 'reliability' })

describe('operating ecosystem', () => {
  it('gates the Data Platform AI initiative by type, era, reputation and research', () => {
    const s = setup(), ai = getCompanion('ai_assistant')!
    expect(companionBlocker(s, ai)).toBeNull()
    s.products[0].productTypeId = 'game'
    expect(companionBlocker(s, ai)).toMatch(/Does not suit/)
    s.products[0].productTypeId = 'data_platform'
    s.day = 0
    expect(companionBlocker(s, ai)).toMatch(/Not until/)
    s.day = dayOfEra(4); s.reputation = 0
    expect(companionBlocker(s, ai)).toMatch(/Reputation 70/)
    s.reputation = 100; s.research.done = []
    expect(companionBlocker(s, ai)).toMatch(/Machine learning/)
    expect(launchCompanion(s, ai.id)).toBeNull()
  })

  it('previews and completes an AI launch, preserving paid progress on reload', () => {
    const s = setup(), p = s.products[0], office = s.offices[0]
    const proposal = { kind: 'item' as const, id: 'companion:ai_assistant' }
    const preview = operationPreview(s, office, p, proposal)
    expect(preview.blocker).toBeNull()
    expect(preview.effect).toMatch(/0.25 shared reliability/)
    expect(preview.effect).toMatch(/No coverage means no flagship bonus/)
    expect(assignOperation(s, office.id, { kind: 'initiative', productId: p.id, proposal }).ok).toBe(true)
    office.project!.progress.engineering = 10
    const loaded = deserialize(serialize(s))!
    expect(loaded.offices[0].project!.progress.engineering).toBe(10)
    for (const d of DISCIPLINES) loaded.offices[0].project!.progress[d] = loaded.offices[0].project!.target[d]
    teamDay(loaded)
    expect(loaded.products.find((p) => p.companionId === 'ai_assistant')?.productTypeId).toBe('ai_product')
    expect(loaded.offices[0].assignment).toEqual({ kind: 'idle' })
  })

  it('reserves company-wide launches and cannot launch from a side-product context', () => {
    const s = setup(), p = s.products[0]
    const side = makeProduct({ id: s.nextId++, role: 'side', users: 500_000 })
    s.products.push(side)
    expect(itemBlocker(s, side, getWorkItem('companion:mobile_app')!)).toMatch(/flagship ecosystem/)
    expect(assignOperation(s, s.offices[0].id, { kind: 'initiative', productId: p.id, proposal: { kind: 'item', id: 'companion:ai_assistant' } }).ok).toBe(true)
    expect(assignOperation(s, s.offices[1].id, { kind: 'initiative', productId: p.id, proposal: { kind: 'item', id: 'companion:mobile_app' } })).toMatchObject({ ok: false, reason: 'A companion launch is already reserved' })
  })

  it('preserves retained side products and the two-slot limit', () => {
    const s = setup()
    s.products.push(makeProduct({ id: s.nextId++, role: 'side' }), makeProduct({ id: s.nextId++, role: 'side' }))
    expect(launchCompanion(s, 'ai_assistant')).toBeNull()
    expect(s.products.filter((p) => p.role === 'side')).toHaveLength(2)
  })

  it('charges companion hosting without changing legacy or unrelated side-product costs', () => {
    const s = setup(), before = hostingCost(s)
    const c = launchCompanion(s, 'ai_assistant')!
    expect(hostingCost(s) - before).toBeCloseTo(c.users * HOSTING_PER_USER_DAY)
    s.products.push(makeProduct({ id: s.nextId++, role: 'side', users: 1_000_000 }))
    expect(hostingCost(s) - before).toBeCloseTo(c.users * HOSTING_PER_USER_DAY)
    for (const o of s.offices) delete o.assignment
    expect(hostingCost(s)).toBe(before)
  })

  it('counts shared bugs and integration overhead, excluding unrelated side products', () => {
    const s = setup(), p = s.products[0]
    const before = productService(s, p, 'reliability').demand
    const c = launchCompanion(s, 'ai_assistant')!
    const after = productService(s, p, 'reliability').demand
    expect(after).toBeGreaterThanOrEqual(before + COMPANION_SERVICE_DEMAND)
    c.bugs = 60
    expect(productService(s, p, 'reliability').demand).toBeCloseTo(after + 1)
    s.products.push(makeProduct({ id: s.nextId++, role: 'side', bugs: 6000 }))
    expect(productService(s, p, 'reliability').demand).toBeCloseTo(after + 1)
  })

  it('fixes ecosystem bugs with one finite shared budget and no double worker accounting', () => {
    const s = setup(), p = s.products[0], c = launchCompanion(s, 'ai_assistant')!
    care(s); p.bugs = 100; c.bugs = 100
    const output = productService(s, p, 'reliability').provided
    const before = s.bugsFixed
    standingDay(s)
    const fixed = 200 - p.bugs - c.bugs
    expect(fixed).toBeCloseTo(Math.max(0, output - COMPANION_SERVICE_DEMAND))
    expect(p.bugs).toBeCloseTo(c.bugs)
    expect(s.bugsFixed - before).toBeCloseTo(fixed)
    expect(new Set(s.dayWork.map((w) => w.employeeId)).size).toBe(s.dayWork.length)
  })

  it('does not multiply fixing capacity when more teams or companions join', () => {
    const s = setup(), p = s.products[0]
    const c = launchCompanion(s, 'ai_assistant')!, d = launchCompanion(s, 'mobile_app')!
    care(s)
    assignOperation(s, s.offices[1].id, { kind: 'standing', productId: p.id, service: 'reliability' })
    for (const product of [p, c, d]) product.bugs = 100
    const provided = productService(s, p, 'reliability').provided
    standingDay(s)
    expect(300 - p.bugs - c.bugs - d.bugs).toBeCloseTo(Math.max(0, provided - 2 * COMPANION_SERVICE_DEMAND))
  })

  it('warns on insufficient care, removes idle bonuses and recovers after reallocation', () => {
    const s = setup(), p = s.products[0], c = launchCompanion(s, 'ai_assistant')!
    expect(companionCoverage(s)).toBe(0)
    expect(companionEffects(s).pay).toBe(0)
    expect(productService(s, p, 'reliability').risk).not.toBeNull()
    care(s)
    expect(companionCoverage(s)).toBeGreaterThan(0)
    expect(companionEffects(s).pay).toBeGreaterThan(0)
    const healthy = companionEffects(s).pay
    p.bugs = 1_000_000
    expect(companionEffects(s).pay).toBeLessThan(healthy)
    p.bugs = 0
    expect(companionEffects(s).pay).toBeCloseTo(healthy)
    c.releaseDay = 0
    expect(companionEffects(s).pay).toBe(0)
  })

  it('does not grant full companion reach for a token assignment or refresh stale releases', () => {
    const s = setup(), p = s.products[0], c = launchCompanion(s, 'mobile_app')!
    care(s); p.bugs = 1_000_000; c.reach = 0; c.releaseDay = 0
    s.day = Math.ceil(s.day / 30) * 30
    companionsDay(s)
    expect(c.reach).toBeGreaterThan(0)
    expect(c.reach).toBeLessThan(p.users * 0.1)
    expect(c.releaseDay).toBe(0)
  })
})
