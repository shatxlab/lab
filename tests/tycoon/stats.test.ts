import { describe, expect, it } from 'vitest'
import { getMilestone, MILESTONES, rewardLabel } from '@/lib/tycoon/data/milestones'
import { PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import { RESEARCH } from '@/lib/tycoon/data/research'
import { DAYS_PER_MONTH, HISTORY_LIMIT, OFFICE_KINDS, START_MONEY } from '@/lib/tycoon/sim/balance'
import { historyWithNow, recordHistory, sampleNow } from '@/lib/tycoon/sim/history'
import { achievedMilestones, checkMilestones } from '@/lib/tycoon/sim/milestones'
import { shipProject, startProject } from '@/lib/tycoon/sim/project'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { advance, advanceDay, drainEvents } from '@/lib/tycoon/sim/tick'
import { DISCIPLINES, type GameState } from '@/lib/tycoon/sim/types'
import { makeEmployee, makeProduct, makeState, richState } from './helpers'

describe('history', () => {
  it('starts with a sample of day 0', () => {
    const state = createInitialState(1)
    expect(state.history).toHaveLength(1)
    expect(state.history[0]).toMatchObject({ day: 0, money: START_MONEY, income: 0 })
    expect(state.history[0].burn).toBeCloseTo((state.employees.reduce((s, e) => s + e.salary, 0) + OFFICE_KINDS.garage.rent) / DAYS_PER_MONTH)
  })

  it('gains one sample per month, taken after that day\'s costs', () => {
    const state = createInitialState(2)
    advance(state, 90)
    expect(state.history.map((h) => h.day)).toEqual([0, 30, 60, 90])
    expect(state.history[3].money).toBeCloseTo(state.money)
    expect(state.history[3].money).toBeLessThan(state.history[0].money) // nothing earned yet, wages paid
  })

  it('records income and burn per day, not per month', () => {
    const state = richState()
    const sample = sampleNow(state)
    expect(sample.income).toBeGreaterThan(0)
    expect(sample.income).toBeLessThan(2000) // a daily figure, not a monthly total
    expect(sample.burn).toBeCloseTo(sample.burn)
    expect(sample.day).toBe(state.day)
  })

  it('keeps only the newest HISTORY_LIMIT samples', () => {
    const state = createInitialState(3)
    for (let i = 0; i < HISTORY_LIMIT + 25; i++) {
      state.day += DAYS_PER_MONTH
      recordHistory(state)
    }
    expect(state.history).toHaveLength(HISTORY_LIMIT)
    expect(state.history[state.history.length - 1].day).toBe(state.day)
    expect(state.history[0].day).toBeGreaterThan(0) // day 0 has been pushed out
  })

  it('historyWithNow reaches today without duplicating a sample taken today', () => {
    const state = createInitialState(4)
    expect(historyWithNow(state)).toHaveLength(1) // day 0 is already recorded
    state.day = 12
    const withNow = historyWithNow(state)
    expect(withNow).toHaveLength(2)
    expect(withNow[1].day).toBe(12)
    expect(state.history).toHaveLength(1) // not stored
  })

  it('survives a save', () => {
    const state = createInitialState(5)
    advance(state, 65)
    expect(deserialize(serialize(state))!.history).toEqual(state.history)
  })

  it('rejects malformed samples', () => {
    const raw = JSON.parse(serialize(createInitialState(6)))
    raw.history = [{ day: 'soon', money: 1, income: 1, burn: 1 }]
    expect(deserialize(JSON.stringify(raw))).toBeNull()
  })
})

describe('milestone data', () => {
  it('has unique ids, readable text, and a real reward', () => {
    expect(new Set(MILESTONES.map((m) => m.id)).size).toBe(MILESTONES.length)
    for (const m of MILESTONES) {
      expect(m.name.length, m.id).toBeGreaterThan(3)
      expect(m.description.length, m.id).toBeGreaterThan(10)
      expect((m.reward.money ?? 0) + (m.reward.reputation ?? 0), m.id).toBeGreaterThan(0)
      expect(rewardLabel(m.reward).length).toBeGreaterThan(0)
    }
  })

  it('checks do not change the state', () => {
    const state = richState()
    const before = structuredClone(state)
    for (const m of MILESTONES) m.check(state)
    expect(state).toEqual(before)
  })

  it('a brand new studio has earned none of them', () => {
    expect(achievedMilestones(createInitialState(1))).toEqual([])
  })

  it('keeps cash rewards small next to what a studio earns', () => {
    const total = MILESTONES.reduce((sum, m) => sum + (m.reward.money ?? 0), 0)
    expect(total).toBeLessThan(300_000)
    const early = MILESTONES.filter((m) => ['first_ship', 'five_products', 'first_update', 'first_promotion', 'team_5'].includes(m.id))
    expect(early.reduce((sum, m) => sum + (m.reward.money ?? 0), 0)).toBeLessThan(4000)
  })

  it('does not pay for volume: shipping lots of poor products earns no count milestone', () => {
    const state = makeState([makeEmployee(1)])
    state.shippedCount = 40
    state.products = Array.from({ length: 40 }, (_, i) => makeProduct({ id: i + 1, quality: 25 }))
    expect(achievedMilestones(state)).toContain('first_ship') // a first ship is a first ship
    expect(achievedMilestones(state)).not.toContain('five_products')
    expect(achievedMilestones(state)).not.toContain('ten_products')
    expect(achievedMilestones(state)).not.toContain('twenty_five_products')
  })
})

describe('checkMilestones', () => {
  it('awards a milestone once: pays the reward and posts a notice', () => {
    const state = makeState([makeEmployee(1)])
    state.shippedCount = 1
    const money = state.money
    checkMilestones(state)
    expect(state.milestones).toEqual(['first_ship'])
    expect(state.money).toBe(money + getMilestone('first_ship')!.reward.money!)
    const notices = drainEvents(state).filter((e) => e.type === 'notice')
    expect(notices).toHaveLength(1)
    expect(notices[0].type === 'notice' && notices[0].text).toContain('Hello, world')

    checkMilestones(state)
    expect(state.money).toBe(money + getMilestone('first_ship')!.reward.money!)
    expect(drainEvents(state)).toEqual([])
  })

  it('awards several at once, and clamps reputation rewards at 100', () => {
    const state = makeState([makeEmployee(1)])
    state.shippedCount = 12
    state.reputation = 99.5
    state.products = Array.from({ length: 12 }, (_, i) => makeProduct({ id: i + 1, quality: 95 }))
    checkMilestones(state)
    expect(state.milestones).toEqual(expect.arrayContaining(['first_ship', 'five_products', 'ten_products', 'quality_90']))
    expect(state.reputation).toBe(100)
  })

  it('knows each condition', () => {
    const reached = (change: (s: GameState) => void) => {
      const state = makeState([makeEmployee(1)])
      change(state)
      return achievedMilestones(state)
    }
    expect(reached((s) => s.products.push(makeProduct({ updates: [{ day: 1 }] })))).toContain('first_update')
    expect(reached((s) => s.products.push(makeProduct({ users: 10_000 })))).toContain('users_10k')
    expect(reached((s) => s.products.push(makeProduct({ users: 9_999 })))).not.toContain('users_10k')
    expect(reached((s) => (s.bugsFixed = 25))).toContain('bugs_25')
    expect(reached((s) => ((s.day = 720), s.products.push(makeProduct({ reach: 10_000, users: 8_000 }))))).toContain('evergreen')
    expect(reached((s) => ((s.day = 719), s.products.push(makeProduct({ reach: 10_000, users: 8_000 }))))).not.toContain('evergreen')
    expect(reached((s) => ((s.day = 720), s.products.push(makeProduct({ reach: 10_000, users: 7_999 }))))).not.toContain('evergreen')
    expect(reached((s) => s.products.push(makeProduct({ boostUntil: 30, boostUsers: 10 })))).toContain('first_promotion')
    expect(reached((s) => (s.money = 100_000))).toContain('cash_100k')
    expect(reached((s) => (s.money = 99_999))).not.toContain('cash_100k')
    expect(reached((s) => (s.reputation = 50))).toContain('rep_50')
    expect(reached((s) => (s.day = 1080))).toContain('survive_3')
    expect(reached((s) => s.products.push(makeProduct({ productTypeId: 'saas_platform' })))).toContain('ship_saas')
    expect(reached((s) => s.products.push(makeProduct({ productTypeId: 'cloud_platform' })))).toContain('frontier')
    expect(reached((s) => (s.employees = Array.from({ length: 5 }, (_, i) => makeEmployee(i + 1))))).toContain('team_5')
    expect(reached((s) => (s.research.done = RESEARCH.slice(0, 5).map((n) => n.id)))).toContain('research_5')
  })

  it('"jack of all trades" needs every product type; "know-it-all" needs every research', () => {
    const state = makeState([makeEmployee(1)])
    state.products = PRODUCT_TYPES.slice(1).map((t, i) => makeProduct({ id: i + 1, productTypeId: t.id }))
    expect(achievedMilestones(state)).not.toContain('every_type')
    state.products.push(makeProduct({ id: 99, productTypeId: PRODUCT_TYPES[0].id }))
    expect(achievedMilestones(state)).toContain('every_type')

    state.research.done = RESEARCH.slice(1).map((n) => n.id)
    expect(achievedMilestones(state)).not.toContain('research_all')
    state.research.done = RESEARCH.map((n) => n.id)
    expect(achievedMilestones(state)).toContain('research_all')
  })

  it('arrives through the daily tick: shipping the first product pays out the next day', () => {
    const state = makeState([makeEmployee(1, { design: 60, engineering: 60, qa: 60 })], 5)
    startProject(state, 'web_app', [])
    for (const d of DISCIPLINES) state.offices[0].project!.progress[d] = state.offices[0].project!.target[d]
    shipProject(state)
    expect(state.milestones).toEqual([])
    advanceDay(state)
    expect(state.milestones).toContain('first_ship')
    expect(drainEvents(state).some((e) => e.type === 'notice' && e.text.includes('Milestone: Hello, world'))).toBe(true)
  })

  it('is not checked once the game is over', () => {
    const state = makeState([makeEmployee(1)])
    state.shippedCount = 3
    state.gameOver = true
    advanceDay(state)
    expect(state.milestones).toEqual([])
  })
})

describe('saving milestones', () => {
  it('keeps what was reached', () => {
    const state = richState()
    state.shippedCount = 6
    checkMilestones(state)
    expect(deserialize(serialize(state))!.milestones).toEqual(state.milestones)
  })

  it('drops milestones this build does not know and rejects malformed lists', () => {
    const raw = JSON.parse(serialize(richState()))
    raw.milestones = ['first_ship', 'removed_in_a_later_version']
    expect(deserialize(JSON.stringify(raw))!.milestones).toEqual(['first_ship'])
    raw.history = 'lots'
    expect(deserialize(JSON.stringify(raw))).toBeNull()
  })
})
