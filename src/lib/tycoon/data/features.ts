import type { Feature } from '@/lib/tycoon/sim/types'

export const FEATURES: readonly Feature[] = [
  { id: 'accounts', name: 'User accounts', cost: { design: 5, engineering: 20, qa: 8 }, value: 1, suits: ['web_app', 'mobile_app', 'saas_platform', 'ai_product', 'cloud_platform'] },
  { id: 'dark_mode', name: 'Dark mode', cost: { design: 12, engineering: 8, qa: 3 }, value: 1, suits: ['web_app', 'mobile_app', 'dev_tool', 'saas_platform', 'ai_product', 'cloud_platform'] },
  { id: 'notifications', name: 'Push notifications', cost: { design: 6, engineering: 15, qa: 6 }, value: 1, suits: ['mobile_app', 'web_app', 'game'] },
  { id: 'payments', name: 'In-app payments', cost: { design: 8, engineering: 25, qa: 15 }, value: 2, suits: ['web_app', 'mobile_app', 'game', 'saas_platform', 'ai_product'] },
  { id: 'search', name: 'Full-text search', cost: { design: 5, engineering: 25, qa: 8 }, value: 1, suits: ['web_app', 'saas_platform', 'dev_tool', 'ai_product', 'cloud_platform'] },
  { id: 'offline', name: 'Offline mode', cost: { design: 6, engineering: 30, qa: 12 }, value: 2, suits: ['mobile_app', 'dev_tool', 'game'] },
  { id: 'cloud_sync', name: 'Cloud sync', cost: { design: 4, engineering: 30, qa: 14 }, value: 2, suits: ['mobile_app', 'web_app', 'saas_platform', 'cloud_platform'] },
  { id: 'analytics', name: 'Analytics dashboard', cost: { design: 15, engineering: 25, qa: 8 }, value: 2, suits: ['saas_platform', 'web_app', 'dev_tool', 'ai_product', 'cloud_platform'] },
  { id: 'api', name: 'Public API', cost: { design: 3, engineering: 30, qa: 12 }, value: 2, suits: ['dev_tool', 'saas_platform', 'ai_product', 'cloud_platform'] },
  { id: 'cli', name: 'Command-line interface', cost: { design: 2, engineering: 20, qa: 6 }, value: 1, suits: ['dev_tool'] },
  { id: 'plugins', name: 'Plugin system', cost: { design: 5, engineering: 40, qa: 16 }, value: 3, suits: ['dev_tool', 'saas_platform', 'game', 'cloud_platform'] },
  { id: 'multiplayer', name: 'Multiplayer', cost: { design: 10, engineering: 45, qa: 20 }, value: 3, suits: ['game'] },
  { id: 'leaderboards', name: 'Leaderboards', cost: { design: 6, engineering: 15, qa: 5 }, value: 1, suits: ['game', 'mobile_app'] },
  { id: 'ai_assistant', name: 'AI assistant', cost: { design: 12, engineering: 40, qa: 18 }, value: 3, suits: ['web_app', 'saas_platform', 'dev_tool', 'mobile_app', 'ai_product'] },
  { id: 'sso', name: 'Enterprise SSO', cost: { design: 2, engineering: 25, qa: 15 }, value: 2, suits: ['saas_platform', 'dev_tool', 'cloud_platform'] },
  { id: 'onboarding', name: 'Guided onboarding', cost: { design: 25, engineering: 10, qa: 5 }, value: 2, suits: ['web_app', 'mobile_app', 'saas_platform', 'ai_product'] },
  { id: 'localization', name: 'Localization', cost: { design: 10, engineering: 12, qa: 12 }, value: 1, suits: ['web_app', 'mobile_app', 'game'] },
  { id: 'ci_integration', name: 'CI integration', cost: { design: 2, engineering: 20, qa: 8 }, value: 1, suits: ['dev_tool'] },
  { id: 'a11y', name: 'Accessibility suite', cost: { design: 14, engineering: 10, qa: 12 }, value: 1, suits: ['web_app', 'mobile_app', 'dev_tool', 'game', 'saas_platform', 'ai_product', 'cloud_platform'], requiresResearch: 'ux_research' },
  { id: 'ml_recs', name: 'Recommendations (ML)', cost: { design: 6, engineering: 38, qa: 16 }, value: 3, suits: ['web_app', 'mobile_app', 'saas_platform', 'ai_product'], requiresResearch: 'ml_foundations' },
  { id: 'voice', name: 'Voice interface', cost: { design: 14, engineering: 30, qa: 14 }, value: 2, suits: ['mobile_app', 'game', 'web_app', 'ai_product'], requiresResearch: 'ml_foundations' },
  { id: 'realtime', name: 'Realtime collaboration', cost: { design: 10, engineering: 42, qa: 18 }, value: 3, suits: ['web_app', 'saas_platform', 'game', 'cloud_platform'], requiresResearch: 'realtime_stack' },
  { id: 'serverless', name: 'Serverless backend', cost: { design: 2, engineering: 32, qa: 14 }, value: 2, suits: ['web_app', 'saas_platform', 'dev_tool', 'cloud_platform'], requiresResearch: 'cloud_infra' },
  { id: 'marketplace', name: 'Plugin marketplace', cost: { design: 10, engineering: 34, qa: 14 }, value: 3, suits: ['dev_tool', 'saas_platform', 'game', 'cloud_platform'], requiresResearch: 'platform_apis' },
]

const BY_ID = new Map(FEATURES.map((f) => [f.id, f]))

export function getFeature(id: string): Feature {
  const feature = BY_ID.get(id)
  if (!feature) throw new Error(`Unknown feature: ${id}`)
  return feature
}
