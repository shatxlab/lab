import { expect, it } from 'vitest'
import { initialiseOperations, assignOperation } from '@/lib/tycoon/sim/operations'
import { assignTeam, teamOf, teamOfficeId, transfer } from '@/lib/tycoon/sim/offices'
import { teamRate } from '@/lib/tycoon/sim/work'
import { deserialize, serialize } from '@/lib/tycoon/sim/state'
import { stage0Fixture } from './stage0-fixtures'

it('ignores stale remote membership in an operating company, with no remote penalty or double contribution', () => {
  const state = stage0Fixture('europe')
  initialiseOperations(state)
  const home = state.offices[0], abroad = state.offices[1]
  const person = teamOf(state, home)[0]
  const homeRate = teamRate(state, home), abroadRate = teamRate(state, abroad)
  person.teamId = abroad.id
  expect(teamOfficeId(state, person)).toBe(home.id)
  expect(teamOf(state, home)).toContain(person)
  expect(teamOf(state, abroad)).not.toContain(person)
  expect(teamRate(state, home)).toEqual(homeRate)
  expect(teamRate(state, abroad)).toEqual(abroadRate)
  expect(assignTeam(state, person.id, abroad.id).ok).toBe(false)
  const restored = deserialize(serialize(state))!
  expect(teamOfficeId(restored, restored.employees.find((e) => e.id === person.id)!)).toBe(home.id)
})

it('preserves physical homes, regions, cash, RNG and paid projects through the existing v7 allocation migration', () => {
  const state = stage0Fixture('europe')
  initialiseOperations(state)
  const home = state.offices[0], product = state.products[0]
  expect(assignOperation(state, home.id, { kind: 'initiative', productId: product.id, proposal: { kind: 'polish', id: 'polish' } }).ok).toBe(true)
  home.project!.progress.engineering = 7
  const paid = structuredClone(home.project)
  const people = state.employees.map((e) => ({ id: e.id, officeId: e.officeId, salary: e.salary, appearanceSeed: e.appearanceSeed }))
  const money = state.money, rng = state.rng
  state.version = 7
  for (const office of state.offices) delete office.assignment
  state.employees[0].teamId = state.offices[1].id
  const restored = deserialize(serialize(state))!
  expect(restored.employees.map((e) => ({ id: e.id, officeId: e.officeId, salary: e.salary, appearanceSeed: e.appearanceSeed }))).toEqual(people)
  expect(restored.employees.every((e) => e.teamId === undefined)).toBe(true)
  expect(restored.money).toBe(money)
  expect(restored.rng).toBe(rng)
  expect(restored.offices.map((o) => o.region)).toEqual(state.offices.map((o) => o.region))
  expect(restored.offices[0].project!.id).toBe(paid!.id)
  expect(restored.offices[0].project!.progress).toEqual(paid!.progress)
  expect(restored.offices[0].assignment?.kind).toBe('initiative')
})

it('keeps capacity and regional staffing limits on physical transfers, with atomic rejection', () => {
  const state = stage0Fixture('europe')
  initialiseOperations(state)
  const person = state.employees[0], abroad = state.offices[1]
  const full = serialize(state)
  expect(transfer(state, person.id, abroad.id)).toEqual({ ok: false, reason: 'No free desk there' })
  expect(serialize(state)).toBe(full)
  // Isolate the regional blocker using an empty synthetic destination, not a gifted live team.
  state.employees = state.employees.filter((e) => e.officeId !== abroad.id)
  const empty = serialize(state)
  expect(transfer(state, person.id, abroad.id)).toEqual({ ok: false, reason: 'They live in the other region: hire local staff for that delivery team' })
  expect(serialize(state)).toBe(empty)
})
