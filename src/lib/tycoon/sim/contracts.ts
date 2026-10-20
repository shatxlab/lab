import { CLIENTS, ENTERPRISE_CLIENTS, JOBS, type Job } from '@/lib/tycoon/data/clients'
import { formatMoney } from '@/lib/tycoon/format'
import {
  CONTRACT_ABANDON_REPUTATION,
  CONTRACT_BOARD,
  CONTRACT_DEPOSIT,
  CONTRACT_FIT,
  CONTRACT_LIFETIME_DAYS,
  CONTRACT_LOAD,
  CONTRACT_MIN_RATE,
  CONTRACT_NEW_MAX_DAYS,
  CONTRACT_NEW_MIN_DAYS,
  CONTRACT_LATE_PAY,
  CONTRACT_MAX_DAYS,
  CONTRACT_MIN_DAYS,
  CONTRACT_OFFERS,
  CONTRACT_PAY_PER_POINT,
  CONTRACT_REPUTATION,
  CONTRACT_REPUTATION_PAY,
  ENTERPRISE_BOARD,
  ENTERPRISE_DUE_SLACK,
  ENTERPRISE_GAP_MAX_DAYS,
  ENTERPRISE_GAP_MIN_DAYS,
  ENTERPRISE_LIFETIME_DAYS,
  ENTERPRISE_MAX_DAYS,
  ENTERPRISE_MIN_DAYS,
  ENTERPRISE_MIN_SIZE,
  ENTERPRISE_PAY_DAYS,
  ENTERPRISE_PAY_MULT,
  ENTERPRISE_REPUTATION,
  CONTRACT_SLACK,
  CONTRACT_SLACK_DAYS,
  REPUTATION_MAX,
} from './balance'
import { productInWork, resolveOffice, teamOf } from './offices'
import { productRevenue } from './products'
import { isResearched } from './unlocks'
import { PROJECT_SIZE_IDS, type Product } from './types'
import { pick, randInt, randRange } from './rng'
import { isReady } from './scoring'
import { DISCIPLINES, emptySkills, fail, OK, type ContractOffer, type GameState, type Office, type Result, type Skills } from './types'
import { teamRate } from './work'

const addReputation = (state: GameState, amount: number) => {
  state.reputation = Math.max(0, Math.min(REPUTATION_MAX, state.reputation + amount))
}

/** What a client pays per point of work: more for a studio with a name. */
export function payPerPoint(state: GameState): number {
  return CONTRACT_PAY_PER_POINT * (1 + CONTRACT_REPUTATION_PAY * state.reputation)
}

/** The per-discipline output of the office that gets the most done: jobs are sized for it. */
function bestRate(state: GameState): Skills {
  let best = emptySkills()
  let bestTotal = -1
  for (const office of state.offices) {
    const rate = teamRate(state, office)
    const total = DISCIPLINES.reduce((sum, d) => sum + rate[d], 0)
    if (total > bestTotal) [best, bestTotal] = [rate, total]
  }
  return best
}

/** Points of this job the team could do per day: its slowest discipline sets the pace. */
function capacity(rate: Skills, job: Job): number {
  let slowest = Infinity
  for (const d of DISCIPLINES) if (job.split[d] > 0) slowest = Math.min(slowest, Math.max(rate[d], CONTRACT_MIN_RATE) / job.split[d])
  return slowest
}

/** One job, sized for the studio as it is now: a kind of work the team is suited to, that it can finish in time. */
function makeOffer(state: GameState): ContractOffer {
  const rate = bestRate(state)
  const fit = JOBS.map((job) => ({ job, capacity: capacity(rate, job) }))
  const best = Math.max(...fit.map((f) => f.capacity))
  const { job, capacity: perDay } = pick(state, fit.filter((f) => f.capacity >= best * CONTRACT_FIT))
  const client = pick(state, CLIENTS)
  const days = randRange(state, CONTRACT_MIN_DAYS, CONTRACT_MAX_DAYS)
  const points = perDay * days * CONTRACT_LOAD
  const target = emptySkills()
  for (const d of DISCIPLINES) target[d] = Math.round(points * job.split[d])
  const pay = Math.round((points * payPerPoint(state) * randRange(state, 0.85, 1.15)) / 50) * 50
  return {
    id: state.nextId++,
    client,
    title: job.title,
    target,
    pay,
    days: Math.ceil(days * CONTRACT_SLACK + CONTRACT_SLACK_DAYS),
    expiresDay: state.day + CONTRACT_LIFETIME_DAYS,
  }
}

/** The research that puts enterprise contracts on the board. */
export const ENTERPRISE_RESEARCH = 'enterprise_sales'

/** True for a job that a big client wants done to one of the studio's products. */
export const isEnterprise = (offer: { productId?: number }): boolean => offer.productId !== undefined

/** Products big enough to interest an enterprise client, and not already being worked on or promised to one. */
export function enterpriseCandidates(state: GameState): Product[] {
  const smallest = PROJECT_SIZE_IDS.indexOf(ENTERPRISE_MIN_SIZE)
  return state.products.filter(
    (p) =>
      PROJECT_SIZE_IDS.indexOf(p.size) >= smallest &&
      !productInWork(state, p.id) &&
      !state.contracts.some((c) => c.productId === p.id),
  )
}

/** A big client wants one of the studio's big products bent to its needs: sized for the best office, and paid by what the product earns. */
function makeEnterpriseOffer(state: GameState, product: Product): ContractOffer {
  const rate = bestRate(state)
  const split = { design: 0.25, engineering: 0.55, qa: 0.2 }
  const perDay = capacity(rate, { title: '', split })
  const days = randRange(state, ENTERPRISE_MIN_DAYS, ENTERPRISE_MAX_DAYS)
  const points = perDay * days * CONTRACT_LOAD
  const target = emptySkills()
  for (const d of DISCIPLINES) target[d] = Math.round(points * split[d])
  const byWork = points * payPerPoint(state) * ENTERPRISE_PAY_MULT
  const byProduct = productRevenue(product) * ENTERPRISE_PAY_DAYS
  const pay = Math.round((Math.max(byWork, byProduct) * randRange(state, 0.9, 1.1)) / 500) * 500
  return {
    id: state.nextId++,
    client: pick(state, ENTERPRISE_CLIENTS),
    title: `a custom ${product.name}`,
    target,
    pay,
    days: Math.ceil(days * ENTERPRISE_DUE_SLACK + CONTRACT_SLACK_DAYS),
    expiresDay: state.day + ENTERPRISE_LIFETIME_DAYS,
    productId: product.id,
  }
}

/** Once a while, with Enterprise sales researched, a big client asks for one of the big products. */
function enterpriseDay(state: GameState): void {
  if (!isResearched(state, ENTERPRISE_RESEARCH)) return
  if (state.day < (state.nextEnterpriseDay ?? 0)) return
  const open = state.contracts.filter(isEnterprise).length
  const candidates = enterpriseCandidates(state)
  if (open >= ENTERPRISE_BOARD || candidates.length === 0) return
  state.contracts.push(makeEnterpriseOffer(state, pick(state, candidates)))
  state.nextEnterpriseDay = state.day + randInt(state, ENTERPRISE_GAP_MIN_DAYS, ENTERPRISE_GAP_MAX_DAYS)
}

/** Puts the opening jobs on the board. */
export function refreshContracts(state: GameState): void {
  state.contracts = Array.from({ length: CONTRACT_OFFERS }, () => makeOffer(state))
  state.nextOfferDay = state.day + randInt(state, CONTRACT_NEW_MIN_DAYS, CONTRACT_NEW_MAX_DAYS)
}

/** Once a day: jobs the client took elsewhere leave the board, and a new one turns up now and then while there is room. */
export function contractsDay(state: GameState): void {
  // An offer for a product that has since been sold or retired goes with it.
  state.contracts = state.contracts.filter(
    (c) => (c.expiresDay === undefined || c.expiresDay >= state.day) && (c.productId === undefined || state.products.some((p) => p.id === c.productId)),
  )
  enterpriseDay(state)
  // Enterprise offers have a board of their own.
  if (state.contracts.filter((c) => !isEnterprise(c)).length >= CONTRACT_BOARD || state.day < (state.nextOfferDay ?? 0)) return
  state.contracts.push(makeOffer(state))
  state.nextOfferDay = state.day + randInt(state, CONTRACT_NEW_MIN_DAYS, CONTRACT_NEW_MAX_DAYS)
}

/** Why `office` can't take this job now, or null when it can. */
export function contractBlocker(state: GameState, office: Office): string | null {
  if (office.project) return 'A project is in progress'
  return teamOf(state, office).length === 0 ? 'Hire someone first' : null
}

/** Takes a job on in an office (the first by default). It pays when every bar is full. */
export function acceptContract(state: GameState, offerId: number, officeId?: number): Result {
  if (state.gameOver) return fail('Game over')
  const office = resolveOffice(state, officeId)
  if (!office) return fail('Unknown office')
  const offer = state.contracts.find((c) => c.id === offerId)
  if (!offer) return fail('That job is gone')
  const blocker = contractBlocker(state, office)
  if (blocker) return fail(blocker)
  const product = offer.productId === undefined ? undefined : state.products.find((p) => p.id === offer.productId)
  if (offer.productId !== undefined && !product) return fail('That product is gone')
  if (product && productInWork(state, product.id)) return fail('Another team is working on it')

  state.contracts = state.contracts.filter((c) => c.id !== offerId)
  const deposit = Math.round(offer.pay * CONTRACT_DEPOSIT)
  state.money += deposit
  office.project = {
    id: state.nextId++,
    name: `${offer.title[0].toUpperCase()}${offer.title.slice(1)} for ${offer.client}`,
    kind: 'contract',
    parentId: product?.id ?? null,
    productTypeId: product?.productTypeId ?? 'web_app',
    size: product?.size ?? 'small',
    featureIds: [],
    target: { ...offer.target },
    progress: emptySkills(),
    startDay: state.day,
    readyNotified: false,
    hype: 1,
    alphaOffered: true,
    bugRisk: 1,
    contract: { client: offer.client, pay: offer.pay, dueDay: state.day + offer.days, deposit, ...(product ? { productId: product.id } : {}) },
  }
  return OK
}

/** Walks away from an office's job: no pay, and the client tells people. */
export function abandonContract(state: GameState, officeId?: number): Result {
  const office = resolveOffice(state, officeId)
  const project = office?.project
  if (!office || !project?.contract) return fail('No client work in progress')
  office.project = null
  const refund = project.contract.deposit ?? 0
  state.money -= refund
  addReputation(state, -CONTRACT_ABANDON_REPUTATION)
  state.events.push({
    type: 'notice',
    text: `You dropped the job for ${project.contract.client}${refund > 0 ? `, gave back the ${formatMoney(refund)} deposit` : ''}: -${CONTRACT_ABANDON_REPUTATION} reputation.`,
  })
  return OK
}

/** What the job pays in all if delivered today: full price on time, less after the deadline. */
export function contractPay(state: GameState, terms: { pay: number; dueDay: number }): number {
  return state.day > terms.dueDay ? Math.round(terms.pay * CONTRACT_LATE_PAY) : terms.pay
}

/** What is still to come on delivery today: the total less the deposit already received. */
export function contractBalance(state: GameState, terms: { pay: number; dueDay: number; deposit?: number }): number {
  return Math.max(0, contractPay(state, terms) - (terms.deposit ?? 0))
}

/** After the day's work on a job: warn once when it goes past its deadline, and deliver it when every bar is full. */
export function contractDay(state: GameState, office: Office): void {
  const project = office.project
  const terms = project?.contract
  if (!project || !terms) return
  if (state.day === terms.dueDay + 1 && !isReady(project)) {
    state.events.push({ type: 'notice', text: `${terms.client}'s job is late. They will only pay ${Math.round(CONTRACT_LATE_PAY * 100)}%.` })
  }
  if (!isReady(project)) return

  const pay = contractBalance(state, terms)
  state.money += pay
  state.contractsDone += 1
  const product = terms.productId === undefined ? undefined : state.products.find((p) => p.id === terms.productId)
  if (state.day <= terms.dueDay) addReputation(state, product ? ENTERPRISE_REPUTATION : CONTRACT_REPUTATION)
  // The client's changes are a release of the product itself: its users come back to full interest.
  if (product) product.updates.push({ day: state.day })
  office.project = null
  state.events.push({
    type: 'notice',
    text: `Delivered to ${terms.client}${state.day > terms.dueDay ? ', late' : ''}: +${formatMoney(pay)}${terms.deposit ? ` on top of the ${formatMoney(terms.deposit)} deposit` : ''}.${product ? ` ${product.name} is fresh again.` : ''}`,
    sound: 'ship',
  })
}
