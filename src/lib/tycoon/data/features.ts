import type { Feature } from '@/lib/tycoon/sim/types'

export const FEATURES: readonly Feature[] = [
  { id: 'accounts', name: 'User accounts', cost: { design: 5, engineering: 20, qa: 8 }, value: 1, suits: ['web_app', 'mobile_app', 'saas_platform', 'ai_product', 'cloud_platform', 'marketplace_app', 'fintech_app', 'data_platform'] },
  { id: 'dark_mode', name: 'Dark mode', cost: { design: 12, engineering: 8, qa: 3 }, value: 1, suits: ['web_app', 'mobile_app', 'dev_tool', 'saas_platform', 'ai_product', 'cloud_platform', 'creative_suite', 'fintech_app', 'data_platform', 'xr_experience', 'marketplace_app'] },
  { id: 'notifications', name: 'Push notifications', cost: { design: 6, engineering: 15, qa: 6 }, value: 1, suits: ['mobile_app', 'web_app', 'game', 'marketplace_app', 'fintech_app'] },
  { id: 'payments', name: 'In-app payments', cost: { design: 8, engineering: 25, qa: 15 }, value: 2, suits: ['web_app', 'mobile_app', 'game', 'saas_platform', 'ai_product', 'marketplace_app', 'fintech_app'] },
  { id: 'search', name: 'Full-text search', cost: { design: 5, engineering: 25, qa: 8 }, value: 1, suits: ['web_app', 'saas_platform', 'dev_tool', 'ai_product', 'cloud_platform', 'marketplace_app', 'data_platform', 'creative_suite', 'fintech_app'] },
  { id: 'offline', name: 'Offline mode', cost: { design: 6, engineering: 30, qa: 12 }, value: 2, suits: ['mobile_app', 'dev_tool', 'game', 'creative_suite'] },
  { id: 'cloud_sync', name: 'Cloud sync', cost: { design: 4, engineering: 30, qa: 14 }, value: 2, suits: ['mobile_app', 'web_app', 'saas_platform', 'cloud_platform', 'creative_suite', 'fintech_app', 'data_platform', 'xr_experience'] },
  { id: 'analytics', name: 'Analytics dashboard', cost: { design: 15, engineering: 25, qa: 8 }, value: 2, suits: ['saas_platform', 'web_app', 'dev_tool', 'ai_product', 'cloud_platform', 'marketplace_app', 'data_platform', 'fintech_app'] },
  { id: 'api', name: 'Public API', cost: { design: 3, engineering: 30, qa: 12 }, value: 2, suits: ['dev_tool', 'saas_platform', 'ai_product', 'cloud_platform', 'marketplace_app', 'fintech_app', 'data_platform'] },
  { id: 'cli', name: 'Command-line interface', cost: { design: 2, engineering: 20, qa: 6 }, value: 1, suits: ['dev_tool'] },
  { id: 'plugins', name: 'Plugin system', cost: { design: 5, engineering: 40, qa: 16 }, value: 3, suits: ['dev_tool', 'saas_platform', 'game', 'cloud_platform', 'creative_suite', 'data_platform'] },
  { id: 'multiplayer', name: 'Multiplayer', cost: { design: 10, engineering: 45, qa: 20 }, value: 3, suits: ['game', 'xr_experience'] },
  { id: 'leaderboards', name: 'Leaderboards', cost: { design: 6, engineering: 15, qa: 5 }, value: 1, suits: ['game', 'mobile_app', 'xr_experience'] },
  { id: 'ai_assistant', name: 'AI assistant', cost: { design: 12, engineering: 40, qa: 18 }, value: 3, suits: ['web_app', 'saas_platform', 'dev_tool', 'mobile_app', 'ai_product', 'creative_suite', 'fintech_app', 'data_platform'] },
  { id: 'sso', name: 'Enterprise SSO', cost: { design: 2, engineering: 25, qa: 15 }, value: 2, suits: ['saas_platform', 'dev_tool', 'cloud_platform', 'marketplace_app', 'fintech_app', 'data_platform', 'creative_suite'] },
  { id: 'onboarding', name: 'Guided onboarding', cost: { design: 25, engineering: 10, qa: 5 }, value: 2, suits: ['web_app', 'mobile_app', 'saas_platform', 'ai_product', 'marketplace_app', 'fintech_app', 'creative_suite', 'xr_experience', 'data_platform'] },
  { id: 'localization', name: 'Localization', cost: { design: 10, engineering: 12, qa: 12 }, value: 1, suits: ['web_app', 'mobile_app', 'game', 'marketplace_app', 'fintech_app', 'creative_suite'] },
  { id: 'ci_integration', name: 'CI integration', cost: { design: 2, engineering: 20, qa: 8 }, value: 1, suits: ['dev_tool', 'data_platform'] },
  { id: 'a11y', name: 'Accessibility suite', cost: { design: 14, engineering: 10, qa: 12 }, value: 1, suits: ['web_app', 'mobile_app', 'dev_tool', 'game', 'saas_platform', 'ai_product', 'cloud_platform', 'marketplace_app', 'fintech_app', 'creative_suite', 'data_platform', 'xr_experience'], requiresResearch: 'ux_research' },
  { id: 'ml_recs', name: 'Recommendations (ML)', cost: { design: 6, engineering: 38, qa: 16 }, value: 3, suits: ['web_app', 'mobile_app', 'saas_platform', 'ai_product', 'marketplace_app', 'creative_suite', 'data_platform'], requiresResearch: 'ml_foundations' },
  { id: 'voice', name: 'Voice interface', cost: { design: 14, engineering: 30, qa: 14 }, value: 2, suits: ['mobile_app', 'game', 'web_app', 'ai_product', 'xr_experience'], requiresResearch: 'ml_foundations' },
  { id: 'realtime', name: 'Realtime collaboration', cost: { design: 10, engineering: 42, qa: 18 }, value: 3, suits: ['web_app', 'saas_platform', 'game', 'cloud_platform', 'creative_suite', 'xr_experience'], requiresResearch: 'realtime_stack' },
  { id: 'serverless', name: 'Serverless backend', cost: { design: 2, engineering: 32, qa: 14 }, value: 2, suits: ['web_app', 'saas_platform', 'dev_tool', 'cloud_platform', 'data_platform', 'fintech_app'], requiresResearch: 'cloud_infra' },
  { id: 'marketplace', name: 'Plugin marketplace', cost: { design: 10, engineering: 34, qa: 14 }, value: 3, suits: ['dev_tool', 'saas_platform', 'game', 'cloud_platform', 'creative_suite', 'data_platform'], requiresResearch: 'platform_apis' },
  { id: 'reviews', name: 'Ratings and reviews', cost: { design: 8, engineering: 22, qa: 8 }, value: 1, suits: ['marketplace_app', 'mobile_app', 'web_app', 'game'] },
  { id: 'escrow', name: 'Buyer protection', cost: { design: 6, engineering: 34, qa: 18 }, value: 2, suits: ['marketplace_app', 'fintech_app'] },
  { id: 'kyc', name: 'Identity checks', cost: { design: 10, engineering: 30, qa: 20 }, value: 2, suits: ['fintech_app', 'marketplace_app'] },
  { id: 'ledger', name: 'Double-entry ledger', cost: { design: 4, engineering: 38, qa: 22 }, value: 2, suits: ['fintech_app', 'saas_platform'] },
  { id: 'layers', name: 'Layers and masks', cost: { design: 24, engineering: 30, qa: 10 }, value: 2, suits: ['creative_suite'] },
  { id: 'export_formats', name: 'Export to anything', cost: { design: 6, engineering: 26, qa: 12 }, value: 1, suits: ['creative_suite', 'dev_tool', 'data_platform'] },
  { id: 'pipelines', name: 'Data pipelines', cost: { design: 6, engineering: 44, qa: 18 }, value: 3, suits: ['data_platform', 'cloud_platform', 'saas_platform'] },
  { id: 'bi_dashboards', name: 'Self-serve BI', cost: { design: 20, engineering: 34, qa: 12 }, value: 2, suits: ['data_platform', 'saas_platform'] },
  { id: 'encryption', name: 'End-to-end encryption', cost: { design: 4, engineering: 36, qa: 22 }, value: 2, suits: ['web_app', 'mobile_app', 'saas_platform', 'fintech_app', 'cloud_platform', 'data_platform', 'marketplace_app', 'ai_product'] },
  { id: 'data_residency', name: 'Data residency', cost: { design: 2, engineering: 30, qa: 16 }, value: 2, suits: ['cloud_platform', 'saas_platform', 'data_platform', 'fintech_app', 'ai_product'] },
  { id: 'agents', name: 'AI agents', cost: { design: 12, engineering: 48, qa: 22 }, value: 3, suits: ['ai_product', 'dev_tool', 'saas_platform', 'web_app', 'data_platform', 'fintech_app'], requiresResearch: 'agent_frameworks' },
  { id: 'spatial', name: 'Spatial mode', cost: { design: 18, engineering: 36, qa: 14 }, value: 2, suits: ['game', 'mobile_app', 'xr_experience', 'creative_suite'], requiresResearch: 'spatial_computing' },
  { id: 'hand_tracking', name: 'Hand tracking', cost: { design: 20, engineering: 40, qa: 16 }, value: 3, suits: ['xr_experience', 'game'], requiresResearch: 'spatial_computing' },
  { id: 'spatial_audio', name: 'Spatial audio', cost: { design: 14, engineering: 28, qa: 10 }, value: 2, suits: ['xr_experience', 'game'], requiresResearch: 'spatial_computing' },
]

const BY_ID = new Map(FEATURES.map((f) => [f.id, f]))

export function getFeature(id: string): Feature {
  const feature = BY_ID.get(id)
  if (!feature) throw new Error(`Unknown feature: ${id}`)
  return feature
}
