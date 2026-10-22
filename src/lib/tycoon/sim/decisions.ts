import { getAudience } from '@/lib/tycoon/data/audiences'
import { getFeature } from '@/lib/tycoon/data/features'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import { getResearch } from '@/lib/tycoon/data/research'
import { title } from './careers'
import { describePendingEvent } from './events'
import { nextSize, promotionCost, promotionEffect, promotionReturn } from './lifecycle'
import { newOfficeCost, officeName, getOffice, openableRegions } from './offices'
import { hitBreakdown, projectBudget, projectQuality, projectTarget } from './project'
import { acquisitionPrice } from './rivals'
import { salePrice, sunsetOutcome } from './sunset'
import { trainingCost } from './staff'
import type { Discipline, Employee, GameState, ProjectSize, Region, Tier } from './types'

/** What a decision looks like in the log: a category, a line to read, and the numbers behind it. */
export type Decision = [kind: string, text: string, data?: Record<string, string | number | boolean | string[]>]

const featureNames = (ids: readonly string[]) => ids.map((id) => getFeature(id).name)
const person = (e: Employee) => `${e.name} (${title(e)})`
const skillsOf = (e: Employee) =>
  e.analysis !== undefined
    ? `analysis ${Math.round(e.analysis)}`
    : `design ${Math.round(e.skills.design)}, engineering ${Math.round(e.skills.engineering)}, qa ${Math.round(e.skills.qa)}`
const officeLabel = (state: GameState, id: number | undefined) => {
  const office = id === undefined ? undefined : getOffice(state, id)
  return office ? officeName(state, office) : 'unknown office'
}

/**
 * Describes each thing the player can decide, from the state as they saw it. Called before the command
 * runs, so costs, candidates and the pending event are still what was on screen.
 */
export const decisions = {
  startProject(state: GameState, typeId: string, features: readonly string[], size: string | undefined, officeId: number, audienceId?: string): Decision {
    return [
      'project.start',
      `Started a ${size ?? 'default-size'} ${getProductType(typeId).name}`,
      { type: typeId, audience: audienceId ? getAudience(audienceId).name : '', size: size ?? '', features: featureNames(features), office: officeLabel(state, officeId), demand: Math.round((state.market[typeId] ?? 1) * 100) / 100, budget: projectBudget(projectTarget(typeId, features, 'new', (size as ProjectSize | undefined) ?? 'small')) },
    ]
  },

  startUpdate(state: GameState, productId: number, features: readonly string[], officeId: number, grow = false): Decision {
    const product = state.products.find((p) => p.id === productId)
    const next = product && grow ? nextSize(product.size) : null
    return [
      next ? 'project.grow' : features.length === 0 ? 'project.maintenance' : 'project.update',
      next ? `Started growing ${product?.name} into a ${next} product` : `Started ${features.length === 0 ? 'maintenance on' : 'an update to'} ${product?.name ?? 'a product'}`,
      { features: featureNames(features), users: Math.round(product?.users ?? 0), ageDays: product ? state.day - product.releaseDay : 0, office: officeLabel(state, officeId) },
    ]
  },

  shipProject(state: GameState, campaign: Tier | undefined, officeId: number): Decision {
    const project = getOffice(state, officeId)?.project
    if (!project) return ['ship', 'Shipped']
    const quality = projectQuality(state, project)
    const data: Record<string, string | number | boolean> = { quality: Math.round(quality), campaign: campaign ?? 'none', kind: project.kind }
    if (project.kind === 'new') data.hitChance = Math.round(hitBreakdown(state, project, quality, campaign).chance * 1000) / 10
    return ['ship', `Shipped ${project.name}`, data]
  },

  promote(state: GameState, productId: number, tier: Tier): Decision {
    const product = state.products.find((p) => p.id === productId)
    return ['promote', `Promoted ${product?.name ?? 'a product'} (${tier})`, product ? { cost: promotionCost(state, product, tier), users: Math.round(product.users), effect: Math.round(promotionEffect(state, product) * 100), payback: Math.round(promotionReturn(state, product, tier) * 100) / 100 } : undefined]
  },

  setLicensed(state: GameState, productId: number, licensed: boolean): Decision {
    const product = state.products.find((p) => p.id === productId)
    return [licensed ? 'license.start' : 'license.end', `${licensed ? 'Licensed' : 'Ended the licence of'} ${product?.name ?? 'a product'}`, product ? { users: Math.round(product.users) } : undefined]
  },

  setAutoPromote(state: GameState, productId: number, tier: Tier | null): Decision {
    const product = state.products.find((p) => p.id === productId)
    return ['promote.policy', `${product?.name ?? 'A product'}: automatic promotion ${tier ?? 'off'}`]
  },

  sunset(state: GameState, productId: number): Decision {
    const product = state.products.find((p) => p.id === productId)
    if (!product) return ['product.end', 'Ended a product']
    const outcome = sunsetOutcome(product)
    return [
      `product.${outcome}`,
      outcome === 'sold' ? `Sold ${product.name}` : `Retired ${product.name}`,
      { users: Math.round(product.users), ageDays: state.day - product.releaseDay, revenue: Math.round(product.totalRevenue), hit: product.hit, price: outcome === 'sold' ? salePrice(product) : 0 },
    ]
  },

  acceptContract(state: GameState, offerId: number, officeId: number): Decision {
    const offer = state.contracts.find((c) => c.id === offerId)
    return ['contract.accept', `Took a job for ${offer?.client ?? 'a client'}: ${offer?.title ?? ''}`, { pay: offer?.pay ?? 0, days: offer?.days ?? 0, office: officeLabel(state, officeId) }]
  },

  abandonContract(state: GameState, officeId: number): Decision {
    const contract = getOffice(state, officeId)?.project?.contract
    return ['contract.abandon', `Dropped the job for ${contract?.client ?? 'a client'}`, { pay: contract?.pay ?? 0 }]
  },

  startResearch(_state: GameState, id: string, target?: string): Decision {
    return ['research.start', `Started researching ${getResearch(id)?.name ?? id}${target ? ` (${getAudience(target).name})` : ''}`, target ? { id, target } : { id }]
  },

  resolveEvent(state: GameState, index: number): Decision {
    const view = describePendingEvent(state)
    const choice = view?.choices[index]
    return ['event.choice', `${view?.title ?? 'Event'}: ${choice?.label ?? `option ${index + 1}`}`, { options: view?.choices.map((c) => c.label) ?? [] }]
  },

  hire(state: GameState, candidateId: number, officeId: number): Decision {
    const c = state.candidates.find((e) => e.id === candidateId)
    return [
      'hire',
      c ? `Hired ${person(c)}` : 'Hired someone',
      c ? { role: c.role, trait: c.trait, skills: skillsOf(c), salary: Math.round(c.salary), office: officeLabel(state, officeId), team: state.employees.length } : undefined,
    ]
  },

  fire(state: GameState, employeeId: number): Decision {
    const e = state.employees.find((x) => x.id === employeeId)
    return ['fire', e ? `Let ${person(e)} go` : 'Let someone go', e ? { role: e.role, skills: skillsOf(e), tenureDays: state.day - e.hiredDay, morale: Math.round(e.morale) } : undefined]
  },

  promoteEmployee(state: GameState, employeeId: number): Decision {
    const e = state.employees.find((x) => x.id === employeeId)
    return ['employee.promote', e ? `Promoted ${person(e)}` : 'Promoted someone', e ? { from: title(e), skills: skillsOf(e) } : undefined]
  },

  train(state: GameState, employeeId: number, discipline: Discipline): Decision {
    const e = state.employees.find((x) => x.id === employeeId)
    return ['employee.train', `${e ? person(e) : 'Someone'} went on a ${discipline} course`, e ? { cost: trainingCost(e, discipline) } : undefined]
  },

  teamOuting(_state: GameState): Decision {
    return ['outing', 'Took the team out']
  },

  transfer(state: GameState, employeeId: number, officeId: number): Decision {
    const e = state.employees.find((x) => x.id === employeeId)
    return ['employee.transfer', `${e ? person(e) : 'Someone'} moved to ${officeLabel(state, officeId)}`]
  },

  assignTeam(state: GameState, employeeId: number, officeId: number | null): Decision {
    const e = state.employees.find((x) => x.id === employeeId)
    return ['employee.team', `${e ? person(e) : 'Someone'} ${officeId === null ? 'went back to their own office’s team' : `joined ${officeLabel(state, officeId)}’s team`}`]
  },

  becomePm(state: GameState, employeeId: number): Decision {
    const e = state.employees.find((x) => x.id === employeeId)
    return ['employee.pm', `${e ? person(e) : 'An analyst'} became a product manager`, e ? { analysis: Math.round(e.analysis ?? 0), office: officeLabel(state, e.officeId) } : undefined]
  },

  survey(state: GameState, audienceId: string): Decision {
    return ['survey', `Studied ${getAudience(audienceId).name}`, { insight: Math.round(state.insight), audience: audienceId }]
  },

  moveOut(): Decision {
    return ['office.moveOut', 'Left the garage for an office']
  },

  openOffice(state: GameState, region?: Region): Decision {
    const where = region ?? openableRegions(state)[0]
    return ['office.open', `Opened office ${state.offices.length + 1} in ${where === 'eu' ? 'Europe' : 'the US'}`, { cost: newOfficeCost(state, where), region: where ?? 'us' }]
  },

  acquire(state: GameState, rivalId: number, keepProductIds: readonly number[] = []): Decision {
    const rival = state.rivals.find((r) => r.id === rivalId)
    const kept = state.rivalProducts.filter((p) => keepProductIds.includes(p.id)).map((p) => p.name)
    return ['acquire', `Absorbed ${rival?.name ?? 'a rival'}`, rival ? { price: acquisitionPrice(state, rival), region: rival.region ?? 'us', kept } : undefined]
  },

  localise(state: GameState, productId: number, officeId: number): Decision {
    const product = state.products.find((p) => p.id === productId)
    return ['project.localise', `Started localising ${product?.name ?? 'a product'} for Europe`, { users: Math.round(product?.users ?? 0), office: officeLabel(state, officeId) }]
  },

  startFix(state: GameState, productId: number): Decision {
    const product = state.products.find((p) => p.id === productId)
    return ['fix.start', `Started fixing bugs in ${product?.name ?? 'a product'}`, { bugs: Math.round(product?.bugs ?? 0) }]
  },

  setOnCall(): Decision {
    return ['fix.onCall', 'Put a pair on call']
  },
}
