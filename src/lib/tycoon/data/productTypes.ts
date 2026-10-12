import type { ProductType } from '@/lib/tycoon/sim/types'

export const PRODUCT_TYPES: readonly ProductType[] = [
  {
    id: 'web_app',
    name: 'Web App',
    unlockReputation: 0,
    era: 0,
    weights: { design: 0.3, engineering: 0.5, qa: 0.2 },
    baseTarget: { design: 40, engineering: 90, qa: 30 },
    audience: 16_500,
    revenuePerUser: 0.3,
    userNoun: 'users',
  },
  {
    id: 'mobile_app',
    name: 'Mobile App',
    unlockReputation: 10,
    era: 0,
    weights: { design: 0.4, engineering: 0.4, qa: 0.2 },
    baseTarget: { design: 60, engineering: 110, qa: 40 },
    audience: 43_000,
    revenuePerUser: 0.15,
    userNoun: 'users',
  },
  {
    id: 'dev_tool',
    name: 'Developer Tool',
    unlockReputation: 25,
    era: 0,
    weights: { design: 0.15, engineering: 0.6, qa: 0.25 },
    baseTarget: { design: 40, engineering: 150, qa: 60 },
    audience: 5_200,
    revenuePerUser: 1.5,
    userNoun: 'users',
  },
  {
    id: 'game',
    name: 'Game',
    unlockReputation: 40,
    era: 0,
    weights: { design: 0.4, engineering: 0.35, qa: 0.25 },
    baseTarget: { design: 100, engineering: 160, qa: 80 },
    audience: 71_000,
    revenuePerUser: 0.15,
    userNoun: 'players',
  },
  {
    id: 'saas_platform',
    name: 'SaaS Platform',
    unlockReputation: 60,
    era: 0,
    weights: { design: 0.25, engineering: 0.5, qa: 0.25 },
    baseTarget: { design: 140, engineering: 260, qa: 120 },
    audience: 1_800,
    revenuePerUser: 9,
    userNoun: 'subscribers',
  },
  {
    id: 'ai_product',
    name: 'AI Product',
    unlockReputation: 70,
    era: 3,
    requiresResearch: 'ml_foundations',
    weights: { design: 0.2, engineering: 0.55, qa: 0.25 },
    baseTarget: { design: 150, engineering: 360, qa: 160 },
    audience: 3_500,
    revenuePerUser: 6,
    userNoun: 'subscribers',
  },
  {
    id: 'cloud_platform',
    name: 'Cloud Platform',
    unlockReputation: 85,
    era: 2,
    requiresResearch: 'cloud_infra',
    weights: { design: 0.15, engineering: 0.55, qa: 0.3 },
    baseTarget: { design: 200, engineering: 480, qa: 240 },
    audience: 400,
    revenuePerUser: 72,
    userNoun: 'customers',
  },
]

const BY_ID = new Map(PRODUCT_TYPES.map((t) => [t.id, t]))

export function getProductType(id: string): ProductType {
  const type = BY_ID.get(id)
  if (!type) throw new Error(`Unknown product type: ${id}`)
  return type
}
