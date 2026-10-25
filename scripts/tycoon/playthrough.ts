// A scripted playthrough of the whole one-product game: the café, the garage hunt, the move out with the hit, then
// the workstreams, Europe, companions, tools, Absorb and the IPO. Prints a timeline so pacing can be judged.
//
//   npx esbuild scripts/tycoon/playthrough.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/playthrough.mjs
//   node /tmp/playthrough.mjs [seed] [years] [quiet]
//
// SAVE_DIR=<dir> also writes the game as it enters each stage (stage-N.json), to load into the real UI.
// The bot is an optimistic player: it reads the true fit of a release (a real player reads it through an analyst's eye).

import { writeFileSync } from 'node:fs'
import process from 'node:process'
import { serialize } from '../../src/lib/tycoon/sim/state.ts'
import { audiencesOf } from '../../src/lib/tycoon/data/audiences.ts'
import { FEATURES } from '../../src/lib/tycoon/data/features.ts'
import { ALL_ITEMS } from '../../src/lib/tycoon/data/workstreams.ts'
import { formatCount, formatMoney } from '../../src/lib/tycoon/format.ts'
import { DAYS_PER_MONTH, GARAGE_PRODUCT_LIMIT } from '../../src/lib/tycoon/sim/balance.ts'
import { promote, promotionBlocker as careerBlocker } from '../../src/lib/tycoon/sim/careers.ts'
import { companionBlocker, companionsOf } from '../../src/lib/tycoon/sim/companions.ts'
import { COMPANIONS } from '../../src/lib/tycoon/data/companions.ts'
import { acceptContract, contractBlocker } from '../../src/lib/tycoon/sim/contracts.ts'
import { dailyIncome, monthlyBurn } from '../../src/lib/tycoon/sim/economy.ts'
import { describePendingEvent, resolveRandomEvent } from '../../src/lib/tycoon/sim/events.ts'
import { ipoBlocker, goPublic } from '../../src/lib/tycoon/sim/exit.ts'
import { NOT_FIT_YET, releaseFit, takeoffBlocker } from '../../src/lib/tycoon/sim/fit.ts'
import { availableFixers, fixBlocker, startFix } from '../../src/lib/tycoon/sim/fixes.ts'
import { RESEARCH } from '../../src/lib/tycoon/data/research.ts'
import { researchBlocker, startResearch } from '../../src/lib/tycoon/sim/research.ts'
import { foundStudio } from '../../src/lib/tycoon/sim/founding.ts'
import { hire, hireCost, ROLE_DISCIPLINE } from '../../src/lib/tycoon/sim/hiring.ts'
import { newProductBlocker, updateBlocker, localiseBlocker } from '../../src/lib/tycoon/sim/lifecycle.ts'
import { freeDesks, moveOut, moveOutBlocker, moveToGarage, moveToGarageBlocker, newOfficeCost, openOffice, openOfficeBlocker, officesIn, staffOf } from '../../src/lib/tycoon/sim/offices.ts'
import { nextItem, setRoadmap } from '../../src/lib/tycoon/sim/roadmap.ts'
import { shipProject, startProject, startUpdate, unlockedProductTypes } from '../../src/lib/tycoon/sim/project.ts'
import { absorbDesks, acquire, acquisitionBlocker, acquisitionPrice, rivalProductsOf } from '../../src/lib/tycoon/sim/rivals.ts'
import { capacityOf, loadOf } from '../../src/lib/tycoon/sim/scale.ts'
import { createInitialState } from '../../src/lib/tycoon/sim/state.ts'
import { sunsetBlocker, sunsetProduct } from '../../src/lib/tycoon/sim/sunset.ts'
import { agentCost, availableAgents, levelOf, setAutonomy } from '../../src/lib/tycoon/sim/agents.ts'
import { setWorkstream } from '../../src/lib/tycoon/sim/teams.ts'
import { nemesisRival, strikeBack, strikeBackBlocker, strikeBackCost } from '../../src/lib/tycoon/sim/nemesis.ts'
import { advanceDay, drainEvents } from '../../src/lib/tycoon/sim/tick.ts'
import { featureLock } from '../../src/lib/tycoon/sim/unlocks.ts'
import { estimateDays } from '../../src/lib/tycoon/sim/work.ts'
import { isBuilder, type BuilderRole, type GameState, type Office, type Product, type Workstream } from '../../src/lib/tycoon/sim/types.ts'
import { marketDemand } from '../../src/lib/tycoon/sim/market.ts'
import { MARKET_COLD, TAKEOFF_MAX_CROWDING } from '../../src/lib/tycoon/sim/balance.ts'
import { interest, marketCrowding, missingFeatures, targetUsers } from '../../src/lib/tycoon/sim/products.ts'
import { STAGES } from '../../src/lib/tycoon/data/stages.ts'

const seed = Number(process.argv[2] ?? 1)
const years = Number(process.argv[3] ?? 12)
const quiet = process.argv[4] === 'quiet'
const state = createInitialState(seed)
const log: string[] = []
const say = (text: string) => {
  const line = `Y${(state.day / 360 + 1).toFixed(2)} d${state.day} ${text}`
  log.push(line)
  if (!quiet) console.log(line)
}

foundStudio(state, 'Bot', 'Botworks')
const hit = () => state.products.find((p) => p.id === state.signatureId)

function answerEvent(): void {
  const view = describePendingEvent(state)
  if (!view) return
  const open = view.choices.map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0)
  if (open.length) resolveRandomEvent(state, open[0])
}

/** The best-paying job the office can do in time. */
function takeJob(office: Office): boolean {
  if (contractBlocker(state, office)) return false
  const doable = state.contracts
    .map((offer) => ({ offer, days: estimateDays(state, offer.target, office) }))
    .filter(({ offer, days }) => days <= offer.days)
    .sort((a, b) => b.offer.pay / b.days - a.offer.pay / a.days)[0]
  return doable ? acceptContract(state, doable.offer.id, office.id).ok : false
}

/** The best (type, audience, features) to launch next: the highest true fit among what the studio can build. */
function bestLaunch(): { type: string; audience: string; features: string[]; fit: number } | null {
  let best: { type: string; audience: string; features: string[]; fit: number } | null = null
  for (const type of unlockedProductTypes(state)) {
    // Somewhere with room: a warm market that few others are in, and nothing of ours there already.
    if (marketCrowding(state, type.id) >= TAKEOFF_MAX_CROWDING * 0.7 || marketDemand(state, type.id) <= MARKET_COLD * 1.1 || state.products.some((p) => p.productTypeId === type.id)) continue
    const open = FEATURES.filter((f) => f.suits.includes(type.id) && featureLock(state, f) === null)
    for (const audience of audiencesOf(type.id)) {
      const ranked = open.map((f) => ({ f, love: (audience.likes[f.id] ?? 1) - 1 })).filter((x) => x.love > 0).sort((a, b) => b.love * b.f.value - a.love * a.f.value)
      const features = ranked.slice(0, 5).map((x) => x.f.id)
      if (features.length === 0) continue
      const fit = releaseFit(state, type.id, audience.id, features, 80).fit
      if (!best || fit > best.fit) best = { type: type.id, audience: audience.id, features, fit }
    }
  }
  return best
}

function huntStep(office: Office): void {
  if (office.project) return
  const staff = staffOf(state, office).length
  if (staff === 0) return
  const lowMoney = state.money < 4 * monthlyBurn(state) + 500
  if (lowMoney && takeJob(office)) return
  // Improve a product that has not taken off: add what its audience loves.
  const weak = state.products.filter((p) => !p.hit && updateBlocker(state, office, p) === null).sort((a, b) => (a.fit ?? 0) - (b.fit ?? 0))
  const blocked = (p: Product) => {
    const why = takeoffBlocker(state, p)
    return why !== null && why !== NOT_FIT_YET && !why.includes('stale') && state.day - p.releaseDay > 60
  }
  const stuck = state.products.find((p) => !p.hit && sunsetBlocker(state, p) === null && ((p.updates.length >= 2 && (p.fit ?? 0) < 60) || blocked(p)))
  if (stuck && sunsetBlocker(state, stuck) === null) {
    say(`kills ${stuck.name} (fit ${Math.round(stuck.fit ?? 0)})`)
    sunsetProduct(state, stuck.id)
  }
  const target = state.products.filter((p) => !p.hit && updateBlocker(state, office, p) === null).sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0))[0]
  if (target && (target.fit ?? 0) >= 40) {
    const audience = audiencesOf(target.productTypeId).find((a) => a.id === (target.audienceId ?? audiencesOf(target.productTypeId)[0].id))!
    const more = FEATURES.filter((f) => f.suits.includes(target.productTypeId) && featureLock(state, f) === null && !target.featureIds.includes(f.id) && (audience.likes[f.id] ?? 1) > 1)
      .sort((a, b) => (audience.likes[b.id] ?? 1) * b.value - (audience.likes[a.id] ?? 1) * a.value)
      .slice(0, 2)
      .map((f) => f.id)
    if (more.length && startUpdate(state, target.id, more, office.id).ok) return
  }
  if (newProductBlocker(state) === null && state.money > 2 * monthlyBurn(state)) {
    const launch = bestLaunch()
    if (launch) {
      const r = startProject(state, launch.type, launch.features, 'small', office.id, launch.audience)
      if (r.ok) say(`starts ${launch.type} for ${launch.audience} (fit ${Math.round(launch.fit)})`)
      return
    }
  }
  takeJob(office)
}

/** Sends a developer and a tester after the bugs of any product that has more than a few. */
function dispatchFixers(): void {
  for (const product of state.products) {
    if (product.bugs < 6 || fixBlocker(state, product) !== null) continue
    const dev = availableFixers(state, 'developer').sort((a, b) => b.skills.engineering - a.skills.engineering)[0]
    const tester = availableFixers(state, 'tester').sort((a, b) => b.skills.qa - a.skills.qa)[0]
    if (dev && tester) startFix(state, product.id, dev.id, tester.id)
  }
}

function hireTo(office: Office, limit: number): void {
  while (staffOf(state, office).length < limit && freeDesks(state, office) > 0) {
    const builders = staffOf(state, office).filter(isBuilder)
    const counts = { design: 0, engineering: 0, qa: 0 } as Record<string, number>
    for (const e of builders) counts[ROLE_DISCIPLINE[e.role as BuilderRole]] += 1
    const want = Object.entries(counts).sort((a, b) => a[1] - b[1])[0][0]
    const pick = state.candidates.find((c) => isBuilder(c) && ROLE_DISCIPLINE[c.role as BuilderRole] === want && (c.region ?? 'us') === (office.region ?? 'us')) ?? state.candidates.find((c) => isBuilder(c) && (c.region ?? 'us') === (office.region ?? 'us'))
    if (!pick || state.money < hireCost(pick) + 3 * monthlyBurn(state)) return
    hire(state, pick.id, office.id)
  }
}

/** The roadmap: a sensible order for the hit, rebuilt when it runs low. */
const ROADMAP_ORDER = ['load_balancer', 'onboarding_flow', 'paid_plans', 'test_automation', 'db_sharding', 'referrals', 'business_tier', 'analytics_pipeline', 'cdn', 'performance_marketing', 'eu_payments', 'enterprise_deals', 'multi_cluster', 'partnerships', 'global_edge', 'ci_pipeline', 'observability', 'perf_pass', 'admin_panel', 'eu_datacentre']
function planRoadmap(h: Product): void {
  const wanted = ROADMAP_ORDER.filter((id) => !(h.built ?? []).includes(id)).slice(0, 12)
  for (const c of COMPANIONS) {
    const id = `companion:${c.id}`
    if (companionBlocker(state, c) === null && ALL_ITEMS.some((i) => i.id === id) && wanted.length < 12) wanted.splice(3, 0, id)
  }
  if ((h.roadmap ?? []).join() !== wanted.join()) setRoadmap(state, h.id, wanted.slice(0, 12))
}

/** One floor per stream, in order of need. */
const STREAMS: Workstream[] = ['features', 'scale', 'growth', 'monetisation', 'quality', 'europe', 'tools', 'companions']

function act2(h: Product): void {
  planRoadmap(h)
  const floors = state.offices.filter((o) => o.kind === 'office')
  const available = (w: Workstream) => nextItem(state, h, w) !== undefined
  const wanted: Workstream[] = []
  if (loadOf(h) > 0.6 && available('scale')) wanted.push('scale')
  if (available('growth')) wanted.push('growth')
  if (available('monetisation')) wanted.push('monetisation')
  if (h.bugs > 15) wanted.push('quality')
  if (available('scale') && !wanted.includes('scale')) wanted.push('scale')
  if (available('companions')) wanted.push('companions')
  if (available('tools')) wanted.push('tools')
  wanted.push('quality')
  let next = 0
  let europeTaken = false
  floors.forEach((floor, i) => {
    let stream: Workstream
    if (floors.length === 1) {
      // One floor does what the hit needs most right now.
      stream = loadOf(h) > 0.8 && available('scale') ? 'scale' : h.bugs > 20 ? 'quality' : available('monetisation') && state.day % 90 < 30 ? 'monetisation' : (wanted[0] ?? 'features')
      if (stream === 'quality' && h.bugs <= 20) stream = 'features'
    } else if (i === 0) stream = 'features'
    else if ((floor.region ?? 'us') === 'eu' && !europeTaken) {
      stream = 'europe'
      europeTaken = true
    } else stream = wanted[Math.min(next++, wanted.length - 1)]
    if (floor.workstream !== stream) setWorkstream(state, floor.id, stream)
    floor.productId ??= h.id
    hireTo(floor, 12)
  })
  const reserve = 6 * monthlyBurn(state)
  if (openOfficeBlocker(state) === null && state.money > newOfficeCost(state) + reserve && floors.every((f) => freeDesks(state, f) <= 3)) {
    const region = state.stage >= 5 && officesIn(state, 'eu').length === 0 ? 'eu' : officesIn(state, 'us').length < 5 ? 'us' : undefined
    const r = openOffice(state, region)
    if (r.ok) say(`opens a floor (${state.offices.length} offices)`)
  }
  // The rival: strike back whenever it is allowed and they are not already behind.
  if (state.nemesis && strikeBackBlocker(state) === null && (nemesisRival(state)?.ratio ?? 0) > 0.75 && state.money > 4 * strikeBackCost(state)) {
    strikeBack(state)
    say(`strikes back at ${nemesisRival(state)?.name}`)
  }
  // Europe: localise once an office is there (the Europe stream does it by itself).
  const target = state.rivals.find((r) => acquisitionBlocker(state, r) === null && state.money > acquisitionPrice(state, r) + reserve * 2)
  if (target) {
    const desks = absorbDesks(state, target)
    if (acquire(state, target.id, []).ok) say(`absorbs ${target.name} (${desks} desks free)`)
  }
}

/** Agents: turns each one on at "acts, you review" once it exists and the studio can afford a month of it. */
function agents(): void {
  for (const kind of availableAgents(state)) {
    if (levelOf(state, kind.id) === 0 && state.money > 30 * agentCost(state, kind, 2) + 6 * monthlyBurn(state)) setAutonomy(state, kind.id, 2)
  }
}

function research(): void {
  if (state.research.active) return
  const reserve = 6 * monthlyBurn(state)
  const next = RESEARCH.filter((n) => researchBlocker(state, n) === null && state.money > n.cost + reserve).sort((a, b) => a.cost - b.cost)[0]
  if (next) startResearch(state, next.id)
}

/** Companions need a free slot: retire a side product once the hit is big enough to launch one. */
function freeASlot(h: Product): void {
  if (h.users < 300_000 || state.products.every((p) => p.role !== 'side') || companionsOf(state).length >= 2) return
  const side = state.products.find((p) => p.role === 'side' && sunsetBlocker(state, p) === null)
  if (side) {
    say(`retires side product ${side.name}`)
    sunsetProduct(state, side.id)
  }
}

function botStep(): void {
  if (state.pendingEvent) answerEvent()
  for (const event of drainEvents(state)) {
    if (event.type === 'projectReady') {
      const office = state.offices.find((o) => o.id === event.officeId)
      if (office?.project?.kind === 'new' || office?.project?.kind === 'contract' || (office?.project?.kind === 'update' && !office.project.byTeam)) shipProject(state, undefined, office.id)
    }
    if (event.type === 'breakout') say(`HIT: ${state.products.find((p) => p.id === event.productId)?.name}`)
    if (event.type === 'stage') {
      say(`stage -> ${STAGES[event.stage]?.name}`)
      // SAVE_DIR=/tmp/saves writes the game at each stage, to load into the real UI.
      if (process.env.SAVE_DIR) writeFileSync(`${process.env.SAVE_DIR}/stage-${event.stage}.json`, serialize(state))
    }
    if (event.type === 'offer') {
      // Turn down every offer: the point of the run is the hit.
      if (state.exit.pending) state.exit.pending = null
    }
  }
  dispatchFixers()
  for (const e of state.employees) if (careerBlocker(state, e) === null) promote(state, e.id)

  if (state.offices.some((o) => o.kind === 'cafe')) {
    for (const office of state.offices) if (!office.project) takeJob(office)
    if (moveToGarageBlocker(state) === null) {
      moveToGarage(state)
      say('moves into the garage')
      for (const office of state.offices) hireTo(office, 3)
    }
    return
  }
  const garage = state.offices.find((o) => o.kind === 'garage')
  if (garage) {
    hireTo(garage, state.signatureId === null ? 3 : 4)
    huntStep(garage)
    if (moveOutBlocker(state) === null && state.money > 40_000 + 4 * monthlyBurn(state)) {
      const keep = state.products.filter((p) => p.id !== state.signatureId).sort((a, b) => b.users - a.users).slice(0, 2).map((p) => p.id)
      if (moveOut(state, keep).ok) say(`moves out of the garage with ${keep.length} side products`)
    }
    return
  }
  const h = hit()
  research()
  agents()
  if (h) freeASlot(h)
  if (h) act2(h)
  if (h && ipoBlocker(state) === null) {
    say(`goes public: ${formatMoney(state.money)} cash`)
    goPublic(state)
  }
}

let nextReport = 0
for (let i = 0; i < years * 360 && !state.gameOver; i++) {
  botStep()
  advanceDay(state)
  if (state.day >= nextReport) {
    nextReport = state.day + 180
    const h = hit()
    const line = `[${STAGES[state.stage].name}] money ${formatMoney(state.money)} income ${formatMoney(dailyIncome(state))}/day staff ${state.employees.length} offices ${state.offices.length}${h ? ` | ${h.name}: ${formatCount(h.users)} users, fit ${Math.round(h.fit ?? 0)}, servers ${Math.round(loadOf(h) * 100)}% of ${formatCount(capacityOf(h))}, built ${(h.built ?? []).length}, companions ${companionsOf(state).length}, reach ${formatCount(h.reach)}, world ${(h.world ?? 1).toFixed(2)}, target ${formatCount(targetUsers(state, h))}, interest ${interest(h, state.day).toFixed(2)}, bugs ${Math.round(h.bugs)}, missing ${missingFeatures(h, state.day).length}, peak ${Math.round(h.peakFit ?? 0)}, floor ${state.offices.map((o) => o.workstream ?? '-').join('/')}, burn ${formatMoney(monthlyBurn(state) / 30)}/day` : ` | products ${state.products.length}, shipped ${state.shippedCount}, jobs ${state.contractsDone}`}`
    say(line)
  }
}
console.log(`\nEnded day ${state.day} (${(state.day / 360).toFixed(1)} years): ${state.gameOver ? JSON.stringify(state.ending) : 'still running'}; stage ${STAGES[state.stage].name}; money ${formatMoney(state.money)}; lifetime ${formatMoney(state.lifetimeRevenue)}`)
void DAYS_PER_MONTH
void GARAGE_PRODUCT_LIMIT
void localiseBlocker
void rivalProductsOf
