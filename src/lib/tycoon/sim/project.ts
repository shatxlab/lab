import { getFeature } from '@/lib/tycoon/data/features'
import { getProductType, PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import {
  CAMPAIGNS,
  DEMAND_NOISE,
  HIT_BASE_CHANCE,
  HIT_CAMPAIGN_BOOST,
  HIT_CHANCE_PER_MISS,
  HIT_MAX_CHANCE,
  HIT_MIN_QUALITY,
  HIT_REACH,
  HIT_REPUTATION,
  MAINTENANCE_TARGET_SHARE,
  LAUNCH_ADOPTERS,
  MAX_FEATURES,
  PROJECT_SIZES,
  REPUTATION_DIVISOR,
  REPUTATION_MAX,
  REPUTATION_NEUTRAL_QUALITY,
  UPDATE_MAX_FEATURES,
  UPDATE_REPUTATION_SHARE,
  UPDATE_TARGET_SHARE,
  WORK_SCALE,
} from './balance'
import { campaignCost, startBoost, updateBlocker } from './lifecycle'
import { marketDemand } from './market'
import { freshProductName } from './naming'
import { resolveOffice, staffOf } from './offices'
import { bugProneness, releaseBugs } from './products'
import { moraleFromRelease } from './staff'
import { statMultiplier } from './modifiers'
import { pick, rand, randRange } from './rng'
import { computeQuality, computeReach, featureReach } from './scoring'
import { featureLock, productTypeLock, sizeLock } from './unlocks'
import {
  DISCIPLINES,
  emptySkills,
  fail,
  OK,
  type GameState,
  type Office,
  type Product,
  type ProductType,
  type Project,
  type ProjectSize,
  type Result,
  type Skills,
  type Tier,
} from './types'

export function unlockedProductTypes(state: GameState): ProductType[] {
  return PRODUCT_TYPES.filter((t) => productTypeLock(state, t) === null)
}

/** The project's quality including the studio-wide bonus from research. */
export function projectQuality(state: GameState, project: Project): number {
  return computeQuality(project, statMultiplier(state, 'quality'))
}

/**
 * Base target for the product type plus the cost of every chosen feature, all times the size's work
 * and WORK_SCALE. An update needs only a share of the base, plus whatever it adds.
 */
export function projectTarget(
  productTypeId: string,
  featureIds: readonly string[],
  kind: 'new' | 'update' = 'new',
  size: ProjectSize = 'small',
): Skills {
  const base = getProductType(productTypeId).baseTarget
  const target = emptySkills()
  // An update with nothing new in it is a maintenance release: cheaper, and it still wins the interest back.
  const share = UPDATE_TARGET_SHARE * (featureIds.length === 0 ? MAINTENANCE_TARGET_SHARE : 1)
  for (const d of DISCIPLINES) target[d] = kind === 'update' ? Math.round(base[d] * share) : base[d]
  for (const id of featureIds) {
    const cost = getFeature(id).cost
    for (const d of DISCIPLINES) target[d] += cost[d]
  }
  for (const d of DISCIPLINES) target[d] *= PROJECT_SIZES[size].work * WORK_SCALE
  return target
}

/** Starts a new product in an office (the first one unless `officeId` says otherwise). */
export function startProject(
  state: GameState,
  productTypeId: string,
  featureIds: readonly string[],
  size: ProjectSize = 'small',
  officeId?: number,
): Result {
  if (state.gameOver) return fail('Game over')
  const office = resolveOffice(state, officeId)
  if (!office) return fail('Unknown office')
  if (office.project) return fail('A project is already in progress')
  if (staffOf(state, office).length === 0) return fail('Hire someone first')
  const type = PRODUCT_TYPES.find((t) => t.id === productTypeId)
  if (!type) return fail('Unknown product type')
  const typeLock = productTypeLock(state, type)
  if (typeLock) return fail(`Product type is locked: ${typeLock}`)
  if (!PROJECT_SIZES[size]) return fail('Unknown project size')
  const sizeProblem = sizeLock(state, size, office)
  if (sizeProblem) return fail(`${PROJECT_SIZES[size].name} projects need ${sizeProblem}`)
  const featureProblem = checkFeatures(state, featureIds, MAX_FEATURES)
  if (featureProblem) return fail(featureProblem)

  office.project = {
    id: state.nextId++,
    name: freshProductName(state),
    kind: 'new',
    parentId: null,
    productTypeId,
    size,
    featureIds: [...featureIds],
    target: projectTarget(productTypeId, featureIds, 'new', size),
    progress: emptySkills(),
    startDay: state.day,
    readyNotified: false,
    hype: 1,
    alphaOffered: false,
    bugRisk: 1,
    contract: null,
  }
  return OK
}

/** Why `featureIds` can't be built (too many, duplicates, unknown, locked), or null when fine. */
function checkFeatures(state: GameState, featureIds: readonly string[], max: number): string | null {
  if (featureIds.length > max) return `At most ${max} feature${max === 1 ? '' : 's'}`
  if (new Set(featureIds).size !== featureIds.length) return 'Duplicate feature'
  for (const id of featureIds) {
    let feature
    try {
      feature = getFeature(id)
    } catch {
      return 'Unknown feature'
    }
    const lock = featureLock(state, feature)
    if (lock) return `${feature.name} is locked: ${lock}`
  }
  return null
}

/** Starts an update to a live product: a smaller project that wins back its users' interest and can add features. */
export function startUpdate(state: GameState, productId: number, featureIds: readonly string[], officeId?: number): Result {
  if (state.gameOver) return fail('Game over')
  const office = resolveOffice(state, officeId)
  if (!office) return fail('Unknown office')
  const product = state.products.find((p) => p.id === productId)
  if (!product) return fail('Unknown product')
  const blocker = updateBlocker(state, office, product)
  if (blocker) return fail(blocker)
  const problem = checkFeatures(state, featureIds, UPDATE_MAX_FEATURES)
  if (problem) return fail(problem)
  const repeated = featureIds.find((id) => product.featureIds.includes(id))
  if (repeated) return fail(`${getFeature(repeated).name} is already in ${product.name}`)

  office.project = {
    id: state.nextId++,
    name: product.name,
    kind: 'update',
    parentId: product.id,
    productTypeId: product.productTypeId,
    size: product.size,
    featureIds: [...featureIds],
    target: projectTarget(product.productTypeId, featureIds, 'update', product.size),
    progress: emptySkills(),
    startDay: state.day,
    readyNotified: false,
    hype: 1,
    alphaOffered: false,
    bugRisk: 1,
    contract: null,
  }
  return OK
}

/**
 * Ships an office's project at its current progress; early shipping just scores lower.
 * A new product may be launched with a paid marketing `campaign`.
 */
export function shipProject(state: GameState, campaign?: Tier, officeId?: number): Result {
  const office = resolveOffice(state, officeId)
  const project = office?.project
  if (!office || !project) return fail('No project to ship')
  if (project.kind !== 'new' && project.kind !== 'update') return fail('Client work has nothing to ship')
  return project.kind === 'update' ? shipUpdate(state, office, project) : shipNewProduct(state, office, project, campaign)
}

/** The product's reach once this update ships at `quality`: its new features and any better quality reach more people. */
export function reachAfterUpdate(product: Product, project: Project, quality: number): number {
  const newQuality = Math.max(product.quality, quality)
  const features = [...product.featureIds, ...project.featureIds]
  const growth =
    (featureReach(product.productTypeId, features) / featureReach(product.productTypeId, product.featureIds)) *
    (newQuality / Math.max(product.quality, 1)) ** 2 *
    project.hype
  return product.reach * growth
}

/** The product's reach after an update with these features, if finished exactly on target; for the planning dialog. */
export function estimateUpdateReach(state: GameState, productId: number, featureIds: readonly string[]): number {
  const product = state.products.find((p) => p.id === productId)
  if (!product) return 0
  const target = projectTarget(product.productTypeId, featureIds, 'update', product.size)
  const plan: Project = {
    id: 0,
    name: product.name,
    kind: 'update',
    parentId: product.id,
    productTypeId: product.productTypeId,
    size: product.size,
    featureIds: [...featureIds],
    target,
    progress: { ...target },
    startDay: state.day,
    readyNotified: true,
    hype: 1,
    alphaOffered: true,
    bugRisk: 1,
    contract: null,
  }
  return reachAfterUpdate(product, plan, projectQuality(state, plan))
}

/** Bigger releases move reputation further, both ways. */
function reputationFromRelease(state: GameState, project: Project, quality: number, share: number): void {
  const change = ((quality - REPUTATION_NEUTRAL_QUALITY) / REPUTATION_DIVISOR) * share * PROJECT_SIZES[project.size].reputation
  state.reputation = Math.max(0, Math.min(REPUTATION_MAX, state.reputation + change))
}

/** What a launch's breakout chance is made of: a base from the streak, times a factor each for quality, market and buzz. */
export interface HitBreakdown {
  chance: number
  /** Before the other factors: grows with every good launch since the last hit. */
  base: number
  /** Good launches since the last hit. */
  misses: number
  quality: number
  market: number
  buzz: number
  /** True when the chance was cut down to the highest it can be. */
  capped: boolean
}

/**
 * The chance a launch of this quality breaks out: none for anything less than good, more for better
 * products, hotter markets and louder launches, and more again for every good launch since the last hit.
 */
export function hitBreakdown(state: GameState, project: Project, quality: number, campaign?: Tier): HitBreakdown {
  const misses = state.launchesSinceHit
  const base = HIT_BASE_CHANCE + HIT_CHANCE_PER_MISS * misses
  const qualityFactor = 0.5 + (quality - HIT_MIN_QUALITY) / (100 - HIT_MIN_QUALITY)
  const market = marketDemand(state, project.productTypeId)
  const buzz = project.hype * (campaign ? HIT_CAMPAIGN_BOOST[campaign] : 1)
  const raw = quality < HIT_MIN_QUALITY ? 0 : base * qualityFactor * market * buzz
  return { chance: Math.min(HIT_MAX_CHANCE, raw), base, misses, quality: qualityFactor, market, buzz, capped: raw > HIT_MAX_CHANCE }
}

export function hitChance(state: GameState, project: Project, quality: number, campaign?: Tier): number {
  return hitBreakdown(state, project, quality, campaign).chance
}

/** The market at launch, plus a little luck per release. */
function launchDemand(state: GameState, productTypeId: string): number {
  return marketDemand(state, productTypeId) * (1 + randRange(state, -DEMAND_NOISE, DEMAND_NOISE))
}

function shipNewProduct(state: GameState, office: Office, project: Project, campaign: Tier | undefined): Result {
  const quality = projectQuality(state, project)
  const cost = campaign ? campaignCost(state, project, quality, campaign) : 0
  if (campaign && cost > state.money) return fail('Not enough money for that campaign')

  let reach = computeReach(project, quality, state.reputation, launchDemand(state, project.productTypeId))
  const bugs = releaseBugs(project)
  const chance = hitChance(state, project, quality, campaign)
  const hit = chance > 0 && rand(state) < chance
  if (hit) reach *= HIT_REACH[project.size]
  state.money -= cost

  const product: Product = {
    id: project.id,
    name: project.name,
    productTypeId: project.productTypeId,
    size: project.size,
    featureIds: [...project.featureIds],
    quality,
    releaseDay: state.day,
    reach,
    users: reach * LAUNCH_ADOPTERS,
    bugs,
    pendingBugs: 0,
    hit,
    totalRevenue: 0,
    updates: [],
    boostUntil: 0,
    boostUsers: 0,
  }
  if (campaign) startBoost(product, CAMPAIGNS[campaign], state.day)
  state.products.push(product)
  state.shippedCount += 1
  reputationFromRelease(state, project, quality, 1)
  if (hit) {
    state.launchesSinceHit = 0
    state.signatureId ??= product.id
    state.reputation = Math.min(REPUTATION_MAX, state.reputation + HIT_REPUTATION)
    state.events.push({ type: 'breakout', productId: product.id })
  } else if (quality >= HIT_MIN_QUALITY) {
    state.launchesSinceHit += 1
  }
  moraleFromRelease(state, quality)
  office.project = null
  state.events.push({ type: 'shipped', productId: project.id, update: false, reach, bugs, quality })
  return OK
}

/** An update renews users' interest, adds its features, and ships a few bugs of its own. */
function shipUpdate(state: GameState, office: Office, project: Project): Result {
  const product = state.products.find((p) => p.id === project.parentId)
  if (!product) return fail('The product to update is gone')

  const quality = projectQuality(state, project)
  // Hidden at first: users find them over the following weeks, and a well-made product has fewer.
  const bugs = releaseBugs(project) * bugProneness(product.quality)
  product.reach = reachAfterUpdate(product, project, quality)
  product.pendingBugs += bugs
  product.updates.push({ day: state.day })
  product.featureIds.push(...project.featureIds)
  product.quality = Math.max(product.quality, quality)
  reputationFromRelease(state, project, quality, UPDATE_REPUTATION_SHARE)
  moraleFromRelease(state, quality, UPDATE_REPUTATION_SHARE)
  office.project = null
  state.events.push({ type: 'shipped', productId: product.id, update: true, reach: product.reach, bugs, quality })
  return OK
}
