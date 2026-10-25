import { CAFE_START_MONEY } from './balance'
import { refreshContracts } from './contracts'
import { rollStudioName, you } from './founding'
import { refreshCandidates } from './hiring'
import { logEntry } from './journal'
import { sampleNow } from './history'
import { studioWorth } from './exit'
import { rand } from './rng'
import { createInitialState } from './state'
import type { Employee, GameState } from './types'

/**
 * A run is a career of chapters. A studio that ends well (sold, public, handed on) lets you start something new with
 * your friend, what you learned and a little of the money, like a founder who sells one company and starts the next.
 * One that ends badly (bankrupt) sends you back to the café alone, with a scar.
 */

/** What the next chapter is: a fresh start from a good ending, or from the ground after a bad one. */
export type ChapterKind = 'continue' | 'restart'

export function chapterKind(state: GameState): ChapterKind | null {
  if (!state.ending) return null
  return state.ending.kind === 'bankrupt' ? 'restart' : 'continue'
}

/** The share of what the studio was worth that you start the next one with, and the least and most. */
const SEED_SHARE = 0.01
const SEED_MIN = 15_000
const SEED_MAX = 150_000

/** What you start again with after a bad ending: twice the first café's money, enough to hire a developer to build with. */
const RESTART_MONEY = CAFE_START_MONEY * 2

/** Reputation kept into the next chapter: most of it after a good ending, a little after a bad one. */
const REPUTATION_KEPT: Record<ChapterKind, number> = { continue: 0.6, restart: 0.25 }

/** The share of the research you finished that you still know after a bad ending. */
const RESEARCH_KEPT_AFTER_FAIL = 0.5

/** The money a good ending starts the next chapter with. */
export function seedMoney(state: GameState): number {
  const worth = state.ending?.worth ?? studioWorth(state)
  return Math.round(Math.min(SEED_MAX, Math.max(SEED_MIN, worth * SEED_SHARE)) / 1000) * 1000
}

/** A person for the next chapter's café: their skills, level, quirk and what they know stay; the studio around them does not. */
function carried(person: Employee, officeId: number, id: number): Employee {
  const { teamId: _teamId, title: _title, ...rest } = structuredClone(person)
  return { ...rest, id, officeId, training: null, readySince: null, morale: Math.max(person.morale, 75) }
}

/**
 * The state of the next chapter, or null while the run has not ended. The world carries on (the day, the rivals and
 * the market); the studio does not. After a good ending you and your friend start again from the café with the
 * research you finished; after a bad one you start alone, with half of it, a smaller name and the starting money.
 */
export function nextChapter(state: GameState): GameState | null {
  const kind = chapterKind(state)
  const ending = state.ending
  const me = you(state)
  if (!kind || !ending || !me) return null

  const next = createInitialState(state.rng)
  const friend = state.employees.find((e) => e.founder && e !== me)
  // The new café and the people in it take ids above everything the world has used.
  next.nextId = state.nextId
  const cafe = { id: next.nextId++, kind: 'cafe' as const, theme: 0, region: 'us' as const, project: null }
  next.offices = [cafe]
  next.employees = [carried(me, cafe.id, next.nextId++), ...(kind === 'continue' && friend ? [carried(friend, cafe.id, next.nextId++)] : [])]

  next.day = state.day
  next.lastEventDay = state.day
  next.lastOutingDay = state.day - 1000
  next.rivals = state.rivals
  next.rivalProducts = state.rivalProducts
  next.absorbedNames = state.absorbedNames
  next.market = state.market
  next.modifiers = state.modifiers.filter((m) => m.expiresDay > state.day)
  next.milestones = state.milestones
  next.journal = state.journal
  next.history = state.history
  next.recentEvents = state.recentEvents

  const keep = kind === 'continue' ? state.research.done.length : Math.floor(state.research.done.length * RESEARCH_KEPT_AFTER_FAIL)
  next.research = { done: state.research.done.slice(0, keep), active: null }
  next.reputation = Math.round(state.reputation * REPUTATION_KEPT[kind])
  next.money = kind === 'continue' ? seedMoney(state) : RESTART_MONEY

  next.chapter = (state.chapter ?? 1) + 1
  next.legacy = [
    ...(state.legacy ?? []),
    { studio: state.studioName ?? 'Your studio', ending: ending.kind, worth: ending.worth, years: Math.round(((state.day - (state.chapterStartDay ?? 0)) / 360) * 10) / 10 },
  ]
  next.chapterStartDay = state.day
  next.freshChapter = true
  next.studioName = rollStudioName(next.rivals.map((r) => r.name), () => rand(next))

  refreshCandidates(next)
  refreshContracts(next)
  next.history = [...state.history, sampleNow(next)]
  logEntry(
    next,
    kind === 'continue' ? 'chapter.continue' : 'chapter.restart',
    kind === 'continue' ? `Started something new${friend ? ` with ${friend.name}` : ''}` : `Started again, alone: ${me.name}`,
    { chapter: next.chapter, money: next.money, reputation: next.reputation, research: next.research.done.length },
  )
  return next
}
