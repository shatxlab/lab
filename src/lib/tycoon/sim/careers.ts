import {
  ANALYST_MAX_LEVEL,
  DAYS_PER_MONTH,
  LEAD_FREE_TEAM,
  LEAD_LEVEL,
  LEAD_MORALE,
  LEAD_SPEED,
  LEVELS,
  MOVE_ON_CHANCE,
  MOVE_ON_YEARS,
  NO_LEAD_SPEED,
  OVERLOOKED_MORALE,
  PROMOTION_MORALE,
  PM_AFTER_DAYS,
  PM_MIN_ANALYSIS,
  PROMOTION_PATIENCE_DAYS,
} from './balance'
import { PM_RESEARCH, salaryOf } from './hiring'
import { depart } from './knowledge'
import { adjustMorale } from './morale'
import { staffOf } from './offices'
import { isResearched } from './unlocks'
import { rand } from './rng'
import { fail, isBuilder, OK, type BuilderRole, type Discipline, type Employee, type GameState, type Office, type Result } from './types'

const PRIMARY: Record<BuilderRole, Discipline> = { designer: 'design', developer: 'engineering', tester: 'qa' }

/** Skill in the person's own line of work: a discipline for a builder, analysis for an analyst or product manager. */
export function primarySkill(employee: Employee): number {
  return isBuilder(employee) ? employee.skills[PRIMARY[employee.role as BuilderRole]] : (employee.analysis ?? 0)
}

/** What the person's main skill is called. */
export function primarySkillName(employee: Employee): string {
  return isBuilder(employee) ? PRIMARY[employee.role as BuilderRole] : 'analysis'
}

/** "developer", "analyst", "product manager". */
export function roleName(employee: Employee): string {
  return employee.role === 'pm' ? 'product manager' : employee.role
}

/** "Senior developer", "Lead tester", "Mid product manager"... */
export function title(employee: Employee): string {
  return `${LEVELS[employee.level].name} ${roleName(employee)}`
}

/** The level someone with this primary skill is hired at, up to `max`. */
export function levelForSkill(skill: number, max: number): number {
  let level = 0
  for (let i = 1; i <= max; i++) if (skill >= LEVELS[i].skill) level = i
  return level
}

/** Why this person can't be promoted now, or null when they can. */
export function promotionBlocker(state: GameState, employee: Employee): string | null {
  if (employee.role === 'analyst' && employee.level >= ANALYST_MAX_LEVEL) return 'A senior analyst can become a product manager'
  const next = LEVELS[employee.level + 1]
  if (!next) return 'Already a Lead'
  if (primarySkill(employee) < next.skill) return `Needs ${next.skill} ${primarySkillName(employee)} skill`
  const wait = next.days - (state.day - employee.levelDay)
  return wait > 0 ? `Ready in ${wait} day${wait === 1 ? '' : 's'}` : null
}

/** Promotes someone a level: a raise (their salary follows the new level) and a happier person. */
export function promote(state: GameState, employeeId: number): Result {
  const employee = state.employees.find((e) => e.id === employeeId)
  if (!employee) return fail('Employee not found')
  const blocker = promotionBlocker(state, employee)
  if (blocker) return fail(blocker)
  employee.level += 1
  employee.levelDay = state.day
  employee.readySince = null
  employee.salary = salaryOf(employee, state.day)
  adjustMorale(state, PROMOTION_MORALE, employee.id)
  state.events.push({ type: 'notice', text: `${employee.name} is now a ${title(employee).toLowerCase()}.` })
  return OK
}

/** The office's Lead, if it has one: a builder at the top level. */
export function leadOf(state: GameState, office: Office): Employee | undefined {
  return staffOf(state, office).find((e) => isBuilder(e) && e.level >= LEAD_LEVEL)
}

/** Builders who sit in this office, the people a Lead coordinates. */
function buildersIn(state: GameState, office: Office): number {
  return staffOf(state, office).filter(isBuilder).length
}

/** The office's product manager, if it has one. */
export function pmOf(state: GameState, office: Office): Employee | undefined {
  return staffOf(state, office).find((e) => e.role === 'pm')
}

/** Why this analyst can't become a product manager now, or null when they can. */
export function pmBlocker(state: GameState, employee: Employee): string | null {
  if (employee.role !== 'analyst') return 'Only an analyst can become a product manager'
  if (!isResearched(state, PM_RESEARCH)) return 'Research Product management first'
  if (employee.level < ANALYST_MAX_LEVEL) return 'They need to be a senior analyst first'
  if ((employee.analysis ?? 0) < PM_MIN_ANALYSIS) return `Needs ${PM_MIN_ANALYSIS} analysis skill`
  const wait = PM_AFTER_DAYS - (state.day - employee.levelDay)
  if (wait > 0) return `Ready in ${wait} day${wait === 1 ? '' : 's'}`
  const office = staffOf(state, state.offices.find((o) => o.id === employee.officeId) ?? state.offices[0])
  return office.some((e) => e.role === 'pm') ? 'Their office already has a product manager' : null
}

/** A senior analyst takes over the direction of their office's products: a product manager, starting at Mid level. */
export function becomePm(state: GameState, employeeId: number): Result {
  const employee = state.employees.find((e) => e.id === employeeId)
  if (!employee) return fail('Employee not found')
  const blocker = pmBlocker(state, employee)
  if (blocker) return fail(blocker)
  employee.role = 'pm'
  employee.level = 1
  employee.levelDay = state.day
  employee.readySince = null
  employee.salary = salaryOf(employee, state.day)
  adjustMorale(state, PROMOTION_MORALE, employee.id)
  state.events.push({ type: 'notice', text: `${employee.name} is now the product manager.`, sound: 'milestone' })
  return OK
}

/** Output multiplier for a whole office: a Lead speeds it up; a big team without one gets in its own way. */
export function teamSpeed(state: GameState, office: Office): number {
  const lead = leadOf(state, office) ? LEAD_SPEED : buildersIn(state, office) > LEAD_FREE_TEAM ? NO_LEAD_SPEED : 1
  return lead
}

/** True when an office is big enough to need a Lead and has none. */
export function needsLead(state: GameState, office: Office): boolean {
  return buildersIn(state, office) > LEAD_FREE_TEAM && !leadOf(state, office)
}

/** How a person's career moves their morale: a Lead in their office helps; being passed over for too long hurts. */
export function careerMorale(state: GameState, employee: Employee, office: Office): number {
  let delta = leadOf(state, office) ? LEAD_MORALE : 0
  if (employee.readySince !== null && state.day - employee.readySince > PROMOTION_PATIENCE_DAYS) delta -= OVERLOOKED_MORALE
  return delta
}

/**
 * One day of careers: people who have earned a promotion say so (once), and those who have been here
 * for many years now and then move on to something of their own.
 */
export function careerDay(state: GameState): void {
  const leaving: Employee[] = []
  for (const employee of state.employees) {
    const ready = promotionBlocker(state, employee) === null
    if (ready && employee.readySince === null) {
      employee.readySince = state.day
      const next = LEVELS[employee.level + 1].name.toLowerCase()
      state.events.push({ type: 'notice', text: `${employee.name} is ready to be promoted to ${next}. Don't keep them waiting too long.` })
    } else if (!ready) {
      employee.readySince = null
    }
    const years = (state.day - employee.hiredDay) / (12 * DAYS_PER_MONTH)
    if (!employee.founder && years >= MOVE_ON_YEARS && rand(state) < MOVE_ON_CHANCE) leaving.push(employee)
  }
  for (const employee of leaving) {
    depart(state, employee)
    state.events.push({ type: 'notice', text: `After ${Math.floor((state.day - employee.hiredDay) / 360)} years, ${employee.name} is leaving to start something of their own. Good luck to them.` })
  }
}

