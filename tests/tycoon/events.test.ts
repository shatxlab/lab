import { describe, expect, it } from 'vitest'
import { RANDOM_EVENTS, getRandomEvent } from '@/lib/tycoon/data/events'
import { EVENT_COOLDOWN_DAYS, EVENT_MIN_DAY, OVERSHOOT_CAP, POACH_IMMUNITY_DAYS } from '@/lib/tycoon/sim/balance'
import { dailyIncome } from '@/lib/tycoon/sim/economy'
import { deskCount } from '@/lib/tycoon/sim/offices'
import { describePendingEvent, resolveRandomEvent, rollRandomEvent } from '@/lib/tycoon/sim/events'
import { hasModifier, statMultiplier } from '@/lib/tycoon/sim/modifiers'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { advanceDay, drainEvents } from '@/lib/tycoon/sim/tick'
import { DISCIPLINES, type GameState } from '@/lib/tycoon/sim/types'
import { makeEmployee, makeState, richState } from './helpers'

/** Puts `id` in front of the player and returns the state, ready for `resolveRandomEvent`. */
function offered(id: string, state: GameState = richState()): GameState {
  const event = getRandomEvent(id)!
  state.pendingEvent = { id, data: event.prepare?.(state) ?? {} }
  return state
}

const choiceIndex = (state: GameState, label: string) =>
  describePendingEvent(state)!.choices.findIndex((c) => c.label === label)

describe('every random event', () => {
  it.each(RANDOM_EVENTS.map((e) => [e.id, e] as const))('%s: can be offered and every available choice applies cleanly', (id, event) => {
    // The investor only shows up when the studio is nearly out of money.
    const state = richState()
    if (id === 'investor') state.money = 500
    expect(event.when(state)).toBe(true)

    const data = event.prepare?.(state) ?? {}
    expect(event.text({ state, data }).length).toBeGreaterThan(10)
    const count = event.choices({ state, data }).length
    expect(count).toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const copy = structuredClone(state)
      const choice = event.choices({ state: copy, data })[i]
      if (choice.disabled) continue
      expect(choice.apply().length).toBeGreaterThan(0)
      expect(Number.isFinite(copy.money)).toBe(true)
      expect(copy.reputation).toBeGreaterThanOrEqual(0)
      expect(copy.reputation).toBeLessThanOrEqual(100)
    }
  })

  it('has unique ids and sensible weights', () => {
    expect(new Set(RANDOM_EVENTS.map((e) => e.id)).size).toBe(RANDOM_EVENTS.length)
    expect(RANDOM_EVENTS.every((e) => e.weight > 0)).toBe(true)
  })
})

describe('rollRandomEvent', () => {
  /** Plays on, resolving each event with its first available choice; returns the days they were offered. */
  function offeredDays(seed: number, days: number): { day: number; id: string }[] {
    const state = richState(seed)
    state.day = 0
    state.lastEventDay = 0
    state.products.forEach((p) => (p.releaseDay -= 100))
    const seen: { day: number; id: string }[] = []
    for (let i = 0; i < days; i++) {
      advanceDay(state)
      drainEvents(state)
      state.money = Math.max(state.money, 50_000) // keep the studio healthy so the roll isn't about debt
      if (!state.pendingEvent) continue
      seen.push({ day: state.day, id: state.pendingEvent.id })
      const view = describePendingEvent(state)!
      resolveRandomEvent(state, Math.max(0, view.choices.findIndex((c) => !c.disabled)))
    }
    return seen
  }

  it('waits for the warm-up, honours the cooldown, and fires every month or two', () => {
    const seen = offeredDays(5, 3000)
    expect(seen.length).toBeGreaterThan(30)
    expect(seen.length).toBeLessThan(110)
    expect(seen[0].day).toBeGreaterThanOrEqual(EVENT_MIN_DAY)
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].day - seen[i - 1].day).toBeGreaterThanOrEqual(EVENT_COOLDOWN_DAYS)
    }
    expect(new Set(seen.map((e) => e.id)).size).toBeGreaterThanOrEqual(6) // variety
  })

  it('is deterministic for a seed', () => {
    expect(offeredDays(8, 600)).toEqual(offeredDays(8, 600))
  })

  it('does nothing while an event is pending or after game over', () => {
    const state = offered('press')
    for (let i = 0; i < 500; i++) rollRandomEvent(state)
    expect(state.pendingEvent?.id).toBe('press')
    expect(state.events).toEqual([])

    const over = richState()
    over.gameOver = true
    for (let i = 0; i < 500; i++) rollRandomEvent(over)
    expect(over.pendingEvent).toBeNull()
  })

  it('always offers an investor lifeline three days into debt, once, even before the warm-up', () => {
    const state = makeState([makeEmployee(1, {}, 3000)])
    state.money = -1
    let offeredOn: number | null = null
    for (let i = 0; i < 10; i++) {
      advanceDay(state)
      if (state.pendingEvent && offeredOn === null) offeredOn = state.day
    }
    expect(offeredOn).toBe(3)
    expect(state.pendingEvent?.id).toBe('investor')
  })

  it('is a one-time last chance: no second investor once a deal was taken', () => {
    const state = makeState([makeEmployee(1, {}, 3000)])
    state.money = -1
    for (let i = 0; i < 3; i++) advanceDay(state)
    resolveRandomEvent(state, 0) // take the money
    expect(state.investorDeals).toBe(1)
    expect(hasModifier(state, 'investor')).toBe(true)
    state.money = -1
    state.debtDays = 2
    advanceDay(state)
    expect(state.pendingEvent).toBeNull()

    // ...not even after the deal has run out
    state.day += 400
    state.money = -1
    state.debtDays = 2
    advanceDay(state)
    expect(state.pendingEvent).toBeNull()
  })

  it('declining the investor does not use up the offer', () => {
    const state = makeState([makeEmployee(1, {}, 3000)])
    state.money = -1
    for (let i = 0; i < 3; i++) advanceDay(state)
    resolveRandomEvent(state, 1) // no thanks
    expect(state.investorDeals).toBe(0)
  })
})

describe('resolveRandomEvent', () => {
  it('applies the choice, clears the event, restarts the cooldown and reports the outcome', () => {
    const state = offered('press')
    state.day = 123
    const reputation = state.reputation
    expect(resolveRandomEvent(state, 0).ok).toBe(true)
    expect(state.reputation).toBe(reputation + 3)
    expect(state.pendingEvent).toBeNull()
    expect(state.lastEventDay).toBe(123)
    expect(state.events.some((e) => e.type === 'notice')).toBe(true)
  })

  it('rejects bad indexes and missing events without changing anything', () => {
    const state = offered('press')
    const before = structuredClone(state)
    expect(resolveRandomEvent(state, 5).ok).toBe(false)
    expect(resolveRandomEvent(state, -1).ok).toBe(false)
    expect(state).toEqual(before)
    expect(resolveRandomEvent(richState(), 0).ok).toBe(false)
  })

  it('refuses a choice the studio cannot afford', () => {
    const state = offered('server_outage')
    state.money = 10
    const before = structuredClone(state)
    expect(resolveRandomEvent(state, choiceIndex(state, 'Pay for an emergency fix')).ok).toBe(false)
    expect(state).toEqual(before)
  })

  it('keeps free choices available when the studio is in debt', () => {
    const state = offered('server_outage')
    state.money = -5000
    const view = describePendingEvent(state)!
    expect(view.choices.find((c) => c.label === 'Ride it out')?.disabled).toBeUndefined()
    expect(resolveRandomEvent(state, choiceIndex(state, 'Ride it out')).ok).toBe(true)
  })
})

describe('event outcomes', () => {
  it('server outage: paying costs money; riding it out cuts income and reputation for a while', () => {
    const paid = offered('server_outage')
    const money = paid.money
    resolveRandomEvent(paid, choiceIndex(paid, 'Pay for an emergency fix'))
    expect(paid.money).toBeLessThan(money)
    expect(statMultiplier(paid, 'revenue')).toBe(1)

    const ignored = offered('server_outage')
    const rep = ignored.reputation
    const income = dailyIncome(ignored)
    resolveRandomEvent(ignored, choiceIndex(ignored, 'Ride it out'))
    expect(ignored.reputation).toBe(rep - 2)
    expect(dailyIncome(ignored)).toBeCloseTo(income * 0.6)
    ignored.day += 10
    expect(statMultiplier(ignored, 'revenue')).toBe(1)
  })

  it('poaching targets someone on the team: a counter-offer keeps them, otherwise they leave', () => {
    const stay = offered('poach')
    const target = stay.pendingEvent!.data.employeeId
    expect(stay.employees.some((e) => e.id === target)).toBe(true)

    const staying = structuredClone(stay)
    const money = staying.money
    resolveRandomEvent(staying, choiceIndex(staying, 'Make a counter-offer'))
    expect(staying.employees.some((e) => e.id === target)).toBe(true)
    expect(staying.money).toBeLessThan(money)
    expect(staying.employees.find((e) => e.id === target)!.keptDay).toBe(staying.day)

    const leaving = structuredClone(stay)
    resolveRandomEvent(leaving, choiceIndex(leaving, 'Let them go'))
    expect(leaving.employees.some((e) => e.id === target)).toBe(false)
    expect(leaving.employees).toHaveLength(stay.employees.length - 1)
  })

  it('poaching spreads over the team and skips someone a counter-offer just kept', () => {
    const targets = new Set<number>()
    for (let seed = 1; seed <= 40; seed++) targets.add(offered('poach', richState(seed)).pendingEvent!.data.employeeId)
    expect(targets.size).toBeGreaterThan(1)

    const state = richState()
    for (const e of state.employees) e.keptDay = state.day
    const [free] = state.employees
    free.keptDay = state.day - POACH_IMMUNITY_DAYS - 1
    expect(getRandomEvent('poach')!.prepare!(state).employeeId).toBe(free.id)

    state.employees[0].keptDay = state.day
    expect(getRandomEvent('poach')!.when(state)).toBe(false)
  })

  it('viral: free boost is smaller than the paid one', () => {
    const free = offered('viral')
    resolveRandomEvent(free, choiceIndex(free, 'Ride the wave'))
    const paid = offered('viral')
    const money = paid.money
    resolveRandomEvent(paid, choiceIndex(paid, 'Boost it with ads'))
    expect(paid.money).toBeLessThan(money)
    expect(statMultiplier(free, 'revenue')).toBeCloseTo(1.35)
    expect(statMultiplier(paid, 'revenue')).toBeCloseTo(1.7)
  })

  it('freelancer: joins at half the signing fee, or leaves the candidate pool when passed', () => {
    const hire = offered('freelancer')
    const id = hire.pendingEvent!.data.employeeId
    const person = hire.candidates.find((c) => c.id === id)!
    const money = hire.money
    resolveRandomEvent(hire, choiceIndex(hire, 'Hire them'))
    expect(hire.employees.some((e) => e.id === id)).toBe(true)
    expect(hire.candidates.some((c) => c.id === id)).toBe(false)
    expect(money - hire.money).toBe(Math.round(person.salary / 2))

    const pass = offered('freelancer')
    const passId = pass.pendingEvent!.data.employeeId
    resolveRandomEvent(pass, choiceIndex(pass, 'Pass'))
    expect(pass.candidates.some((c) => c.id === passId)).toBe(false)
    expect(pass.employees.some((e) => e.id === passId)).toBe(false)
  })

  it('freelancer: cannot be hired without a free desk', () => {
    const state = offered('freelancer')
    while (state.employees.length < deskCount(state)) state.employees.push(makeEmployee(500 + state.employees.length))
    expect(describePendingEvent(state)!.choices[0].disabled).toBe('No free desk')
  })

  it('investor: pays out now in exchange for a year of lower income', () => {
    const state = richState()
    state.money = 500
    offered('investor', state)
    resolveRandomEvent(state, 0)
    expect(state.money).toBeGreaterThan(5000)
    expect(statMultiplier(state, 'revenue')).toBeCloseTo(0.85)
    state.day += 359
    expect(hasModifier(state, 'investor')).toBe(true)
    state.day += 1
    expect(hasModifier(state, 'investor')).toBe(false)
  })

  it('open-source help adds progress, capped at the polish limit', () => {
    const quick = offered('oss_help')
    const before = quick.offices[0].project!.progress.engineering
    resolveRandomEvent(quick, choiceIndex(quick, 'Merge them quickly'))
    expect(quick.offices[0].project!.progress.engineering).toBeCloseTo(before + quick.offices[0].project!.target.engineering * 0.08)

    const careful = offered('oss_help')
    careful.offices[0].project!.progress.qa = careful.offices[0].project!.target.qa * 1.45
    resolveRandomEvent(careful, choiceIndex(careful, 'Review them properly'))
    expect(careful.offices[0].project!.progress.qa).toBeCloseTo(careful.offices[0].project!.target.qa * OVERSHOOT_CAP)
  })

  it('gambles resolve both ways across seeds (tax audit, ignored vulnerability)', () => {
    const outcomes = { tax: new Set<string>(), security: new Set<string>() }
    for (let seed = 1; seed <= 60; seed++) {
      const tax = offered('tax_audit', richState(seed))
      const money = tax.money
      resolveRandomEvent(tax, choiceIndex(tax, 'Contest it'))
      outcomes.tax.add(tax.money === money ? 'won' : 'lost')

      const sec = offered('security', richState(seed))
      const rep = sec.reputation
      resolveRandomEvent(sec, choiceIndex(sec, 'Ignore it'))
      outcomes.security.add(sec.reputation === rep ? 'safe' : 'breach')
    }
    expect([...outcomes.tax].sort()).toEqual(['lost', 'won'])
    expect([...outcomes.security].sort()).toEqual(['breach', 'safe'])
  })
})

describe('saving with events', () => {
  it('a pending event survives a save and load', () => {
    const state = offered('poach')
    const restored = deserialize(serialize(state))!
    expect(restored.pendingEvent).toEqual(state.pendingEvent)
    expect(describePendingEvent(restored)?.title).toBe('Job offer')
  })

  it('drops a pending event this build does not know instead of rejecting the save', () => {
    const state = richState()
    const raw = JSON.parse(serialize(state))
    raw.pendingEvent = { id: 'removed_in_a_later_version', data: {} }
    expect(deserialize(JSON.stringify(raw))?.pendingEvent).toBeNull()
  })

  it('rejects malformed new fields', () => {
    const base = JSON.parse(serialize(richState()))
    const bad = (change: (s: Record<string, any>) => void) => {
      const copy = structuredClone(base)
      change(copy)
      return deserialize(JSON.stringify(copy))
    }
    expect(bad((s) => (s.modifiers = [{ id: 1, source: 'x', stat: 'luck', mult: 1, expiresDay: 5 }]))).toBeNull()
    expect(bad((s) => (s.market = { web_app: 'high' }))).toBeNull()
    expect(bad((s) => (s.pendingEvent = { id: 'press', data: { a: 'b' } }))).toBeNull()
    expect(bad((s) => (s.lastEventDay = 'soon'))).toBeNull()
  })
})
