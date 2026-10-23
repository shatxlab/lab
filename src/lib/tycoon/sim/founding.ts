import { FIRST_NAMES, LAST_NAMES, STUDIO_HEADS, STUDIO_TAILS } from '@/lib/tycoon/data/names'
import { fail, OK, type Employee, type GameState, type Result } from './types'

/**
 * The start of a run: you name yourself and the studio. You are the founder who studies users (an analyst, later
 * the product manager of the hit), and your friend the founder who builds.
 */

/** The longest a name may be, yours or the studio's. */
export const NAME_MAX = 32

/** What the studio is called in the ranking and on the screen. */
export function studioNameOf(state: GameState): string {
  return state.studioName ?? 'Your studio'
}

/** You: the founder who reads the market. */
export function you(state: GameState): Employee | undefined {
  return state.employees.find((e) => e.founder && (e.role === 'analyst' || e.role === 'pm'))
}

const from = (list: readonly string[], random: () => number) => list[Math.floor(random() * list.length)]!

/**
 * A person's name, rolled with `random` rather than the game's own luck: the start screen's dice can be rolled as
 * often as you like without changing how the run plays.
 */
export function rollPersonName(random: () => number = Math.random): string {
  return `${from(FIRST_NAMES, random)} ${from(LAST_NAMES, random)}`
}

/** A studio name that none of the `taken` (the rivals') already is. */
export function rollStudioName(taken: readonly string[] = [], random: () => number = Math.random): string {
  for (let i = 0; i < 40; i++) {
    const name = `${from(STUDIO_HEADS, random)} ${from(STUDIO_TAILS, random)}`
    if (!taken.includes(name)) return name
  }
  return `${from(STUDIO_HEADS, random)} ${from(STUDIO_TAILS, random)} Labs`
}

/** Why these names can't be used, or null when they can. */
export function foundingBlocker(state: GameState, yourName: string, studioName: string): string | null {
  const person = yourName.trim()
  const studio = studioName.trim()
  if (!person) return 'Give yourself a name'
  if (!studio) return 'Give the studio a name'
  if (person.length > NAME_MAX || studio.length > NAME_MAX) return `Names are at most ${NAME_MAX} letters`
  if (state.rivals.some((r) => r.name.toLowerCase() === studio.toLowerCase())) return `${studio} is a rival's name`
  return you(state) ? null : 'Nobody to name'
}

/** Names you and the studio. */
export function foundStudio(state: GameState, yourName: string, studioName: string): Result {
  const blocker = foundingBlocker(state, yourName, studioName)
  if (blocker) return fail(blocker)
  you(state)!.name = yourName.trim()
  state.studioName = studioName.trim()
  return OK
}
