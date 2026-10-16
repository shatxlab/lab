import {
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
  PROMOTION_PATIENCE_DAYS,
} from './balance'
import { salaryOf } from './hiring'
import { adjustMorale } from './morale'
import { staffOf } from './offices'
import { rand } from './rng'
import { fail, OK, type Discipline, type Employee, type GameState, type Office, type Result, type Role } from './types'

const PRIMARY: Record<Role, Discipline> = { designer: 'design', developer: 'engineering', tester: 'qa' }

/** Skill in the person's own discipline. */
export function primarySkill(employee: Employee): number {
  return employee.skills[PRIMARY[employee.role]]
}

/** "Senior developer", "Lead tester"... */
export function title(employee: Employee): string {
  return `${LEVELS[employee.level].name} ${employee.role}`
}

/** The level someone with this primary skill is hired at, up to `max`. */
export function levelForSkill(skill: number, max: number): number {
  let level = 0
  for (let i = 1; i <= max; i++) if (skill >= LEVELS[i].skill) level = i
  return level
}

/** Why this person can't be promoted now, or null when they can. */
export function promotionBlocker(state: GameState, employee: Employee): string | null {
  const next = LEVELS[employee.level + 1]
  if (!next) return 'Already a Lead'
  if (primarySkill(employee) < next.skill) return `Needs ${next.skill} ${PRIMARY[employee.role]} skill`
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

/** The office's Lead, if it has one. */
export function leadOf(state: GameState, office: Office): Employee | undefined {
  return staffOf(state, office).find((e) => e.level >= LEAD_LEVEL)
}

/** Output multiplier for a whole office: a Lead speeds it up; a big team without one gets in its own way. */
export function teamSpeed(state: GameState, office: Office): number {
  if (leadOf(state, office)) return LEAD_SPEED
  return staffOf(state, office).length > LEAD_FREE_TEAM ? NO_LEAD_SPEED : 1
}

/** True when an office is big enough to need a Lead and has none. */
export function needsLead(state: GameState, office: Office): boolean {
  return staffOf(state, office).length > LEAD_FREE_TEAM && !leadOf(state, office)
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
    state.employees = state.employees.filter((e) => e.id !== employee.id)
    state.events.push({ type: 'notice', text: `After ${Math.floor((state.day - employee.hiredDay) / 360)} years, ${employee.name} is leaving to start something of their own. Good luck to them.` })
  }
}

