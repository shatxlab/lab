import type { Workstream } from '@/lib/tycoon/sim/types'
import { COMPANIONS } from './companions'

/** What a built item does to its product. Capacity, pay and churn are used by the sim as the product scales (`sim/scale.ts`). */
export interface ItemEffect {
  /** More users the servers hold. */
  capacity?: number
  /** A share more of what each user pays. */
  pay?: number
  /** A share more reach when it ships. */
  reach?: number
  /** A share of the users who leave that stay instead. */
  churn?: number
  /** Points of product–market fit won when it ships. */
  fit?: number
  /** A share of the open bugs fixed when it ships. */
  bugs?: number
  /** Points of quality gained when it ships. */
  quality?: number
  /** Internal tools, studio-wide: a share more progress on bug-fixing jobs, insight a day, a share faster work, morale points. */
  fixes?: number
  insight?: number
  speed?: number
  morale?: number
  /** What it costs to keep running, per day. */
  upkeep?: number
}

export interface WorkItem {
  id: string
  workstream: Exclude<Workstream, 'features'>
  /** For the item that launches a companion product: which one (`data/companions.ts`). */
  companionId?: string
  name: string
  blurb: string
  /** How much work it is, as a multiple of a maintenance release. */
  work: number
  /** The users the product needs before this makes sense. */
  minUsers: number
  effect: ItemEffect
}

export const WORK_ITEMS: readonly WorkItem[] = [
  { id: 'test_automation', workstream: 'quality', name: 'Test automation', blurb: 'Most open bugs fixed, and a steadier release after', work: 1.5, minUsers: 0, effect: { bugs: 0.5, quality: 3 } },
  { id: 'perf_pass', workstream: 'quality', name: 'Performance pass', blurb: 'Faster everywhere; fewer users give up', work: 1.5, minUsers: 20_000, effect: { quality: 4, churn: 0.1 } },
  { id: 'observability', workstream: 'quality', name: 'Monitoring and alerts', blurb: 'Problems are found before users find them', work: 2, minUsers: 100_000, effect: { bugs: 0.3, churn: 0.1 } },
  { id: 'chaos_testing', workstream: 'quality', name: 'Resilience testing', blurb: 'The product shrugs off a bad day', work: 2.5, minUsers: 1_000_000, effect: { quality: 3, churn: 0.15 } },

  { id: 'load_balancer', workstream: 'scale', name: 'Load balancing', blurb: 'The servers hold 300,000 more users', work: 1.5, minUsers: 0, effect: { capacity: 300_000 } },
  { id: 'db_sharding', workstream: 'scale', name: 'Sharded database', blurb: 'The servers hold 1.5 million more users', work: 2, minUsers: 200_000, effect: { capacity: 1_500_000 } },
  { id: 'cdn', workstream: 'scale', name: 'Content delivery network', blurb: 'The servers hold 5 million more users', work: 2.5, minUsers: 900_000, effect: { capacity: 5_000_000 } },
  { id: 'multi_cluster', workstream: 'scale', name: 'Multi-cluster hosting', blurb: 'The servers hold 15 million more users', work: 3, minUsers: 3_500_000, effect: { capacity: 15_000_000 } },
  { id: 'global_edge', workstream: 'scale', name: 'Global edge network', blurb: 'The servers hold 60 million more users', work: 4, minUsers: 12_000_000, effect: { capacity: 60_000_000 } },

  { id: 'onboarding_flow', workstream: 'growth', name: 'Onboarding that sticks', blurb: 'New users find their feet; a little more reach', work: 1, minUsers: 0, effect: { reach: 0.1, churn: 0.05 } },
  { id: 'referrals', workstream: 'growth', name: 'Invite a friend', blurb: 'Users bring users', work: 1.5, minUsers: 10_000, effect: { reach: 0.15 } },
  { id: 'performance_marketing', workstream: 'growth', name: 'Performance marketing', blurb: 'Paid reach, tuned week after week', work: 2, minUsers: 100_000, effect: { reach: 0.2 } },
  { id: 'partnerships', workstream: 'growth', name: 'Partner integrations', blurb: 'Other products send you their users', work: 3, minUsers: 1_000_000, effect: { reach: 0.25 } },

  { id: 'paid_plans', workstream: 'monetisation', name: 'Paid plans', blurb: 'Half as much again from each user', work: 1.5, minUsers: 5_000, effect: { pay: 0.5 } },
  { id: 'ads', workstream: 'monetisation', name: 'Advertising', blurb: 'A third more from each user, and some do not like it', work: 1, minUsers: 50_000, effect: { pay: 0.3, fit: -2 } },
  { id: 'business_tier', workstream: 'monetisation', name: 'Business tier', blurb: 'Teams pay twice what people do', work: 2.5, minUsers: 200_000, effect: { pay: 1 } },
  { id: 'enterprise_deals', workstream: 'monetisation', name: 'Enterprise contracts', blurb: 'Large customers on annual deals: three times the pay', work: 3.5, minUsers: 2_000_000, effect: { pay: 2 } },

  { id: 'admin_panel', workstream: 'tools', name: 'Admin panel', blurb: 'Support fixes bugs faster, for $40 a day', work: 1, minUsers: 20_000, effect: { fixes: 0.4, upkeep: 40 } },
  { id: 'analytics_pipeline', workstream: 'tools', name: 'Analytics pipeline', blurb: 'Insight 1.5 a day, for $60 a day', work: 1.5, minUsers: 50_000, effect: { insight: 1.5, upkeep: 60 } },
  { id: 'ci_pipeline', workstream: 'tools', name: 'Deploy pipeline', blurb: 'Every team works 10% faster, for $80 a day', work: 1.5, minUsers: 100_000, effect: { speed: 0.1, upkeep: 80 } },
  { id: 'hr_portal', workstream: 'tools', name: 'People portal', blurb: 'Happier people, +3 morale, for $30 a day', work: 1, minUsers: 100_000, effect: { morale: 3, upkeep: 30 } },

  { id: 'eu_payments', workstream: 'europe', name: 'Local payment methods', blurb: 'Europe pays the way it likes to', work: 1.5, minUsers: 0, effect: { reach: 0.1, pay: 0.05 } },
  { id: 'eu_datacentre', workstream: 'europe', name: 'European data centre', blurb: 'Faster at home, and room for 2 million more users', work: 2.5, minUsers: 0, effect: { capacity: 2_000_000, churn: 0.05 } },
  { id: 'eu_support', workstream: 'europe', name: 'Support in local languages', blurb: 'Fewer European users leave', work: 2, minUsers: 0, effect: { churn: 0.1, fit: 2 } },
]

/** The roadmap items that launch companion products, one for each (`data/companions.ts`). */
const COMPANION_ITEMS: readonly WorkItem[] = COMPANIONS.map((c) => ({
  id: `companion:${c.id}`,
  workstream: 'companions',
  companionId: c.id,
  name: c.name,
  blurb: c.blurb,
  work: 4,
  minUsers: 300_000,
  effect: {},
}))

/** Everything a roadmap can hold. */
export const ALL_ITEMS: readonly WorkItem[] = [...WORK_ITEMS, ...COMPANION_ITEMS]

export const getWorkItem = (id: string): WorkItem | undefined => ALL_ITEMS.find((i) => i.id === id)

export const WORKSTREAM_INFO: Record<Workstream, { name: string; blurb: string }> = {
  features: { name: 'Features', blurb: 'Ships the features you queue for it, one release after another' },
  quality: { name: 'Quality', blurb: 'Fixes bugs and speeds the product up; with the roadmap empty, polishing releases' },
  scale: { name: 'Scale', blurb: 'Builds the servers that hold more users' },
  growth: { name: 'Growth', blurb: 'Onboarding, marketing and partners that bring in users' },
  monetisation: { name: 'Monetisation', blurb: 'Plans, tiers and ads: what each user pays' },
  tools: { name: 'Internal tools', blurb: 'Tools for the studio itself: they earn nothing and cost to run, and make everything else easier' },
  companions: { name: 'Companions', blurb: 'Launches and looks after the products that make the hit bigger: a team off the hit is the price' },
  europe: { name: 'Europe', blurb: "Meets Europe's data rules, localises the product, then builds for European users" },
}

/** What a product's built items add up to. */
export function itemEffects(product: { built?: string[] }): Required<ItemEffect> {
  const total: Required<ItemEffect> = { capacity: 0, pay: 0, reach: 0, churn: 0, fit: 0, bugs: 0, quality: 0, fixes: 0, insight: 0, speed: 0, morale: 0, upkeep: 0 }
  for (const id of product.built ?? []) {
    const item = getWorkItem(id)
    if (!item) continue
    for (const key of Object.keys(total) as (keyof ItemEffect)[]) total[key] += item.effect[key] ?? 0
  }
  return total
}
