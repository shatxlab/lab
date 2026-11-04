/** Studio links are transient navigation, never saved company state. Keep old links working during regrouping. */
export type StudioTab = 'company' | 'industry' | 'journey' | 'products'
export type StudioLink = StudioTab | 'stats' | 'milestones'
export type StudioSection = 'metrics' | 'milestones' | 'ecosystem' | null

export function studioLocation(link: StudioLink | undefined, hasHit: boolean, managed: boolean): { tab: StudioTab; section: StudioSection } {
  if (link === 'stats') return { tab: 'company', section: 'metrics' }
  if (link === 'milestones') return { tab: 'journey', section: 'milestones' }
  if (link === 'products' && managed) return { tab: 'company', section: 'ecosystem' }
  return { tab: link ?? (hasHit ? 'company' : 'products'), section: null }
}
