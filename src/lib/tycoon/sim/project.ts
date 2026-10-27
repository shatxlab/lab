import { formatMoney } from '@/lib/tycoon/format'
import { audienceFor, audiencesOf } from '@/lib/tycoon/data/audiences'
import { getFeature } from '@/lib/tycoon/data/features'
import { getWorkItem, type WorkItem } from '@/lib/tycoon/data/workstreams'
import { getProductType, PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import {
  BUDGET_PER_POINT,
  BUDGET_RESERVE_DAYS,
  DAYS_PER_MONTH,
  CAMPAIGNS,
  POLISH_FIX_SHARE,
  PROMO_AUDIENCE,
  DEMAND_NOISE,
  GROW_MAX_FEATURES,
  MAINTENANCE_TARGET_SHARE,
  LAUNCH_ADOPTERS,
  MAX_FEATURES,
  PIVOT_KEEP,
  PROJECT_SIZES,
  REPUTATION_DIVISOR,
  REPUTATION_MAX,
  REPUTATION_NEUTRAL_QUALITY,
  SPEC_REACH,
  UPDATE_MAX_FEATURES,
  UPDATE_REPUTATION_SHARE,
  UPDATE_TARGET_SHARE,
  WORK_SCALE,
} from './balance'
import { launchCompanion } from './companions'
import { monthlyBurn } from './economy'
import { officeRunning, pmFitFactor, pmReachFactor } from './direction'
import { releaseFit, takeoffBlocker, takeOff, undiscovered } from './fit'
import { campaignCost, growBlocker, localiseBlocker, newProductBlocker, nextSize, startBoost, updateBlocker } from './lifecycle'
import { marketDemand } from './market'
import { freshProductName } from './naming'
import { inGarage, officeName, resolveOffice, teamOf } from './offices'
import { bugProneness, euShareOf, regionScale, releaseBugs, settledUsers } from './products'
import { addNote, bumpFor, bumped, formatVersion, versionOf } from './releases'
import { moraleFromRelease } from './staff'
import { statMultiplier } from './modifiers'
import { pick, randRange } from './rng'
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
  type ReleaseNote,
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

/**
 * The work to grow a product from `from` to `to`: what the bigger size adds over what is already built,
 * plus the features chosen at the new size's scale.
 */
export function growTarget(productTypeId: string, featureIds: readonly string[], from: ProjectSize, to: ProjectSize): Skills {
  const full = projectTarget(productTypeId, featureIds, 'new', to)
  const built = projectTarget(productTypeId, [], 'new', from)
  const target = emptySkills()
  for (const d of DISCIPLINES) target[d] = Math.max(0, Math.round(full[d] - built[d]))
  return target
}

/** The cash a project with this much work to do costs to start, in tidy $50s. */
export function projectBudget(target: Skills): number {
  const points = DISCIPLINES.reduce((sum, d) => sum + target[d], 0)
  return Math.round((points * BUDGET_PER_POINT) / 50) * 50
}

/** Why the studio can't pay a project's budget now, or null when it can: the bank has to cover it and a month of wages after. */
export function budgetBlocker(state: GameState, budget: number): string | null {
  if (budget <= 0) return null
  const cushion = Math.round(((monthlyBurn(state) / DAYS_PER_MONTH) * BUDGET_RESERVE_DAYS) / 50) * 50
  if (state.money >= budget + cushion) return null
  return `Not enough money: the budget is ${formatMoney(budget)}, and ${formatMoney(cushion)} must stay for wages`
}

/** Starts a new product in an office (the first one unless `officeId` says otherwise). */
export function startProject(
  state: GameState,
  productTypeId: string,
  featureIds: readonly string[],
  size: ProjectSize = 'small',
  officeId?: number,
  audienceId?: string,
): Result {
  if (state.gameOver) return fail('Game over')
  const office = resolveOffice(state, officeId)
  if (!office) return fail('Unknown office')
  if (office.project) return fail('A project is already in progress')
  if (teamOf(state, office).length === 0) return fail('Hire someone first')
  const type = PRODUCT_TYPES.find((t) => t.id === productTypeId)
  if (!type) return fail('Unknown product type')
  const typeLock = productTypeLock(state, type)
  if (typeLock) return fail(`Product type is locked: ${typeLock}`)
  if (audienceId !== undefined && !audiencesOf(productTypeId).some((a) => a.id === audienceId)) return fail('Unknown audience')
  if (!PROJECT_SIZES[size]) return fail('Unknown project size')
  const sizeProblem = sizeLock(state, size, office)
  if (sizeProblem) return fail(`${PROJECT_SIZES[size].name} projects need ${sizeProblem}`)
  const featureProblem = checkFeatures(state, featureIds, MAX_FEATURES)
  if (featureProblem) return fail(featureProblem)
  const portfolioProblem = newProductBlocker(state)
  if (portfolioProblem) return fail(portfolioProblem)
  const target = projectTarget(productTypeId, featureIds, 'new', size)
  const budget = projectBudget(target)
  const budgetProblem = budgetBlocker(state, budget)
  if (budgetProblem) return fail(budgetProblem)
  state.money -= budget
  if (!inGarage(state)) state.lastNewProductDay = state.day

  office.project = {
    id: state.nextId++,
    name: freshProductName(state),
    kind: 'new',
    parentId: null,
    productTypeId,
    audienceId: audienceId ?? audiencesOf(productTypeId)[0]?.id,
    size,
    featureIds: [...featureIds],
    target,
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
export function startUpdate(state: GameState, productId: number, featureIds: readonly string[], officeId?: number, grow = false, byTeam = false): Result {
  if (state.gameOver) return fail('Game over')
  const office = resolveOffice(state, officeId)
  if (!office) return fail('Unknown office')
  const product = state.products.find((p) => p.id === productId)
  if (!product) return fail('Unknown product')
  const blocker = grow ? growBlocker(state, office, product) : updateBlocker(state, office, product, byTeam)
  if (blocker) return fail(blocker)
  const bigger = grow ? nextSize(product.size) : null
  const problem = checkFeatures(state, featureIds, grow ? GROW_MAX_FEATURES : UPDATE_MAX_FEATURES)
  if (problem) return fail(problem)
  const repeated = featureIds.find((id) => product.featureIds.includes(id))
  if (repeated) return fail(`${getFeature(repeated).name} is already in ${product.name}`)
  const target = bigger ? growTarget(product.productTypeId, featureIds, product.size, bigger) : projectTarget(product.productTypeId, featureIds, 'update', product.size)
  const budget = bigger ? projectBudget(target) : 0
  const budgetProblem = budgetBlocker(state, budget)
  if (budgetProblem) return fail(budgetProblem)
  state.money -= budget

  office.project = {
    id: state.nextId++,
    name: product.name,
    kind: 'update',
    parentId: product.id,
    productTypeId: product.productTypeId,
    audienceId: product.audienceId,
    size: product.size,
    featureIds: [...featureIds],
    target,
    ...(bigger ? { grows: bigger } : {}),
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

/** Why `product` can't pivot to `audienceId` from `office` now, or null when it can. */
export function pivotBlocker(state: GameState, office: Office, product: Product, audienceId: string): string | null {
  if (product.hit) return 'A hit has found its people'
  if (product.pivoted) return 'It has pivoted once already'
  if (!audiencesOf(product.productTypeId).some((a) => a.id === audienceId)) return 'Unknown audience'
  if (audienceId === (product.audienceId ?? audiencesOf(product.productTypeId)[0]?.id)) return 'It is already for them'
  return updateBlocker(state, office, product)
}

/** The work of a pivot: an update's, without new features, but not the cheap maintenance kind. */
export function pivotTarget(product: Product): Skills {
  const target = projectTarget(product.productTypeId, [], 'update', product.size)
  for (const d of DISCIPLINES) target[d] = Math.round(target[d] / MAINTENANCE_TARGET_SHARE)
  return target
}

/**
 * Starts pointing a live product at another audience of its type. Everything built so far stays, and counts for the
 * new audience at once; when it ships, most of its users leave (they came for what it was), it starts again as a
 * launch, and its fit is the new audience's. A product pivots once.
 */
export function startPivot(state: GameState, productId: number, audienceId: string, officeId?: number): Result {
  if (state.gameOver) return fail('Game over')
  const office = resolveOffice(state, officeId)
  if (!office) return fail('Unknown office')
  const product = state.products.find((p) => p.id === productId)
  if (!product) return fail('Unknown product')
  const blocker = pivotBlocker(state, office, product, audienceId)
  if (blocker) return fail(blocker)
  office.project = {
    id: state.nextId++,
    name: product.name,
    kind: 'update',
    parentId: product.id,
    productTypeId: product.productTypeId,
    audienceId: product.audienceId,
    size: product.size,
    featureIds: [],
    target: pivotTarget(product),
    pivotsTo: audienceId,
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

/** A pivot ships: the product is for its new audience, keeps a few of its users, and starts again as a launch does. */
function pivot(state: GameState, product: Product, audienceId: string): void {
  product.audienceId = audienceId
  product.users *= PIVOT_KEEP
  if (product.euUsers !== undefined) product.euUsers *= PIVOT_KEEP
  delete product.loyalUsers
  product.releaseDay = state.day
  product.pivoted = true
  state.events.push({ type: 'notice', text: `${product.name} is now for ${audienceFor(product.productTypeId, audienceId).name.toLowerCase()}.` })
}

/** The share of its reach a product would gain in Europe if localised now: the market's size there, as its features and audience suit it. */
export function euGain(product: Pick<Product, 'productTypeId' | 'featureIds' | 'audienceId'>): number {
  const us = featureReach(product.productTypeId, product.featureIds, product.audienceId, 'us')
  const eu = featureReach(product.productTypeId, product.featureIds, product.audienceId, 'eu')
  return regionScale(product.productTypeId, 'eu') * (eu / us)
}

/** Starts localising a live product for Europe: a maintenance-sized release that opens the market there. It costs the budget of that work. */
export function startLocalisation(state: GameState, productId: number, officeId?: number, byTeam = false): Result {
  if (state.gameOver) return fail('Game over')
  const office = resolveOffice(state, officeId)
  if (!office) return fail('Unknown office')
  const product = state.products.find((p) => p.id === productId)
  if (!product) return fail('Unknown product')
  const blocker = localiseBlocker(state, office, product, byTeam)
  if (blocker) return fail(blocker)
  const target = projectTarget(product.productTypeId, [], 'update', product.size)
  const budget = projectBudget(target)
  const budgetProblem = budgetBlocker(state, budget)
  if (budgetProblem) return fail(budgetProblem)
  state.money -= budget
  office.project = {
    id: state.nextId++,
    name: product.name,
    kind: 'update',
    parentId: product.id,
    productTypeId: product.productTypeId,
    audienceId: product.audienceId,
    size: product.size,
    featureIds: [],
    target,
    localises: true,
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

/** The fit a product has once this update ships at `quality`: all its features, for its audience (a new one if it pivots), at its best quality yet. */
export function updateFit(state: GameState, product: Product, project: Project, quality: number): number {
  return projectFit(state, project, Math.max(product.quality, quality), [...product.featureIds, ...project.featureIds])
}

/**
 * The product's reach once this update ships at `quality`: its new features and any better quality reach more people,
 * and until it takes off, a better fit lets more of them find it.
 */
export function reachAfterUpdate(state: GameState, product: Product, project: Project, quality: number): number {
  const newQuality = Math.max(product.quality, quality)
  const features = [...product.featureIds, ...project.featureIds]
  const audience = project.pivotsTo ?? product.audienceId
  const found = product.hit || product.fit === undefined ? 1 : undiscovered(updateFit(state, product, project, quality)) / undiscovered(product.fit)
  const people = project.pivotsTo ? audienceFor(product.productTypeId, project.pivotsTo).reach / audienceFor(product.productTypeId, product.audienceId).reach : 1
  const growth =
    (featureReach(product.productTypeId, features, audience) / featureReach(product.productTypeId, product.featureIds, product.audienceId)) *
    (newQuality / Math.max(product.quality, 1)) ** 2 *
    project.hype *
    found *
    people
  return product.reach * growth
}

/** The product's reach after an update with these features, if finished exactly on target; for the planning dialog. */
export function estimateUpdateReach(state: GameState, productId: number, featureIds: readonly string[], grow = false): number {
  const product = state.products.find((p) => p.id === productId)
  if (!product) return 0
  const bigger = grow ? nextSize(product.size) : null
  const target = bigger ? growTarget(product.productTypeId, featureIds, product.size, bigger) : projectTarget(product.productTypeId, featureIds, 'update', product.size)
  const plan: Project = {
    id: 0,
    name: product.name,
    kind: 'update',
    parentId: product.id,
    productTypeId: product.productTypeId,
    audienceId: product.audienceId,
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
  const reach = reachAfterUpdate(state, product, plan, projectQuality(state, plan))
  return bigger ? reach * (PROJECT_SIZES[bigger].reach / PROJECT_SIZES[product.size].reach) : reach
}

/** Bigger releases move reputation further, both ways. */
function reputationFromRelease(state: GameState, project: Project, quality: number, share: number): void {
  const change = ((quality - REPUTATION_NEUTRAL_QUALITY) / REPUTATION_DIVISOR) * share * PROJECT_SIZES[project.size].reputation
  state.reputation = Math.max(0, Math.min(REPUTATION_MAX, state.reputation + change))
}

/** The fit a release of this project would earn: its features for its audience, its quality, and the product manager steering it. */
export function projectFit(state: GameState, project: Project, quality: number, featureIds: readonly string[] = project.featureIds): number {
  const audience = project.pivotsTo ?? project.audienceId
  return Math.min(100, releaseFit(state, project.productTypeId, audience, featureIds, quality).fit * pmFitFactor(state, officeRunning(state, project)))
}

/** The market at launch, plus a little luck per release. */
function launchDemand(state: GameState, productTypeId: string): number {
  return marketDemand(state, productTypeId) * (1 + randRange(state, -DEMAND_NOISE, DEMAND_NOISE))
}

/** Takes off now if it is ready to. */
function maybeTakeOff(state: GameState, product: Product): void {
  if (!product.hit && takeoffBlocker(state, product) === null) takeOff(state, product)
}

function shipNewProduct(state: GameState, office: Office, project: Project, campaign: Tier | undefined): Result {
  const quality = projectQuality(state, project)
  const cost = campaign ? campaignCost(state, project, quality, campaign) : 0
  if (campaign && cost > state.money) return fail('Not enough money for that campaign')

  // Until it takes off, a product reaches only the few who go looking for it.
  const fit = projectFit(state, project, quality)
  const reach = computeReach(project, quality, state.reputation, launchDemand(state, project.productTypeId)) * pmReachFactor(state, office) * undiscovered(fit)
  const bugs = releaseBugs(project)
  state.money -= cost

  const product: Product = {
    id: project.id,
    name: project.name,
    productTypeId: project.productTypeId,
    audienceId: project.audienceId,
    size: project.size,
    featureIds: [...project.featureIds],
    quality,
    releaseDay: state.day,
    reach,
    users: reach * LAUNCH_ADOPTERS,
    bugs,
    pendingBugs: 0,
    hit: false,
    fit,
    totalRevenue: 0,
    updates: [],
    boostUntil: 0,
    boostUsers: 0,
  }
  // A team with nothing of its own to look after takes on what it launched.
  if (office.productId === undefined || !state.products.some((p) => p.id === office.productId)) office.productId = product.id
  if (campaign) {
    // As priced (`campaignAudience`): everyone it could reach, not only those who find it by themselves.
    const everyone = product.reach / undiscovered(fit)
    const audience = Math.min(everyone, PROMO_AUDIENCE * settledUsers(state, product.productTypeId, product.featureIds, everyone))
    startBoost(product, CAMPAIGNS[campaign], state.day, audience)
  }
  state.products.push(product)
  state.shippedCount += 1
  reputationFromRelease(state, project, quality, 1)
  maybeTakeOff(state, product)
  moraleFromRelease(state, quality)
  office.project = null
  state.events.push({ type: 'shipped', productId: project.id, update: false, reach, bugs, quality })
  return OK
}

/** A roadmap item ships: it counts as built, and what it does at once (reach, fit, bugs, quality) is done; the rest is read from `itemEffects`. */
function buildItem(state: GameState, product: Product, item: WorkItem): void {
  const { effect } = item
  product.roadmap = (product.roadmap ?? []).filter((id) => id !== item.id)
  if (product.roadmap.length === 0) delete product.roadmap
  if (item.companionId) {
    const companion = launchCompanion(state, item.companionId)
    if (companion) {
      state.events.push({ type: 'notice', text: `${companion.name} is out: it will make ${product.name} bigger while a floor on Companions looks after it.`, sound: 'milestone' })
    }
    return
  }
  product.built = [...(product.built ?? []), item.id]
  if (effect.reach) product.reach *= 1 + effect.reach
  if (effect.fit) {
    product.fit = Math.max(0, Math.min(100, (product.fit ?? 0) + effect.fit))
    product.peakFit = Math.max(0, Math.min(100, (product.peakFit ?? product.fit) + effect.fit))
  }
  if (effect.bugs) product.bugs *= 1 - effect.bugs
  if (effect.quality) product.quality = Math.min(100, product.quality + effect.quality)
  state.events.push({ type: 'notice', text: `${item.name} is live on ${product.name}.`, sound: 'milestone' })
}

/** An update renews users' interest, adds its features, and ships a few bugs of its own. */
function shipUpdate(state: GameState, office: Office, project: Project): Result {
  const product = state.products.find((p) => p.id === project.parentId)
  if (!product) return fail('The product to update is gone')

  const quality = projectQuality(state, project)
  // Hidden at first: users find them over the following weeks, and a well-made product has fewer.
  const bugs = releaseBugs(project) * bugProneness(product.quality)
  const fit = updateFit(state, product, project, quality)
  const before = { reach: product.reach, fit: product.fit ?? fit, quality: product.quality }
  product.reach = reachAfterUpdate(state, product, project, quality)
  // A clear spec finds more people for the same work, a vague one fewer.
  if (project.spec) product.reach *= 1 + (SPEC_REACH * (project.spec.clarity - 50)) / 50
  product.fit = fit
  product.peakFit = fit
  if (project.pivotsTo) pivot(state, product, project.pivotsTo)
  if (project.grows) {
    product.reach *= (PROJECT_SIZES[project.grows].reach / PROJECT_SIZES[product.size].reach) * pmReachFactor(state, office)
    state.events.push({ type: 'notice', text: `${product.name} grew into a ${PROJECT_SIZES[project.grows].name} product.`, sound: 'milestone' })
    product.size = project.grows
  }
  if (project.polishes) product.bugs *= 1 - POLISH_FIX_SHARE
  const item = project.itemId ? getWorkItem(project.itemId) : undefined
  if (item) buildItem(state, product, item)
  if (project.localises && euShareOf(product) === 0) {
    // Europe is a market of its own: the product gains reach there, and its first users arrive as a launch's do.
    const gain = euGain(product)
    product.reach *= 1 + gain
    product.euShare = gain / (1 + gain)
    product.euUsers = product.reach * product.euShare * LAUNCH_ADOPTERS
    product.users += product.euUsers
    state.events.push({ type: 'notice', text: `${product.name} is out in Europe.`, sound: 'milestone' })
  }
  product.pendingBugs += bugs
  product.updates.push({ day: state.day })
  product.featureIds.push(...project.featureIds)
  product.quality = Math.max(product.quality, quality)
  reputationFromRelease(state, project, quality, UPDATE_REPUTATION_SHARE)
  moraleFromRelease(state, quality, UPDATE_REPUTATION_SHARE)
  maybeTakeOff(state, product)
  const bump = project.spec?.bump ?? bumpFor(project.featureIds.length, project.itemId !== undefined)
  product.version = bumped(versionOf(product), bump)
  const note: ReleaseNote = {
    version: formatVersion(product.version),
    title: project.spec?.title ?? '',
    day: state.day,
    by: officeName(state, office),
    ...(project.spec ? { clarity: Math.round(project.spec.clarity) } : {}),
    reachBefore: before.reach,
    reachAfter: product.reach,
    fitBefore: before.fit,
    fitAfter: product.fit ?? fit,
    qualityBefore: before.quality,
    qualityAfter: product.quality,
    bugsShipped: bugs,
  }
  addNote(product, note)
  office.project = null
  state.events.push({ type: 'shipped', productId: product.id, update: true, reach: product.reach, bugs, quality })
  return OK
}

/** Adds or takes out a feature of a new product while it is being built: the target follows, the work done stays. */
export function reshapeProject(project: Project, change: { add?: string; remove?: string }): void {
  if (change.remove) project.featureIds = project.featureIds.filter((id) => id !== change.remove)
  if (change.add && !project.featureIds.includes(change.add)) project.featureIds.push(change.add)
  project.target = projectTarget(project.productTypeId, project.featureIds, 'new', project.size)
}
