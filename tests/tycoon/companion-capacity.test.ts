import { describe, expect, it } from 'vitest'
import { getCompanion } from '@/lib/tycoon/data/companions'
import { companionBlocker, companionCoverage, companionEffects, companionLaunchForecast, companionsOf, ecosystemCapacity, launchCompanion } from '@/lib/tycoon/sim/companions'
import { assignOperation, initialiseOperations, operationPreview, standingDay } from '@/lib/tycoon/sim/operations'
import { COMPANION_SERVICE_DEMAND, productService } from '@/lib/tycoon/sim/services'
import { COMPANION_KEEP_PAY, COMPANION_REACH_BOOST } from '@/lib/tycoon/sim/balance'
import { hostingCost } from '@/lib/tycoon/sim/scale'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { teamDay } from '@/lib/tycoon/sim/teams'
import { DISCIPLINES } from '@/lib/tycoon/sim/types'
import { stage0Fixture } from './stage0-fixtures'
import { dayOfEra, makeProduct } from './helpers'

function setup() {
  const s = stage0Fixture('europe')
  initialiseOperations(s)
  s.day = dayOfEra(4)
  const p = s.products[0]
  p.productTypeId = 'data_platform'; p.users = 500_000; p.releaseDay = s.day
  p.bugs = p.pendingBugs = 0; p.quality = 95
  return s
}
const care = (s: ReturnType<typeof setup>, index = 0) => assignOperation(s, s.offices[index].id, { kind: 'standing', productId: s.signatureId!, service: 'reliability' }, true)
const launch = { kind: 'item' as const, id: 'companion:ai_assistant' }

describe('capacity-backed managed companion catalogue', () => {
  it('can operate more than two companions without deleting retained products or receiving free value', () => {
    const s = setup(), before = hostingCost(s)
    s.products.push(makeProduct({ id: s.nextId++, role: 'side' }), makeProduct({ id: s.nextId++, role: 'side' }))
    for (const id of ['mobile_app', 'free_edition', 'integrations', 'ai_assistant']) expect(launchCompanion(s, id)).not.toBeNull()
    expect(companionsOf(s)).toHaveLength(4)
    expect(s.products.filter((p) => p.role === 'side')).toHaveLength(2)
    expect(hostingCost(s)).toBeGreaterThan(before)
    expect(companionEffects(s)).toEqual({ reach: 0, retention: 0, pay: 0 })
    expect(companionBlocker(s, getCompanion('ai_assistant')!)).toBe('Already launched')
  })

  it('keeps the legacy two-slot admission rule only outside Operations', () => {
    const s = setup()
    for (const o of s.offices) delete o.assignment
    launchCompanion(s, 'mobile_app'); launchCompanion(s, 'free_edition')
    expect(companionBlocker(s, getCompanion('integrations')!)).toMatch(/slots are taken/)
    initialiseOperations(s)
    expect(companionBlocker(s, getCompanion('integrations')!)).toBeNull()
  })

  it('forecasts real draft users, traffic bugs and integration cost without consuming IDs, money or RNG', () => {
    const s = setup(), ai = getCompanion('ai_assistant')!
    care(s, 1)
    const before = serialize(s), forecast = companionLaunchForecast(s, ai, s.offices[0].id)!
    expect(serialize(s)).toBe(before)
    const live = productService(s, s.products[0], 'reliability')
    expect(forecast.addedDemand).toBeGreaterThan(COMPANION_SERVICE_DEMAND)
    const c = launchCompanion(s, ai.id)!
    expect(c.users).toBe(forecast.users)
    expect(productService(s, s.products[0], 'reliability').demand).toBeCloseTo(live.demand + forecast.addedDemand)
    expect(companionCoverage(s)).toBeCloseTo(forecast.coverage)
  })

  it('does not count the selected build floor as simultaneously supplying its old reliability service', () => {
    const s = setup(), [a, b] = s.offices
    care(s)
    const fromCareFloor = companionLaunchForecast(s, getCompanion('ai_assistant')!, a.id)!
    const fromIdleFloor = companionLaunchForecast(s, getCompanion('ai_assistant')!, b.id)!
    expect(fromCareFloor.provided).toBe(0)
    expect(fromCareFloor.coverage).toBe(0)
    expect(fromIdleFloor.provided).toBeGreaterThan(0)
    const preview = operationPreview(s, a, s.products[0], launch)
    expect(preview.blocker).toBeNull()
    expect(preview.warning).toMatch(/only 0%/)
    expect(preview.companionForecast).toEqual(fromCareFloor)
    expect(assignOperation(s, a.id, { kind: 'initiative', productId: s.signatureId!, proposal: launch }, true).ok).toBe(true)
    expect(productService(s, s.products[0], 'reliability').provided).toBe(0)
  })

  it('does not subtract an unrelated product responsibility from flagship care', () => {
    const s = setup(), other = makeProduct({ id: s.nextId++ })
    s.products.push(other)
    care(s, 1)
    assignOperation(s, s.offices[0].id, { kind: 'standing', productId: other.id, service: 'reliability' })
    expect(ecosystemCapacity(s, s.offices[0].id)!.provided).toBe(productService(s, s.products[0], 'reliability').provided)
  })

  it('shows paid in-flight demand, survives reload, excludes the replaced reservation and clears on deliberate cancellation', () => {
    const s = setup(), a = s.offices[0]
    assignOperation(s, a.id, { kind: 'initiative', productId: s.signatureId!, proposal: launch })
    const c = ecosystemCapacity(s)!
    expect(c.pending).toBe(1)
    expect(c.reservedDemand).toBeGreaterThan(COMPANION_SERVICE_DEMAND)
    expect(ecosystemCapacity(s, a.id)!.pending).toBe(0)
    const loaded = deserialize(serialize(s))!
    expect(ecosystemCapacity(loaded)).toEqual(c)
    expect(assignOperation(loaded, a.id, { kind: 'idle' }, true).ok).toBe(true)
    expect(ecosystemCapacity(loaded)!.reservedDemand).toBe(0)
  })

  it('runs distinct companion builds on separate floors, reserves identity rather than the whole company, and reloads both', () => {
    const s = setup(), [a, b] = s.offices
    expect(assignOperation(s, a.id, { kind: 'initiative', productId: s.signatureId!, proposal: launch }).ok).toBe(true)
    expect(assignOperation(s, b.id, { kind: 'initiative', productId: s.signatureId!, proposal: launch })).toMatchObject({ ok: false, reason: 'This companion launch is already reserved' })
    expect(assignOperation(s, b.id, { kind: 'initiative', productId: s.signatureId!, proposal: { kind: 'item', id: 'companion:mobile_app' } }).ok).toBe(true)
    expect(ecosystemCapacity(s)!.pending).toBe(2)
    const loaded = deserialize(serialize(s))!
    expect(ecosystemCapacity(loaded)).toEqual(ecosystemCapacity(s))
    for (const floor of loaded.offices) for (const d of DISCIPLINES) floor.project!.progress[d] = floor.project!.target[d]
    teamDay(loaded)
    expect(companionsOf(loaded)).toHaveLength(2)
    expect(ecosystemCapacity(loaded)!.pending).toBe(0)
    expect(loaded.offices.every((o) => o.assignment?.kind === 'idle')).toBe(true)
  })

  it('delivers a paid third companion after a save/reload even if all care has since been removed', () => {
    const s = setup(), a = s.offices[0]
    const side = makeProduct({ id: s.nextId++, role: 'side' })
    s.products.push(side)
    launchCompanion(s, 'mobile_app'); launchCompanion(s, 'free_edition')
    care(s, 1)
    expect(assignOperation(s, a.id, { kind: 'initiative', productId: s.signatureId!, proposal: launch }).ok).toBe(true)
    const loaded = deserialize(serialize(s))!, floor = loaded.offices[0]
    assignOperation(loaded, loaded.offices[1].id, { kind: 'idle' }, true)
    for (const d of DISCIPLINES) floor.project!.progress[d] = floor.project!.target[d]
    teamDay(loaded)
    expect(companionsOf(loaded)).toHaveLength(3)
    expect(loaded.products.some((p) => p.id === side.id)).toBe(true)
    expect(floor.project).toBeNull()
    expect(companionCoverage(loaded)).toBe(0)
    expect(floor.assignment).toEqual({ kind: 'idle' })
  })

  it('continues to share one finite care budget across more than two companions, without multiplying bonuses or workers', () => {
    const s = setup(), p = s.products[0]
    for (const id of ['mobile_app', 'free_edition', 'integrations', 'ai_assistant']) launchCompanion(s, id)
    for (const product of s.products) product.bugs = product === p ? 1000 : 5
    care(s)
    const capacity = ecosystemCapacity(s)!, coverage = companionCoverage(s)
    expect(capacity.headroom).toBeLessThan(0)
    expect(coverage).toBeGreaterThan(0); expect(coverage).toBeLessThan(1)
    const effects = companionEffects(s)
    expect(effects.reach).toBeCloseTo(2 * COMPANION_REACH_BOOST * coverage)
    expect(effects.pay).toBeCloseTo(2 * COMPANION_KEEP_PAY * coverage)
    const bugs = s.products.reduce((sum, product) => sum + product.bugs, 0)
    standingDay(s)
    expect(bugs - s.products.reduce((sum, product) => sum + product.bugs, 0)).toBeCloseTo(Math.max(0, capacity.provided - 4 * COMPANION_SERVICE_DEMAND))
    expect(new Set(s.dayWork.map((w) => w.employeeId)).size).toBe(s.dayWork.length)
    for (const product of s.products) product.bugs = 0
    expect(companionCoverage(s)).toBe(1)
    expect(p.id).toBe(s.signatureId)
  })
})
