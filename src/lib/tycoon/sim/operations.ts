import { audienceFor, audiencesOf } from '@/lib/tycoon/data/audiences'
import { companionLaunchForecast } from './companions'
import { getCompanion } from '@/lib/tycoon/data/companions'
import { getFeature } from '@/lib/tycoon/data/features'
import { COMPLIANCE_FEATURE } from '@/lib/tycoon/data/regions'
import { getWorkItem } from '@/lib/tycoon/data/workstreams'
import { COMPANION_KEEP_PAY, COMPANION_KEEP_RETENTION, COMPANION_REACH_BOOST, HOSTING_PER_USER_DAY, SPEC_BUGS, POLISH_BUG_RISK, RELEASE_MIN_DAYS } from './balance'
import { businessSnapshot, recordBusinessDecision } from './business-history'
import { candidates, clarityOf, describeProposal, releaseEffect, releaseScope } from './cycle'
import { logEntry } from './journal'
import { workersOf } from './offices'
import { type OperationInitiative, type OperationProposal, type StandingService } from './operating-contract'
import { budgetBlocker, estimateUpdateReach, growTarget, pivotTarget, startPivot, projectBudget, projectTarget, startLocalisation, startUpdate } from './project'
import { growBlocker, nextSize } from './lifecycle'
import { PROJECT_SIZES } from './balance'
import { itemBlocker, stepBlocker } from './roadmap'
import { COMPANION_SERVICE_DEMAND, companionServiceDemand, reliabilityProducts, serviceOutput, productService } from './services'
import { featureLock } from './unlocks'
import { estimateDaysAt, teamRate, expectedContribution } from './work'
import { DISCIPLINES, fail, OK, type GameState, type Office, type Product, type Proposal, type Result } from './types'

export type Initiative = OperationInitiative
export type OperationChoice = { kind: 'idle' } | { kind: 'standing'; service: StandingService['service']; productId: number }
  | { kind: 'initiative'; productId: number; proposal: { kind: Initiative; id: string } }

/** Product capabilities reserve product scope; each companion identity is reserved company-wide. */
export function initiativeBlocker(state: GameState, product: Product, proposal: { kind: Initiative; id: string }, except?: Office): string | null {
  if (proposal.kind === 'pivot') {
    if (product.hit) return 'A hit has found its people'
    if (product.pivoted) return 'It has pivoted once already'
    if (!audiencesOf(product.productTypeId).some((a) => a.id === proposal.id)) return 'Unknown audience'
    if (audienceFor(product.productTypeId, product.audienceId).id === proposal.id) return 'It is already for them'
    if (state.offices.some((o) => o !== except && o.project?.parentId === product.id)) return 'Finish other work on this product before pivoting it'
    return null
  }
  if (proposal.kind === 'grow') {
    if (proposal.id !== nextSize(product.size)) return 'Choose the next product size'
    if (!except) return 'Choose a delivery team'
    if (state.offices.some((o) => o !== except && o.project?.parentId === product.id)) return 'Finish other work on this product before growing it'
    return growBlocker(state, except, product, true)
  }
  for (const o of state.offices) {
    if (o === except || !o.project) continue
    const p = o.project
    const companion = proposal.kind === 'item' && getWorkItem(proposal.id)?.companionId
    if (companion && p.itemId && getWorkItem(p.itemId)?.companionId === companion) return 'This companion launch is already reserved'
    if (p.parentId !== product.id) continue
    if (p.grows || p.pivotsTo) return 'Another team is changing this product’s scope or audience'
    if ((proposal.kind === 'item' && p.itemId === proposal.id) || (proposal.kind === 'localise' && p.localises) ||
      ((proposal.kind === 'feature' || proposal.kind === 'compliance') && p.featureIds.includes(proposal.kind === 'compliance' ? COMPLIANCE_FEATURE : proposal.id)) ||
      (proposal.kind === 'polish' && p.polishes)) return 'Another team has reserved this initiative'
  }
  if (proposal.kind === 'item') {
    const item = getWorkItem(proposal.id)
    return item ? itemBlocker(state, product, item) : 'Unknown item'
  }
  if (proposal.kind === 'compliance' || proposal.kind === 'localise') return stepBlocker(state, product, proposal.kind)
  if (proposal.kind === 'polish') return null
  try {
    const feature = getFeature(proposal.id)
    if (!feature.suits.includes(product.productTypeId)) return 'Feature does not suit this product'
    return product.featureIds.includes(feature.id) ? 'Already built' : featureLock(state, feature)
  } catch { return 'Unknown feature' }
}

export function operationChoices(state: GameState, product: Product, office: Office): OperationProposal[] {
  const choices: OperationProposal[] = candidates(state, product).filter((p) => initiativeBlocker(state, product, p as { kind: Initiative; id: string }, office) === null)
    .sort((a, b) => b.weight - a.weight).map(({ kind, id, why }) => ({ kind: kind as Initiative, id, why }))
  const size = nextSize(product.size)
  if (!product.hit && !product.pivoted) for (const audience of audiencesOf(product.productTypeId)) {
    if (audience.id !== audienceFor(product.productTypeId, product.audienceId).id) choices.push({ kind: 'pivot', id: audience.id, why: 'Find a different audience for this retained product' })
  }
  if (size) choices.push({ kind: 'grow', id: size, why: 'Broader product scope and larger client opportunities' })
  return choices
}

export function operationPreview(state: GameState, office: Office, product: Product, proposal: { kind: Initiative; id: string }) {
  if (proposal.kind === 'grow' || proposal.kind === 'pivot') {
    const isPivot = proposal.kind === 'pivot'
    const audience = audiencesOf(product.productTypeId).find((a) => a.id === proposal.id)
    const next = nextSize(product.size)
    const scope = isPivot ? pivotTarget(product) : next ? growTarget(product.productTypeId, [], product.size, next) : { design: 0, engineering: 0, qa: 0 }
    const target = { ...scope }
    const rate = teamRate(state, office, { typeId: product.productTypeId, productId: product.id })
    const days = estimateDaysAt(target, rate)
    const cash = isPivot ? 0 : projectBudget(scope)
    const missing = DISCIPLINES.filter((d) => target[d] > 0 && rate[d] <= 0)
    return { title: isPivot ? `Pivot to ${audience?.name ?? 'unknown audience'}` : next ? `Grow to ${PROJECT_SIZES[next].name}` : 'Already a Flagship',
      effect: isPivot ? 'Keeps built capabilities but changes the audience at release; most current users leave, loyalty resets and the product launches again. A product can pivot only once. Not a guaranteed better fit.' : `Expands product scope at release and renews freshness; estimated reach +${Math.max(0, Math.round((estimateUpdateReach(state, product.id, [], true) / Math.max(1, product.reach) - 1) * 100))}%. Larger sizes open client opportunities; server capacity, fit and demand still govern users. Not a guaranteed return.`,
      companionForecast: null, warning: null, clarity: clarityOf(state, office), scope, target, rate, days, cash, upkeep: 0,
      blocker: initiativeBlocker(state, product, proposal, office) ?? (missing.length ? `Missing build skills: ${missing.join(', ')}` : budgetBlocker(state, cash)) }
  }
  const card: Proposal = { kind: proposal.kind, id: proposal.id, why: '' }
  // Validate identifiers before content getters; callers can preview stale/untrusted choices.
  const invalid = proposal.kind === 'item' && !getWorkItem(proposal.id) ? 'Unknown item' : proposal.kind === 'feature' && (() => { try { getFeature(proposal.id); return false } catch { return true } })() ? 'Unknown feature' : null
  if (invalid) return { companionForecast: null, warning: null, title: 'Unavailable initiative', effect: '', clarity: 0, scope: { design: 0, engineering: 0, qa: 0 }, target: { design: 0, engineering: 0, qa: 0 }, rate: { design: 0, engineering: 0, qa: 0 }, days: 0, cash: 0, upkeep: 0, blocker: invalid }
  const clarity = clarityOf(state, office)
  const scope = releaseScope(product, card, clarity)
  const target = { ...scope }
  const rate = teamRate(state, office, { typeId: product.productTypeId, productId: product.id })
  const units = proposal.kind === 'item' ? getWorkItem(proposal.id)?.work ?? 1 : 1
  for (const d of DISCIPLINES) if (scope[d] > 0) target[d] = Math.max(scope[d], rate[d] * RELEASE_MIN_DAYS * Math.min(2, units))
  const days = estimateDaysAt(target, rate)
  const cash = proposal.kind === 'localise' ? projectBudget(projectTarget(product.productTypeId, [], 'update', product.size)) : 0
  const missing = DISCIPLINES.filter((d) => target[d] > 0 && rate[d] <= 0)
  const companion = proposal.kind === 'item' ? getCompanion(getWorkItem(proposal.id)?.companionId ?? '') : undefined
  const forecast = companion ? companionLaunchForecast(state, companion, office.id) : null
  const companionEffect = companion ? `Launches ${companion.name}. At full shared care, while fresh and healthy: ${companion.role === 'reach' ? `+${Math.round(COMPANION_REACH_BOOST * 100)}% flagship reach` : `+${Math.round(COMPANION_KEEP_RETENTION * 100)}% retention and +${Math.round(COMPANION_KEEP_PAY * 100)}% pay`}. Medium-or-larger product scope or ${getWorkItem(proposal.id)!.minUsers.toLocaleString('en-US')} users opens this opportunity; type/era/reputation/research requirements still apply. No fixed companion-count limit in operating companies; effective shared care bounds value. Adds ${COMPANION_SERVICE_DEMAND} shared reliability service points/day, plus bug demand and hosting at $${HOSTING_PER_USER_DAY}/user/day. No coverage means no flagship bonus; upkeep does not refresh stale releases.` : null
  return { companionForecast: forecast, warning: forecast && forecast.coverage < 1 ? `Shared reliability would cover only ${Math.floor(forecast.coverage * 100)}% at today's demand after assigning this floor. Reallocate a separate care team or accept reduced companion value; existing products remain intact.` : null, title: describeProposal(card).title, effect: companionEffect ?? releaseEffect(state, office, product, card, clarity), clarity,
    scope, target, rate, days, cash, upkeep: proposal.kind === 'item' ? getWorkItem(proposal.id)?.effect.upkeep ?? 0 : 0,
    blocker: initiativeBlocker(state, product, proposal, office) ?? (missing.length ? `Missing build skills: ${missing.join(', ')}` : budgetBlocker(state, cash)) }
}

export function reassignmentCost(office: Office): string {
  if (office.project?.contract) return 'Client work must be explicitly abandoned first: return the deposit and lose reputation.'
  if (office.project) return 'Abandons this unfinished project and all its progress. Upfront costs are not refunded; payroll and rent continue.'
  if (office.assignment?.kind === 'standing') return `Stops ${office.assignment.service} coverage immediately. Payroll and rent continue.`
  return 'Uses only this floor’s team. Payroll, rent and existing upkeep continue; other teams keep working.'
}

/** Reassignment is explicit and atomic: preview/validate first, then release the old reservation. */
export function assignOperation(state: GameState, officeId: number, choice: OperationChoice, confirmed = false): Result {
  if (state.gameOver) return fail('Game over')
  const office = state.offices.find((o) => o.id === officeId)
  if (!office || office.kind !== 'office' || !office.assignment) return fail('Operations need an office')
  if (office.project?.contract) return fail(reassignmentCost(office))
  if ((office.project || office.assignment.kind !== 'idle') && !confirmed) return fail(reassignmentCost(office))
  if (choice.kind === 'idle') {
    office.project = null
    office.assignment = { kind: 'idle' }
    logEntry(state, 'operations.idle', `Floor ${office.id} is idle`)
    return OK
  }
  const product = state.products.find((p) => p.id === choice.productId)
  if (!product) return fail('Unknown product')
  if (choice.kind === 'standing') {
    if (!['reliability', 'growth', 'research'].includes(choice.service)) return fail('Unknown service')
    if (serviceOutput(state, office, choice.service) <= 0) return fail(choice.service === 'research' ? 'Needs an analyst or product manager' : 'Missing required service skills')
    office.project = null
    office.productId = product.id
    office.assignment = { ...choice, startedDay: state.day }
    logEntry(state, 'operations.standing', `Floor ${office.id}: ${choice.service} for ${product.name}`)
    return OK
  }
  const blocker = initiativeBlocker(state, product, choice.proposal, office)
  if (blocker) return fail(blocker)
  const preview = operationPreview(state, office, product, choice.proposal)
  if (preview.blocker) return fail(preview.blocker)
  const oldAssignment = office.assignment
  const old = office.project
  const before = businessSnapshot(state, product)
  office.project = null
  office.assignment = { kind: 'idle' }
  const result = choice.proposal.kind === 'localise' ? startLocalisation(state, product.id, office.id, true)
    : choice.proposal.kind === 'pivot' ? startPivot(state, product.id, choice.proposal.id, office.id, true)
    : startUpdate(state, product.id, choice.proposal.kind === 'feature' ? [choice.proposal.id] : choice.proposal.kind === 'compliance' ? [COMPLIANCE_FEATURE] : [], office.id, choice.proposal.kind === 'grow', true)
  if (!result.ok || !office.project) { office.project = old; office.assignment = oldAssignment; return result }
  // startUpdate mutates the office through a function; retain its new project, not the old narrowing.
  const project = (office as Office).project!
  project.byTeam = true
  project.target = preview.target
  project.scope = DISCIPLINES.reduce((sum, d) => sum + preview.scope[d], 0)
  project.bugRisk *= 1 + (1 - preview.clarity / 100) * SPEC_BUGS
  if (choice.proposal.kind === 'polish') { project.polishes = true; project.bugRisk *= POLISH_BUG_RISK }
  if (choice.proposal.kind === 'item') project.itemId = choice.proposal.id
  project.spec = { title: preview.title, bump: choice.proposal.kind === 'grow' || choice.proposal.kind === 'pivot' ? 'major' : describeProposal({ kind: choice.proposal.kind, id: choice.proposal.id, why: '' }).bump, clarity: preview.clarity, promise: preview.effect }
  project.name = `${product.name}: ${preview.title}` // Version is assigned at completion, never reserved at start.
  office.productId = product.id
  office.assignment = { kind: 'initiative', productId: product.id, proposal: { kind: choice.proposal.kind, id: choice.proposal.id }, projectId: project.id, startedDay: state.day }
  recordBusinessDecision(state, product, preview.title, 'release', before, project.id)
  logEntry(state, 'operations.initiative', `Floor ${office.id}: ${preview.title} for ${product.name}`, { projectId: project.id })
  return OK
}

/** v7 labour reservations collapse onto physical floors. No staff are deleted or moved across regions. */
export function initialiseOperations(state: GameState): void {
  if (state.signatureId === null || state.offices.some((o) => o.kind !== 'office')) return
  delete state.plan
  state.fixes = []
  state.onCall = null
  for (const person of state.employees) delete person.teamId
  for (const office of state.offices) {
    if (office.assignment) continue
    const p = office.project
    if (p?.kind === 'update' && p.parentId !== null) {
      const kind: Initiative = p.pivotsTo ? 'pivot' : p.grows ? 'grow' : p.localises ? 'localise' : p.itemId ? 'item' : p.polishes ? 'polish' : p.featureIds.includes(COMPLIANCE_FEATURE) ? 'compliance' : p.featureIds.length ? 'feature' : 'polish'
      office.assignment = { kind: 'initiative', productId: p.parentId, projectId: p.id, proposal: { kind, id: p.pivotsTo ?? p.grows ?? p.itemId ?? p.featureIds[0] ?? kind }, startedDay: Math.max(0, p.startDay) }
      // Preserve paid work, quality/scope and absolute progress, but remove the old helper/floor inflated remaining target.
      if (p.grows || p.pivotsTo) { p.byTeam = true; continue }
      const scope = releaseScope(state.products.find((product) => product.id === p.parentId)!, { kind: kind as Proposal['kind'], id: office.assignment.proposal.id, why: '' }, p.spec?.clarity ?? 0)
      const rate = teamRate(state, office, { typeId: p.productTypeId, productId: p.parentId })
      for (const d of DISCIPLINES) {
        const remainingShare = p.target[d] > 0 ? Math.max(0, 1 - p.progress[d] / p.target[d]) : 0
        p.target[d] = p.progress[d] + Math.max(scope[d], scope[d] > 0 ? rate[d] * RELEASE_MIN_DAYS : 0) * remainingShare
      }
      p.byTeam = true
    } else office.assignment = { kind: 'idle' }
  }
}

/** Standing work follows finite releases, before users/fit/revenue; it never also executes a project. */
export function standingDay(state: GameState): void {
  for (const office of state.offices) {
    const a = office.assignment
    if (a?.kind !== 'standing' || office.project) continue
    const product = state.products.find((p) => p.id === a.productId)
    if (!product) { office.assignment = { kind: 'idle' }; continue }
    const output = serviceOutput(state, office, a.service)
    if (a.service === 'reliability') {
      // Pay the shared care overhead once across all flagship reliability teams,
      // then split each team's remaining output proportionally. Never mint capacity per product.
      const total = productService(state, product, 'reliability').provided
      const available = output * (total > 0 ? Math.max(0, 1 - companionServiceDemand(state, product) / total) : 0)
      const products = reliabilityProducts(state, product)
      const bugs = products.reduce((sum, p) => sum + p.bugs, 0)
      const fixed = Math.min(bugs, available)
      if (bugs > 0) for (const p of products) p.bugs = Math.max(0, p.bugs - fixed * p.bugs / bugs)
      state.bugsFixed += fixed
    }
    for (const employee of workersOf(state, office)) state.dayWork.push({ employeeId: employee.id, points: expectedContribution(employee, state), fixing: a.service === 'reliability' })
    if (state.day % 30 === 0) {
      const service = productService(state, product, a.service)
      if (service.risk) state.events.push({ type: 'notice', text: `${product.name}: ${a.service} coverage ${service.provided.toFixed(1)}/${service.demand.toFixed(1)} ${service.unit}. ${service.risk}` })
    }
  }
}
