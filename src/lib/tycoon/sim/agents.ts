import { eraIndexAt } from '@/lib/tycoon/data/eras'
import { AGENT_ERA, AGENT_ERA_BOOST, AGENT_KINDS, AUTONOMY, getAgentKind, type AgentKind } from '@/lib/tycoon/data/agents'
import {
  AGENT_BUGS,
  AGENT_COST_PEOPLE,
  AGENT_FIT_LOSS,
  AGENT_INSIGHT_LOSS,
  AGENT_OVERSIGHT,
  AGENT_OVERSIGHT_CAP,
  AGENT_QUALITY_LOSS,
  AGENT_ROLLBACK_DAYS,
  AGENT_RUNAWAY_DAYS,
  AGENT_RUNAWAY_MULT,
  AGENT_RUNAWAY_SHARE,
} from './balance'
import { offerEvent } from './events'
import { rand } from './rng'
import { fail, OK, type GameState, type Result } from './types'

/**
 * AI agents are tools you tune, not people you hire: each kind has a dial from Off to Unattended. More freedom means more of
 * its effect and a bigger bill, and a bigger chance it does something you wish it had not. Safeguards on the hit (monitoring,
 * test automation) cut that chance. What they add goes through `toolEffects`, next to the internal tools.
 */

/** The agents that exist in this era. */
export function availableAgents(state: Pick<GameState, 'day'>): AgentKind[] {
  const era = eraIndexAt(Math.max(state.day, 0))
  return AGENT_KINDS.filter((k) => k.era <= era)
}

export const levelOf = (state: Pick<GameState, 'agents'>, kindId: string): number => state.agents?.[kindId] ?? 0

/** How much of its effect a kind gives now. */
export function agentPower(state: Pick<GameState, 'agents' | 'day'>, kind: AgentKind): number {
  if (kind.era > eraIndexAt(Math.max(state.day, 0))) return 0
  const boost = eraIndexAt(Math.max(state.day, 0)) >= AGENT_ERA ? AGENT_ERA_BOOST : 1
  return AUTONOMY[levelOf(state, kind.id)].power * boost
}

/** What one kind costs a day at its level: more for a bigger team, and for a runaway loop while one lasts. */
export function agentCost(state: Pick<GameState, 'agents' | 'day' | 'employees' | 'billSpike'>, kind: AgentKind, level = levelOf(state, kind.id)): number {
  if (level === 0 || kind.era > eraIndexAt(Math.max(state.day, 0))) return 0
  const spike = state.billSpike && state.day < state.billSpike.until ? state.billSpike.mult : 1
  return kind.baseCost * AUTONOMY[level].cost * (1 + state.employees.length / AGENT_COST_PEOPLE) * spike
}

/** What the agents add up to: the studio-wide numbers they move, and what they cost a day. */
export function agentEffects(state: Pick<GameState, 'agents' | 'day' | 'employees' | 'billSpike'>): { speed: number; fixes: number; insight: number; churn: number; upkeep: number } {
  const total = { speed: 0, fixes: 0, insight: 0, churn: 0, upkeep: 0 }
  if (!state.agents) return total
  for (const kind of AGENT_KINDS) {
    if (levelOf(state, kind.id) === 0) continue
    total[kind.effect] += kind.perPower * agentPower(state, kind)
    total.upkeep += agentCost(state, kind)
  }
  return total
}

/** Turns an agent's dial. */
export function setAutonomy(state: GameState, kindId: string, level: number): Result {
  const kind = getAgentKind(kindId)
  if (!kind) return fail('Unknown agent')
  if (!availableAgents(state).includes(kind)) return fail(`${kind.name} does not exist yet`)
  if (!Number.isInteger(level) || level < 0 || level >= AUTONOMY.length) return fail('Unknown level')
  state.agents = { ...state.agents, [kindId]: level }
  return OK
}

/** The share of incidents your safeguards stop: monitoring, tests and resilience work on the hit. */
export function oversight(state: Pick<GameState, 'products' | 'signatureId'>): number {
  const built = state.products.find((p) => p.id === state.signatureId)?.built ?? []
  return Math.min(AGENT_OVERSIGHT_CAP, built.reduce((sum, id) => sum + (AGENT_OVERSIGHT[id] ?? 0), 0))
}

/** What all the agents cost a day. */
export const agentBill = (state: Pick<GameState, 'agents' | 'day' | 'employees' | 'billSpike'>): number => agentEffects(state).upkeep

/** What a rollback costs: some days of the whole bill. */
export const rollbackCost = (state: GameState): number => Math.round((agentBill(state) * AGENT_ROLLBACK_DAYS) / 10) * 10

/** Once a month, each agent with real freedom may do something you wish it had not; you decide what to do about it (`agent_incident`). */
export function agentsMonth(state: GameState): void {
  if (!state.agents || state.pendingEvent || state.gameOver) return
  for (const [index, kind] of AGENT_KINDS.entries()) {
    const level = levelOf(state, kind.id)
    if (level === 0 || kind.era > eraIndexAt(Math.max(state.day, 0))) continue
    const chance = AUTONOMY[level].risk * (1 - oversight(state))
    if (chance > 0 && rand(state) < chance) {
      offerEvent(state, 'agent_incident', { kind: index })
      return
    }
  }
}

/** What an incident does if you let it ride; returns a sentence for the news. */
export function incidentHits(state: GameState, kind: AgentKind): string {
  const hit = state.products.find((p) => p.id === state.signatureId) ?? state.products[0]
  switch (kind.effect) {
    case 'speed':
      if (hit) {
        hit.bugs += AGENT_BUGS / 2
        hit.quality = Math.max(0, hit.quality - AGENT_QUALITY_LOSS)
      }
      break
    case 'fixes':
      if (hit) hit.bugs += AGENT_BUGS
      break
    case 'insight':
      state.insight = Math.max(0, state.insight - AGENT_INSIGHT_LOSS)
      break
    case 'churn':
      if (hit?.fit !== undefined) hit.fit = Math.max(0, hit.fit - AGENT_FIT_LOSS)
      break
  }
  // Some incidents also run up the bill: a loop that never stops.
  if (rand(state) < AGENT_RUNAWAY_SHARE) {
    state.billSpike = { until: state.day + AGENT_RUNAWAY_DAYS, mult: AGENT_RUNAWAY_MULT }
    return `The ${kind.name.toLowerCase()} ${kind.incident}, and then ran in a loop all night. The bill is ${AGENT_RUNAWAY_MULT} times for ${AGENT_RUNAWAY_DAYS} days.`
  }
  return `The ${kind.name.toLowerCase()} ${kind.incident}.`
}

/** For the monthly log. */
export function agentFields(state: GameState): Record<string, string | number> {
  if (!state.agents) return {}
  const on = AGENT_KINDS.filter((k) => levelOf(state, k.id) > 0)
  if (on.length === 0) return {}
  return { agents: on.map((k) => `${k.id} ${AUTONOMY[levelOf(state, k.id)].name}`).join(', '), agentBill: Math.round(agentBill(state)), oversight: Math.round(oversight(state) * 100) }
}

