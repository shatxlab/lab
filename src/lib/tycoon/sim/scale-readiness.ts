import { FRESH_DAYS, PROJECT_SIZES, RELEASE_MIN_DAYS, SPEC_REWORK } from './balance'
import { fitOf } from './fit'
import { projectTarget } from './project'
import { bugDensity, interest } from './products'
import { capacityOf } from './scale'
import { operating, productService, serviceOutput } from './services'
import { estimateDaysAt, teamRate } from './work'
import { DISCIPLINES, type GameState } from './types'

export interface ScaleRequirement {
  id: string
  label: string
  met: boolean
  progress: string
  remedy: string
}

const count = (n: number) => Math.floor(n).toLocaleString('en-US')

/** Shared physical-capacity read model for scale steps and paid-company charters. */
export function operatingCapacity(state: GameState) {
  const offices = state.offices.filter((o) => o.kind === 'office')
  const capable = offices.filter((o) => {
    if (o.assignment?.kind === 'standing') return serviceOutput(state, o, o.assignment.service) > 0
    const rate = teamRate(state, o)
    return DISCIPLINES.some((d) => rate[d] > 0) || serviceOutput(state, o, 'research') > 0
  })
  const hit = state.products.find((p) => p.id === state.signatureId)
  if (!hit) return { capable, delivery: [], fastest: Infinity, cadence: 0 }
  const target = projectTarget(hit.productTypeId, [], 'update', hit.size)
  for (const d of DISCIPLINES) target[d] *= 1 + SPEC_REWORK
  const cadence = FRESH_DAYS * PROJECT_SIZES[hit.size].life
  const delivery = offices.filter((o) => o.assignment && o.assignment.kind !== 'standing' &&
    (!o.project || (o.project.kind === 'update' && o.project.parentId === hit.id)))
    .map((office) => ({ office, days: Math.max(RELEASE_MIN_DAYS, estimateDaysAt(target, teamRate(state, office, { typeId: hit.productTypeId, productId: hit.id }))) }))
  return { capable, delivery: delivery.filter((d) => d.days <= cadence).map((d) => d.office),
    fastest: delivery.length ? Math.min(...delivery.map((d) => d.days)) : Infinity, cadence }
}

/** Live operating gates, not titles, headcounts or an extra source of labour.
 * Stages already earned are never revoked; IPO's historical requirements are unchanged.
 * Capacity targets match the current chapter's existing user milestones, not future scale.
 * The first floor keeps its existing completed-Scale gate; health/shared-care gates start
 * only once headquarters can open a separate care floor (no expansion/coverage bootstrap trap).
 */
export function scaleRequirements(state: GameState, stage = state.stage): ScaleRequirement[] {
  if (!operating(state) || stage < 3 || stage > 5) return []
  const hit = state.products.find((p) => p.id === state.signatureId)
  if (!hit) return [{ id: 'operating_hit', label: 'Operate a live flagship ecosystem', met: false, progress: 'No live signature product', remedy: 'A retired signature cannot supply live operating readiness. Company retirement remains available.' }]
  // One complete physical floor must cover delivery scope; no borrowed or double-counted labour.
  const { fastest, cadence, capable } = operatingCapacity(state)
  const productive = capable.length
  const floors = stage - 2
  const capacityTarget = stage === 4 ? 1_000_000 : 3_000_000
  const capacity = capacityOf(hit)
  const fit = fitOf(state, hit)
  const freshness = interest(hit, state.day)
  const density = bugDensity(hit)
  const requirements: ScaleRequirement[] = [
    { id: 'delivery_capacity', label: 'Keep a delivery team capable of regular flagship releases',
      met: fastest <= cadence,
      progress: `${Number.isFinite(fastest) ? `${Math.ceil(fastest)} days` : 'No complete delivery team'} / ${Math.floor(cadence)}-day freshness window`,
      remedy: 'Assign a floor to the flagship or leave it available, with effective design, engineering and QA output. Estimate uses maintenance scope with maximum clarity rework, not daily variance; no helper floors are borrowed.' },
    { id: 'productive_floors', label: `Maintain effective capacity on ${floors} ${floors === 1 ? 'floor' : 'floors'}`,
      met: productive >= floors, progress: `${productive} / ${floors} output-capable floors`,
      remedy: 'An empty floor or a team entirely away in training provides no capacity. Staff builders or analysts with current output; full desks and arbitrary senior titles are not required.' },
  ]
  if (stage >= 4) requirements.push(
    { id: 'scale_capacity', label: `Provision servers for ${count(capacityTarget)} users`,
      met: capacity >= capacityTarget, progress: `${count(capacity)} / ${count(capacityTarget)} user capacity`,
      remedy: 'Complete Scale initiatives on the flagship. Product-size growth expands scope and opportunities, not server capacity.' },
    { id: 'operating_health', label: 'Keep the flagship healthy enough for organic momentum',
      met: fit >= 50 && freshness >= 0.6 && density < 10,
      progress: `Fit ${fit.toFixed(1)} / 50; freshness ${Math.round(freshness * 100)}% / 60%; bug density ${density.toFixed(1)} / below 10`,
      remedy: 'Ship relevant updates, restore freshness and fix bugs. Neglect can delay the next chapter; earned chapters are not revoked.' },
  )
  if (stage >= 4) {
    const service = productService(state, hit, 'reliability')
    requirements.push({ id: 'shared_reliability', label: 'Cover current flagship and companion reliability demand',
      met: service.provided >= service.demand,
      progress: `${service.provided.toFixed(2)} / ${service.demand.toFixed(2)} service points/day`,
      remedy: 'Reallocate a separate engineering/QA floor to shared reliability or reduce the bug backlog. Coverage uses effective output and live demand, not a nominal assignment.' })
  }
  if (stage === 5) requirements.push({ id: 'europe_capacity', label: 'Staff effective capacity in Europe',
    met: capable.some((o) => o.region === 'eu'), progress: `${capable.filter((o) => o.region === 'eu').length} output-capable European floors`,
    remedy: 'An empty European building is not operating capacity. Hire a local team with current delivery or analyst output.' })
  return requirements
}
