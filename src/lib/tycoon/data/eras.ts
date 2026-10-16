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
]

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
