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

/**
 * When the company opens in Europe, you become its CEO and your developer friend its CTO; one of your analysts (the
 * best, by analysis) takes over as the hit's product manager. The CEO no longer gathers insight.
 */
export function changeOfGuard(state: GameState): void {
  const ceo = you(state)
  if (!ceo || ceo.title === 'CEO') return
  const friend = state.employees.find((e) => e.founder && e !== ceo)
  const successor = state.employees
    .filter((e) => !e.founder && e.role === 'analyst' && !e.training)
    .sort((a, b) => (b.analysis ?? 0) - (a.analysis ?? 0))[0]
  ceo.title = 'CEO'
  ceo.role = 'analyst'
  if (friend) friend.title = 'CTO'
  let text = `${ceo.name} is the CEO now${friend ? `, with ${friend.name} as CTO` : ''}.`
  if (successor) {
    successor.role = 'pm'
    successor.level = Math.max(successor.level, 1)
    successor.levelDay = state.day
    text += ` ${successor.name} takes over as the hit's product manager.`
  } else {
    text += ' Nobody is left to steer the hit: hire analysts, and make one a product manager.'
  }
  state.events.push({ type: 'notice', text, sound: 'milestone' })
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
