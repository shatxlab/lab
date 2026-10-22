import { getTrait, TRAITS, type Trait } from '@/lib/tycoon/data/traits'
import {
  BREAKS_MORALE,
  CANDIDATE_MORALE_MAX,
  LEVELS,
  CANDIDATE_MORALE_MIN,
  MORALE_BASE,
  MORALE_CRUNCH_DAYS,
  MORALE_CRUNCH_MAX_STEPS,
  MORALE_CRUNCH_PENALTY,
  MORALE_CRUNCH_STEP_DAYS,
  MORALE_DEBT_PENALTY,
  MORALE_PULL,
  MORALE_QUIT,
  MORALE_UNHAPPY,
  OUTING_COOLDOWN_DAYS,
  OUTING_COST_FLOOR,
  OUTING_COST_SHARE,
  OUTING_MORALE,
  PROJECT_SIZES,
  QUIT_CHANCE_PER_DAY,
  RELEASE_BAD_QUALITY,
  RELEASE_GOOD_QUALITY,
  RELEASE_MORALE_BONUS,
  RELEASE_MORALE_PENALTY,
  STANDUP_MORALE,
  TEAM_MORALE_CAP,
  TRAINING_COST_BASE,
  TRAINING_COST_PER_SKILL,
  TRAINING_DAYS,
  TRAINING_GAIN,
  TRAINING_MAX_SKILL,
  TRAINING_MORALE,
} from './balance'
import { monthlySalaries } from './economy'
import { depart } from './knowledge'
import { adjustMorale, clampMorale, moraleSpeed } from './morale'
import { careerMorale } from './careers'
import { officeOf } from './offices'
import { rand, randRange } from './rng'
import { fail, OK, type Discipline, type Employee, type GameState, type ProjectSize, type Result } from './types'

/** How long a project of this size can run before the team starts to feel the crunch. */
export function crunchDays(size: ProjectSize): number {
  return Math.round(MORALE_CRUNCH_DAYS * Math.sqrt(PROJECT_SIZES[size].work))
}

export function traitOf(employee: Employee): Trait {
  return getTrait(employee.trait)
}

/** A random trait, weighted by how common each is. */
export function pickTrait(state: GameState): Trait {
  let pointer = rand(state) * TRAITS.reduce((sum, t) => sum + t.weight, 0)
  return TRAITS.find((t) => (pointer -= t.weight) < 0) ?? TRAITS[TRAITS.length - 1]
}

/** Morale for someone who has just walked in. */
export function startingMorale(state: GameState): number {
  return Math.round(randRange(state, CANDIDATE_MORALE_MIN, CANDIDATE_MORALE_MAX))
}

/** How fast this person works in one discipline today: trait, experience, morale, and whether they are training. */
export function employeeSpeed(employee: Employee, discipline: Discipline): number {
  if (employee.training) return 0
  const trait = traitOf(employee)
  return (trait.allSpeed ?? 1) * (trait.speed?.[discipline] ?? 1) * LEVELS[employee.level].speed * moraleSpeed(employee.morale)
}

/** Multiplier on how fast this person's skills grow: their own trait and any mentors beside them. */
export function employeeSkillGain(state: GameState, employee: Employee): number {
  let mult = traitOf(employee).skillGain ?? 1
  for (const other of state.employees) {
    if (other.id !== employee.id) mult *= traitOf(other).teamSkillGain ?? 1
  }
  return mult
}

/**
 * The morale this person drifts toward: content by default, lifted by team players in their office,
 * dragged by a long crunch on their office's project or by debt.
 */
export function moraleTarget(state: GameState, employee: Employee): number {
  let target = MORALE_BASE
  let cheer = 0
  for (const other of state.employees) {
    if (other.id !== employee.id && other.officeId === employee.officeId) cheer += traitOf(other).teamMorale ?? 0
  }
  target += Math.min(cheer, TEAM_MORALE_CAP)
  const office = officeOf(state, employee)
  target += careerMorale(state, employee, office)
  if (office.breaks) target += BREAKS_MORALE
  if (office.standup) target -= STANDUP_MORALE
  const project = office.project
  if (project) {
    const over = state.day - project.startDay - crunchDays(project.size)
    if (over > 0) {
      const steps = Math.min(MORALE_CRUNCH_MAX_STEPS, 1 + Math.floor(over / MORALE_CRUNCH_STEP_DAYS))
      target -= MORALE_CRUNCH_PENALTY * steps
    }
  }
  if (state.money < 0) target -= MORALE_DEBT_PENALTY
  return target
}

/** One day of morale: drift toward the target, burn out the workaholics, post warnings, and lose the miserable. */
export function moraleDay(state: GameState): void {
  const leaving: Employee[] = []
  for (const employee of state.employees) {
    const before = employee.morale
    let next = before + (moraleTarget(state, employee) - before) * MORALE_PULL
    if (officeOf(state, employee).project) next -= traitOf(employee).moraleDrain ?? 0
    employee.morale = clampMorale(next)

    if (before >= MORALE_UNHAPPY && employee.morale < MORALE_UNHAPPY) {
      state.events.push({ type: 'notice', text: `${employee.name} is unhappy. A team outing or a good release would help.` })
    }
    if (!employee.founder && employee.morale < MORALE_QUIT && rand(state) < QUIT_CHANCE_PER_DAY) leaving.push(employee)
  }

  for (const employee of leaving) {
    depart(state, employee)
    state.events.push({ type: 'notice', text: `${employee.name} quit. Morale had been too low for too long.` })
    adjustMorale(state, -4)
  }
}

/** Shipping something good lifts the whole team; shipping something bad drags it down. `share` scales it (updates count for less). */
export function moraleFromRelease(state: GameState, quality: number, share = 1): void {
  if (quality >= RELEASE_GOOD_QUALITY) adjustMorale(state, RELEASE_MORALE_BONUS * share)
  else if (quality < RELEASE_BAD_QUALITY) adjustMorale(state, -RELEASE_MORALE_PENALTY * share)
}

// ---- Training

export function trainingCost(employee: Employee, discipline: Discipline): number {
  return Math.round((TRAINING_COST_BASE + TRAINING_COST_PER_SKILL * employee.skills[discipline]) / 50) * 50
}

/** Skill points a finished course adds: more for beginners, less near the top. */
export function trainingGain(employee: Employee, discipline: Discipline): number {
  return Math.max(0, TRAINING_GAIN * (1 - employee.skills[discipline] / 110))
}

/** Why this person can't train this discipline now, or null when they can. */
export function trainingBlocker(state: GameState, employee: Employee, discipline: Discipline): string | null {
  if (employee.training) return 'Already training'
  if (employee.skills[discipline] > TRAINING_MAX_SKILL) return 'Already an expert'
  if (state.money < trainingCost(employee, discipline)) return 'Not enough money'
  return null
}

export function startTraining(state: GameState, employeeId: number, discipline: Discipline): Result {
  const employee = state.employees.find((e) => e.id === employeeId)
  if (!employee) return fail('Employee not found')
  const blocker = trainingBlocker(state, employee, discipline)
  if (blocker) return fail(blocker)
  state.money -= trainingCost(employee, discipline)
  employee.training = { discipline, finishDay: state.day + TRAINING_DAYS }
  return OK
}

/** Finishes any course that is due: the skill goes up and the person comes back in a better mood. */
export function trainingDay(state: GameState): void {
  for (const employee of state.employees) {
    const course = employee.training
    if (!course || state.day < course.finishDay) continue
    const gain = trainingGain(employee, course.discipline)
    employee.skills[course.discipline] = Math.min(100, employee.skills[course.discipline] + gain)
    employee.training = null
    adjustMorale(state, TRAINING_MORALE, employee.id)
    state.events.push({
      type: 'notice',
      text: `${employee.name} finished training: ${course.discipline} +${gain.toFixed(1)}.`,
    })
  }
}

// ---- Team outings

export function outingCost(state: GameState): number {
  return Math.max(OUTING_COST_FLOOR, Math.round((monthlySalaries(state) * OUTING_COST_SHARE) / 50) * 50)
}

/** Why a team outing can't happen now, or null when it can. */
export function outingBlocker(state: GameState): string | null {
  if (state.employees.length === 0) return 'Nobody to take'
  const wait = OUTING_COOLDOWN_DAYS - (state.day - state.lastOutingDay)
  if (wait > 0) return `Again in ${wait} day${wait === 1 ? '' : 's'}`
  return state.money < outingCost(state) ? 'Not enough money' : null
}

export function teamOuting(state: GameState): Result {
  const blocker = outingBlocker(state)
  if (blocker) return fail(blocker)
  state.money -= outingCost(state)
  state.lastOutingDay = state.day
  adjustMorale(state, OUTING_MORALE)
  return OK
}
