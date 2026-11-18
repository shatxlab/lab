import type { Discipline } from '@/lib/tycoon/sim/types'

export interface Trait {
  id: string
  name: string
  description: string
  /** Relative chance when a person is generated. */
  weight: number
  /** Multiplies this person's output in one discipline. */
  speed?: Partial<Record<Discipline, number>>
  /** Multiplies all of this person's output. */
  allSpeed?: number
  /** Multiplies how fast this person's skills grow. */
  skillGain?: number
  /** Multiplies this person's market salary. */
  salary?: number
  /** Morale lost per workday while a project runs, on top of the usual drift. */
  moraleDrain?: number
  /** Added to every colleague's morale target. */
  teamMorale?: number
  /** Multiplies how fast every colleague's skills grow. */
  teamSkillGain?: number
}

export const TRAITS: readonly Trait[] = [
  {
    id: 'fast_learner',
    name: 'Fast learner',
    description: 'Still learning the ropes: 4% slower now, but skills grow 50% faster.',
    weight: 3,
    allSpeed: 0.96,
    skillGain: 1.5,
  },
  {
    id: 'perfectionist',
    name: 'Perfectionist',
    description: 'Obsessed with details: QA output +25%, other work 10% slower.',
    weight: 2,
    speed: { qa: 1.25, engineering: 0.9, design: 0.9 },
  },
  {
    id: 'workaholic',
    name: 'Workaholic',
    description: 'Works 10% faster, but burns out: morale drains while a project runs.',
    weight: 2,
    allSpeed: 1.1,
    moraleDrain: 0.6,
  },
  {
    id: 'team_player',
    name: 'Team player',
    description: "Chatty, but good for everyone's mood: 3% slower, +3 to colleagues' morale.",
    weight: 3,
    allSpeed: 0.97,
    teamMorale: 3,
  },
  {
    id: 'mentor',
    name: 'Mentor',
    description: 'Teaches the people around them: 6% slower, but colleagues learn 8% faster.',
    weight: 2,
    allSpeed: 0.94,
    teamSkillGain: 1.08,
  },
  {
    id: 'creative',
    name: 'Creative',
    description: 'Design output +20%, engineering 8% and QA 5% slower.',
    weight: 2,
    speed: { design: 1.2, engineering: 0.92, qa: 0.95 },
  },
  {
    id: 'coder',
    name: 'Lives in the editor',
    description: 'Engineering output +20%, QA 10% and design 5% slower.',
    weight: 2,
    speed: { engineering: 1.2, qa: 0.9, design: 0.95 },
  },
  {
    id: 'frugal',
    name: 'Easygoing about money',
    description: 'Asks for 10% less salary, and works 5% slower.',
    weight: 2,
    allSpeed: 0.95,
    salary: 0.9,
  },
]

/** What people from before traits existed have, and what tests use for a neutral colleague. */
export const NO_TRAIT_ID = 'none'
const NEUTRAL: Trait = { id: NO_TRAIT_ID, name: 'No particular quirks', description: '', weight: 0 }
const BY_ID = new Map(TRAITS.map((t) => [t.id, t]))

/** The trait with this id; unknown ids (from an older build) behave as no trait. */
export function getTrait(id: string): Trait {
  return BY_ID.get(id) ?? NEUTRAL
}

export function isKnownTrait(id: unknown): boolean {
  return typeof id === 'string' && (BY_ID.has(id) || id === NO_TRAIT_ID)
}
