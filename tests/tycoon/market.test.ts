import { describe, expect, it } from 'vitest'
import { PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import { MARKET_COLD, MARKET_HOT, MARKET_MAX, MARKET_MIN, MARKET_NEWS_GAP_DAYS } from '@/lib/tycoon/sim/balance'
import { initialMarket, marketDemand, updateMarket } from '@/lib/tycoon/sim/market'
import { shipProject, startProject } from '@/lib/tycoon/sim/project'
import { createInitialState } from '@/lib/tycoon/sim/state'
import { DISCIPLINES } from '@/lib/tycoon/sim/types'
import { makeEmployee, makeState } from './helpers'

describe('market', () => {
  it('starts neutral for every product type', () => {
    const market = initialMarket()
    expect(Object.keys(market).sort()).toEqual(PRODUCT_TYPES.map((t) => t.id).sort())
    expect(Object.values(market).every((v) => v === 1)).toBe(true)
  })

  it('stays inside its bounds and keeps drifting around 1.0', () => {
    const state = createInitialState(3)
    let total = 0
    let count = 0
    let lowest = Infinity
    let highest = -Infinity
    for (let month = 0; month < 3000; month++) {
      updateMarket(state)
      for (const type of PRODUCT_TYPES) {
        const v = marketDemand(state, type.id)
        total += v
        count += 1
        lowest = Math.min(lowest, v)
        highest = Math.max(highest, v)
      }
    }
    expect(lowest).toBeGreaterThanOrEqual(MARKET_MIN)
    expect(highest).toBeLessThanOrEqual(MARKET_MAX)
    expect(total / count).toBeGreaterThan(0.93)
    expect(total / count).toBeLessThan(1.07)
    expect(highest).toBeGreaterThan(1.25) // booms really happen
    expect(lowest).toBeLessThan(0.8) // and so do busts
  })

  it('is deterministic for a given seed', () => {
    const a = createInitialState(9)
    const b = createInitialState(9)
    for (let i = 0; i < 24; i++) {
      updateMarket(a)
      updateMarket(b)
    }
    expect(a.market).toEqual(b.market)
  })

  it('announces surges and slumps, but only for product types the player has unlocked', () => {
    const texts: string[] = []
    for (let seed = 1; seed <= 3000; seed++) {
      const state = createInitialState(seed) // reputation 0: only Web App is unlocked
      updateMarket(state)
      for (const event of state.events) if (event.type === 'notice') texts.push(event.text)
    }
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.every((t) => t.startsWith('Web App demand is'))).toBe(true)
    expect(texts.some((t) => t.includes('surging'))).toBe(true)
    expect(texts.some((t) => t.includes('cooling'))).toBe(true)
  })

  it('makes the news about a type at most once in a while, however its demand hovers', () => {
    const state = createInitialState(11)
    let news = 0
    for (let month = 0; month < 120; month++) {
      state.day += 30
      // Swing Web App across the line every month.
      state.market.web_app = month % 2 === 0 ? MARKET_HOT - 0.01 : MARKET_COLD + 0.01
      updateMarket(state)
      news += state.events.filter((e) => e.type === 'notice' && e.text.startsWith('Web App')).length
      state.events = []
    }
    expect(news).toBeLessThanOrEqual(Math.ceil((120 * 30) / MARKET_NEWS_GAP_DAYS) + 1)
  })

  it('scales a product\'s reach with demand at launch', () => {
    const launch = (demand: number) => {
      const state = makeState([makeEmployee(1, { design: 50, engineering: 50, qa: 50 })], 5)
      state.market.web_app = demand
      startProject(state, 'web_app', [])
      const project = state.offices[0].project!
      for (const d of DISCIPLINES) project.progress[d] = project.target[d]
      shipProject(state)
      return state.products[0].reach
    }
    expect(launch(1.4) / launch(0.7)).toBeCloseTo(2, 6)
  })
})
