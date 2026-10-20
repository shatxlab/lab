import type { Audience } from '@/lib/tycoon/sim/types'

/**
 * Two or three audiences for each product type. The wide ones are big and pay little, the narrow ones the
 * other way round; `likes` is what the player learns from feedback after a launch.
 */
export const AUDIENCES: readonly Audience[] = [
  {
    id: 'web_consumers',
    productTypeId: 'web_app',
    name: 'Everyday users',
    blurb: 'Everyone with a browser. They want it pleasant and easy, and they will not read a manual.',
    reach: 1.25,
    pay: 0.8,
    likes: { dark_mode: 1.6, onboarding: 1.7, notifications: 1.4, localization: 1.4, ml_recs: 1.4, sso: 0.5, api: 0.5, analytics: 0.6 },
  },
  {
    id: 'web_business',
    productTypeId: 'web_app',
    name: 'Small businesses',
    blurb: 'Owners who run a shop on it. They care about getting paid and knowing where things stand.',
    reach: 1,
    pay: 1,
    likes: { payments: 1.7, accounts: 1.5, analytics: 1.5, search: 1.4, cloud_sync: 1.3, dark_mode: 0.6 },
  },
  {
    id: 'web_teams',
    productTypeId: 'web_app',
    name: 'Working teams',
    blurb: 'Groups that live in it all day. They want it to do the busywork and let them work together.',
    reach: 0.7,
    pay: 1.45,
    likes: { realtime: 1.8, sso: 1.6, ai_assistant: 1.5, api: 1.4, analytics: 1.4, notifications: 0.7, dark_mode: 0.8 },
  },
  {
    id: 'mobile_everyday',
    productTypeId: 'mobile_app',
    name: 'Everyday phone users',
    blurb: 'A thumb and a spare minute. It has to be quick to love and nice to look at.',
    reach: 1.3,
    pay: 0.8,
    likes: { notifications: 1.6, onboarding: 1.6, dark_mode: 1.5, localization: 1.4, voice: 1.4, leaderboards: 1.2, sso: 0.5 },
  },
  {
    id: 'mobile_pros',
    productTypeId: 'mobile_app',
    name: 'People who work on the go',
    blurb: 'They depend on it away from a desk, and a flaky connection is their daily life.',
    reach: 0.9,
    pay: 1.2,
    likes: { offline: 1.7, cloud_sync: 1.6, ai_assistant: 1.5, payments: 1.4, a11y: 1.3, leaderboards: 0.5 },
  },
  {
    id: 'dev_hackers',
    productTypeId: 'dev_tool',
    name: 'Solo developers',
    blurb: 'They live in a terminal and bend their tools to fit. They notice every rough edge and forgive a missing logo.',
    reach: 1.3,
    pay: 0.7,
    likes: { cli: 1.8, plugins: 1.6, dark_mode: 1.5, offline: 1.3, sso: 0.4, analytics: 0.6 },
  },
  {
    id: 'dev_teams',
    productTypeId: 'dev_tool',
    name: 'Engineering teams',
    blurb: 'Groups that ship every day. They want it to slot into the way they already build and release.',
    reach: 1,
    pay: 1,
    likes: { ci_integration: 1.8, api: 1.6, search: 1.4, ai_assistant: 1.4, serverless: 1.3 },
  },
  {
    id: 'dev_enterprise',
    productTypeId: 'dev_tool',
    name: 'Large companies',
    blurb: 'Few of them, with budgets and a security department. They ask who can sign in and who can see what.',
    reach: 0.55,
    pay: 1.8,
    likes: { sso: 1.9, analytics: 1.6, a11y: 1.5, api: 1.4, ci_integration: 1.3, dark_mode: 0.5, cli: 0.6 },
  },
  {
    id: 'game_casual',
    productTypeId: 'game',
    name: 'Casual players',
    blurb: 'Play for ten minutes on the bus. They want to be shown what to do and brag to friends.',
    reach: 1.4,
    pay: 0.7,
    likes: { leaderboards: 1.7, notifications: 1.5, onboarding: 1.6, payments: 1.4, localization: 1.3, multiplayer: 0.8 },
  },
  {
    id: 'game_hardcore',
    productTypeId: 'game',
    name: 'Dedicated players',
    blurb: 'They put in hundreds of hours and want depth, other people, and room to make it their own.',
    reach: 0.8,
    pay: 1.3,
    likes: { multiplayer: 1.8, plugins: 1.6, realtime: 1.5, marketplace: 1.5, voice: 1.2, onboarding: 0.6, notifications: 0.6 },
  },
  {
    id: 'saas_startups',
    productTypeId: 'saas_platform',
    name: 'Startups',
    blurb: 'Small teams with no time. They want to be running by the afternoon and pay by card.',
    reach: 1.3,
    pay: 0.8,
    likes: { onboarding: 1.7, payments: 1.5, ai_assistant: 1.5, accounts: 1.4, search: 1.2, sso: 0.5 },
  },
  {
    id: 'saas_midmarket',
    productTypeId: 'saas_platform',
    name: 'Mid-sized firms',
    blurb: 'Growing companies that connect everything to everything and want to see how it is going.',
    reach: 1,
    pay: 1,
    likes: { analytics: 1.6, api: 1.5, plugins: 1.4, cloud_sync: 1.3, realtime: 1.3 },
  },
  {
    id: 'saas_enterprise',
    productTypeId: 'saas_platform',
    name: 'Large enterprises',
    blurb: 'Slow to choose and slow to leave. They check the boxes on a long form before anything else.',
    reach: 0.6,
    pay: 1.7,
    likes: { sso: 1.9, analytics: 1.6, a11y: 1.6, marketplace: 1.4, serverless: 1.3, onboarding: 0.7 },
  },
  {
    id: 'ai_everyday',
    productTypeId: 'ai_product',
    name: 'Curious everyone',
    blurb: 'People who just want to try it. Talking to it should feel natural and the first minute should delight.',
    reach: 1.3,
    pay: 0.8,
    likes: { onboarding: 1.6, voice: 1.6, ml_recs: 1.5, dark_mode: 1.4, accounts: 1.3, api: 0.6 },
  },
  {
    id: 'ai_builders',
    productTypeId: 'ai_product',
    name: 'People who build on it',
    blurb: 'They want to wire it into their own work, and they judge it by what they can plug in.',
    reach: 0.9,
    pay: 1.2,
    likes: { api: 1.8, ai_assistant: 1.5, ml_recs: 1.4, serverless: 1.4, search: 1.3, onboarding: 0.7 },
  },
  {
    id: 'ai_enterprise',
    productTypeId: 'ai_product',
    name: 'Large companies',
    blurb: 'Eager but careful. Where the data goes and who is allowed to ask matters more than the demo.',
    reach: 0.6,
    pay: 1.7,
    likes: { sso: 1.8, analytics: 1.6, a11y: 1.5, cloud_sync: 1.2, voice: 0.7 },
  },
  {
    id: 'cloud_startups',
    productTypeId: 'cloud_platform',
    name: 'Startups',
    blurb: 'Teams who want to ship without running servers, and to scale only when they have to.',
    reach: 1.2,
    pay: 0.8,
    likes: { serverless: 1.7, api: 1.5, onboarding: 1.5, payments: 1.2, sso: 0.6 },
  },
  {
    id: 'cloud_enterprise',
    productTypeId: 'cloud_platform',
    name: 'Large enterprises',
    blurb: 'They move whole data centres. Compliance, access control and a partner network decide the deal.',
    reach: 0.8,
    pay: 1.3,
    likes: { sso: 1.8, analytics: 1.6, marketplace: 1.5, a11y: 1.4, realtime: 1.2, onboarding: 0.7 },
  },
]

const BY_ID = new Map(AUDIENCES.map((a) => [a.id, a]))

export function getAudience(id: string): Audience {
  const audience = BY_ID.get(id)
  if (!audience) throw new Error(`Unknown audience: ${id}`)
  return audience
}

export function audiencesOf(productTypeId: string): Audience[] {
  return AUDIENCES.filter((a) => a.productTypeId === productTypeId)
}

const EVERYONE = { id: '', name: 'Everyone', blurb: '', reach: 1, pay: 1, likes: {} }

/** The audience a product or project is for: the one it names, else a neutral one (older saves have none). */
export function audienceFor(productTypeId: string, audienceId?: string): Audience {
  const named = audienceId ? BY_ID.get(audienceId) : undefined
  return named && named.productTypeId === productTypeId ? named : { ...EVERYONE, productTypeId }
}
