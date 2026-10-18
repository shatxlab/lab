import { describe, expect, it } from 'vitest'
import { PRODUCT_WORDS } from '@/lib/tycoon/data/names'
import { freshProductName } from '@/lib/tycoon/sim/naming'
import { createInitialState } from '@/lib/tycoon/sim/state'
import { makeProduct } from './helpers'

describe('product names', () => {
  it('has no repeated words in the pool', () => {
    expect(new Set(PRODUCT_WORDS).size).toBe(PRODUCT_WORDS.length)
  })

  it('never repeats a name across your products, retired ones and the rivals', () => {
    const state = createInitialState(7)
    const names = new Set(state.rivalProducts.map((p) => p.name))
    for (let i = 0; i < PRODUCT_WORDS.length * 2; i++) {
      const name = freshProductName(state)
      expect(names.has(name)).toBe(false)
      names.add(name)
      // Alternate who ships it, so every list is checked.
      if (i % 2 === 0) state.products.push(makeProduct({ id: state.nextId++, name }))
      else state.rivalProducts.push({ ...state.rivalProducts[0], id: state.nextId++, name })
    }
  })

  it('avoids a name the player has retired', () => {
    const state = createInitialState(3)
    const taken = new Set(PRODUCT_WORDS.slice(1))
    state.retired = [...taken].map((name, i) => ({
      id: 900 + i, name, productTypeId: 'web_app', size: 'small', hit: false, releaseDay: 0, endDay: 1,
      users: 0, totalRevenue: 0, outcome: 'retired', price: 0, buyer: null,
    }))
    const first = PRODUCT_WORDS[0].toLowerCase()
    for (let i = 0; i < 20; i++) {
      const name = freshProductName(state)
      expect(taken.has(name)).toBe(false)
      expect(name === PRODUCT_WORDS[0] || name.includes(' ')).toBe(true)
      void first
    }
  })
})
