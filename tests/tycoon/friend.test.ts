import { describe, expect, it } from 'vitest'
import { FRIEND_IDEA_DAYS } from '@/lib/tycoon/sim/balance'
import { chapterKind, nextChapter } from '@/lib/tycoon/sim/chapters'
import { crisisMonth, rallyCost } from '@/lib/tycoon/sim/crisis'
import { resolveRandomEvent } from '@/lib/tycoon/sim/events'
import { courtFriend, friendMonth, friendOf } from '@/lib/tycoon/sim/friend'
import { nemesisMonth, nemesisRival } from '@/lib/tycoon/sim/nemesis'
import { createInitialState, deserialize, serialize } from '@/lib/tycoon/sim/state'
import { makeProduct } from './helpers'
import type { GameState } from '@/lib/tycoon/sim/types'

function studio(): GameState {
  const state = createInitialState(31)
  state.day = 2000
  state.hitDay = 1000
  state.products = [makeProduct({ id: 3, hit: true, users: 60_000, reach: 90_000, productTypeId: 'fintech_app' })]
  state.signatureId = 3
  state.incomeAverage = 20_000
  state.money = 5_000_000
  for (let i = 0; i < 4; i++) state.employees.push({ ...state.employees[0], id: 800 + i, founder: false, name: `Hire ${i}`, morale: 80 })
  return state
}

describe('the friend', () => {
  it('tells you about their own idea once the hit is a few months old, and your answer moves the bond', () => {
    const state = studio()
    state.hitDay = state.day - FRIEND_IDEA_DAYS + 30
    friendMonth(state)
    expect(state.pendingEvent).toBeNull()
    expect(state.friendArc).toMatchObject({ stage: 'together' })
    state.hitDay = state.day - FRIEND_IDEA_DAYS
    friendMonth(state)
    expect(state.pendingEvent?.id).toBe('friend_idea')
    const bond = state.friendArc!.bond
    expect(resolveRandomEvent(state, 2).ok).toBe(true)
    expect(state.friendArc!.bond).toBeLessThan(bond)
    friendMonth(state)
    expect(state.pendingEvent).toBeNull()
  })

  it('follows the mood of the team', () => {
    const state = studio()
    friendMonth(state)
    state.friendArc!.ideaTold = true
    const bond = state.friendArc!.bond
    state.employees.forEach((e) => (e.morale = 90))
    friendMonth(state)
    expect(state.friendArc!.bond).toBeGreaterThan(bond)
    state.employees.forEach((e) => (e.morale = 30))
    const happy = state.friendArc!.bond
    friendMonth(state)
    expect(state.friendArc!.bond).toBeLessThan(happy)
  })

  it('is courted by the nemesis, and a close friend talked to stays while a distant one goes', () => {
    const stayed = studio()
    friendMonth(stayed)
    stayed.pendingEvent = null
    stayed.hitDay = 0
    nemesisMonth(stayed)
    stayed.friendArc!.ideaTold = true
    stayed.friendArc!.stage = 'together'
    stayed.friendArc!.bond = 100
    expect(courtFriend(stayed)).toBe(true)
    expect(stayed.pendingEvent?.id).toBe('friend_offer')
    expect(resolveRandomEvent(stayed, 0).ok).toBe(true)
    expect(friendOf(stayed)).toBeDefined()
    expect(stayed.friendArc!.stage).toBe('together')

    const left = studio()
    friendMonth(left)
    left.pendingEvent = null
    left.hitDay = 0
    nemesisMonth(left)
    left.friendArc!.stage = 'together'
    left.friendArc!.bond = 0
    const ratio = nemesisRival(left)!.ratio!
    const friend = friendOf(left)!
    courtFriend(left)
    expect(resolveRandomEvent(left, 2).ok).toBe(true) // their call, with nothing between you: they go
    expect(friendOf(left)).toBeUndefined()
    expect(left.friendArc).toMatchObject({ stage: 'gone', left: { name: friend.name } })
    expect(nemesisRival(left)!.ratio!).toBeCloseTo(ratio + 0.25, 5)
  })

  it('comes back after the rival falls, if you let them, and not otherwise', () => {
    const state = studio()
    friendMonth(state)
    state.pendingEvent = null
    state.hitDay = 0
    nemesisMonth(state)
    state.friendArc!.bond = 0
    courtFriend(state)
    resolveRandomEvent(state, 2)
    const name = state.friendArc!.left!.name
    friendMonth(state)
    expect(state.pendingEvent).toBeNull()
    state.nemesesBeaten = 1
    friendMonth(state)
    expect(state.pendingEvent?.id).toBe('friend_return')
    expect(resolveRandomEvent(state, 0).ok).toBe(true)
    expect(friendOf(state)).toMatchObject({ name, title: 'CTO', founder: true })
    expect(state.friendArc).toMatchObject({ stage: 'returned', bond: 70 })
    expect(state.friendArc!.left).toBeUndefined()
  })

  it('survives a save', () => {
    const state = studio()
    friendMonth(state)
    state.pendingEvent = null
    state.hitDay = 0
    nemesisMonth(state)
    state.friendArc!.bond = 0
    courtFriend(state)
    resolveRandomEvent(state, 2)
    expect(deserialize(serialize(state))!.friendArc).toEqual(state.friendArc)
  })
})

describe('losing confidence', () => {
  function doubted(): GameState {
    const state = studio()
    state.hitDay = 0
    nemesisMonth(state)
    nemesisRival(state)!.ratio = 1.8
    state.employees.forEach((e) => (e.morale = 20))
    return state
  }

  it('puts a vote of no confidence to you after months of low spirits and a rival pulling ahead', () => {
    const state = doubted()
    crisisMonth(state)
    crisisMonth(state)
    expect(state.pendingEvent).toBeNull()
    crisisMonth(state)
    expect(state.pendingEvent?.id).toBe('no_confidence')
  })

  it('lets you rally once, which costs a share of the cash, and ends the run the second time you step down', () => {
    const state = doubted()
    for (let i = 0; i < 3; i++) crisisMonth(state)
    const cost = rallyCost(state)
    expect(cost).toBe(1_250_000)
    expect(resolveRandomEvent(state, 0).ok).toBe(true)
    expect(state.money).toBe(5_000_000 - cost)
    expect(state.employees.every((e) => e.morale >= 40)).toBe(true)
    expect(state.rallied).toBe(true)
    state.employees.forEach((e) => (e.morale = 20))
    nemesisRival(state)!.ratio = 1.8
    for (let i = 0; i < 3; i++) crisisMonth(state)
    expect(state.pendingEvent?.id).toBe('no_confidence')
    expect(resolveRandomEvent(state, 0).ok).toBe(false) // already rallied once
    expect(resolveRandomEvent(state, 1).ok).toBe(true)
    expect(state.gameOver).toBe(true)
    expect(state.ending).toMatchObject({ kind: 'ousted', worth: 0 })
    expect(chapterKind(state)).toBe('restart')
    const next = nextChapter(state)!
    expect(next.employees).toHaveLength(1)
  })

  it('eases off when things look better', () => {
    const state = doubted()
    crisisMonth(state)
    crisisMonth(state)
    state.employees.forEach((e) => (e.morale = 80))
    crisisMonth(state)
    expect(state.doubtMonths).toBe(1)
    expect(state.pendingEvent).toBeNull()
  })
})
