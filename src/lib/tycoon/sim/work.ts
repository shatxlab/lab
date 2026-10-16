import { OVERSHOOT_CAP, POINTS_PER_SKILL, SKILL_GAIN, WORK_VARIANCE } from './balance'
import { contractDay } from './contracts'
import { fixDay } from './fixes'
import { teamSpeed } from './careers'
import { officeOf, staffOf } from './offices'
import { DISCIPLINE_SPEED, statMultiplier } from './modifiers'
import { rand } from './rng'
import { isReady } from './scoring'
import { employeeSkillGain, employeeSpeed } from './staff'
import { DISCIPLINES, emptySkills, type Employee, type GameState, type Office, type Skills } from './types'

/** Points an employee could add in one day, before the overshoot cap. */
export function dailyContribution(employee: Employee, state: GameState): Skills {
  const out = emptySkills()
  const speed = statMultiplier(state, 'workSpeed') * teamSpeed(state, officeOf(state, employee))
  for (const d of DISCIPLINES) {
    const variance = 1 + WORK_VARIANCE * (2 * rand(state) - 1)
    out[d] =
      employee.skills[d] * POINTS_PER_SKILL * variance * speed * statMultiplier(state, DISCIPLINE_SPEED[d]) * employeeSpeed(employee, d)
  }
  return out
}

/** Expected points per day from an office's team (the first office's by default), ignoring variance and the overshoot cap. */
export function teamRate(state: GameState, office: Office = state.offices[0]): Skills {
  const rate = emptySkills()
  const speed = statMultiplier(state, 'workSpeed') * teamSpeed(state, office)
  for (const employee of staffOf(state, office)) {
    for (const d of DISCIPLINES) {
      rate[d] += employee.skills[d] * POINTS_PER_SKILL * speed * statMultiplier(state, DISCIPLINE_SPEED[d]) * employeeSpeed(employee, d)
    }
  }
  return rate
}

/** Days for an office's team (the first office's by default) to reach `target`; Infinity if a needed discipline has no output. */
export function estimateDays(state: GameState, target: Skills, office: Office = state.offices[0]): number {
  const rate = teamRate(state, office)
  let days = 0
  for (const d of DISCIPLINES) {
    if (target[d] <= 0) continue
    days = Math.max(days, rate[d] > 0 ? Math.ceil(target[d] / rate[d]) : Infinity)
  }
  return days
}

/** Every office's team works on its own project. */
export function workDay(state: GameState): void {
  for (const office of state.offices) officeWorkDay(state, office)
}

/**
 * The office's people work on its project. Points beyond the overshoot cap (or, fixing bugs, beyond
 * the target) are discarded and earn no skill growth. Fires `projectReady` once; a fix sprint instead
 * fixes bugs as it goes and ends itself.
 */
function officeWorkDay(state: GameState, office: Office): void {
  const project = office.project
  if (!project) return

  // Fixes and client work have nothing to polish: they stop at the target.
  const cap = project.kind === 'new' || project.kind === 'update' ? OVERSHOOT_CAP : 1
  const skillGain = SKILL_GAIN * statMultiplier(state, 'skillGain')
  for (const employee of staffOf(state, office)) {
    const wanted = dailyContribution(employee, state)
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
    state.dayWork.push({ employeeId: employee.id, points: applied, fixing: project.kind === 'fix' })
  }

  if (project.kind === 'fix') {
    fixDay(state, office)
    return
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
