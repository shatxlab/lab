import { describe, expect, it } from 'vitest'
import { PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import { ALL_ITEMS } from '@/lib/tycoon/data/workstreams'
import { companyTrafficGoal } from '@/lib/tycoon/sim/company-scale'
import { stageProgress } from '@/lib/tycoon/sim/stages'
import { ipoBlocker } from '@/lib/tycoon/sim/exit'
import { itemBlocker } from '@/lib/tycoon/sim/roadmap'
import { scaleRequirements } from '@/lib/tycoon/sim/scale-readiness'
import { charterFixture } from './charter-fixtures'

describe('prospective paid-company professional traffic progression', () => {
  it.each(PRODUCT_TYPES.map((p) => [p.id, p.revenuePerUser] as const))('%s uses fixed public base-price equivalence, never current cash', (id, price) => {
    const s = charterFixture().game, p = s.products[0]
    p.productTypeId = id
    const original = 10000000, target = Math.ceil(original * Math.min(1, .3 / price))
    expect(companyTrafficGoal(s, original)).toBe(target)
    expect(target).toBeLessThanOrEqual(original)
    s.money = 9e12; s.incomeAverage = 1e10; p.built = ALL_ITEMS.map((i) => i.id)
    expect(companyTrafficGoal(s, original)).toBe(target)
    delete s.founding
    expect(companyTrafficGoal(s, original)).toBe(original)
  })
  it('does not use a selected planning focus before any signature exists', () => {
    const s = charterFixture().game
    s.founding!.focus = 'cloud_platform'; s.products = []; s.signatureId = null
    expect(companyTrafficGoal(s, 10000000)).toBe(10000000)
    expect(companyTrafficGoal(s, 0)).toBe(0)
  })
  it('keeps Journey, server readiness and IPO on the same earned professional-customer thresholds', () => {
    const s = charterFixture().game, p = s.products[0]
    p.productTypeId = 'cloud_platform'; p.users = 41667
    const goal = stageProgress(s, 6).find((g) => g.id === 'hit_10m')!
    expect(goal.label).toContain('41,667 customers (product-family scale)')
    expect(goal.met).toBe(true)
    expect(ipoBlocker(s)).toBe(null)
    const servers = scaleRequirements(s, 5).find((g) => g.id === 'scale_capacity')!
    expect(servers.label).toContain('12,500')
    p.users = 41666
    expect(ipoBlocker(s)).toContain('41,667 customers')
    delete s.founding
    expect(ipoBlocker(s)).toBe('Grow your hit to 10 million users')
    expect(stageProgress(s, 6).find((g) => g.id === 'hit_10m')!.met).toBe(false)
  })
  it('never bypasses revenue, profit or charter by buying a high-priced family or funding a company', () => {
    const s = charterFixture().game, p = s.products[0]
    p.productTypeId = 'cloud_platform'; p.users = 50000
    s.lifetimeRevenue = 0; s.money = 1e12
    expect(ipoBlocker(s)).toBe('Earn $1 billion over the life of the company')
    s.lifetimeRevenue = 1e9; s.profitDays = 0
    expect(ipoBlocker(s)).toBe('Make a profit for a year')
    s.profitDays = 360; p.size = 'small'
    expect(ipoBlocker(s)).toMatch(/Flagship/)
  })
  it.each(PRODUCT_TYPES.map((p) => [p.id] as const))('%s has the same paid initiative threshold in previews and admission, without free work', (id) => {
    const s = charterFixture().game, p = s.products[0], item = ALL_ITEMS.find((i) => i.id === 'enterprise_deals')!
    p.productTypeId = id; p.built = []; p.users = companyTrafficGoal(s, item.minUsers, id)
    const before = structuredClone(s)
    expect(itemBlocker(s, p, item)).toBe(null)
    expect(s).toEqual(before)
    p.users--
    expect(itemBlocker(s, p, item)).toContain('From ')
    if (companyTrafficGoal(s, item.minUsers, id) < item.minUsers) {
      p.users++; delete s.founding
      expect(itemBlocker(s, p, item)).toContain('From 2.00M users')
    }
  })
})
