import type { Region } from '@/lib/tycoon/sim/types'

export const REGION_NAME: Record<Region, string> = { us: 'US', eu: 'Europe' }

/**
 * What Europe makes of a feature, on top of what the audience itself thinks: the market asks for privacy,
 * compliance and local languages, and is cooler on the newest hype. Features left out count 1.
 */
export const EU_LIKES: Readonly<Record<string, number>> = {
  privacy: 1.3,
  encryption: 1.4,
  data_residency: 1.6,
  sso: 1.2,
  a11y: 1.3,
  localization: 1.4,
  kyc: 1.2,
  ai_assistant: 0.85,
  agents: 0.85,
  ml_recs: 0.85,
  payments: 0.95,
}

/** How big a product type's market is in Europe next to the US one; types left out count 0.7. */
export const EU_TYPE_SIZE: Readonly<Record<string, number>> = {
  web_app: 0.75,
  mobile_app: 0.8,
  dev_tool: 0.7,
  game: 0.8,
  saas_platform: 0.7,
  ai_product: 0.6,
  cloud_platform: 0.65,
  marketplace_app: 0.8,
  creative_suite: 0.75,
  fintech_app: 0.55,
  data_platform: 0.65,
  xr_experience: 0.7,
}

/** Europe's data rules: a product needs this feature before it can be localised for Europe. */
export const COMPLIANCE_FEATURE = 'privacy'
/** European users put up with this share of the bugs American ones do. */
export const EU_BUG_TOLERANCE = 0.6
/** Public complaints about bugs cost this many times the reputation for a product sold in Europe. */
export const EU_COMPLAINT_FACTOR = 2
/** A breach of a product sold in Europe also brings a regulator's fine of this many days of its European income. */
export const EU_BREACH_FINE_DAYS = 30

/** What each user pays in Europe, next to the US. */
export const EU_PAY = 0.9
