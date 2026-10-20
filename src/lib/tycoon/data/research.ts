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
  /** Not worth starting before the studio reaches this stage of its journey (an index into STAGES). */
  stage?: number
  /** Permanent multipliers, applied through `statMultiplier`. Content unlocks live on the features and types. */
  effects: { stat: Stat; mult: number }[]
  /** Can be done again and again, each time for a different subject; it never counts as done. */
  repeatable?: 'audience'
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
    id: 'marketing_automation',
    name: 'Marketing automation',
    branch: 'business',
    description: 'Set a product to promote itself whenever the bank can spare it, so you stop clicking Promote every month.',
    cost: 45000,
    days: 50,
    requires: ['brand_partnerships'],
    effects: [],
    ability: 'automatic promotion of a product',
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
    id: 'user_research',
    name: 'User research',
    branch: 'business',
    description: 'A desk for people who study users. Analysts gather insight that shows what an audience likes, and read launch feedback as it comes in.',
    cost: 15000,
    days: 30,
    requires: ['marketing_dept'],
    stage: 1,
    effects: [],
    ability: 'hiring analysts',
  },
  {
    id: 'product_management',
    name: 'Product management',
    branch: 'business',
    description: 'A senior analyst can become the product manager of an office: its products reach more people and break out more often.',
    cost: 30000,
    days: 45,
    requires: ['user_research'],
    stage: 2,
    effects: [],
    ability: 'product managers',
  },
  {
    id: 'audience_study',
    name: 'Audience study',
    branch: 'business',
    description: 'Commission a study of one audience: afterwards you see what it thinks of every feature. Can be done again for another audience.',
    cost: 12000,
    days: 25,
    requires: ['user_research'],
    stage: 1,
    repeatable: 'audience',
    effects: [],
    ability: 'studying an audience for money',
  },
  {
    id: 'enterprise_sales',
    name: 'Enterprise sales',
    branch: 'business',
    description: 'A sales team that lands big clients: enterprise contracts appear on the board, paid in proportion to the studio’s biggest products.',
    cost: 60000,
    days: 60,
    requires: ['brand_partnerships'],
    stage: 3,
    effects: [],
    ability: 'enterprise contracts',
  },
  {
    id: 'licensing',
    name: 'Licensing programme',
    branch: 'business',
    description: 'License a Flagship product to other companies: it pays a steady fee on top of what its own users bring.',
    cost: 90000,
    days: 70,
    requires: ['enterprise_sales'],
    stage: 4,
    effects: [],
    ability: 'licensing a flagship',
  },
  {
    id: 'knowledge_base',
    name: 'Knowledge base',
    branch: 'engineering',
    description: 'Write things down: when someone leaves, part of what they knew about your products stays with the team.',
    cost: 20000,
    days: 35,
    requires: ['code_review'],
    stage: 2,
    effects: [],
    ability: 'handing knowledge over',
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
  // Second and third steps of the plain speed lines: dearer, and they wait for later eras and a bigger studio.
  {
    id: 'security_practice',
    name: 'Security practice',
    branch: 'qa',
    description: 'Threat modelling and audits as a habit: +2% quality on everything you ship.',
    cost: 55000,
    days: 45,
    requires: ['test_automation_2'],
    era: 5,
    effects: [{ stat: 'quality', mult: 1.02 }],
  },
  {
    id: 'data_sovereignty',
    name: 'Data sovereignty',
    branch: 'business',
    description: 'Contracts and hosting in every jurisdiction: everything you sell earns another 3% more.',
    cost: 80000,
    days: 55,
    requires: ['security_practice', 'cloud_infra'],
    era: 8,
    effects: [{ stat: 'revenue', mult: 1.03 }],
  },
  {
    id: 'agent_frameworks',
    name: 'Agent frameworks',
    branch: 'engineering',
    description: 'Software that plans and acts on its own: your engineers learn to build with it.',
    cost: 70000,
    days: 50,
    requires: ['ml_foundations'],
    era: 6,
    effects: [],
  },
  {
    id: 'spatial_computing',
    name: 'Spatial computing',
    branch: 'engineering',
    description: 'Tracking, depth and sound in three dimensions.',
    cost: 80000,
    days: 55,
    requires: ['realtime_stack'],
    era: 7,
    effects: [],
  },
  {
    id: 'ux_research_2',
    name: 'UX research lab II',
    branch: 'design',
    description: 'Design work is another 6% faster.',
    cost: 20000,
    days: 35,
    requires: ['design_system'],
    era: 2,
    stage: 2,
    effects: [{ stat: 'designSpeed', mult: 1.06 }],
  },
  {
    id: 'ux_research_3',
    name: 'UX research lab III',
    branch: 'design',
    description: 'Design work is another 6% faster.',
    cost: 45000,
    days: 45,
    requires: ['ux_research_2'],
    era: 4,
    stage: 3,
    effects: [{ stat: 'designSpeed', mult: 1.06 }],
  },
  {
    id: 'ci_pipeline_2',
    name: 'CI pipeline II',
    branch: 'engineering',
    description: 'Engineering work is another 6% faster.',
    cost: 20000,
    days: 35,
    requires: ['code_review'],
    era: 2,
    stage: 2,
    effects: [{ stat: 'engineeringSpeed', mult: 1.06 }],
  },
  {
    id: 'ci_pipeline_3',
    name: 'CI pipeline III',
    branch: 'engineering',
    description: 'Engineering work is another 6% faster.',
    cost: 45000,
    days: 45,
    requires: ['ci_pipeline_2'],
    era: 4,
    stage: 3,
    effects: [{ stat: 'engineeringSpeed', mult: 1.06 }],
  },
  {
    id: 'test_automation_2',
    name: 'Test automation II',
    branch: 'qa',
    description: 'QA work is another 8% faster.',
    cost: 20000,
    days: 35,
    requires: ['beta_program'],
    era: 2,
    stage: 2,
    effects: [{ stat: 'qaSpeed', mult: 1.08 }],
  },
  {
    id: 'test_automation_3',
    name: 'Test automation III',
    branch: 'qa',
    description: 'QA work is another 8% faster.',
    cost: 45000,
    days: 45,
    requires: ['test_automation_2'],
    era: 4,
    stage: 3,
    effects: [{ stat: 'qaSpeed', mult: 1.08 }],
  },
  {
    id: 'brand_partnerships_2',
    name: 'Global partnerships',
    branch: 'business',
    description: 'Everything you sell earns another 3% more.',
    cost: 50000,
    days: 50,
    requires: ['marketing_automation'],
    era: 3,
    stage: 3,
    effects: [{ stat: 'revenue', mult: 1.03 }],
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
