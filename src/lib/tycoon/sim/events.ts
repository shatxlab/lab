import { CAFE_EVENTS, getRandomEvent, RANDOM_EVENTS } from '@/lib/tycoon/data/events'
import {
  CAFE_EVENT_CHANCE_PER_DAY,
  CAFE_EVENT_COOLDOWN_DAYS,
  CAFE_EVENT_MIN_DAY,
  EVENT_CHANCE_PER_DAY,
  EVENT_COOLDOWN_DAYS,
  EVENT_MIN_DAY,
  EVENT_REPEAT_GAP,
  INVESTOR_LIFELINE_DEBT_DAYS,
  ALPHA_PROGRESS,
} from './balance'
import { activeProjects, inCafe } from './offices'
import { rand } from './rng'
import { overallProgress } from './scoring'
import { fail, OK, type GameState, type Result } from './types'

/** Puts an event in front of the player now. */
export function offerEvent(state: GameState, id: string, data?: Record<string, number>): void {
  const event = getRandomEvent(id)
  if (!event) return
  state.pendingEvent = { id, data: data ?? event.prepare?.(state) ?? {} }
  state.lastEventDay = state.day
  state.recentEvents = [...(state.recentEvents ?? []), id].slice(-EVENT_REPEAT_GAP)
  state.events.push({ type: 'randomEvent' })
}

/**
 * Called once a day. Offers an event now and then (after a warm-up and a cooldown), and always
 * puts one investor lifeline in front of a player who has just fallen into debt, and the alpha
 * checkpoint in front of one whose new Medium-or-bigger product is halfway done.
 */
export function rollRandomEvent(state: GameState): void {
  if (state.pendingEvent || state.gameOver) return

  if (state.debtDays === INVESTOR_LIFELINE_DEBT_DAYS && state.investorDeals === 0) {
    offerEvent(state, 'investor')
    return
  }
  for (const { office, project } of activeProjects(state)) {
    if (project.kind === 'new' && project.size !== 'small' && !project.alphaOffered && overallProgress(project) >= ALPHA_PROGRESS) {
      project.alphaOffered = true
      offerEvent(state, 'alpha_preview', { officeId: office.id })
      return
    }
  }
  // The café has its own, smaller happenings, and more of them: it is a short chapter.
  const cafe = inCafe(state)
  const [minDay, cooldown, chance] = cafe ? [CAFE_EVENT_MIN_DAY, CAFE_EVENT_COOLDOWN_DAYS, CAFE_EVENT_CHANCE_PER_DAY] : [EVENT_MIN_DAY, EVENT_COOLDOWN_DAYS, EVENT_CHANCE_PER_DAY]
  if (state.day < minDay || state.day - state.lastEventDay < cooldown) return
  if (rand(state) >= chance) return

  // Skip what came up lately, unless that leaves nothing at all.
  const possible = (cafe ? CAFE_EVENTS : RANDOM_EVENTS).filter((e) => e.when(state))
  const fresh = possible.filter((e) => !state.recentEvents?.includes(e.id))
  const eligible = fresh.length > 0 ? fresh : possible
  if (eligible.length === 0) return
  let pointer = rand(state) * eligible.reduce((sum, e) => sum + e.weight, 0)
  const chosen = eligible.find((e) => (pointer -= e.weight) < 0) ?? eligible[eligible.length - 1]
  offerEvent(state, chosen.id)
}

export interface PendingEventView {
  title: string
  text: string
  choices: { label: string; detail?: string; disabled?: string }[]
}

/** What the dialog shows for the pending event, or null if there isn't one. */
export function describePendingEvent(state: GameState): PendingEventView | null {
  const pending = state.pendingEvent
  const event = pending && getRandomEvent(pending.id)
  if (!pending || !event) return null
  const ctx = { state, data: pending.data }
  return {
    title: event.title,
    text: event.text(ctx),
    choices: event.choices(ctx).map(({ label, detail, disabled }) => ({ label, detail, disabled })),
  }
}

/** Applies the player's choice, clears the pending event, and posts the outcome as a notice. */
export function resolveRandomEvent(state: GameState, index: number): Result {
  const pending = state.pendingEvent
  const event = pending && getRandomEvent(pending.id)
  if (!pending || !event) return fail('No event to resolve')

  const choice = event.choices({ state, data: pending.data })[index]
  if (!choice) return fail('Unknown choice')
  if (choice.disabled) return fail(choice.disabled)

  const outcome = choice.apply()
  state.pendingEvent = null
  state.lastEventDay = state.day
  if (outcome) state.events.push({ type: 'notice', text: outcome })
  return OK
}
