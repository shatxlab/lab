/** How much freedom an agent gets. More freedom does more work, costs more to run and goes wrong more often. */
export interface Autonomy {
  level: number
  name: string
  blurb: string
  /** How much of the agent's effect you get. */
  power: number
  /** What it costs to run, against the lowest level that is on. */
  cost: number
  /** The chance a month that it does something you wish it had not, before your safeguards. */
  risk: number
}

export const AUTONOMY: readonly Autonomy[] = [
  { level: 0, name: 'Off', blurb: 'Not running', power: 0, cost: 0, risk: 0 },
  { level: 1, name: 'Suggests', blurb: 'Drafts the work and waits for a person to approve every step', power: 0.4, cost: 1, risk: 0 },
  { level: 2, name: 'Acts, you review', blurb: 'Does the work and leaves it for a person to look over before it counts', power: 0.8, cost: 2.2, risk: 0.06 },
  { level: 3, name: 'Unattended', blurb: 'Does the work and ships it. Fast, costly, and nobody checks', power: 1.4, cost: 4, risk: 0.22 },
]

export type AgentEffect = 'speed' | 'fixes' | 'insight' | 'churn'

export interface AgentKind {
  id: string
  name: string
  blurb: string
  /** The first era (an index into ERAS) in which it exists. */
  era: number
  /** What it adds at full power, and which of the studio's numbers it moves. */
  effect: AgentEffect
  perPower: number
  /** What it costs a day at the lowest level that is on, for a studio of one; the bill grows with the team. */
  baseCost: number
  /** What it does when it goes wrong. */
  incident: string
}

export const AGENT_KINDS: readonly AgentKind[] = [
  { id: 'copilot', name: 'Code copilot', blurb: 'Writes and reviews code beside your people: every team works faster', era: 3, effect: 'speed', perPower: 0.1, baseCost: 12, incident: 'merged a confident change nobody read' },
  { id: 'analyst', name: 'Research analyst', blurb: 'Reads feedback and the market all day: more insight a day', era: 3, effect: 'insight', perPower: 1.2, baseCost: 10, incident: 'wrote a convincing report from data it made up' },
  { id: 'triage', name: 'Bug triager', blurb: 'Picks up bugs as they are reported and works on them: faster fixes', era: 4, effect: 'fixes', perPower: 0.5, baseCost: 8, incident: 'closed a pile of bugs with a fix that fixed something else' },
  { id: 'support', name: 'Support agent', blurb: 'Answers your hit\'s users at any hour: fewer of them leave', era: 6, effect: 'churn', perPower: 0.12, baseCost: 14, incident: 'told a thousand users something it should not have' },
]

export const getAgentKind = (id: string): AgentKind | undefined => AGENT_KINDS.find((k) => k.id === id)

/** The agent era's agents are sharper: this much more power from then on. */
export const AGENT_ERA = 6
export const AGENT_ERA_BOOST = 1.25
