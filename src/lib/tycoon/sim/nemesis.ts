import { CLONE_LINES, NEMESIS_STORIES } from '@/lib/tycoon/data/nemesis'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import {
  NEMESIS_AMBITION,
  NEMESIS_BEAT_DAYS,
  NEMESIS_BEAT_RATIO,
  NEMESIS_BEAT_REPUTATION,
  NEMESIS_BLITZ_DAYS,
  NEMESIS_BLITZ_MULT,
  NEMESIS_CLONE_GAIN,
  NEMESIS_CLONE_QUALITY_GAP,
  NEMESIS_CLONE_REACH,
  NEMESIS_FIRST_DAYS,
  NEMESIS_ITEM_CAP,
  NEMESIS_MAX_RATIO,
  NEMESIS_MIN_RATIO,
  NEMESIS_MOVE_MAX_DAYS,
  NEMESIS_PER_RELEASE,
  NEMESIS_RELEASE_CAP,
  NEMESIS_STRIKE_COOLDOWN,
  NEMESIS_STRIKE_DAYS,
  NEMESIS_STRIKE_SETBACK,
  NEMESIS_STRONG_FIT,
  NEMESIS_STRONG_FIT_GAIN,
  NEMESIS_MIN_INCOME,
  NEMESIS_MOVE_MIN_DAYS,
  NEMESIS_NEXT_DAYS,
  NEMESIS_PER_ITEM,
  NEMESIS_START_RATIO,
  NEMESIS_WEAKNESS,
  NEMESIS_WEAKNESS_CAP,
  LAUNCH_ADOPTERS,
  REPUTATION_MAX,
} from './balance'
import { offerEvent } from './events'
import { courtFriend } from './friend'
import { rollPersonName, rollStudioName } from './founding'
import { logEntry } from './journal'
import { addModifier } from './modifiers'
import { freshProductName } from './naming'
import { makeProduct, rivalRevenue } from './rivals'
import { pick, rand, randInt } from './rng'
import { trailingIncome } from './economy'
import { fail, OK, type GameState, type Product, type Result, type Rival } from './types'

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '')

/** The hit, if the studio has one. */
const hitOf = (state: GameState): Product | undefined => state.products.find((p) => p.id === state.signatureId)

/** The rival who is the nemesis right now, if any. */
export function nemesisRival(state: GameState): Rival | undefined {
  return state.nemesis && state.rivals.find((r) => r.id === state.nemesis!.rivalId)
}

/** What they earn a day against what you do, as a number to show: "$31,000 against your $26,000". */
export function nemesisStanding(state: GameState): { theirs: number; yours: number; ratio: number } | null {
  const rival = nemesisRival(state)
  if (!rival) return null
  const theirs = rivalRevenue(state, rival)
  const ratio = rival.ratio ?? 1
  return { theirs, yours: ratio > 0 ? theirs / ratio : 0, ratio }
}

/** A funded newcomer who comes for the hit: a new studio with a founder, a story and an appetite. */
function emerge(state: GameState, hit: Product): void {
  const founder = rollPersonName(() => rand(state))
  const name = rollStudioName(state.rivals.map((r) => r.name), () => rand(state))
  const rival: Rival = {
    id: state.nextId++,
    name,
    skill: 82,
    reputation: 45,
    focus: [hit.productTypeId],
    region: 'us',
    size: 'medium',
    nextLaunchDay: state.day + randInt(state, 60, 120),
    business: 0,
    growth: 0,
    businessCap: 0,
    ratio: NEMESIS_START_RATIO,
  }
  state.rivals.push(rival)
  const story = fill(pick(state, NEMESIS_STORIES), { founder })
  state.nemesis = {
    rivalId: rival.id,
    founder,
    story,
    since: state.day,
    leadDays: 0,
    nextMoveDay: state.day + randInt(state, NEMESIS_MOVE_MIN_DAYS, NEMESIS_MOVE_MAX_DAYS),
    builtSeen: (hit.built ?? []).length,
    updatesSeen: hit.updates.length,
  }
  state.events.push({ type: 'notice', text: `${name} has come for ${hit.name}. ${story}` })
  logEntry(state, 'nemesis.emerge', `${name} (${founder}) came for ${hit.name}`, { story, rival: name })
}

/** They launch a lookalike of the hit: it crowds the market, which presses on the hit's fit, and lifts them. */
function clone(state: GameState, rival: Rival, hit: Product): void {
  const base = makeProduct(state, rival, state.day)
  const quality = clamp(hit.quality - NEMESIS_CLONE_QUALITY_GAP, 40, 98)
  const reach = hit.reach * NEMESIS_CLONE_REACH
  const product = { ...base, name: freshProductName(state), productTypeId: hit.productTypeId, quality, reach, users: reach * LAUNCH_ADOPTERS, hit: true }
  state.rivalProducts.push(product)
  rival.ratio = clamp((rival.ratio ?? 1) + NEMESIS_CLONE_GAIN, NEMESIS_MIN_RATIO, NEMESIS_MAX_RATIO)
  const line = fill(pick(state, CLONE_LINES), { studio: rival.name, founder: state.nemesis!.founder, product: product.name, hit: hit.name })
  state.events.push({ type: 'notice', text: line })
  logEntry(state, 'nemesis.clone', `${rival.name} launched ${product.name}, a lookalike of ${hit.name}`, { type: getProductType(hit.productTypeId).name })
}

/** An ad blitz: for a while some of your sign-ups go to them. */
function blitz(state: GameState, rival: Rival): void {
  addModifier(state, { source: 'nemesis-blitz', stat: 'revenue', mult: NEMESIS_BLITZ_MULT, days: NEMESIS_BLITZ_DAYS })
  state.events.push({ type: 'notice', text: `${rival.name} is buying every ad your users see. Income dips for ${NEMESIS_BLITZ_DAYS} days.` })
  logEntry(state, 'nemesis.blitz', `${rival.name} ran an ad blitz`)
}

/** They go after someone on your team: you choose whether to keep them (`nemesis_poach` in the events). */
function poach(state: GameState, rival: Rival): boolean {
  if (state.pendingEvent) return false
  const targets = state.employees.filter((e) => !e.founder)
  if (targets.length < 3) return false
  const best = [...targets].sort((a, b) => b.salary - a.salary)[0]
  offerEvent(state, 'nemesis_poach', { employeeId: best.id, rivalId: rival.id })
  return true
}

/** One of their moves, now and then. Returns false if it had to wait. */
function move(state: GameState, rival: Rival, hit: Product): boolean {
  const roll = rand(state)
  if (roll < 0.15 && courtFriend(state)) return true
  if (roll < 0.5) {
    clone(state, rival, hit)
    return true
  }
  if (roll < 0.75 && poach(state, rival)) return true
  blitz(state, rival)
  return true
}

/** The rivalry ends: you out-earned them, or absorbed them. The next one comes later, hungrier. */
function defeat(state: GameState, how: 'outearned' | 'absorbed'): void {
  const nemesis = state.nemesis!
  const rival = nemesisRival(state)
  const name = rival?.name ?? 'Your rival'
  // They stay in the market as an ordinary studio with the income they had.
  if (rival) {
    rival.business = Math.max(0, Math.round(rivalRevenue(state, rival)))
    rival.businessCap = rival.business * 2
    rival.growth = 0.2
    delete rival.ratio
  }
  state.nemesesBeaten = (state.nemesesBeaten ?? 0) + 1
  state.reputation = Math.min(REPUTATION_MAX, state.reputation + NEMESIS_BEAT_REPUTATION)
  const text = how === 'absorbed' ? `You absorbed ${name}. ${nemesis.founder} works for you now, or does not work at all.` : `You out-earned ${name} and kept it up. ${nemesis.founder} is no longer the one to beat.`
  state.events.push({ type: 'notice', text, sound: 'milestone' })
  logEntry(state, 'nemesis.beaten', text, { how, beaten: state.nemesesBeaten })
  state.nemesis = undefined
  state.nextNemesisDay = state.day + NEMESIS_NEXT_DAYS
}

/** Once a day: the rivalry's clock. A rival that has been absorbed is beaten; one who is behind by the margin long enough is too. */
export function nemesisDay(state: GameState): void {
  const nemesis = state.nemesis
  if (!nemesis) return
  const rival = nemesisRival(state)
  if (!rival) {
    defeat(state, 'absorbed')
    return
  }
  const ratio = rival.ratio ?? 1
  nemesis.leadDays = ratio <= NEMESIS_BEAT_RATIO ? nemesis.leadDays + 1 : Math.max(0, nemesis.leadDays - 2)
  if (nemesis.leadDays >= NEMESIS_BEAT_DAYS) {
    defeat(state, 'outearned')
    return
  }
  const hit = hitOf(state)
  if (hit && state.day >= nemesis.nextMoveDay && !state.pendingEvent) {
    if (move(state, rival, hit)) nemesis.nextMoveDay = state.day + randInt(state, NEMESIS_MOVE_MIN_DAYS, NEMESIS_MOVE_MAX_DAYS)
  }
}

/** Once a month: they gain on you where you are weak and fall back when you finish things. A new one comes when it is time. */
export function nemesisMonth(state: GameState): void {
  const hit = hitOf(state)
  if (!hit) return
  if (!state.nemesis) {
    const due = state.nextNemesisDay ?? (state.hitDay ?? state.day) + NEMESIS_FIRST_DAYS
    if (state.day >= due && state.signatureId !== null) emerge(state, hit)
    return
  }
  const rival = nemesisRival(state)
  if (!rival) return
  const built = (hit.built ?? []).length
  const finished = Math.max(0, built - state.nemesis.builtSeen)
  state.nemesis.builtSeen = built
  const weakness = clamp(((90 - (hit.fit ?? 100)) * NEMESIS_WEAKNESS), 0, NEMESIS_WEAKNESS_CAP)
  const shipped = Math.max(0, hit.updates.length - (state.nemesis.updatesSeen ?? hit.updates.length))
  state.nemesis.updatesSeen = hit.updates.length
  const strong = (hit.fit ?? 0) >= NEMESIS_STRONG_FIT ? NEMESIS_STRONG_FIT_GAIN : 0
  const drift = NEMESIS_AMBITION + weakness - Math.min(NEMESIS_ITEM_CAP, finished * NEMESIS_PER_ITEM) - Math.min(NEMESIS_RELEASE_CAP, shipped * NEMESIS_PER_RELEASE) - strong
  rival.ratio = clamp((rival.ratio ?? 1) + drift, NEMESIS_MIN_RATIO, NEMESIS_MAX_RATIO)
}

/** What striking back costs: a few weeks of what you earn. */
export function strikeBackCost(state: GameState): number {
  return Math.round((Math.max(trailingIncome(state), NEMESIS_MIN_INCOME) * NEMESIS_STRIKE_DAYS) / 1000) * 1000
}

/** Why you can't strike back now, or null when you can. */
export function strikeBackBlocker(state: GameState): string | null {
  const nemesis = state.nemesis
  if (!nemesis || !nemesisRival(state)) return 'Nobody to strike back at'
  if (state.gameOver) return 'The run is over'
  const left = (nemesis.struckDay ?? -10_000) + NEMESIS_STRIKE_COOLDOWN - state.day
  if (left > 0) return `Wait ${left} more day${left === 1 ? '' : 's'}`
  return state.money < strikeBackCost(state) ? 'Not enough money' : null
}

/** A campaign aimed at their customers: it costs weeks of income, and sets them back. */
export function strikeBack(state: GameState): Result {
  const blocker = strikeBackBlocker(state)
  if (blocker) return fail(blocker)
  const rival = nemesisRival(state)!
  const cost = strikeBackCost(state)
  state.money -= cost
  rival.ratio = clamp((rival.ratio ?? 1) - NEMESIS_STRIKE_SETBACK, NEMESIS_MIN_RATIO, NEMESIS_MAX_RATIO)
  state.nemesis!.struckDay = state.day
  state.events.push({ type: 'notice', text: `You went after ${rival.name}'s customers. They will feel it.` })
  return OK
}

/** For the monthly log. */
export function nemesisFields(state: GameState): Record<string, string | number> {
  const standing = nemesisStanding(state)
  if (!state.nemesis || !standing) return {}
  return {
    nemesis: nemesisRival(state)?.name ?? '',
    nemesisFounder: state.nemesis.founder,
    nemesisRatio: Math.round(standing.ratio * 100) / 100,
    nemesisLeadDays: state.nemesis.leadDays,
  }
}

