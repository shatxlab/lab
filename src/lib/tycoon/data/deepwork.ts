import type { Discipline } from '@/lib/tycoon/sim/types'

/** What kind of work it is, which sets the skill of yours that counts and grows. */
export type DeepSkill = Discipline | 'analysis'

export interface DeepWorkKind {
  id: string
  name: string
  blurb: string
  skill: DeepSkill
  days: number
  /** What it needs to start, besides a hit: the nemesis, for studying them. */
  needsNemesis?: boolean
  /** What it gives when it works out, and what it costs when it does not, for the dialog. */
  reward: string
  failure: string
}

export const DEEP_WORK: readonly DeepWorkKind[] = [
  {
    id: 'signature',
    name: 'Design the signature feature',
    blurb: 'The one thing people will say your product is for. You design it yourself.',
    skill: 'design',
    days: 45,
    reward: 'fit up 6 (10 if bold)',
    failure: 'fit down 2',
  },
  {
    id: 'rewrite',
    name: 'Rewrite the core',
    blurb: 'The part everything stands on, written again with what you know now.',
    skill: 'engineering',
    days: 60,
    reward: 'most bugs gone, quality up 5 (8 if bold)',
    failure: 'bugs up 6',
  },
  {
    id: 'study',
    name: 'Study your rival',
    blurb: 'Weeks inside their product, their pricing and their people, looking for what they cannot do.',
    skill: 'analysis',
    days: 30,
    needsNemesis: true,
    reward: 'your rival set back 0.25 (0.4 if bold), and 30 insight',
    failure: 'your rival set back a little',
  },
  {
    id: 'story',
    name: 'Tell the story',
    blurb: 'Why it exists, written and told in your voice, to the press and to the people who matter.',
    skill: 'design',
    days: 30,
    reward: 'reputation up 10, the hit reaches 8% more (15% if bold)',
    failure: 'reputation down 2',
  },
]

export const getDeepWork = (id: string): DeepWorkKind | undefined => DEEP_WORK.find((k) => k.id === id)
