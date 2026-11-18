import { describe, expect, it } from 'vitest'
import { audiencesOf } from '@/lib/tycoon/data/audiences'
import { createStore } from '@/lib/tycoon/store'
import { assignOperation, initialiseOperations, operationChoices, operationPreview } from '@/lib/tycoon/sim/operations'
import { acceptContract, abandonContract, contractDay, contractOfferBlocker } from '@/lib/tycoon/sim/contracts'
import { startProject, startUpdate, startLocalisation, startPivot } from '@/lib/tycoon/sim/project'
import { growBlocker } from '@/lib/tycoon/sim/lifecycle'
import { initialisePeopleManagement } from '@/lib/tycoon/sim/people-management'
import { deserialize, serialize, STATE_VERSION } from '@/lib/tycoon/sim/state'
import { sunsetProduct } from '@/lib/tycoon/sim/sunset'
import { teamDay } from '@/lib/tycoon/sim/teams'
import { DISCIPLINES } from '@/lib/tycoon/sim/types'
import { stage0Fixture } from './stage0-fixtures'
import { makeProduct, makeState, makeEmployee } from './helpers'

function setup() {
  const s = stage0Fixture('europe')
  initialiseOperations(s)
  initialisePeopleManagement(s)
  s.products[0].releaseDay = s.day - 300
  s.products[0].updates.push({ day: s.day })
  for (const offer of s.contracts) offer.expiresDay = s.day + 100
  return s
}
const growth = (s: ReturnType<typeof setup>) => ({ kind: 'initiative' as const, productId: s.signatureId!, proposal: { kind: 'grow' as const, id: 'medium' } })
function finish(s: ReturnType<typeof setup>, index = 0) {
  const project = s.offices[index].project!
  for (const d of DISCIPLINES) project.progress[d] = project.target[d]
  teamDay(s)
}

describe('product operations and command boundaries', () => {
  it('previews, pays for and ships growth on one floor while another keeps working', () => {
    const s = setup(), [a, b] = s.offices, p = s.products[0]
    const preview = operationPreview(s, a, p, growth(s).proposal)
    expect(preview.blocker).toBeNull()
    expect(preview.cash).toBeGreaterThan(0)
    expect(preview.effect).toMatch(/server capacity, fit and demand/)
    assignOperation(s, b.id, { kind: 'standing', productId: p.id, service: 'reliability' })
    const before = s.money
    expect(assignOperation(s, a.id, growth(s)).ok).toBe(true)
    expect(before - s.money).toBe(preview.cash)
    expect(a.project!.target).toEqual(preview.target)
    expect(a.project!.grows).toBe('medium')
    expect(a.project!.polishes).toBeUndefined()
    finish(s)
    expect(p.size).toBe('medium')
    expect(a.assignment).toEqual({ kind: 'idle' })
    expect(b.assignment?.kind).toBe('standing')
    expect(s.businessDecisions!.at(-1)!.after).toBeDefined()
  })

  it('uses current readiness for operating growth rather than the next journey title', () => {
    const s = setup(), p = s.products[0], a = s.offices[0]
    s.stage = 3; p.size = 'large'
    expect(growBlocker(s, a, p)).not.toBeNull()
    expect(operationPreview(s, a, p, { kind: 'grow', id: 'flagship' }).blocker).toBeNull()
    p.bugs = 1_000_000
    expect(operationPreview(s, a, p, { kind: 'grow', id: 'flagship' }).blocker).toMatch(/bugs/)
  })

  it('shows missing skills and treasury reserves; failed growth is atomic even on reassignment', () => {
    const s = setup(), a = s.offices[0], p = s.products[0]
    assignOperation(s, a.id, { kind: 'standing', productId: p.id, service: 'growth' })
    s.money = 0
    const before = serialize(s)
    expect(assignOperation(s, a.id, growth(s), true).ok).toBe(false)
    expect(serialize(s)).toBe(before)
    s.money = 100_000_000
    s.employees = s.employees.filter((e) => e.officeId !== a.id)
    expect(operationPreview(s, a, p, growth(s).proposal).blocker).toMatch(/Missing build skills/)
  })

  it('rejects skipped sizes, parallel growth and overlapping product work in both directions', () => {
    const s = setup(), [a, b] = s.offices, p = s.products[0]
    expect(assignOperation(s, a.id, { ...growth(s), proposal: { kind: 'grow', id: 'flagship' } }).ok).toBe(false)
    expect(assignOperation(s, a.id, growth(s)).ok).toBe(true)
    expect(assignOperation(s, b.id, growth(s)).ok).toBe(false)
    expect(assignOperation(s, b.id, { kind: 'initiative', productId: p.id, proposal: { kind: 'polish', id: 'polish' } }).ok).toBe(false)
    assignOperation(s, a.id, { kind: 'idle' }, true)
    assignOperation(s, b.id, { kind: 'initiative', productId: p.id, proposal: { kind: 'polish', id: 'polish' } })
    expect(assignOperation(s, a.id, growth(s)).ok).toBe(false)
  })

  it('supports a retained product pivot as a finite explicit initiative', () => {
    const s = setup(), a = s.offices[0]
    const side = makeProduct({ id: s.nextId++, productTypeId: 'web_app', role: 'side', releaseDay: s.day, users: 10_000 })
    s.products.push(side)
    const choice = operationChoices(s, side, a).find((p) => p.kind === 'pivot')!
    expect(choice).toBeDefined()
    expect(assignOperation(s, a.id, { kind: 'initiative', productId: side.id, proposal: { kind: choice.kind, id: choice.id } })).toEqual({ ok: true })
    expect(a.project!.pivotsTo).toBe(choice.id)
    finish(s)
    expect(side.pivoted).toBe(true)
    expect(side.audienceId).toBe(choice.id)
    expect(side.users).toBeLessThan(10_000)
    expect(operationChoices(s, side, a).some((p) => p.kind === 'pivot')).toBe(false)
  })

  it('rejects direct post-hit project/update/localisation/pivot bypasses without changing state', () => {
    const s = setup(), p = s.products[0], a = s.offices[0]
    const before = serialize(s)
    expect(startProject(s, 'web_app', []).ok).toBe(false)
    expect(startUpdate(s, p.id, [], a.id, true).ok).toBe(false)
    expect(startUpdate(s, p.id, [], a.id).ok).toBe(false)
    expect(startLocalisation(s, p.id, a.id).ok).toBe(false)
    expect(startPivot(s, p.id, audiencesOf(p.productTypeId)[0].id, a.id).ok).toBe(false)
    expect(serialize(s)).toBe(before)
    const prehit = makeState([makeEmployee(100, { design: 50, engineering: 50, qa: 50 })])
    expect(startProject(prehit, 'web_app', []).ok).toBe(true)
  })

  it('does not unpause an operating company when taking a client job', () => {
    const s = setup(), store = createStore(s, 0)
    const offer = s.contracts[0]
    expect(store.acceptContract(offer.id, s.offices[0].id).ok).toBe(true)
    expect(store.speed.value).toBe(0)
    expect(deserialize(serialize(s))).not.toBeNull()
  })

  it('cannot reassign client work to erase its deposit obligation, even with confirmation', () => {
    const s = setup(), a = s.offices[0], offer = s.contracts[0]
    const before = s.money
    expect(acceptContract(s, offer.id, a.id).ok).toBe(true)
    const active = serialize(s)
    expect(assignOperation(s, a.id, { kind: 'idle' }, true).ok).toBe(false)
    expect(assignOperation(s, a.id, growth(s), true).ok).toBe(false)
    expect(serialize(s)).toBe(active)
    expect(abandonContract(s, a.id).ok).toBe(true)
    expect(s.money).toBe(before)
    expect(a.project).toBeNull()
    expect(assignOperation(s, a.id, growth(s)).ok).toBe(true)
  })

  it('blocks expired offers, zero-skill jobs and enterprise conflicts through the sim command too', () => {
    const s = setup(), [a, b] = s.offices, p = s.products[0], offer = s.contracts[0]
    offer.expiresDay = s.day - 1
    expect(acceptContract(s, offer.id, a.id).ok).toBe(false)
    delete offer.expiresDay
    s.employees = s.employees.filter((e) => e.officeId !== a.id)
    expect(contractOfferBlocker(s, a, offer)).not.toBeNull()
    offer.productId = p.id
    expect(assignOperation(s, b.id, growth(s)).ok).toBe(true)
    expect(acceptContract(s, offer.id, b.id).ok).toBe(false)
  })

  it('settles a job automatically and leaves its floor idle, without selecting new work', () => {
    const s = setup(), a = s.offices[0], offer = s.contracts[0]
    acceptContract(s, offer.id, a.id)
    const cash = s.money
    for (const d of DISCIPLINES) a.project!.progress[d] = a.project!.target[d]
    contractDay(s, a)
    expect(s.money).toBeGreaterThan(cash)
    expect(a.project).toBeNull()
    expect(a.assignment).toEqual({ kind: 'idle' })
  })

  it('selling a side product immediately clears coverage and its offers, including before reload', () => {
    const s = setup(), a = s.offices[0]
    const side = makeProduct({ id: s.nextId++, role: 'side' })
    s.products.push(side)
    s.contracts[0].productId = side.id
    assignOperation(s, a.id, { kind: 'standing', productId: side.id, service: 'reliability' })
    expect(sunsetProduct(s, side.id).ok).toBe(true)
    expect(a.assignment).toEqual({ kind: 'idle' })
    expect(a.productId).toBeUndefined()
    expect(s.contracts.some((c) => c.productId === side.id)).toBe(false)
    expect(deserialize(serialize(s))).not.toBeNull()
  })
})

describe('v9 to v10 paid-work migration', () => {
  it('preserves progress, costs, people and management policy for active growth, then reloads idempotently', () => {
    const s = setup(), a = s.offices[0]
    assignOperation(s, a.id, growth(s))
    a.project!.progress.engineering = 7
    s.version = 9
    if (a.assignment?.kind === 'initiative') a.assignment.proposal = { kind: 'polish', id: 'polish' }
    const restored = deserialize(serialize(s))!
    expect(restored.version).toBe(STATE_VERSION)
    expect(restored.offices[0].project).toEqual(a.project)
    expect(restored.offices[0].assignment).toMatchObject({ proposal: { kind: 'grow', id: 'medium' } })
    expect(restored.money).toBe(s.money)
    expect(restored.employees).toEqual(s.employees)
    expect(restored.peopleManagement).toEqual(s.peopleManagement)
    expect(serialize(deserialize(serialize(restored))!)).toBe(serialize(restored))
  })

  it('rejects malformed, mismatched and mislabeled scope reservations in v10', () => {
    const s = setup()
    assignOperation(s, s.offices[0].id, growth(s))
    const raw = JSON.parse(serialize(s))
    raw.offices[0].assignment.proposal.id = 'flagship'
    expect(deserialize(JSON.stringify(raw))).toBeNull()
    raw.offices[0].assignment.proposal = { kind: 'polish', id: 'polish' }
    expect(deserialize(JSON.stringify(raw))).toBeNull()
    raw.offices[0].assignment.proposal = { kind: 'grow', id: 'nonsense' }
    raw.offices[0].project.grows = 'nonsense'
    expect(deserialize(JSON.stringify(raw))).toBeNull()
  })
})

it('migrates an idle-labeled v9 pivot without restarting paid progress or rerunning founder migration', () => {
  const s = setup(), a = s.offices[0]
  const side = makeProduct({ id: s.nextId++, role: 'side' })
  s.products.push(side)
  const choice = operationChoices(s, side, a).find((p) => p.kind === 'pivot')!
  expect(assignOperation(s, a.id, { kind: 'initiative', productId: side.id, proposal: choice }).ok).toBe(true)
  a.project!.progress.qa = 11
  s.version = 9
  a.assignment = { kind: 'idle' }
  a.project!.byTeam = false
  const restored = deserialize(serialize(s))!
  expect(restored.offices[0].assignment).toMatchObject({ kind: 'initiative', proposal: { kind: 'pivot', id: choice.id } })
  expect(restored.offices[0].project!.progress.qa).toBe(11)
  expect(restored.offices[0].project!.byTeam).toBe(true)
  expect(restored.employees).toEqual(s.employees)
})

it('enforces scope conflicts even for low-level team execution, not only operation previews', () => {
  const s = setup(), [a, b] = s.offices, p = s.products[0]
  expect(assignOperation(s, a.id, { kind: 'initiative', productId: p.id, proposal: { kind: 'polish', id: 'polish' } }).ok).toBe(true)
  expect(startUpdate(s, p.id, [], b.id, true, true).ok).toBe(false)
  assignOperation(s, a.id, { kind: 'idle' }, true)
  expect(assignOperation(s, a.id, growth(s)).ok).toBe(true)
  expect(startUpdate(s, p.id, [], b.id, false, true).ok).toBe(false)
})
