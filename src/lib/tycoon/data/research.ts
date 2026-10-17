import type { Stat } from '@/lib/tycoon/sim/types'
import { FEATURES } from './features'
import { PRODUCT_TYPES } from './productTypes'

export type Branch = 'design' | 'engineering' | 'qa' | 'business'

export const BRANCHES: readonly { id: Branch; name: string }[] = [
  { id: 'design', name: 'Design' },
  { id: 'engineering', name: 'Engineering' },
  { id: 'qa', name: 'Quality' },
  { id: 'business', name: 'Business' },
]

export interface ResearchNode {
  id: string
  name: string
  branch: Branch
  /** One line for the dialog; the unlocks are listed separately. */
  description: string
  cost: number
  /** Game days it takes once started. */
  days: number
  /** Research that must be finished first. */
  requires: string[]
  /** Not possible before this era (an index into ERAS); the technology doesn't exist yet. */
  era?: number
  /** Permanent multipliers, applied through `statMultiplier`. Content unlocks live on the features and types. */
  effects: { stat: Stat; mult: number }[]
  /** Something the game lets you do once it is done, named for the dialog (and checked in the sim by id). */
  ability?: string
}

export const RESEARCH: readonly ResearchNode[] = [
  // Design
  {
    id: 'ux_research',
    name: 'UX research lab',
    branch: 'design',
    description: 'Design work is 8% faster.',
    cost: 6000,
    days: 20,
    requires: [],
    effects: [{ stat: 'designSpeed', mult: 1.08 }],
  },
  {
    id: 'design_system',
    name: 'Design system',
    branch: 'design',
    description: 'Everything you ship looks more polished: +2% quality.',
    cost: 12000,
    days: 30,
    requires: ['ux_research'],
    effects: [{ stat: 'quality', mult: 1.02 }],
  },

  // Engineering
  {
    id: 'ci_pipeline',
    name: 'CI pipeline',
    branch: 'engineering',
    description: 'Engineering work is 8% faster.',
    cost: 6000,
    days: 20,
    requires: [],
    effects: [{ stat: 'engineeringSpeed', mult: 1.08 }],
  },
  {
    id: 'code_review',
    name: 'Code review culture',
    branch: 'engineering',
    description: 'People learn from each other: skills grow 20% faster.',
    cost: 12000,
    days: 30,
    requires: ['ci_pipeline'],
    effects: [{ stat: 'skillGain', mult: 1.2 }],
  },
  {
    id: 'ml_foundations',
    name: 'Machine learning',
    branch: 'engineering',
    description: 'Your engineers learn to build with models.',
    cost: 25000,
    days: 45,
    requires: ['ci_pipeline'],
    era: 3,
    effects: [],
  },
  {
    id: 'realtime_stack',
    name: 'Realtime stack',
    branch: 'engineering',
    description: 'Sockets, presence, and conflict-free sync.',
    cost: 15000,
    days: 30,
    requires: ['ci_pipeline'],
    era: 1,
    effects: [],
  },

  // Quality
  {
    id: 'test_automation',
    name: 'Test automation',
    branch: 'qa',
    description: 'QA work is 10% faster.',
    cost: 6000,
    days: 20,
    requires: [],
    effects: [{ stat: 'qaSpeed', mult: 1.1 }],
  },
  {
    id: 'beta_program',
    name: 'Beta program',
    branch: 'qa',
    description: 'Real users find the bugs first: +2% quality.',
    cost: 14000,
    days: 30,
    requires: ['test_automation'],
    effects: [{ stat: 'quality', mult: 1.02 }],
  },
  {
    id: 'incident_management',
    name: 'Incident management',
    branch: 'qa',
    description: 'Put a developer and a tester on call: every bug that is reported is picked up and fixed as it comes, and they work on their office\'s project when nothing is open.',
    cost: 30000,
    days: 40,
    requires: ['test_automation'],
    effects: [],
    ability: 'an on-call fixing pair',
  },
  {
    id: 'cloud_infra',
    name: 'Cloud infrastructure',
    branch: 'qa',
    description: 'Reliable, scalable hosting from day one.',
    cost: 22000,
    days: 40,
    requires: ['test_automation', 'ci_pipeline'],
    era: 2,
    effects: [],
  },

  // Business
  {
    id: 'marketing_dept',
    name: 'Marketing department',
    branch: 'business',
    description: 'Everything you sell earns 3% more.',
    cost: 10000,
    days: 25,
    requires: [],
    effects: [{ stat: 'revenue', mult: 1.03 }],
  },
  {
    id: 'brand_partnerships',
    name: 'Brand partnerships',
    branch: 'business',
    description: 'Everything you sell earns another 3% more.',
    cost: 20000,
    days: 40,
    requires: ['marketing_dept'],
    effects: [{ stat: 'revenue', mult: 1.03 }],
  },
  {
    id: 'payroll_automation',
    name: 'Payroll automation',
    branch: 'business',
    description: 'Less admin: wages cost 5% less.',
    cost: 8000,
    days: 20,
    requires: [],
    effects: [{ stat: 'wage', mult: 0.95 }],
  },
  {
    id: 'recruiting_network',
    name: 'Recruiting network',
    branch: 'business',
    description: 'Candidates arrive 6% more skilled.',
    cost: 9000,
    days: 20,
    requires: [],
    effects: [{ stat: 'candidateSkill', mult: 1.06 }],
  },
  {
    id: 'platform_apis',
    name: 'Platform APIs',
    branch: 'business',
    description: 'Open your products to third parties.',
    cost: 18000,
    days: 35,
    requires: ['marketing_dept'],
    effects: [],
  },
]

const BY_ID = new Map(RESEARCH.map((n) => [n.id, n]))

export function getResearch(id: string): ResearchNode | undefined {
  return BY_ID.get(id)
}

/** Names of the features and product types that finishing `id` makes available. */
export function unlocksOf(id: string): { features: string[]; productTypes: string[]; abilities: string[] } {
  return {
    abilities: BY_ID.get(id)?.ability ? [BY_ID.get(id)!.ability!] : [],
    features: FEATURES.filter((f) => f.requiresResearch === id).map((f) => f.name),
    productTypes: PRODUCT_TYPES.filter((t) => t.requiresResearch === id).map((t) => t.name),
  }
}
