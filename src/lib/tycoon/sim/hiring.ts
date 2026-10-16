import { FIRST_NAMES, LAST_NAMES } from '@/lib/tycoon/data/names'
import { eraIndexAt } from '@/lib/tycoon/data/eras'
import {
  CANDIDATE_COUNT,
  ERA_WAGE_GROWTH,
  FOUNDER_PAY_SHARE,
  HIRE_MAX_LEVEL,
  LEVELS,
  PRIMARY_SKILL_MIN,
  PRIMARY_SKILL_RANGE,
  REPUTATION_SKILL_BONUS,
  SALARY_BASE,
  SALARY_PER_SKILL_POINT,
  SECONDARY_SKILL_MIN,
  SECONDARY_SKILL_RANGE,
} from './balance'
import { levelForSkill } from './careers'
import { freeDesks, getOffice } from './offices'
import { getTrait } from '@/lib/tycoon/data/traits'
import { statMultiplier } from './modifiers'
import { pick, randRange } from './rng'
import { pickTrait, startingMorale } from './staff'
import {
  DISCIPLINES,
  fail,
  OK,
  type Discipline,
  type Employee,
  type GameState,
  type Result,
  type Role,
  type Skills,
} from './types'

export const ROLES: readonly Role[] = ['designer', 'developer', 'tester']

export const ROLE_DISCIPLINE: Record<Role, Discipline> = {
  designer: 'design',
  developer: 'engineering',
  tester: 'qa',
}

/** Market rate for a skill set, trait and level (Mid by default) on `day`; employees are re-rated monthly. */
export function salaryFor(skills: Skills, traitId = '', level = 1, day = 0, share = 1): number {
  const total = DISCIPLINES.reduce((sum, d) => sum + skills[d], 0)
  const market = (SALARY_BASE + SALARY_PER_SKILL_POINT * total) * (1 + ERA_WAGE_GROWTH * eraIndexAt(day))
  return Math.round((market * (getTrait(traitId).salary ?? 1) * LEVELS[level].salary * share) / 50) * 50
}

/** The share of the market rate this person draws: founders take less, and it moves with the market. */
export function payShare(employee: Pick<Employee, 'founder'>): number {
  return employee.founder ? FOUNDER_PAY_SHARE : 1
}

/** What this person is paid on `day`. */
export function salaryOf(employee: Employee, day: number): number {
  return salaryFor(employee.skills, employee.trait, employee.level, day, payShare(employee))
}

/** Creates a new person (not yet in any list) and consumes an id. */
export function generateEmployee(state: GameState, role: Role): Employee {
  const primary = ROLE_DISCIPLINE[role]
  const reputationBonus = Math.min(state.reputation, 50) * REPUTATION_SKILL_BONUS
  const skills = {} as Skills
  for (const d of DISCIPLINES) {
    skills[d] =
      d === primary
        ? Math.min(
            100,
            (PRIMARY_SKILL_MIN + randRange(state, 0, PRIMARY_SKILL_RANGE) + reputationBonus) * statMultiplier(state, 'candidateSkill'),
          )
        : SECONDARY_SKILL_MIN + randRange(state, 0, SECONDARY_SKILL_RANGE)
    skills[d] = Math.round(skills[d])
  }
  const trait = pickTrait(state).id
  const level = levelForSkill(skills[primary], HIRE_MAX_LEVEL)
  return {
    id: state.nextId++,
    name: `${pick(state, FIRST_NAMES)} ${pick(state, LAST_NAMES)}`,
    role,
    skills,
    salary: salaryFor(skills, trait, level, state.day),
    trait,
    morale: startingMorale(state),
    training: null,
    officeId: 0,
    level,
    levelDay: state.day,
    hiredDay: state.day,
    readySince: null,
  }
}

/** Replaces the hire pool: one of each role, then random extras. */
export function refreshCandidates(state: GameState): void {
  const candidates: Employee[] = []
  for (let i = 0; i < CANDIDATE_COUNT; i++) {
    const role = i < ROLES.length ? ROLES[i] : pick(state, ROLES)
    candidates.push(generateEmployee(state, role))
  }
  state.candidates = candidates
}

/** Signing fee: one month's salary. */
export function hireCost(employee: Employee): number {
  return employee.salary
}

/** The office a new hire would join: `officeId` if it has a desk free, otherwise the first that does. */
export function hiringOffice(state: GameState, officeId?: number) {
  const wanted = officeId === undefined ? undefined : getOffice(state, officeId)
  if (wanted && freeDesks(state, wanted) > 0) return wanted
  return state.offices.find((o) => freeDesks(state, o) > 0)
}

/** Hires a candidate into `officeId`, or into the first office with a free desk if that one is full. */
export function hire(state: GameState, candidateId: number, officeId?: number): Result {
  const index = state.candidates.findIndex((c) => c.id === candidateId)
  if (index < 0) return fail('Candidate not found')
  const office = hiringOffice(state, officeId)
  if (!office) return fail('No free desks')
  const candidate = state.candidates[index]
  if (state.money < hireCost(candidate)) return fail('Not enough money')
  state.money -= hireCost(candidate)
  candidate.officeId = office.id
  candidate.hiredDay = state.day
  candidate.levelDay = state.day
  state.employees.push(candidate)
  state.candidates.splice(index, 1)
  return OK
}

export function fire(state: GameState, employeeId: number): Result {
  const index = state.employees.findIndex((e) => e.id === employeeId)
  if (index < 0) return fail('Employee not found')
  if (state.employees[index].founder) return fail('Founders stay: it is their studio too')
  state.employees.splice(index, 1)
  return OK
}
