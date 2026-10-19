import { ERAS } from '@/lib/tycoon/data/eras'
import { getStage } from '@/lib/tycoon/data/stages'
import { DAYS_PER_MONTH } from './balance'
import { dailyIncome, monthlyBurn } from './economy'
import { productRevenue } from './products'
import { statMultiplier } from './modifiers'
import { playerRank } from './rivals'
import { describePendingEvent } from './events'
import type { GameState, JournalEntry, SimEvent } from './types'

/** A run is a few thousand lines; this only stops a runaway from filling the save. */
export const JOURNAL_LIMIT = 20000

type Data = NonNullable<JournalEntry['data']>

/** Adds a line to the run's log. */
export function logEntry(state: GameState, kind: string, text: string, data?: Data): void {
  state.journal.push({ day: state.day, kind, text, cash: Math.round(state.money), ...(data ? { data } : {}) })
  if (state.journal.length > JOURNAL_LIMIT) state.journal.splice(0, state.journal.length - JOURNAL_LIMIT)
}

/** Logs what the sim reported on a day: stages, eras, hits, events on offer and notices. `from` is where the day's events begin. */
export function journalDay(state: GameState, from: number): void {
  for (const event of state.events.slice(from)) logSimEvent(state, event)
}

/** Logs one thing the sim reported: also used for what a command leaves behind (a launch that broke out). */
export function logSimEvent(state: GameState, event: SimEvent): void {
  switch (event.type) {
    case 'notice':
      logEntry(state, 'notice', event.text)
      break
    case 'stage':
      logEntry(state, 'stage', `Reached ${getStage(event.stage).name}`, { stage: event.stage })
      break
    case 'era':
      logEntry(state, 'era', `A new era began: ${ERAS[event.era]?.name ?? event.era}`, { era: event.era })
      break
    case 'breakout': {
      const product = state.products.find((p) => p.id === event.productId)
      logEntry(state, 'hit', `${product?.name ?? 'A product'} broke out`, { productId: event.productId })
      break
    }
    case 'offer':
      break
    case 'bankrupt':
      logEntry(state, 'end.bankrupt', 'The money ran out and stayed out')
      break
    case 'randomEvent': {
      const view = describePendingEvent(state)
      if (view) logEntry(state, 'event.offered', view.title, { text: view.text, choices: view.choices.map((c) => c.label + (c.disabled ? ' (unavailable)' : '')) })
      break
    }
    default:
      break
  }
}

/** A monthly snapshot of where the studio stands, so the decisions between two of them can be read against the numbers. */
export function journalMonth(state: GameState): void {
  const users = state.products.reduce((sum, p) => sum + p.users, 0)
  const revenueMult = statMultiplier(state, 'revenue')
  logEntry(state, 'month', 'Month end', {
    income: Math.round(dailyIncome(state)),
    burn: Math.round(monthlyBurn(state) / DAYS_PER_MONTH),
    reputation: Math.round(state.reputation),
    stage: getStage(state.stage).name,
    rank: playerRank(state),
    employees: state.employees.length,
    offices: state.offices.length,
    products: state.products.length,
    users: Math.round(users),
    lifetimeRevenue: Math.round(state.lifetimeRevenue),
    research: state.research.done.length,
    productList: state.products.map((p) => {
      const income = Math.round(productRevenue(p) * revenueMult)
      return `${p.name} (${p.productTypeId}, ${p.size}, ${Math.round(p.users)} users, $${income}/day, quality ${Math.round(p.quality)}${p.autoPromote ? `, auto-promote ${p.autoPromote}` : ''})`
    }),
  })
}

/** The most the studio ever earned in a day, from the monthly samples and today. */
export function peakIncome(state: GameState): number {
  return Math.round(Math.max(dailyIncome(state), ...state.history.map((h) => h.income)))
}

/** The people who have been here longest, as "Name (years)". */
export function longestServing(state: GameState, count = 3): string[] {
  return [...state.employees]
    .sort((a, b) => a.hiredDay - b.hiredDay)
    .slice(0, count)
    .map((e) => `${e.name} (${Math.round(((state.day - e.hiredDay) / (12 * DAYS_PER_MONTH)) * 10) / 10} years)`)
}

/** The run in one place: where it ended and what the studio looked like. */
export function runSummary(state: GameState): Record<string, string | number | boolean | string[]> {
  const best = [...state.products].sort((a, b) => b.users - a.users)[0]
  return {
    day: state.day,
    years: Math.round((state.day / (12 * DAYS_PER_MONTH)) * 10) / 10,
    ended: state.gameOver,
    stage: getStage(state.stage).name,
    money: Math.round(state.money),
    income: Math.round(dailyIncome(state)),
    lifetimeRevenue: Math.round(state.lifetimeRevenue),
    reputation: Math.round(state.reputation),
    rank: playerRank(state),
    employees: state.employees.length,
    offices: state.offices.length,
    productsLive: state.products.length,
    productsRetired: state.retired.length,
    productsShipped: state.shippedCount,
    hits: state.products.filter((p) => p.hit).length + state.retired.filter((p) => p.hit).length,
    bestProduct: best ? `${best.name} (${Math.round(best.users)} users)` : '',
    peakIncome: peakIncome(state),
    longestServing: longestServing(state),
    research: state.research.done,
  }
}

/** The whole log as a file to share: a summary, then every line in order. */
export function exportJournal(state: GameState): string {
  return JSON.stringify({ game: 'software-tycoon', version: state.version, exportedAt: new Date().toISOString(), summary: runSummary(state), journal: state.journal }, null, 1)
}
