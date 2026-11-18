import { afterEach, describe, expect, it, vi } from 'vitest'
import { businessDelta, businessSnapshot, completeBusinessDecision, recordBusinessDecision } from '@/lib/tycoon/sim/business-history'
import { chooseCard, initiativePreview } from '@/lib/tycoon/sim/cycle'
import { deepWorkDay } from '@/lib/tycoon/sim/deepwork'
import { shipProject } from '@/lib/tycoon/sim/project'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { advanceDay } from '@/lib/tycoon/sim/tick'
import * as products from '@/lib/tycoon/sim/products'
import { isFloorAssignment, operationEventMode, standingService, type FloorAssignment } from '@/lib/tycoon/sim/operating-contract'
import { DISCIPLINES, type Proposal } from '@/lib/tycoon/sim/types'
import { stage0Fixture } from './stage0-fixtures'

function ready() {
  const state = stage0Fixture('one-floor')
  state.plan = { clarity: 90, cards: [{ kind: 'polish', id: 'polish', why: 'Reduce open bugs' }] }
  return state
}
afterEach(() => vi.restoreAllMocks())

describe('initiative decision contracts', () => {
  it('is pure, names affected product, labour, time and recurring cash', () => {
    const state = ready()
    const before = serialize(state)
    const card: Proposal = { kind: 'item', id: 'ci_pipeline', why: 'Improve tools' }
    const preview = initiativePreview(state, state.products[0], card, 90)
    expect(preview.productId).toBe(state.signatureId)
    expect(preview.floors).toEqual([state.offices[0].id])
    expect(preview.delayed).toContain('no guaranteed return')
    expect(preview.costNote).toContain('Payroll')
    expect(preview.addedDailyUpkeep).toBe(80)
    expect(serialize(state)).toBe(before)
  })
  it('records only successful decisions before effects and matches the exact project on completion', () => {
    const state = ready()
    const before = businessSnapshot(state, state.products[0])
    expect(chooseCard(state, 99).ok).toBe(false)
    expect(state.businessDecisions).toBeUndefined()
    expect(chooseCard(state, 0).ok).toBe(true)
    const decision = state.businessDecisions![0]
    expect(decision.before).toEqual(before)
    const project = state.offices[0].project!
    expect(decision.projectId).toBe(project.id)
    completeBusinessDecision(state, state.signatureId!, project.id + 1)
    expect(decision.after).toBeUndefined()
    state.day += 10
    for (const key of DISCIPLINES) project.progress[key] = project.target[key]
    expect(shipProject(state, undefined, state.offices[0].id).ok).toBe(true)
    expect(decision.after?.day).toBe(state.day)
    expect(businessDelta(decision.before, decision.after!).day).toBe(10)
  })
  it('records uncertain deep-work outcomes without pretending an immediate benefit', () => {
    const state = ready()
    state.plan!.cards = [{ kind: 'deep', id: 'rewrite', why: 'Fix the core' }]
    expect(chooseCard(state, 0).ok).toBe(true)
    expect(state.businessDecisions![0].kind).toBe('deep')
    expect(state.businessDecisions![0].after).toBeUndefined()
    state.deepWork!.checkpointDone = true
    state.day += state.deepWork!.days
    deepWorkDay(state)
    expect(state.businessDecisions![0].after?.day).toBe(state.day)
  })
  it('round-trips optional observations and rejects malformed/non-finite data', () => {
    const state = ready()
    expect(deserialize(serialize(state))?.businessDecisions).toBeUndefined()
    chooseCard(state, 0)
    const json = serialize(state)
    expect(deserialize(json)?.businessDecisions).toEqual(state.businessDecisions)
    const raw = JSON.parse(json)
    raw.businessDecisions[0].before.revenue = 'false revenue'
    expect(deserialize(JSON.stringify(raw))).toBeNull()
    raw.businessDecisions[0].before.revenue = null
    expect(deserialize(JSON.stringify(raw))).toBeNull()
  })
  it('bounds saved history and does not consume RNG', () => {
    const state = ready()
    const rng = state.rng
    for (let i = 0; i < 40; i++) recordBusinessDecision(state, state.products[0], 'Test', 'strike', businessSnapshot(state, state.products[0]))
    expect(state.businessDecisions).toHaveLength(24)
    expect(state.businessDecisions?.every((entry) => entry.after !== undefined)).toBe(true)
    expect(state.rng).toBe(rng)
  })
  it('blocks missing skills in both the preview and the command', () => {
    const state = ready()
    state.employees.forEach((employee) => { employee.skills = { design: 0, engineering: 0, qa: 0 } })
    const preview = initiativePreview(state, state.products[0], state.plan!.cards[0], 90)
    expect(preview.missing.length).toBeGreaterThan(0)
    expect(preview.blocker).toContain('Missing')
    expect(chooseCard(state, 0).ok).toBe(false)
    expect(state.businessDecisions).toBeUndefined()
  })
  it('captures release completion before that day’s demand and income pass', () => {
    const state = ready()
    chooseCard(state, 0)
    const project = state.offices[0].project!
    for (const key of DISCIPLINES) project.progress[key] = project.target[key]
    let sawCompletion = false
    const original = products.productsDay
    vi.spyOn(products, 'productsDay').mockImplementation((current) => {
      const decision = current.businessDecisions![0]
      sawCompletion = decision.after !== undefined
      expect(decision.after?.users).toBe(current.products[0].users)
      original(current)
    })
    advanceDay(state)
    expect(sawCompletion).toBe(true)
  })
})

describe('next-stage operating boundary (not activated in v7)', () => {
  it('round-trips mutually exclusive idle, initiative and standing assignments as JSON data', () => {
    const assignments: FloorAssignment[] = [ { kind: 'idle' },
      { kind: 'initiative', productId: 2, projectId: 4, proposal: { kind: 'polish', id: 'polish' }, startedDay: 3 },
      { kind: 'standing', productId: 2, service: 'reliability', startedDay: 3 } ]
    const loaded = JSON.parse(JSON.stringify(assignments))
    expect(loaded).toEqual(assignments)
    expect(loaded.every(isFloorAssignment)).toBe(true)
    expect(isFloorAssignment({ ...assignments[1], service: 'reliability' })).toBe(false)
    expect(isFloorAssignment({ kind: 'idle', queue: [] })).toBe(false)
    expect(isFloorAssignment({ kind: 'standing', productId: 1, service: 'free money', startedDay: 0 })).toBe(false)
  })
  it('shows demand, service, headroom and risk in the same units without inventing staffing costs', () => {
    expect(standingService('reliability', 100, 120, 'users')).toMatchObject({ headroom: -20, risk: expect.any(String) })
    expect(standingService('research', 10, 0, 'analysis points/day').risk).toBeNull()
    expect(() => standingService('growth', Infinity, 1, 'points/day')).toThrow()
  })
  it('keeps deliberate decisions blocking, routine outcomes informational in the future policy', () => {
    expect(operationEventMode({ type: 'randomEvent' })).toBe('blocking')
    expect(operationEventMode({ type: 'offer' })).toBe('blocking')
    expect(operationEventMode({ type: 'released', productId: 2 })).toBe('informational')
    expect(operationEventMode({ type: 'notice', text: 'Team awaiting an assignment' })).toBe('informational')
  })
})
