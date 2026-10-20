import { formatMoney } from '@/lib/tycoon/format'
import type { GameState } from '@/lib/tycoon/sim/types'
import { PRODUCT_TYPES } from './productTypes'
import { RESEARCH } from './research'

export interface MilestoneReward {
  money?: number
  reputation?: number
}

export interface Milestone {
  id: string
  name: string
  description: string
  reward: MilestoneReward
  check(state: GameState): boolean
}

/** Products you have shipped of these types, live or since retired or sold. */
const shippedType = (s: GameState, ...ids: string[]) => s.products.some((p) => ids.includes(p.productTypeId)) || s.retired.some((p) => ids.includes(p.productTypeId))

/** Products good enough to count toward the first volume goal; otherwise shipping junk in bulk would pay. */
export const GOOD_QUALITY = 60
const goodProducts = (s: GameState) => s.products.filter((p) => p.quality >= GOOD_QUALITY).length
/** Past products that paid their way: sold or retired after earning this much. */
const PAID_WAY = 10_000
/** Good live products plus the ones that have since left and paid their way: a studio with a portfolio ships one a year. */
const worthwhile = (s: GameState) => goodProducts(s) + s.retired.filter((p) => p.hit || p.totalRevenue >= PAID_WAY).length
/** Days one person has worked on one product, at most. */
const mostKnown = (s: GameState) => s.employees.reduce((most, e) => Math.max(most, ...Object.values(e.knowledge?.products ?? {})), 0)
const mostUsers = (s: GameState) => s.products.reduce((most, p) => Math.max(most, p.users), 0)
/** How long a product has to keep its users for the long-haul milestone. */
const EVERGREEN_DAYS = 720

export const MILESTONES: readonly Milestone[] = [
  { id: 'first_ship', name: 'Hello, world', description: 'Ship your first product.', reward: { money: 500 }, check: (s) => s.shippedCount >= 1 },
  { id: 'five_products', name: 'Getting the hang of it', description: `Ship 5 good products (quality ${GOOD_QUALITY}+).`, reward: { money: 1000 }, check: (s) => goodProducts(s) >= 5 },
  { id: 'ten_products', name: 'A proper catalogue', description: `Ship 10 good products (quality ${GOOD_QUALITY}+), counting past ones that paid their way.`, reward: { money: 2500 }, check: (s) => worthwhile(s) >= 10 },
  { id: 'twenty_products', name: 'Product machine', description: 'Ship 20 good products, counting past ones that paid their way.', reward: { money: 8000 }, check: (s) => worthwhile(s) >= 20 },
  { id: 'full_portfolio', name: 'A full shelf', description: 'Have 5 products live at once.', reward: { money: 4000 }, check: (s) => s.products.length >= 5 },
  { id: 'flagship', name: 'Flagship', description: 'Grow a product into a Flagship.', reward: { money: 8000, reputation: 2 }, check: (s) => s.products.some((p) => p.size === 'flagship') },
  { id: 'quality_90', name: 'Masterpiece', description: 'Ship a product with quality 90 or more.', reward: { reputation: 2 }, check: (s) => s.products.some((p) => p.quality >= 90) },
  { id: 'first_update', name: 'Version 1.1', description: 'Release an update for a live product.', reward: { money: 500 }, check: (s) => s.products.some((p) => p.updates.length > 0) },
  { id: 'users_10k', name: 'Ten thousand strong', description: 'Have 10,000 users on one product.', reward: { money: 2000 }, check: (s) => mostUsers(s) >= 10_000 },
  { id: 'users_100k', name: 'Big audience', description: 'Have 100,000 users on one product.', reward: { money: 12000 }, check: (s) => mostUsers(s) >= 100_000 },
  { id: 'bugs_25', name: 'Bug squasher', description: 'Fix 25 bugs.', reward: { money: 1000 }, check: (s) => s.bugsFixed >= 25 },
  { id: 'bugs_250', name: 'Exterminator', description: 'Fix 250 bugs.', reward: { money: 8000 }, check: (s) => s.bugsFixed >= 250 },
  {
    id: 'evergreen',
    name: 'Evergreen',
    description: 'Two years after a launch, still have 80% of the users that product can reach.',
    reward: { money: 8000, reputation: 3 },
    check: (s) => s.products.some((p) => s.day - p.releaseDay >= EVERGREEN_DAYS && p.users >= 0.8 * p.reach),
  },
  { id: 'first_promotion', name: 'Spread the word', description: 'Run a promotion.', reward: { money: 300 }, check: (s) => s.products.some((p) => p.boostUntil > 0) },
  { id: 'team_4', name: 'A real team', description: 'Have 4 people on the team: the garage is full.', reward: { money: 1000 }, check: (s) => s.employees.length >= 4 },
  { id: 'full_house', name: 'Full house', description: 'Fill an office: 12 people.', reward: { money: 10000 }, check: (s) => s.employees.length >= 12 },
  { id: 'europe', name: 'Across the Atlantic', description: 'Open the European market for a product.', reward: { money: 10000, reputation: 1 }, check: (s) => s.products.some((p) => (p.euShare ?? 0) > 0) },
  { id: 'both_markets', name: 'Both sides', description: 'Have 5,000 users on one product in each of the US and Europe.', reward: { money: 15000 }, check: (s) => s.products.some((p) => (p.euUsers ?? 0) >= 5000 && p.users - (p.euUsers ?? 0) >= 5000) },
  { id: 'know_audience', name: 'Know your audience', description: 'Study an audience: with an analyst or a commissioned study.', reward: { money: 1500 }, check: (s) => s.surveyed.length >= 1 },
  { id: 'old_hand', name: 'Old hand', description: 'Have someone who has spent 600 days working on one product.', reward: { money: 3000 }, check: (s) => mostKnown(s) >= 600 },
  { id: 'steering', name: 'Someone at the wheel', description: 'Have a product manager.', reward: { money: 3000 }, check: (s) => s.employees.some((e) => e.role === 'pm') },
  { id: 'licensed', name: 'Open for business', description: 'License a Flagship to other companies.', reward: { money: 6000 }, check: (s) => s.products.some((p) => p.licensed) },
  { id: 'cash_100k', name: 'Six figures', description: 'Hold $100,000.', reward: { money: 5000 }, check: (s) => s.money >= 100_000 },
  { id: 'cash_1m', name: 'Millionaire', description: 'Hold $1,000,000.', reward: { money: 50000 }, check: (s) => s.money >= 1_000_000 },
  { id: 'rep_50', name: 'Making a name', description: 'Reach reputation 50.', reward: { money: 5000 }, check: (s) => s.reputation >= 50 },
  { id: 'rep_100', name: 'Household name', description: 'Reach reputation 100.', reward: { money: 20000 }, check: (s) => s.reputation >= 100 },
  { id: 'ship_saas', name: 'Software as a service', description: 'Ship a SaaS Platform.', reward: { money: 5000 }, check: (s) => shippedType(s, 'saas_platform') },
  { id: 'frontier', name: 'On the frontier', description: 'Ship an AI Product or a Cloud Platform.', reward: { money: 25000 }, check: (s) => shippedType(s, 'ai_product', 'cloud_platform') },
  {
    id: 'every_type',
    name: 'Jack of all trades',
    description: 'Ship at least one of every product type.',
    reward: { money: 50000 },
    check: (s) => PRODUCT_TYPES.every((t) => shippedType(s, t.id)),
  },
  { id: 'research_5', name: 'Curious minds', description: 'Finish 5 pieces of research.', reward: { money: 5000 }, check: (s) => s.research.done.length >= 5 },
  {
    id: 'research_all',
    name: 'Know-it-all',
    description: 'Finish all the research.',
    reward: { money: 40000 },
    check: (s) => RESEARCH.every((n) => s.research.done.includes(n.id)),
  },
  { id: 'survive_3', name: 'Still standing', description: 'Keep the studio going for 3 years.', reward: { money: 10000 }, check: (s) => s.day >= 1080 },
  { id: 'survive_5', name: 'Veteran', description: 'Keep the studio going for 5 years.', reward: { money: 25000 }, check: (s) => s.day >= 1800 },
  { id: 'survive_10', name: 'Institution', description: 'Keep the studio going for 10 years.', reward: { money: 15000, reputation: 2 }, check: (s) => s.day >= 3600 },
  { id: 'survive_20', name: 'Legend', description: 'Keep the studio going for 20 years.', reward: { money: 40000, reputation: 3 }, check: (s) => s.day >= 7200 },
]

const BY_ID = new Map(MILESTONES.map((m) => [m.id, m]))

export function getMilestone(id: string): Milestone | undefined {
  return BY_ID.get(id)
}

export function rewardLabel(reward: MilestoneReward): string {
  const parts: string[] = []
  if (reward.money) parts.push(`+${formatMoney(reward.money)}`)
  if (reward.reputation) parts.push(`+${reward.reputation} reputation`)
  return parts.join(', ')
}
