import { getFeature } from '@/lib/tycoon/data/features'
import { COMPLIANCE_FEATURE } from '@/lib/tycoon/data/regions'
import { getWorkItem } from '@/lib/tycoon/data/workstreams'
import { SPEC_BUGS, POLISH_BUG_RISK, RELEASE_MIN_DAYS } from './balance'
import { businessSnapshot, recordBusinessDecision } from './business-history'
import { candidates, clarityOf, describeProposal, releaseEffect, releaseScope } from './cycle'
import { logEntry } from './journal'
import { workersOf } from './offices'
import { type StandingService } from './operating-contract'
import { budgetBlocker, projectBudget, projectTarget, startLocalisation, startUpdate } from './project'
import { itemBlocker, stepBlocker } from './roadmap'
import { serviceOutput, productService } from './services'
import { featureLock } from './unlocks'
import { estimateDaysAt, teamRate, expectedContribution } from './work'
import { DISCIPLINES, fail, OK, type GameState, type Office, type Product, type Proposal, type Result } from './types'

export type Initiative = Exclude<Proposal['kind'], 'deep' | 'strike'>
export type OperationChoice = { kind: 'idle' } | { kind: 'standing'; service: StandingService['service']; productId: number }
  | { kind: 'initiative'; productId: number; proposal: { kind: Initiative; id: string } }

/** Reservations are product-scoped except companion unlocks, whose slots are company-wide. */
export function initiativeBlocker(state: GameState, product: Product, proposal: { kind: Initiative; id: string }, except?: Office): string | null {
  for (const o of state.offices) {
    if (o === except || !o.project) continue
    const p = o.project
    const companion = proposal.kind === 'item' && getWorkItem(proposal.id)?.companionId
    if (companion && p.itemId && getWorkItem(p.itemId)?.companionId) return 'A companion launch is already reserved'
    if (p.parentId !== product.id) continue
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

export function operationChoices(state: GameState, product: Product, office: Office): Proposal[] {
  return candidates(state, product).filter((p) => initiativeBlocker(state, product, p as { kind: Initiative; id: string }, office) === null)
    .sort((a, b) => b.weight - a.weight).map(({ kind, id, why }) => ({ kind, id, why }))
}

export function operationPreview(state: GameState, office: Office, product: Product, proposal: { kind: Initiative; id: string }) {
  const card: Proposal = { ...proposal, why: '' }
  // Validate identifiers before content getters; callers can preview stale/untrusted choices.
  const invalid = proposal.kind === 'item' && !getWorkItem(proposal.id) ? 'Unknown item' : proposal.kind === 'feature' && (() => { try { getFeature(proposal.id); return false } catch { return true } })() ? 'Unknown feature' : null
  if (invalid) return { title: 'Unavailable initiative', effect: '', clarity: 0, scope: { design: 0, engineering: 0, qa: 0 }, target: { design: 0, engineering: 0, qa: 0 }, rate: { design: 0, engineering: 0, qa: 0 }, days: 0, cash: 0, upkeep: 0, blocker: invalid }
  const clarity = clarityOf(state, office)
  const scope = releaseScope(product, card, clarity)
  const target = { ...scope }
  const rate = teamRate(state, office, { typeId: product.productTypeId, productId: product.id })
  const units = proposal.kind === 'item' ? getWorkItem(proposal.id)?.work ?? 1 : 1
  for (const d of DISCIPLINES) if (scope[d] > 0) target[d] = Math.max(scope[d], rate[d] * RELEASE_MIN_DAYS * Math.min(2, units))
  const days = estimateDaysAt(target, rate)
  const cash = proposal.kind === 'localise' ? projectBudget(projectTarget(product.productTypeId, [], 'update', product.size)) : 0
  const missing = DISCIPLINES.filter((d) => target[d] > 0 && rate[d] <= 0)
  return { title: describeProposal(card).title, effect: releaseEffect(state, office, product, card, clarity), clarity,
    scope, target, rate, days, cash, upkeep: proposal.kind === 'item' ? getWorkItem(proposal.id)?.effect.upkeep ?? 0 : 0,
    blocker: initiativeBlocker(state, product, proposal, office) ?? (missing.length ? `Missing build skills: ${missing.join(', ')}` : budgetBlocker(state, cash)) }
}

export function reassignmentCost(office: Office): string {
  if (office.project) return 'Abandons this unfinished project and all its progress. Upfront costs are not refunded; payroll and rent continue.'
  if (office.assignment?.kind === 'standing') return `Stops ${office.assignment.service} coverage immediately. Payroll and rent continue.`
  return 'Uses only this floor’s team. Payroll, rent and existing upkeep continue; other teams keep working.'
}

/** Reassignment is explicit and atomic: preview/validate first, then release the old reservation. */
export function assignOperation(state: GameState, officeId: number, choice: OperationChoice, confirmed = false): Result {
  if (state.gameOver) return fail('Game over')
  const office = state.offices.find((o) => o.id === officeId)
  if (!office || office.kind !== 'office' || !office.assignment) return fail('Operations need an office')
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
    : startUpdate(state, product.id, choice.proposal.kind === 'feature' ? [choice.proposal.id] : choice.proposal.kind === 'compliance' ? [COMPLIANCE_FEATURE] : [], office.id, false, true)
  if (!result.ok || !office.project) { office.project = old; office.assignment = oldAssignment; return result }
  // startUpdate mutates the office through a function; retain its new project, not the old narrowing.
  const project = (office as Office).project!
  project.byTeam = true
  project.target = preview.target
  project.scope = DISCIPLINES.reduce((sum, d) => sum + preview.scope[d], 0)
  project.bugRisk *= 1 + (1 - preview.clarity / 100) * SPEC_BUGS
  if (choice.proposal.kind === 'polish') { project.polishes = true; project.bugRisk *= POLISH_BUG_RISK }
  if (choice.proposal.kind === 'item') project.itemId = choice.proposal.id
  project.spec = { title: preview.title, bump: describeProposal({ ...choice.proposal, why: '' }).bump, clarity: preview.clarity, promise: preview.effect }
  project.name = `${product.name}: ${preview.title}` // Version is assigned at completion, never reserved at start.
  office.productId = product.id
  office.assignment = { ...choice, projectId: project.id, startedDay: state.day }
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
      const kind: Initiative = p.localises ? 'localise' : p.itemId ? 'item' : p.polishes ? 'polish' : p.featureIds.includes(COMPLIANCE_FEATURE) ? 'compliance' : p.featureIds.length ? 'feature' : 'polish'
      office.assignment = { kind: 'initiative', productId: p.parentId, projectId: p.id, proposal: { kind, id: p.itemId ?? p.featureIds[0] ?? kind }, startedDay: Math.max(0, p.startDay) }
      // Preserve paid work, quality/scope and absolute progress, but remove the old helper/floor inflated remaining target.
      const scope = releaseScope(state.products.find((product) => product.id === p.parentId)!, { ...office.assignment.proposal, why: '' }, p.spec?.clarity ?? 0)
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
      const fixed = Math.min(product.bugs, output)
      product.bugs -= fixed
      state.bugsFixed += fixed
    }
    for (const employee of workersOf(state, office)) state.dayWork.push({ employeeId: employee.id, points: expectedContribution(employee, state), fixing: a.service === 'reliability' })
    if (state.day % 30 === 0) {
      const service = productService(state, product, a.service)
      if (service.risk) state.events.push({ type: 'notice', text: `${product.name}: ${a.service} coverage ${service.provided.toFixed(1)}/${service.demand.toFixed(1)} ${service.unit}. ${service.risk}` })
    }
  }
}
