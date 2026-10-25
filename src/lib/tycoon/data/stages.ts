import { CAFE_JOBS, FIT_TAKEOFF, GARAGE_READY_MONEY, IPO_PROFIT_DAYS, IPO_REVENUE, IPO_USERS } from '@/lib/tycoon/sim/balance'
import { getWorkItem } from '@/lib/tycoon/data/workstreams'
import { trailingIncome } from '@/lib/tycoon/sim/economy'
import type { GameState } from '@/lib/tycoon/sim/types'

export interface StageGoal {
  id: string
  /** What to do, as a short instruction. */
  label: string
  check(state: GameState): boolean
  /** How far along it is, e.g. "1,240 / 3,000", for the journey tab. */
  progress?(state: GameState): string
}

export interface Stage {
  id: string
  name: string
  /** Where the studio stands, in a sentence. */
  blurb: string
  /** What reaching this stage opens up, for the celebration and the journey tab. */
  unlocks: string[]
  /** What it takes to move on to the next stage; the last stage has none. */
  goals: StageGoal[]
}

const count = (n: number) => Math.floor(n).toLocaleString('en-US')
/** Users of the studio's hit, its signature product. */
const hitUsers = (s: GameState) => s.products.find((p) => p.id === s.signatureId)?.users ?? 0

const upTo = (value: number, goal: number) => `${count(Math.min(value, goal))} / ${count(goal)}`
const realOffices = (s: GameState) => s.offices.filter((o) => o.kind === 'office').length

export const STAGES: readonly Stage[] = [
  {
    id: 'cafe',
    name: 'Two friends at a café',
    blurb: 'You and a friend, two laptops and a corner table, taking whatever small jobs come along.',
    unlocks: [],
    goals: [
      { id: 'cafe_jobs', label: `Deliver ${CAFE_JOBS} jobs for clients`, check: (s) => s.contractsDone >= CAFE_JOBS, progress: (s) => upTo(s.contractsDone, CAFE_JOBS) },
      {
        id: 'to_garage',
        label: `Save $${count(GARAGE_READY_MONEY)} and move into a garage`,
        check: (s) => s.offices.every((o) => o.kind !== 'cafe'),
        progress: (s) => `$${upTo(Math.max(0, s.money), GARAGE_READY_MONEY)}`,
      },
    ],
  },
  {
    id: 'garage',
    name: 'Garage startup',
    blurb: 'A couple of people in a garage, making small things and trying to cover the rent.',
    unlocks: ['A garage with four desks: room to hire two more people', 'Medium projects', 'Paying yourselves: half the market rate'],
    goals: [
      { id: 'ship_3', label: 'Ship 3 products', check: (s) => s.shippedCount >= 3, progress: (s) => upTo(s.shippedCount, 3) },
      { id: 'hit', label: `Make a product take off: a fit of ${FIT_TAKEOFF} with what its audience loves, in a market with room`, check: (s) => s.signatureId !== null },
    ],
  },
  {
    id: 'indie',
    name: 'Indie studio',
    blurb: 'People have started to notice. A real office would let the team grow.',
    unlocks: ['Moving out of the garage into a 12-desk office', 'Large projects, once you have moved'],
    goals: [{ id: 'moved_out', label: 'Move into an office', check: (s) => s.offices.every((o) => o.kind === 'office') }],
  },
  {
    id: 'breakout',
    name: 'First floor',
    blurb: 'The hit pays for a real office. Now make it big.',
    unlocks: ['Flagship projects', 'Workstreams for the hit: Scale, Growth and Monetisation, ranked on its roadmap'],
    goals: [
      { id: 'hit_200k', label: 'Grow your hit to 200,000 users', check: (s) => hitUsers(s) >= 200_000, progress: (s) => upTo(hitUsers(s), 200_000) },
      { id: 'first_scale', label: 'Build servers for your hit: finish a Scale item on its roadmap', check: (s) => (s.products.find((p) => p.id === s.signatureId)?.built ?? []).some((id) => getWorkItem(id)?.workstream === 'scale') },
      { id: 'team_12', label: 'Fill an office: a team of 12', check: (s) => s.employees.length >= 12, progress: (s) => upTo(s.employees.length, 12) },
    ],
  },
  {
    id: 'established',
    name: 'Headquarters',
    blurb: 'A company built around one product, with a building to match.',
    unlocks: [
      'More floors for headquarters, and a building in Europe',
      'Absorbing a rival that competes with your hit: its users move to the hit, its best people take your empty desks',
      'Internal tools and companion products on the roadmap',
    ],
    goals: [
      { id: 'hit_1m', label: 'Grow your hit to 1 million users', check: (s) => hitUsers(s) >= 1_000_000, progress: (s) => upTo(hitUsers(s), 1_000_000) },
      { id: 'two_offices', label: 'Run 2 full floors: 24 people', check: (s) => realOffices(s) >= 2 && s.employees.length >= 24, progress: (s) => `${realOffices(s)} floors, ${s.employees.length} / 24 people` },
      { id: 'income_30k', label: 'Earn $30,000 a day', check: (s) => trailingIncome(s) >= 30_000, progress: (s) => `$${upTo(trailingIncome(s), 30_000)}` },
    ],
  },
  {
    id: 'leader',
    name: 'Europe',
    blurb: 'The hit has outgrown home. Take it across the Atlantic.',
    unlocks: ['You become CEO and your friend CTO when the European office opens; one of your analysts becomes the hit\'s product manager'],
    goals: [
      { id: 'eu_office', label: 'Open a building in Europe', check: (s) => s.offices.some((o) => o.region === 'eu'), progress: (s) => (s.offices.some((o) => o.region === 'eu') ? 'open' : 'not yet') },
      { id: 'eu_localised', label: 'Localise your hit for Europe', check: (s) => (s.products.find((p) => p.id === s.signatureId)?.euShare ?? 0) > 0 },
      { id: 'hit_3m', label: 'Grow your hit to 3 million users', check: (s) => hitUsers(s) >= 3_000_000, progress: (s) => upTo(hitUsers(s), 3_000_000) },
      {
        id: 'nemesis',
        label: 'Overtake your rival: out-earn them by a fifth for 90 days',
        check: (s) => (s.nemesesBeaten ?? 0) > 0,
        progress: (s) => ((s.nemesesBeaten ?? 0) > 0 ? 'beaten' : s.nemesis ? `${s.nemesis.leadDays} / 90 days ahead` : 'no rival yet'),
      },
      { id: 'three_offices', label: 'Run 3 full floors: 36 people', check: (s) => realOffices(s) >= 3 && s.employees.length >= 36, progress: (s) => `${realOffices(s)} floors, ${s.employees.length} / 36 people` },
    ],
  },
  {
    id: 'giant',
    name: 'Global company',
    blurb: 'The hit is everywhere. These are the marks of a company ready to ring the bell.',
    unlocks: ['Taking the company public: the last ending, and the biggest'],
    // Nothing comes after this stage, so these are goals to chase, not gates; together they open the IPO.
    goals: [
      { id: 'hit_10m', label: 'Grow your hit to 10 million users', check: (s) => hitUsers(s) >= IPO_USERS, progress: (s) => upTo(hitUsers(s), IPO_USERS) },
      { id: 'billion', label: 'Earn $1 billion over the life of the company', check: (s) => s.lifetimeRevenue >= IPO_REVENUE, progress: (s) => `$${upTo(s.lifetimeRevenue, IPO_REVENUE)}` },
      { id: 'profit_year', label: 'Make a profit for a year', check: (s) => (s.profitDays ?? 0) >= IPO_PROFIT_DAYS, progress: (s) => upTo(s.profitDays ?? 0, IPO_PROFIT_DAYS) },
    ],
  },
]

export function getStage(index: number): Stage {
  return STAGES[Math.max(0, Math.min(index, STAGES.length - 1))]
}
