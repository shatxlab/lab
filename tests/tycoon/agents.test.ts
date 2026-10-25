import { describe, expect, it } from 'vitest'
import { AGENT_KINDS } from '@/lib/tycoon/data/agents'
import { agentBill, agentEffects, agentsMonth, availableAgents, oversight, rollbackCost, setAutonomy } from '@/lib/tycoon/sim/agents'
import { resolveRandomEvent } from '@/lib/tycoon/sim/events'
import { toolEffects, toolUpkeep } from '@/lib/tycoon/sim/tools'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { dayOfEra, makeProduct } from './helpers'
import type { GameState } from '@/lib/tycoon/sim/types'

function aiStudio(): GameState {
  const state = createInitialState(41)
  state.day = dayOfEra(3) + 10
  state.money = 1_000_000
  state.products = [makeProduct({ id: 3, hit: true, users: 50_000, reach: 80_000, productTypeId: 'fintech_app' })]
  state.signatureId = 3
  return state
}

describe('AI agents', () => {
  it('arrive with their era, and refuse unknown or unavailable ones', () => {
    const early = createInitialState(1)
    expect(availableAgents(early)).toEqual([])
    expect(setAutonomy(early, 'copilot', 1).ok).toBe(false)
    const state = aiStudio()
    expect(availableAgents(state).map((k) => k.id)).toEqual(['copilot', 'analyst'])
    expect(setAutonomy(state, 'nope', 1).ok).toBe(false)
    expect(setAutonomy(state, 'copilot', 4).ok).toBe(false)
    expect(setAutonomy(state, 'support', 1).ok).toBe(false) // the agent era
    expect(setAutonomy(state, 'copilot', 2).ok).toBe(true)
  })

  it('add their effect to the studio\'s tools, and their bill to the upkeep, more at higher freedom', () => {
    const state = aiStudio()
    expect(toolUpkeep(state)).toBe(0)
    setAutonomy(state, 'copilot', 1)
    const low = { speed: toolEffects(state).speed, bill: toolUpkeep(state) }
    setAutonomy(state, 'copilot', 3)
    const high = { speed: toolEffects(state).speed, bill: toolUpkeep(state) }
    expect(low.speed).toBeCloseTo(0.04)
    expect(high.speed).toBeGreaterThan(low.speed * 3)
    expect(high.bill).toBeGreaterThan(low.bill * 3)
    expect(agentBill(state)).toBe(high.bill)
    setAutonomy(state, 'analyst', 2)
    expect(toolEffects(state).insight).toBeCloseTo(0.96)
  })

  it('cost more for a bigger team, and the agent era makes them sharper', () => {
    const state = aiStudio()
    setAutonomy(state, 'copilot', 2)
    const small = agentBill(state)
    for (let i = 0; i < 8; i++) state.employees.push({ ...state.employees[0], id: 900 + i, founder: false })
    expect(agentBill(state)).toBeGreaterThan(small)
    const before = agentEffects(state).speed
    state.day = dayOfEra(6) + 1
    expect(agentEffects(state).speed).toBeCloseTo(before * 1.25)
  })

  it('go wrong only with freedom, less with safeguards, and you decide what it costs', () => {
    const state = aiStudio()
    setAutonomy(state, 'copilot', 1)
    for (let i = 0; i < 300; i++) agentsMonth(state)
    expect(state.pendingEvent).toBeNull()
    setAutonomy(state, 'copilot', 3)
    state.products[0].built = ['observability', 'test_automation', 'chaos_testing']
    expect(oversight(state)).toBe(0.6)
    for (let i = 0; i < 400 && !state.pendingEvent; i++) agentsMonth(state)
    expect(state.pendingEvent?.id).toBe('agent_incident')
    const bugs = state.products[0].bugs
    const quality = state.products[0].quality
    expect(resolveRandomEvent(state, 1).ok).toBe(true) // let it ride
    expect(state.products[0].bugs).toBeGreaterThan(bugs)
    expect(state.products[0].quality).toBeLessThan(quality)
  })

  it('can be rolled back for a price, or switched off', () => {
    const state = aiStudio()
    setAutonomy(state, 'copilot', 3)
    state.products[0].built = []
    for (let i = 0; i < 400 && !state.pendingEvent; i++) agentsMonth(state)
    expect(state.pendingEvent?.id).toBe('agent_incident')
    const bugs = state.products[0].bugs
    const money = state.money
    const cost = rollbackCost(state)
    expect(cost).toBeGreaterThan(0)
    expect(resolveRandomEvent(state, 0).ok).toBe(true)
    expect(state.money).toBe(money - cost)
    expect(state.products[0].bugs).toBe(bugs)
    state.pendingEvent = null
    for (let i = 0; i < 400 && !state.pendingEvent; i++) agentsMonth(state)
    expect(resolveRandomEvent(state, 2).ok).toBe(true)
    expect(state.agents!.copilot).toBe(0)
  })

  it('survive a save, and every kind is in a known era', () => {
    const state = aiStudio()
    setAutonomy(state, 'analyst', 3)
    expect(deserialize(serialize(state))!.agents).toEqual({ analyst: 3 })
    expect(AGENT_KINDS.every((k) => k.perPower > 0 && k.baseCost > 0)).toBe(true)
  })
})
