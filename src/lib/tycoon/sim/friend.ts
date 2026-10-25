import {
  FRIEND_HAPPY_MORALE,
  FRIEND_IDEA_DAYS,
  FRIEND_LEAVE_MORALE,
  FRIEND_LEAVE_RIVAL_GAIN,
  FRIEND_MOOD_GAIN,
  FRIEND_START_BOND,
  FRIEND_UNHAPPY_MORALE,
  REPUTATION_MAX,
} from './balance'
import { you } from './founding'
import { depart } from './knowledge'
import { logEntry } from './journal'
import { adjustMorale } from './morale'
import { offerEvent } from './events'
import { nemesisRival } from './nemesis'
import { freeDesks } from './offices'
import { salaryOf } from './hiring'
import type { Employee, GameState } from './types'

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** The other founder, if they are still with you. */
export function friendOf(state: GameState): Employee | undefined {
  const me = you(state)
  return state.employees.find((e) => e.founder && e !== me)
}

/** Moves the bond, within 0 to 100. */
export function changeBond(state: GameState, delta: number): void {
  if (state.friendArc) state.friendArc.bond = clamp(state.friendArc.bond + delta, 0, 100)
}

/** The average mood of the people who work for you. */
function teamMorale(state: GameState): number {
  const people = state.employees.filter((e) => !e.training)
  return people.length === 0 ? 75 : people.reduce((sum, e) => sum + e.morale, 0) / people.length
}

/** Whether the nemesis can court your friend now: they are with you, and not already in a story. */
export function canCourtFriend(state: GameState): boolean {
  return !!friendOf(state) && !state.pendingEvent && (state.friendArc?.stage === 'together' || state.friendArc?.stage === 'restless' || state.friendArc?.stage === 'returned')
}

/** The nemesis makes your friend an offer (an event, `friend_offer`). */
export function courtFriend(state: GameState): boolean {
  if (!canCourtFriend(state)) return false
  const rival = nemesisRival(state)
  const friend = friendOf(state)!
  if (!rival) return false
  state.friendArc!.stage = 'courted'
  offerEvent(state, 'friend_offer', { friendId: friend.id, rivalId: rival.id })
  return true
}

/** The friend takes the offer and goes. They are remembered, so they can come back. */
export function friendLeaves(state: GameState): void {
  const friend = friendOf(state)
  const arc = state.friendArc
  if (!friend || !arc) return
  arc.left = structuredClone(friend)
  arc.stage = 'gone'
  arc.beatenAtLeave = state.nemesesBeaten ?? 0
  depart(state, friend)
  const rival = nemesisRival(state)
  if (rival?.ratio !== undefined) rival.ratio += FRIEND_LEAVE_RIVAL_GAIN
  adjustMorale(state, -FRIEND_LEAVE_MORALE)
  logEntry(state, 'friend.leaves', `${friend.name} left to join ${rival?.name ?? 'your rival'}`, { bond: Math.round(arc.bond) })
}

/** The friend stays: they felt it was worth it. */
export function friendStays(state: GameState): void {
  const arc = state.friendArc
  if (!arc) return
  arc.stage = 'together'
  changeBond(state, 10)
  logEntry(state, 'friend.stays', `${friendOf(state)?.name ?? 'Your friend'} stayed`, { bond: Math.round(arc.bond) })
}

/** The friend comes back to the company they helped start, to the office with a free desk (any, if none). */
export function friendReturns(state: GameState): boolean {
  const arc = state.friendArc
  const left = arc?.left
  if (!arc || !left || friendOf(state)) return false
  const office = state.offices.find((o) => o.kind === 'office' && freeDesks(state, o) > 0) ?? state.offices.find((o) => o.kind === 'office') ?? state.offices[0]
  const friend: Employee = { ...structuredClone(left), officeId: office.id, morale: 90, title: 'CTO', founder: true, training: null }
  delete friend.teamId
  friend.salary = salaryOf(friend, state.day)
  state.employees.push(friend)
  arc.stage = 'returned'
  arc.bond = 70
  delete arc.left
  state.reputation = Math.min(REPUTATION_MAX, state.reputation + 3)
  logEntry(state, 'friend.returns', `${friend.name} came back`)
  return true
}

/** Once a month: the bond follows the mood of the team, and the friend's own story moves on. */
export function friendMonth(state: GameState): void {
  const hit = state.products.find((p) => p.id === state.signatureId)
  if (!hit || state.hitDay === undefined) return
  const friend = friendOf(state)
  if (!state.friendArc) {
    if (!friend) return
    state.friendArc = { stage: 'together', bond: FRIEND_START_BOND }
  }
  const arc = state.friendArc
  if (friend) {
    const morale = teamMorale(state)
    changeBond(state, morale >= FRIEND_HAPPY_MORALE ? FRIEND_MOOD_GAIN : morale < FRIEND_UNHAPPY_MORALE ? -FRIEND_MOOD_GAIN : 0)
  }
  if (state.pendingEvent) return
  if (friend && arc.stage === 'together' && !arc.ideaTold && state.day - state.hitDay >= FRIEND_IDEA_DAYS) {
    arc.ideaTold = true
    arc.stage = 'restless'
    offerEvent(state, 'friend_idea', { friendId: friend.id })
    return
  }
  // They write again once another rival has fallen after they left.
  if (!friend && arc.stage === 'gone' && arc.left && (state.nemesesBeaten ?? 0) > (arc.beatenAtLeave ?? 0)) {
    offerEvent(state, 'friend_return', { friendId: arc.left.id })
  }
}

