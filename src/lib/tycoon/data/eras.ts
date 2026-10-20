import { DAYS_PER_MONTH } from '@/lib/tycoon/sim/balance'

export interface Era {
  id: string
  name: string
  /** The year (counting from 1) it begins. */
  startYear: number
  /** What changes, in a sentence for the news. */
  blurb: string
  /** Where demand for each product type settles during this era; types left out settle at 1. */
  demand: Partial<Record<string, number>>
  /** Features users of a type now take for granted: a product without them reaches fewer people. */
  expected: Partial<Record<string, readonly string[]>>
}

/** What users expect once the platform age has arrived; later eras add to it. */
const PLATFORM_EXPECTED: Era['expected'] = {
  web_app: ['accounts', 'cloud_sync', 'ai_assistant'],
  mobile_app: ['notifications', 'cloud_sync', 'ai_assistant'],
  saas_platform: ['accounts', 'sso', 'ai_assistant'],
  dev_tool: ['ci_integration', 'ai_assistant'],
  game: ['multiplayer'],
  cloud_platform: ['api'],
}

export const ERAS: readonly Era[] = [
  {
    id: 'web',
    name: 'The web years',
    startYear: 1,
    blurb: 'Everyone wants a website, and the tools to build one.',
    demand: { web_app: 1.15, dev_tool: 1.05 },
    expected: {},
  },
  {
    id: 'apps',
    name: 'The app boom',
    startYear: 3,
    blurb: 'Phones are everywhere: mobile apps and games are in demand. People now expect accounts on the web and notifications on their phones.',
    demand: { mobile_app: 1.3, game: 1.2, web_app: 0.95 },
    expected: { web_app: ['accounts'], mobile_app: ['notifications'] },
  },
  {
    id: 'cloud',
    name: 'The cloud years',
    startYear: 5,
    blurb: 'Businesses move online: SaaS and cloud platforms are hot, and everything is expected to sync.',
    demand: { saas_platform: 1.25, cloud_platform: 1.3, web_app: 0.9 },
    expected: {
      web_app: ['accounts', 'cloud_sync'],
      mobile_app: ['notifications', 'cloud_sync'],
      saas_platform: ['accounts', 'sso'],
      dev_tool: ['ci_integration'],
    },
  },
  {
    id: 'ai',
    name: 'The AI wave',
    startYear: 7,
    blurb: 'Machine learning goes mainstream: AI products are the hottest thing around, and users expect an assistant in their apps.',
    demand: { ai_product: 1.45, saas_platform: 1.1, web_app: 0.85 },
    expected: {
      web_app: ['accounts', 'cloud_sync', 'ai_assistant'],
      mobile_app: ['notifications', 'cloud_sync', 'ai_assistant'],
      saas_platform: ['accounts', 'sso', 'ai_assistant'],
      dev_tool: ['ci_integration', 'ai_assistant'],
    },
  },
  {
    id: 'platforms',
    name: 'The platform age',
    startYear: 9,
    blurb: 'The giants are platforms now: cloud, AI and developer tools lead, and games are expected to be played together.',
    demand: { cloud_platform: 1.3, ai_product: 1.2, dev_tool: 1.15, web_app: 0.8 },
    expected: {
      web_app: ['accounts', 'cloud_sync', 'ai_assistant'],
      mobile_app: ['notifications', 'cloud_sync', 'ai_assistant'],
      saas_platform: ['accounts', 'sso', 'ai_assistant'],
      dev_tool: ['ci_integration', 'ai_assistant'],
      game: ['multiplayer'],
      cloud_platform: ['api'],
    },
  },
  {
    id: 'trust',
    name: 'The trust years',
    startYear: 11,
    blurb: 'Customers and regulators ask who holds their data. Fintech and SaaS lead, and anything that keeps secrets is expected to encrypt them.',
    demand: { fintech_app: 1.3, saas_platform: 1.15, data_platform: 1.1, game: 0.9, web_app: 0.8 },
    expected: grow(PLATFORM_EXPECTED, {
      saas_platform: ['encryption'],
      cloud_platform: ['encryption'],
      fintech_app: ['payments', 'encryption'],
      data_platform: ['encryption'],
    }),
  },
  {
    id: 'agents',
    name: 'The agent era',
    startYear: 13,
    blurb: 'Software that acts on its own is the new normal. AI products and developer tools lead, and users expect agents in everything they pay for.',
    demand: { ai_product: 1.4, dev_tool: 1.25, saas_platform: 1.1, web_app: 0.75 },
    expected: grow(PLATFORM_EXPECTED, {
      saas_platform: ['encryption', 'agents'],
      cloud_platform: ['encryption'],
      fintech_app: ['payments', 'encryption'],
      data_platform: ['encryption', 'agents'],
      ai_product: ['agents'],
      dev_tool: ['agents'],
    }),
  },
  {
    id: 'spatial',
    name: 'The spatial years',
    startYear: 15,
    blurb: 'Headsets are in living rooms and offices. XR and games lead, and phones are expected to see the room around them.',
    demand: { xr_experience: 1.5, game: 1.2, creative_suite: 1.15, mobile_app: 0.9 },
    expected: grow(PLATFORM_EXPECTED, {
      saas_platform: ['encryption', 'agents'],
      cloud_platform: ['encryption'],
      fintech_app: ['payments', 'encryption'],
      data_platform: ['encryption', 'agents'],
      ai_product: ['agents'],
      dev_tool: ['agents'],
      game: ['spatial'],
      xr_experience: ['spatial', 'spatial_audio'],
    }),
  },
  {
    id: 'sovereign',
    name: 'The sovereign cloud',
    startYear: 17,
    blurb: 'Every country wants its data at home. Cloud and data platforms lead, and anything enterprises buy has to say where it lives.',
    demand: { data_platform: 1.4, cloud_platform: 1.25, fintech_app: 1.1, xr_experience: 1.1, ai_product: 0.95 },
    expected: grow(PLATFORM_EXPECTED, {
      saas_platform: ['encryption', 'agents', 'data_residency'],
      cloud_platform: ['encryption', 'data_residency'],
      fintech_app: ['payments', 'encryption', 'data_residency'],
      data_platform: ['encryption', 'agents', 'pipelines', 'data_residency'],
      ai_product: ['agents'],
      dev_tool: ['agents'],
      game: ['spatial'],
      xr_experience: ['spatial', 'spatial_audio'],
    }),
  },
]

/** The eras' own words for what is taken for granted: `base` plus what a later era adds to the lists, type by type. */
function grow(base: Era['expected'], add: Era['expected']): Era['expected'] {
  const merged: Partial<Record<string, readonly string[]>> = { ...base }
  for (const [type, ids] of Object.entries(add)) merged[type] = [...new Set([...(base[type] ?? []), ...(ids ?? [])])]
  return merged
}

/** The era's name in mid-sentence: "the AI wave", not "The AI wave" and not "the ai wave". */
export function eraPhrase(era: Era): string {
  return era.name.replace(/^The /, 'the ')
}

const DAYS_PER_YEAR = 12 * DAYS_PER_MONTH

/** The index into ERAS of the era `day` falls in. */
export function eraIndexAt(day: number): number {
  const year = Math.floor(day / DAYS_PER_YEAR) + 1
  let index = 0
  ERAS.forEach((era, i) => {
    if (year >= era.startYear) index = i
  })
  return index
}

export function eraAt(day: number): Era {
  return ERAS[eraIndexAt(day)]
}

/** Features a product of this type is expected to have on `day`. */
export function expectedFeatures(productTypeId: string, day: number): readonly string[] {
  return eraAt(day).expected[productTypeId] ?? []
}
