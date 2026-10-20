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
