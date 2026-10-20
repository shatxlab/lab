import { dailyIncome } from '@/lib/tycoon/sim/economy'
import { productRevenue } from '@/lib/tycoon/sim/products'
import { playerRank, standings } from '@/lib/tycoon/sim/rivals'
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
const mostUsers = (s: GameState) => s.products.reduce((most, p) => Math.max(most, p.users), 0)
/** Products at least a year old that still earn this much a day: ones people rely on. */
const lasting = (s: GameState, perDay: number) => s.products.filter((p) => productRevenue(p) >= perDay && s.day - p.releaseDay >= 360).length
/** What the next two studios in the ranking earn together. */
const nextTwo = (s: GameState) =>
  standings(s)
    .filter((r) => r.id !== 0)
    .slice(0, 2)
    .reduce((sum, r) => sum + r.revenue, 0)
const upTo = (value: number, goal: number) => `${count(Math.min(value, goal))} / ${count(goal)}`
const realOffices = (s: GameState) => s.offices.filter((o) => o.kind === 'office').length
/** Days at the top of the ranking that make an industry leader a tech giant. */
const DAYS_AT_TOP = 360

export const STAGES: readonly Stage[] = [
  {
    id: 'garage',
    name: 'Garage startup',
    blurb: 'A couple of people in a garage, making small things and trying to cover the rent.',
    unlocks: [],
    goals: [
      { id: 'ship_3', label: 'Ship 3 products', check: (s) => s.shippedCount >= 3, progress: (s) => upTo(s.shippedCount, 3) },
      { id: 'users_5k', label: 'Have 5,000 users on one product', check: (s) => mostUsers(s) >= 5000, progress: (s) => upTo(mostUsers(s), 5000) },
      { id: 'client_jobs', label: 'Deliver 3 jobs for clients', check: (s) => s.contractsDone >= 3, progress: (s) => upTo(s.contractsDone, 3) },
    ],
  },
  {
    id: 'indie',
    name: 'Indie studio',
    blurb: 'People have started to notice. A real office would let the team grow.',
    unlocks: ['Moving out of the garage into a 12-desk office', 'Large projects, once you have moved'],
    goals: [
      { id: 'hit', label: 'Have a breakout hit (good launches make one likelier each time)', check: (s) => s.signatureId !== null },
      { id: 'moved_out', label: 'Move into an office (needs the hit)', check: (s) => s.offices.every((o) => o.kind !== 'garage') },
    ],
  },
  {
    id: 'breakout',
    name: 'Breakout studio',
    blurb: 'You have a hit, and it is what people know you for.',
    unlocks: ['Flagship projects'],
    goals: [
      {
        id: 'three_lasting',
        label: 'Have 3 products over a year old earning $300 a day each',
        check: (s) => lasting(s, 300) >= 3,
        progress: (s) => upTo(lasting(s, 300), 3),
      },
      { id: 'rep_70', label: 'Reach reputation 70', check: (s) => s.reputation >= 70, progress: (s) => upTo(s.reputation, 70) },
      { id: 'team_12', label: 'Fill an office: a team of 12', check: (s) => s.employees.length >= 12, progress: (s) => upTo(s.employees.length, 12) },
    ],
  },
  {
    id: 'established',
    name: 'Established company',
    blurb: 'A company with products people rely on, and the money to grow.',
    unlocks: ['Opening more offices'],
    goals: [
      { id: 'two_offices', label: 'Run 2 full offices: 24 people', check: (s) => realOffices(s) >= 2 && s.employees.length >= 24, progress: (s) => `${realOffices(s)} offices, ${s.employees.length} / 24 people` },
      { id: 'top_3', label: 'Reach the top 3 of the industry ranking', check: (s) => playerRank(s) <= 3, progress: (s) => `#${playerRank(s)}` },
      { id: 'income_15k', label: 'Earn $15,000 a day', check: (s) => dailyIncome(s) >= 15_000, progress: (s) => `$${upTo(dailyIncome(s), 15_000)}` },
    ],
  },
  {
    id: 'leader',
    name: 'Industry leader',
    blurb: 'One of the names everyone in the business knows.',
    unlocks: ['Buying out rival studios'],
    goals: [
      {
        id: 'number_one',
        label: 'Hold #1 in the industry ranking for a year as a leader',
        check: (s) => s.daysAtTop >= DAYS_AT_TOP,
        progress: (s) => (s.daysAtTop > 0 ? `${s.daysAtTop} / ${DAYS_AT_TOP} days` : `#${playerRank(s)} now`),
      },
      { id: 'three_offices', label: 'Run 3 full offices: 36 people', check: (s) => realOffices(s) >= 3 && s.employees.length >= 36, progress: (s) => `${realOffices(s)} offices, ${s.employees.length} / 36 people` },
      {
        id: 'two_rivals',
        label: 'Earn as much as the two biggest rivals put together',
        check: (s) => dailyIncome(s) >= nextTwo(s),
        progress: (s) => `$${count(dailyIncome(s))} vs $${count(nextTwo(s))} a day`,
      },
    ],
  },
  {
    id: 'giant',
    name: 'Tech giant',
    blurb: 'The top of the industry. Now stay there.',
    unlocks: [],
    goals: [],
  },
]

export function getStage(index: number): Stage {
  return STAGES[Math.max(0, Math.min(index, STAGES.length - 1))]
}
