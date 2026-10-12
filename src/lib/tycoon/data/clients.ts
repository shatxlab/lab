import type { Skills } from '@/lib/tycoon/sim/types'

/** Small businesses and organisations that hire a studio for a job. */
export const CLIENTS: readonly string[] = [
  "Rosa's Bakery",
  'Greenleaf Dental',
  'Northside Gym',
  'Blue Harbor Hotel',
  'Pine & Co. Law',
  'City Library',
  'Maple Street School',
  'Brightside Florists',
  'Union Bike Shop',
  'Harbor Logistics',
  'Kettle & Crumb Café',
  'Summit Realty',
  'Lakeside Clinic',
  'Atlas Insurance',
  'Golden Gate Movers',
  'The Vinyl Vault',
  'Riverbend Council',
  'Orchard Farm Co-op',
  'Starlight Theatre',
  'Copperpot Kitchens',
]

export interface Job {
  /** What the client wants, as it reads after "Build ..." */
  title: string
  /** How the work splits between disciplines; sums to 1. */
  split: Skills
}

export const JOBS: readonly Job[] = [
  { title: 'a website', split: { design: 0.4, engineering: 0.4, qa: 0.2 } },
  { title: 'an online shop', split: { design: 0.3, engineering: 0.5, qa: 0.2 } },
  { title: 'a booking system', split: { design: 0.25, engineering: 0.5, qa: 0.25 } },
  { title: 'a mobile app', split: { design: 0.35, engineering: 0.45, qa: 0.2 } },
  { title: 'an internal dashboard', split: { design: 0.2, engineering: 0.6, qa: 0.2 } },
  { title: 'a data migration', split: { design: 0.05, engineering: 0.65, qa: 0.3 } },
  { title: 'a brand refresh', split: { design: 0.7, engineering: 0.2, qa: 0.1 } },
  { title: 'a test suite for their old system', split: { design: 0.05, engineering: 0.35, qa: 0.6 } },
  { title: 'an API integration', split: { design: 0.05, engineering: 0.7, qa: 0.25 } },
  { title: 'an accessibility audit', split: { design: 0.4, engineering: 0.15, qa: 0.45 } },
]
