import { describe, expect, it } from 'vitest'
import { ERAS } from '@/lib/tycoon/data/eras'
import { FEATURES } from '@/lib/tycoon/data/features'
import { PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'

describe('late-game content', () => {
  it('has eras that run into the twenties and start in order', () => {
    expect(ERAS.length).toBeGreaterThanOrEqual(9)
    expect(ERAS.at(-1)!.startYear).toBeGreaterThanOrEqual(15)
  })

  it('only expects features that exist and suit the type that is expected to have them', () => {
    for (const era of ERAS) {
      for (const [typeId, ids] of Object.entries(era.expected)) {
        for (const id of ids ?? []) {
          const feature = FEATURES.find((f) => f.id === id)
          expect(feature, `${era.id}: ${id}`).toBeDefined()
          expect(feature!.suits, `${era.id}: ${id} for ${typeId}`).toContain(typeId)
        }
      }
    }
  })

  it('never takes an expectation back: what one era expects the next still does', () => {
    for (let i = 5; i < ERAS.length; i++) {
      for (const [typeId, ids] of Object.entries(ERAS[i - 1].expected)) {
        for (const id of ids ?? []) expect(ERAS[i].expected[typeId] ?? [], `${ERAS[i].id} ${typeId}`).toContain(id)
      }
    }
  })

  it('opens every product type in some era', () => {
    for (const type of PRODUCT_TYPES) expect(type.era).toBeLessThan(ERAS.length)
    expect(PRODUCT_TYPES.length).toBeGreaterThanOrEqual(12)
  })
})

describe('wages across eras', () => {
  it('rise steeply at first and gently in the late eras', async () => {
    const { eraWageFactor } = await import('@/lib/tycoon/sim/hiring')
    const { ERA_WAGE_FULL_ERAS, ERA_WAGE_GROWTH, ERA_WAGE_LATE_GROWTH } = await import('@/lib/tycoon/sim/balance')
    const dayOf = (index: number) => (ERAS[index].startYear - 1) * 360
    expect(eraWageFactor(0)).toBe(1)
    expect(eraWageFactor(dayOf(1))).toBeCloseTo(1 + ERA_WAGE_GROWTH, 10)
    expect(eraWageFactor(dayOf(ERA_WAGE_FULL_ERAS))).toBeCloseTo(1 + ERA_WAGE_GROWTH * ERA_WAGE_FULL_ERAS, 10)
    expect(eraWageFactor(dayOf(ERA_WAGE_FULL_ERAS + 1))).toBeCloseTo(1 + ERA_WAGE_GROWTH * ERA_WAGE_FULL_ERAS + ERA_WAGE_LATE_GROWTH, 10)
    expect(eraWageFactor(dayOf(ERAS.length - 1))).toBeLessThan(1 + ERA_WAGE_GROWTH * (ERAS.length - 1))
  })
})
