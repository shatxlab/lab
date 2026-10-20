import { OVERSHOOT_CAP, POINTS_PER_SKILL, SKILL_GAIN, WORK_VARIANCE } from './balance'
import { contractDay } from './contracts'
import { knowledgeSpeed, learn, type Subject } from './knowledge'
import { teamSpeed } from './careers'
import { officeOf, staffOf, workersOf } from './offices'
import { DISCIPLINE_SPEED, statMultiplier } from './modifiers'
import { rand } from './rng'
import { isReady } from './scoring'
import { employeeSkillGain, employeeSpeed } from './staff'
import { DISCIPLINES, emptySkills, type Employee, type GameState, type Office, type Project, type Skills } from './types'

/** Points an employee could add in one day, before the overshoot cap. */
export function dailyContribution(employee: Employee, state: GameState, subject?: Subject | null): Skills {
  const out = emptySkills()
  const speed = statMultiplier(state, 'workSpeed') * teamSpeed(state, officeOf(state, employee)) * knowledgeSpeed(employee, subject)
  for (const d of DISCIPLINES) {
    const variance = 1 + WORK_VARIANCE * (2 * rand(state) - 1)
    out[d] =
      employee.skills[d] * POINTS_PER_SKILL * variance * speed * statMultiplier(state, DISCIPLINE_SPEED[d]) * employeeSpeed(employee, d)
  }
  return out
}

/** Points an employee adds per day on average, ignoring the day-to-day variance and the overshoot cap. */
export function expectedContribution(employee: Employee, state: GameState, subject?: Subject | null): Skills {
  const out = emptySkills()
  const speed = statMultiplier(state, 'workSpeed') * teamSpeed(state, officeOf(state, employee)) * knowledgeSpeed(employee, subject)
  for (const d of DISCIPLINES) {
    out[d] = employee.skills[d] * POINTS_PER_SKILL * speed * statMultiplier(state, DISCIPLINE_SPEED[d]) * employeeSpeed(employee, d)
  }
  return out
}

/** Expected points per day from an office's team (the first office's by default), ignoring variance and the overshoot cap. */
export function teamRate(state: GameState, office: Office = state.offices[0], subject?: Subject | null): Skills {
  const rate = emptySkills()
  for (const employee of workersOf(state, office)) {
    const mine = expectedContribution(employee, state, subject)
    for (const d of DISCIPLINES) rate[d] += mine[d]
  }
  return rate
}

/** Days for an office's team (the first office's by default) to reach `target`; Infinity if a needed discipline has no output. */
export function estimateDays(state: GameState, target: Skills, office: Office = state.offices[0], subject?: Subject | null): number {
  const rate = teamRate(state, office, subject)
  let days = 0
  for (const d of DISCIPLINES) {
    if (target[d] <= 0) continue
    days = Math.max(days, rate[d] > 0 ? Math.ceil(target[d] / rate[d]) : Infinity)
  }
  return days
}

/** What a project is about, for what its team learns and brings to it; client work has no subject. */
export function subjectOf(project: Project): Subject | null {
  if (project.kind === 'contract') return null
  return { typeId: project.productTypeId, productId: project.kind === 'update' ? project.parentId : project.id }
}

/** Every office's team works on its own project (the people off fixing bugs are not part of it). */
export function workDay(state: GameState): void {
  for (const office of state.offices) officeWorkDay(state, office)
}

/**
 * The office's people work on its project. Points beyond the overshoot cap (or, fixing bugs, beyond
 * the target) are discarded and earn no skill growth. Fires `projectReady` once.
 */
function officeWorkDay(state: GameState, office: Office): void {
  const project = office.project
  if (!project) return

  // Client work has nothing to polish: it stops at the target.
  const cap = project.kind === 'new' || project.kind === 'update' ? OVERSHOOT_CAP : 1
  const skillGain = SKILL_GAIN * statMultiplier(state, 'skillGain')
  const subject = subjectOf(project)
  for (const employee of workersOf(state, office)) {
    const wanted = dailyContribution(employee, state, subject)
    const gain = skillGain * employeeSkillGain(state, employee)
    const applied = emptySkills()
    for (const d of DISCIPLINES) {
      const room = Math.max(project.target[d] * cap - project.progress[d], 0)
      applied[d] = Math.min(wanted[d], room)
      project.progress[d] += applied[d]
      employee.skills[d] = Math.min(
        100,
        employee.skills[d] + applied[d] * gain * (1 - employee.skills[d] / 100),
      )
    }
    if (DISCIPLINES.some((d) => applied[d] > 0)) learn(employee, subject)
    state.dayWork.push({ employeeId: employee.id, points: applied, fixing: false })
  }

  if (project.kind === 'contract') {
    contractDay(state, office)
    return
  }
  if (!project.readyNotified && isReady(project)) {
    project.readyNotified = true
    state.events.push({ type: 'projectReady', officeId: office.id })
  }
}
