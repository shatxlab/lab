import { PM_FIT_BONUS, PM_REACH_BONUS } from './balance'
import { pmOf } from './careers'
import type { Employee, GameState, Office, Project } from './types'

/** The office whose team is building this project, if it is one of theirs. */
export function officeRunning(state: GameState, project: Project): Office | undefined {
  return state.offices.find((o) => o.project?.id === project.id)
}

/** How much of a product manager's pull they bring: their level, a little more for the sharper ones. */
function pull(pm: Employee, bonuses: readonly number[]): number {
  return bonuses[pm.level] * (0.6 + 0.4 * ((pm.analysis ?? 0) / 100))
}

/** Multiplier on the fit a release from the office earns, from its product manager; 1 when there is none. */
export function pmFitFactor(state: GameState, office: Office | undefined): number {
  const pm = office && pmOf(state, office)
  return pm ? 1 + pull(pm, PM_FIT_BONUS) : 1
}

/** Multiplier on the reach of a launch, or of a product growing into the next size, from the office's product manager. */
export function pmReachFactor(state: GameState, office: Office | undefined): number {
  const pm = office && pmOf(state, office)
  return pm ? 1 + pull(pm, PM_REACH_BONUS) : 1
}

/** What the office's product manager adds, in words ("+8% fit, +6% reach"), or null when it has none. */
export function pmEffectText(state: GameState, office: Office | undefined): string | null {
  if (!office || !pmOf(state, office)) return null
  const percent = (factor: number) => `+${Math.round((factor - 1) * 100)}%`
  return `${percent(pmFitFactor(state, office))} fit, ${percent(pmReachFactor(state, office))} reach`
}
