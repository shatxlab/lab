import { MAX_OFFICES, MOVE_OUT_COST, NEW_OFFICE_COST, OFFICE_KINDS, OFFICE_UPGRADE_MORALE, type OfficeSpec } from './balance'
import { adjustMorale } from './morale'
import { fail, OK, type Employee, type GameState, type Office, type Project, type Result } from './types'

/** Journey stage at which the garage can be left behind, and at which more offices can open (indexes into STAGES). */
export const MOVE_OUT_STAGE = 1
export const NEW_OFFICE_STAGE = 3

export function officeSpec(office: Office): OfficeSpec {
  return OFFICE_KINDS[office.kind]
}

/** "Garage", "HQ", "Office 2"...: the first real office is headquarters. */
export function officeName(state: GameState, office: Office): string {
  if (office.kind === 'garage') return 'Garage'
  const index = state.offices.indexOf(office)
  return index <= 0 ? 'HQ' : `Office ${index + 1}`
}

export function getOffice(state: GameState, id: number): Office | undefined {
  return state.offices.find((o) => o.id === id)
}

/** The office `id` names, or the first one when no id is given: one-office callers needn't care. */
export function resolveOffice(state: GameState, id?: number): Office | undefined {
  return id === undefined ? state.offices[0] : getOffice(state, id)
}

/** The people who work in this office. */
export function staffOf(state: GameState, office: Office): Employee[] {
  return state.employees.filter((e) => e.officeId === office.id)
}

/** Everyone who is off fixing bugs right now, whatever office they sit in. */
export function fixingIds(state: GameState): Set<number> {
  const ids = new Set<number>()
  for (const fix of state.fixes) {
    ids.add(fix.developerId)
    ids.add(fix.testerId)
  }
  return ids
}

/** The people in this office who work on its project: those not away on a bug-fixing job. */
export function workersOf(state: GameState, office: Office): Employee[] {
  const away = fixingIds(state)
  return staffOf(state, office).filter((e) => !away.has(e.id))
}

/** Desks across every office. */
export function deskCount(state: GameState): number {
  return state.offices.reduce((sum, o) => sum + officeSpec(o).desks, 0)
}

export function freeDesks(state: GameState, office: Office): number {
  return officeSpec(office).desks - staffOf(state, office).length
}

/** Rent across every office, per month. */
export function monthlyRent(state: GameState): number {
  return state.offices.reduce((sum, o) => sum + officeSpec(o).rent, 0)
}

/** Every project running anywhere, with the office running it. */
export function activeProjects(state: GameState): { office: Office; project: Project }[] {
  return state.offices.flatMap((office) => (office.project ? [{ office, project: office.project }] : []))
}

/** The office whose employee this is (their own office, or the first if theirs is gone). */
export function officeOf(state: GameState, employee: Employee): Office {
  return getOffice(state, employee.officeId) ?? state.offices[0]
}

/** True if some office is already updating this product. */
export function productInWork(state: GameState, productId: number): boolean {
  return activeProjects(state).some(({ project }) => project.kind !== 'new' && project.parentId === productId)
}

/** Why the studio can't move out of its garage now, or null when it can. */
export function moveOutBlocker(state: GameState): string | null {
  if (!state.offices.some((o) => o.kind === 'garage')) return 'Already in an office'
  if (state.stage < MOVE_OUT_STAGE) return 'The studio is not ready yet'
  if (state.signatureId === null) return 'Have a breakout hit first'
  return state.money < MOVE_OUT_COST ? 'Not enough money' : null
}

/** True while the studio is still in its garage. */
export function inGarage(state: GameState): boolean {
  return state.offices.some((o) => o.kind === 'garage')
}

/** Leaves the garage for a real office: the same team and project, with room for twelve. */
export function moveOut(state: GameState): Result {
  const blocker = moveOutBlocker(state)
  if (blocker) return fail(blocker)
  const garage = state.offices.find((o) => o.kind === 'garage')!
  state.money -= MOVE_OUT_COST
  state.exit.pending = null
  garage.kind = 'office'
  adjustMorale(state, OFFICE_UPGRADE_MORALE)
  return OK
}

/** What the next office costs to open. */
export function newOfficeCost(state: GameState): number {
  return NEW_OFFICE_COST * state.offices.length
}

/** Why another office can't open now, or null when it can. */
export function openOfficeBlocker(state: GameState): string | null {
  if (state.offices.length >= MAX_OFFICES) return 'No more offices available'
  if (state.offices.some((o) => o.kind === 'garage')) return 'Move out of the garage first'
  if (state.stage < NEW_OFFICE_STAGE) return 'The studio is not ready yet'
  return state.money < newOfficeCost(state) ? 'Not enough money' : null
}

/** Opens another office, empty, with its own colours. Move people in or hire into it. */
export function openOffice(state: GameState): Result {
  const blocker = openOfficeBlocker(state)
  if (blocker) return fail(blocker)
  state.money -= newOfficeCost(state)
  state.offices.push({ id: state.nextId++, kind: 'office', theme: state.offices.length, project: null })
  return OK
}

/** Moves someone to another office's team. They leave their old project behind. */
export function transfer(state: GameState, employeeId: number, officeId: number): Result {
  const employee = state.employees.find((e) => e.id === employeeId)
  if (!employee) return fail('Employee not found')
  const office = getOffice(state, officeId)
  if (!office) return fail('Unknown office')
  if (employee.officeId === officeId) return fail('Already there')
  if (freeDesks(state, office) <= 0) return fail('No free desk there')
  employee.officeId = officeId
  return OK
}
