import { MORALE_NEUTRAL, MORALE_UNHAPPY } from './balance'
import type { GameState } from './types'

export function clampMorale(value: number): number {
  return Math.max(0, Math.min(100, value))
}

/**
 * Output multiplier from morale: 0.7 at 0, exactly 1 at the neutral point, 1.1 at 100.
 * A team in good spirits works at its normal pace or better; a miserable one is a third slower.
 */
export function moraleSpeed(morale: number): number {
  const m = clampMorale(morale)
  return m <= MORALE_NEUTRAL ? 0.7 + 0.3 * (m / MORALE_NEUTRAL) : 1 + 0.1 * ((m - MORALE_NEUTRAL) / (100 - MORALE_NEUTRAL))
}

/** Moves morale by `delta` for everyone, or just `employeeId` when given; warns about anyone who falls below the unhappy line. */
export function adjustMorale(state: GameState, delta: number, employeeId?: number): void {
  for (const employee of state.employees) {
    if (employeeId !== undefined && employee.id !== employeeId) continue
    const before = employee.morale
    employee.morale = clampMorale(before + delta)
    if (before >= MORALE_UNHAPPY && employee.morale < MORALE_UNHAPPY) {
      state.events.push({ type: 'notice', text: `${employee.name} is unhappy. A team outing or a good release would help.` })
    }
  }
}
