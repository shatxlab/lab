import { describe, expect, it } from 'vitest'
import { keepsakeFor, keepsakeX } from '@/lib/tycoon/render-support/keepsakes'

describe('keepsakeFor', () => {
  it('always gives the same person the same thing', () => {
    for (let id = -3; id < 40; id++) expect(keepsakeFor(id)).toBe(keepsakeFor(id))
  })

  it('mixes flags, other things and bare walls among a few people hired in a row', () => {
    for (let first = 0; first < 20; first++) {
      const items = Array.from({ length: 4 }, (_, i) => keepsakeFor(first + i))
      expect(items).toContain(null)
      expect(items.some((item) => item !== null)).toBe(true)
    }
    const all = new Set(Array.from({ length: 20 }, (_, id) => keepsakeFor(id)))
    expect(all).toEqual(new Set(['flagUs', 'flagIndia', 'flagUk', 'picture', 'note', null]))
  })
})

describe('keepsakeX', () => {
  it('hangs each in its outer corner, as far in from either end of the partition', () => {
    for (const width of [6, 11, 12]) {
      expect(keepsakeX(false, width)).toBe(2)
      expect(keepsakeX(true, width) + width - 1).toBe(76)
    }
  })
})
