/**
 * Products that exist to make the hit bigger. A Reach companion brings new people to the hit; a Keep companion makes
 * the hit's users stay and pay more. Each suits some kinds of hit, and is launched from the roadmap (`Companions`).
 */
export interface Companion {
  id: string
  role: 'reach' | 'keep'
  name: string
  blurb: string
  /** What kind of product it is. */
  productTypeId: string
  /** The kinds of hit it suits. */
  suits: readonly string[]
}

export const COMPANIONS: readonly Companion[] = [
  { id: 'mobile_app', role: 'reach', name: 'Mobile companion app', blurb: 'Reach: the hit in people\'s pockets', productTypeId: 'mobile_app', suits: ['web_app', 'saas_platform', 'marketplace_app', 'creative_suite', 'fintech_app', 'data_platform'] },
  { id: 'free_edition', role: 'reach', name: 'Free edition', blurb: 'Reach: a free way in for people who would never pay first', productTypeId: 'web_app', suits: ['dev_tool', 'saas_platform', 'cloud_platform', 'ai_product', 'data_platform'] },
  { id: 'creator_tool', role: 'reach', name: 'Creator tool', blurb: 'Reach: players make things, and bring their friends', productTypeId: 'creative_suite', suits: ['game', 'xr_experience', 'mobile_app'] },
  { id: 'pro_addon', role: 'keep', name: 'Pro add-on', blurb: 'Keep: more for the users who would pay more', productTypeId: 'saas_platform', suits: ['web_app', 'mobile_app', 'dev_tool', 'creative_suite', 'game', 'ai_product', 'xr_experience'] },
  { id: 'integrations', role: 'keep', name: 'Integrations marketplace', blurb: 'Keep: the hit plugged into everything else users run', productTypeId: 'marketplace_app', suits: ['saas_platform', 'dev_tool', 'cloud_platform', 'data_platform', 'fintech_app', 'ai_product', 'web_app'] },
  { id: 'analytics_addon', role: 'keep', name: 'Analytics add-on', blurb: 'Keep: users see what they get out of it', productTypeId: 'data_platform', suits: ['web_app', 'saas_platform', 'marketplace_app', 'fintech_app', 'mobile_app', 'cloud_platform'] },
]

export const getCompanion = (id: string): Companion | undefined => COMPANIONS.find((c) => c.id === id)
