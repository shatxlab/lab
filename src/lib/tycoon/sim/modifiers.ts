import { getResearch } from '@/lib/tycoon/data/research'
import type { Discipline, GameState, Stat } from './types'

/** The speed stat for each discipline's work. */
export const DISCIPLINE_SPEED: Record<Discipline, Stat> = {
  design: 'designSpeed',
  engineering: 'engineeringSpeed',
  qa: 'qaSpeed',
}

/** Product of every active temporary modifier and every finished research effect on `stat`; 1 when there are none. */
export function statMultiplier(state: GameState, stat: Stat): number {
  let mult = 1
  for (const m of state.modifiers) {
    if (m.stat === stat && state.day < m.expiresDay) mult *= m.mult
  }
  for (const id of state.research.done) {
    for (const effect of getResearch(id)?.effects ?? []) {
      if (effect.stat === stat) mult *= effect.mult
    }
  }
  return mult
}

export function addModifier(
  state: GameState,
  { source, stat, mult, days }: { source: string; stat: Stat; mult: number; days: number },
): void {
  state.modifiers.push({ id: state.nextId++, source, stat, mult, expiresDay: state.day + days })
}

export function hasModifier(state: GameState, source: string): boolean {
  return state.modifiers.some((m) => m.source === source && state.day < m.expiresDay)
}

export function pruneModifiers(state: GameState): void {
  state.modifiers = state.modifiers.filter((m) => state.day < m.expiresDay)
}
