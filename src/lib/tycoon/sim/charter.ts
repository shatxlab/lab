import { PROJECT_SIZES } from './balance'
import { fitOf } from './fit'
import { bugDensity, interest } from './products'
import { operatingCapacity, type ScaleRequirement } from './scale-readiness'
import { productService } from './services'
import { PROJECT_SIZE_IDS, type GameState } from './types'

/** Additional live IPO conditions only for personally funded charters. Standard/legacy rules are unchanged. */
export function charterRequirements(state: GameState): ScaleRequirement[] {
  const ambition = state.founding?.ambition
  if (!ambition) return []
  const hit = state.products.find((p) => p.id === state.signatureId && p.hit)
  if (!hit) return [{ id: 'charter_hit', label: 'Operate a live signature product for this charter', met: false,
    progress: 'No live flagship', remedy: 'Discover a real hit; a retired product or a purchased footprint is not product-market fit.' }]
  const size = ambition === 'modest' ? 'medium' : ambition === 'studio' ? 'large' : 'flagship'
  const profitDays = ambition === 'venture' ? 180 : 90
  const floors = ambition === 'modest' ? 1 : ambition === 'studio' ? 2 : 3
  const capacity = operatingCapacity(state)
  const fit = fitOf(state, hit), freshness = interest(hit, state.day), density = bugDensity(hit)
  const requirements: ScaleRequirement[] = [
    { id: 'charter_size', label: `Charter: ${PROJECT_SIZES[size].name}-or-larger signature product`,
      met: PROJECT_SIZE_IDS.indexOf(hit.size) >= PROJECT_SIZE_IDS.indexOf(size), progress: `${PROJECT_SIZES[hit.size].name} / ${PROJECT_SIZES[size].name}`,
      remedy: 'Pay to build/grow the signature product; a larger investment does not waive product scope.' },
    { id: 'charter_health', label: 'Charter: fit ≥50, freshness ≥60%, bug density <10',
      met: fit >= 50 && freshness >= 0.6 && density < 10,
      progress: `Fit ${fit.toFixed(1)}; freshness ${Math.round(freshness * 100)}%; bug density ${density.toFixed(1)}`,
      remedy: 'Keep relevant releases fresh and fix bugs. Prior charter recognition does not waive current health.' },
    { id: 'charter_floors', label: ambition === 'modest' ? 'Charter: one effective rented delivery floor' : `Charter: ${floors} output-capable rented floors`,
      met: ambition === 'modest' ? capacity.delivery.length >= 1 : capacity.capable.length >= floors,
      progress: `${ambition === 'modest' ? capacity.delivery.length : capacity.capable.length} / ${floors}`,
      remedy: 'Staff physical rented floors with effective output. Empty desks, training and nominal assignments are not capacity.' },
    { id: 'charter_profit', label: `Charter: ${profitDays} consecutive profitable days`, met: (state.profitDays ?? 0) >= profitDays,
      progress: `${state.profitDays ?? 0} / ${profitDays}`, remedy: 'Earn operating profit; transferred founder cash is not revenue.' },
  ]
  if (ambition !== 'modest') {
    const reliability = productService(state, hit, 'reliability')
    requirements.push({ id: 'charter_reliability', label: 'Charter: shared reliability coverage',
      met: reliability.provided >= reliability.demand,
      progress: `${reliability.provided.toFixed(2)} / ${reliability.demand.toFixed(2)} service points/day`,
      remedy: 'Dedicate real engineering/QA output to shared care; the same workers cannot deliver and supply reliability at once.' })
  }
  if (ambition === 'venture') requirements.push(
    { id: 'charter_europe', label: 'Charter: effective capacity in Europe', met: capacity.capable.some((o) => o.region === 'eu'),
      progress: `${capacity.capable.filter((o) => o.region === 'eu').length} output-capable European floors`,
      remedy: 'Hire a local European team; an empty European office is not capacity.' },
    { id: 'charter_rival', label: 'Charter: earn the existing 90-day rival lead', met: (state.nemesesBeaten ?? 0) > 0,
      progress: (state.nemesesBeaten ?? 0) > 0 ? 'beaten' : `${state.nemesis?.leadDays ?? 0} / 90 days`,
      remedy: 'Overtake the rival through the normal rivalry system; cash and charter recognition do not buy a win.' },
  )
  return requirements
}

export function charterBlocker(state: GameState): string | null {
  return charterRequirements(state).find((r) => !r.met)?.label ?? null
}
