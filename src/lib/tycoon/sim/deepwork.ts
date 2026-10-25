import { getDeepWork, DEEP_WORK, type DeepWorkKind } from '@/lib/tycoon/data/deepwork'
import {
  DEEP_BASE_CHANCE,
  DEEP_BOLD_PENALTY,
  DEEP_CONTRACTOR_DAYS,
  DEEP_FRIEND_BOND_GAIN,
  DEEP_FRIEND_BOND_MIN,
  DEEP_HELP_BONUS,
  DEEP_MAX_CHANCE,
  DEEP_MIN_CHANCE,
  DEEP_SKILL_DIVISOR,
  DEEP_SKILL_GAIN,
  NEMESIS_MIN_RATIO,
  REPUTATION_MAX,
} from './balance'
import { trailingIncome } from './economy'
import { offerEvent } from './events'
import { changeBond, friendOf } from './friend'
import { you } from './founding'
import { logEntry } from './journal'
import { nemesisRival } from './nemesis'
import { inGarage } from './offices'
import { peakFitOf } from './fit'
import { rand } from './rng'
import { fail, OK, type Employee, type GameState, type Product, type Result } from './types'

/**
 * Deep work: the founder stops managing and builds a piece of the hit by hand. It takes weeks, during which you gather no
 * insight; halfway you decide how to go on (steady, bold, with help); at the end your own skill and the choices decide whether
 * it works out. It is the verb of the headquarters years, and it makes your skills grow.
 */

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

const hitOf = (state: GameState): Product | undefined => state.products.find((p) => p.id === state.signatureId)

/** Your skill for a kind of work, 0 to 100. */
export function skillFor(me: Employee, kind: DeepWorkKind): number {
  return kind.skill === 'analysis' ? (me.analysis ?? 0) : me.skills[kind.skill]
}

/** Why this piece of work can't be started now, or null when it can. */
export function deepWorkBlocker(state: GameState, kindId: string): string | null {
  const kind = getDeepWork(kindId)
  if (!kind) return 'Unknown work'
  if (state.gameOver) return 'The run is over'
  if (state.deepWork) return 'You are already deep in something'
  if (!hitOf(state) || inGarage(state)) return 'You need a hit and an office first'
  if (!you(state)) return 'Nobody to do it'
  if (kind.needsNemesis && !nemesisRival(state)) return 'You have no rival to study'
  return null
}

/** Starts a piece of deep work. */
export function startDeepWork(state: GameState, kindId: string): Result {
  const blocker = deepWorkBlocker(state, kindId)
  if (blocker) return fail(blocker)
  const kind = getDeepWork(kindId)!
  state.deepWork = { kind: kind.id, startDay: state.day, days: kind.days }
  logEntry(state, 'deepwork.start', `Started deep work: ${kind.name}`, { days: kind.days })
  return OK
}

/** The chance it works out, from your skill and what you have chosen. */
export function deepWorkChance(state: GameState): number {
  const work = state.deepWork
  const me = you(state)
  const kind = work && getDeepWork(work.kind)
  if (!work || !me || !kind) return 0
  return clamp(DEEP_BASE_CHANCE + skillFor(me, kind) / DEEP_SKILL_DIVISOR + (work.helped ? DEEP_HELP_BONUS : 0) - (work.bold ? DEEP_BOLD_PENALTY : 0), DEEP_MIN_CHANCE, DEEP_MAX_CHANCE)
}

/** What a contractor costs to lend a hand. */
export const contractorCost = (state: GameState): number => Math.round((trailingIncome(state) * DEEP_CONTRACTOR_DAYS) / 100) * 100

/** Your friend lends a hand, if they are with you and close enough. Returns a reason it can't be done, or null. */
export function pairBlocker(state: GameState): string | null {
  if (!friendOf(state)) return 'Your friend is not here'
  return (state.friendArc?.bond ?? 0) >= DEEP_FRIEND_BOND_MIN ? null : 'You two are not close enough for that right now'
}

/** Choices at the halfway checkpoint. */
export function steerDeepWork(state: GameState, how: 'steady' | 'bold' | 'help-contractor' | 'help-friend'): void {
  const work = state.deepWork
  if (!work) return
  work.checkpointDone = true
  if (how === 'bold') work.bold = true
  else if (how !== 'steady') {
    work.helped = true
    if (how === 'help-friend') changeBond(state, DEEP_FRIEND_BOND_GAIN)
  }
}

/** What it gives when it works out (bold gives more) or costs when it does not; returns a sentence. */
function conclude(state: GameState, kind: DeepWorkKind, ok: boolean, bold: boolean): string {
  const hit = hitOf(state)
  switch (kind.id) {
    case 'signature':
      if (hit?.fit !== undefined) {
        hit.fit = clamp(hit.fit + (ok ? (bold ? 10 : 6) : -2), 0, 100)
        if (ok) hit.peakFit = Math.max(peakFitOf(hit), hit.fit)
      }
      return ok ? 'It is exactly the thing. People will say what your product is for in one sentence.' : 'It does not land the way you meant. A few users even liked the old way better.'
    case 'rewrite':
      if (hit) {
        if (ok) {
          hit.bugs *= 0.3
          hit.quality = clamp(hit.quality + (bold ? 8 : 5), 0, 100)
        } else hit.bugs += 6
      }
      return ok ? 'The new core hums. Most of the old bugs lived in what you replaced.' : 'The rewrite is cleaner and wrong in new places. Bugs, a few weeks of them.'
    case 'study': {
      const rival = nemesisRival(state)
      if (rival?.ratio !== undefined) rival.ratio = clamp(rival.ratio - (ok ? (bold ? 0.4 : 0.25) : 0.05), NEMESIS_MIN_RATIO, 10)
      if (ok) state.insight += 30
      return ok ? `You know what ${rival?.name ?? 'they'} cannot do, and now so does your roadmap.` : 'They are better prepared than you thought. You learn a little.'
    }
    default:
      if (ok) {
        state.reputation = clamp(state.reputation + 10, 0, REPUTATION_MAX)
        if (hit) hit.reach *= bold ? 1.15 : 1.08
      } else state.reputation = clamp(state.reputation - 2, 0, REPUTATION_MAX)
      return ok ? 'The story spreads. People who never used it know why it exists.' : 'The story is told and nobody retells it.'
  }
}

/** Once a day: halfway there you are asked how to go on; at the end it works out or it does not. */
export function deepWorkDay(state: GameState): void {
  const work = state.deepWork
  if (!work) return
  const kind = getDeepWork(work.kind)
  const me = you(state)
  if (!kind || !me) {
    delete state.deepWork
    return
  }
  const elapsed = state.day - work.startDay
  if (!work.checkpointDone && elapsed >= work.days / 2 && !state.pendingEvent) {
    work.checkpointDone = true
    offerEvent(state, 'deep_work_checkpoint', { kind: DEEP_WORK.indexOf(kind) })
    return
  }
  if (elapsed < work.days || state.pendingEvent) return
  const chance = deepWorkChance(state)
  const ok = rand(state) < chance
  me.skills = { ...me.skills }
  const gain = ok ? DEEP_SKILL_GAIN : DEEP_SKILL_GAIN / 2
  if (kind.skill === 'analysis') me.analysis = Math.min(100, (me.analysis ?? 0) + gain)
  else me.skills[kind.skill] = Math.min(100, me.skills[kind.skill] + gain)
  const text = conclude(state, kind, ok, work.bold === true)
  state.events.push({ type: 'notice', text: `${kind.name}: ${text}`, sound: ok ? 'milestone' : undefined })
  logEntry(state, ok ? 'deepwork.done' : 'deepwork.failed', `${kind.name} ${ok ? 'worked out' : 'did not work out'}`, { chance: Math.round(chance * 100), bold: work.bold === true, helped: work.helped === true })
  delete state.deepWork
}
