import { formatMoney } from '@/lib/tycoon/format'
import { REGION_NAME } from '@/lib/tycoon/data/regions'
import { CAFE_JOBS, EU_OFFICE_COST, GARAGE_DEPOSIT, GARAGE_READY_MONEY, MAX_OFFICES, MOVE_OUT_COST, NEW_OFFICE_COST, OFFICE_KINDS, OFFICE_UPGRADE_MORALE, REGION_OFFICE_LIMIT, type OfficeSpec } from './balance'
import { adjustMorale } from './morale'
import { fail, isBuilder, OK, REGIONS, type Employee, type GameState, type Office, type Project, type Region, type Result } from './types'

/** Journey stage at which the garage can be left behind, and at which more offices can open (indexes into STAGES). */
export const MOVE_OUT_STAGE = 2
export const NEW_OFFICE_STAGE = 4

export function officeSpec(office: Office): OfficeSpec {
  return OFFICE_KINDS[office.kind]
}

/** Where an office is. */
export const regionOf = (office: Pick<Office, 'region'>): Region => office.region ?? 'us'

/** The offices of a region. */
export function officesIn(state: GameState, region: Region): Office[] {
  return state.offices.filter((o) => regionOf(o) === region)
}

/** The name of a region's building: headquarters in the US, and the European office. */
export const buildingName = (region: Region): string => (region === 'us' ? 'HQ' : REGION_NAME.eu)

/** Which floor of its building an office is, from 1 at the bottom. */
export function floorOf(state: GameState, office: Office): number {
  return officesIn(state, regionOf(office)).indexOf(office) + 1
}

/** "Garage", "HQ", "Europe", or with more floors "HQ 2", "Europe 3": the building and the floor. */
export function officeName(state: GameState, office: Office): string {
  if (office.kind === 'cafe') return 'Café'
  if (office.kind === 'garage') return 'Garage'
  const region = regionOf(office)
  const name = buildingName(region)
  return officesIn(state, region).length <= 1 ? name : `${name} ${floorOf(state, office)}`
}

/**
 * True while the studio is small enough for a buyer: the garage, or a single rented floor. A second floor,
 * or Europe, makes it a building, and nobody buys a building of a studio.
 */
export function canBeSold(state: GameState): boolean {
  return state.offices.length === 1
}

/** True once the studio has an office in Europe: its market is open to localised products. */
export function hasEuropeOffice(state: GameState): boolean {
  return officesIn(state, 'eu').length > 0
}

export function getOffice(state: GameState, id: number): Office | undefined {
  return state.offices.find((o) => o.id === id)
}

/** The office `id` names, or the first one when no id is given: one-office callers needn't care. */
export function resolveOffice(state: GameState, id?: number): Office | undefined {
  return id === undefined ? state.offices[0] : getOffice(state, id)
}

/** The people who sit in this office. */
export function staffOf(state: GameState, office: Office): Employee[] {
  return state.employees.filter((e) => e.officeId === office.id)
}

/** The office whose project this person works on: the one they sit in, unless they were put on another team. */
export function teamOfficeId(state: GameState, employee: Employee): number {
  return employee.teamId !== undefined && getOffice(state, employee.teamId) ? employee.teamId : employee.officeId
}

/** The builders on this office's team, wherever they sit; analysts and product managers do no project work. */
export function teamOf(state: GameState, office: Office): Employee[] {
  return state.employees.filter((e) => isBuilder(e) && teamOfficeId(state, e) === office.id)
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

/** The people on this office's team who work on its project: those not away on a bug-fixing job. */
export function workersOf(state: GameState, office: Office): Employee[] {
  const away = fixingIds(state)
  return teamOf(state, office).filter((e) => !away.has(e.id))
}

/** Puts someone on the team of another office's project (or back on their own office's with `null`). They keep their desk. */
export function assignTeam(state: GameState, employeeId: number, officeId: number | null): Result {
  const employee = state.employees.find((e) => e.id === employeeId)
  if (!employee) return fail('Employee not found')
  if (!isBuilder(employee)) return fail('They do not work on projects')
  if (officeId === null || officeId === employee.officeId) {
    delete employee.teamId
    return OK
  }
  if (!getOffice(state, officeId)) return fail('Unknown office')
  employee.teamId = officeId
  return OK
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

/** True while the two founders still work from the café. */
export function inCafe(state: GameState): boolean {
  return state.offices.some((o) => o.kind === 'cafe')
}

/** Why the founders can't move from the café into the garage yet, or null when they can. */
export function moveToGarageBlocker(state: GameState): string | null {
  if (!inCafe(state)) return 'Already out of the café'
  if (state.contractsDone < CAFE_JOBS) return `Deliver ${CAFE_JOBS} jobs for clients first`
  return state.money < GARAGE_READY_MONEY ? `Save ${formatMoney(GARAGE_READY_MONEY)} first: the deposit, and a month for two new people` : null
}

/** Leaves the café for a garage: the same two and their project, with room for two more. */
export function moveToGarage(state: GameState): Result {
  const blocker = moveToGarageBlocker(state)
  if (blocker) return fail(blocker)
  const cafe = state.offices.find((o) => o.kind === 'cafe')!
  state.money -= GARAGE_DEPOSIT
  cafe.kind = 'garage'
  adjustMorale(state, OFFICE_UPGRADE_MORALE)
  return OK
}

/** Why the studio can't move out of its garage now, or null when it can. */
export function moveOutBlocker(state: GameState): string | null {
  if (inCafe(state)) return 'Move into the garage first'
  if (!state.offices.some((o) => o.kind === 'garage')) return 'Already in an office'
  if (state.stage < MOVE_OUT_STAGE) return 'The studio is not ready yet'
  if (state.signatureId === null) return 'Have a breakout hit first'
  return state.money < MOVE_OUT_COST ? 'Not enough money' : null
}

/** True while the studio is still small: in its garage, or before that at the café. */
export function inGarage(state: GameState): boolean {
  return state.offices.some((o) => o.kind !== 'office')
}

/** Leaves the garage for a real office: the same team and project, with room for twelve. */
export function moveOut(state: GameState): Result {
  const blocker = moveOutBlocker(state)
  if (blocker) return fail(blocker)
  const garage = state.offices.find((o) => o.kind === 'garage')!
  state.money -= MOVE_OUT_COST
  garage.kind = 'office'
  adjustMorale(state, OFFICE_UPGRADE_MORALE)
  return OK
}

/** The regions a floor could be added in: either building, until it has all its floors; the smaller building first. */
export function openableRegions(state: GameState): Region[] {
  return REGIONS.filter((r) => officesIn(state, r).length < REGION_OFFICE_LIMIT).sort((a, b) => officesIn(state, a).length - officesIn(state, b).length)
}

/** What the next floor costs there: the first in Europe (a new building) costs much more than the others. */
export function newOfficeCost(state: GameState, region: Region = openableRegions(state)[0] ?? 'us'): number {
  return region === 'eu' && !hasEuropeOffice(state) ? EU_OFFICE_COST : NEW_OFFICE_COST * state.offices.length
}

/** Why another floor can't be added now (in `region`, by default the first it could), or null when it can. */
export function openOfficeBlocker(state: GameState, region?: Region): string | null {
  if (state.offices.length >= MAX_OFFICES) return 'Both buildings are full'
  if (inGarage(state)) return 'Move out of the garage first'
  if (state.stage < NEW_OFFICE_STAGE) return 'The studio is not ready yet'
  const where = region ?? openableRegions(state)[0]
  if (!where || !openableRegions(state).includes(where)) return `${buildingName(where ?? 'us')} has all its ${REGION_OFFICE_LIMIT} floors`
  return state.money < newOfficeCost(state, where) ? 'Not enough money' : null
}

/** Adds a floor to a building (or opens the European one), empty, with its own colours. Move people in or hire into it. */
export function openOffice(state: GameState, region?: Region): Result {
  const blocker = openOfficeBlocker(state, region)
  if (blocker) return fail(blocker)
  const where = region ?? openableRegions(state)[0]
  state.money -= newOfficeCost(state, where)
  state.offices.push({ id: state.nextId++, kind: 'office', theme: state.offices.length, region: where, project: null })
  closeSale(state)
  return OK
}

/** A building is no studio a buyer wants: any offer is withdrawn and none come again. */
export function closeSale(state: GameState): void {
  if (canBeSold(state) || state.exit.closed) return
  state.exit.pending = null
  state.exit.closed = true
}

/** Moves someone to another office's team. They leave their old project behind. */
export function transfer(state: GameState, employeeId: number, officeId: number): Result {
  const employee = state.employees.find((e) => e.id === employeeId)
  if (!employee) return fail('Employee not found')
  const office = getOffice(state, officeId)
  if (!office) return fail('Unknown office')
  if (employee.officeId === officeId) return fail('Already there')
  if (freeDesks(state, office) <= 0) return fail('No free desk there')
  if (regionOf(office) !== (getOffice(state, employee.officeId) ? regionOf(getOffice(state, employee.officeId)!) : 'us')) {
    return fail('They live in the other region: put them on that office’s team instead')
  }
  employee.officeId = officeId
  // A move is a fresh start: they join the team of the office they moved to.
  delete employee.teamId
  return OK
}
