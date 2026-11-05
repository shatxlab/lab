// Reproducible final economic diagnostics. All saves are bot-generated/synthetic and live only under /tmp.
// Bundle playthrough.ts to /tmp/tycoon-stage7-bot.mjs first. Never consumes a player's journal.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createCareerSave, deserializeCareerSave, serializeCareerSave, settleCareerSave } from '../../src/lib/tycoon/career-save'
import { createInitialState, deserialize, serialize } from '../../src/lib/tycoon/sim/state'
import { foundPaidCompany, foundingOffers, quoteFounding } from '../../src/lib/tycoon/paid-founding'
import { financeSummary, type VentureAmbition } from '../../src/lib/tycoon/sim/founder-finance'
import { advanceConsulting, quoteConsulting, startConsulting } from '../../src/lib/tycoon/consulting'
import { advanceDay, drainEvents } from '../../src/lib/tycoon/sim/tick'
import { describePendingEvent, resolveRandomEvent } from '../../src/lib/tycoon/sim/events'
import { assignOperation } from '../../src/lib/tycoon/sim/operations'
import { declineBuyout, ipoBlocker, goPublic } from '../../src/lib/tycoon/sim/exit'
import { createStore, MS_PER_DAY } from '../../src/lib/tycoon/store'
import { businessOverview } from '../../src/lib/tycoon/sim/business'
import type { FinanceResult } from '../../src/lib/tycoon/sim/founder-finance'
const unwrap = <T>(r: FinanceResult<T>): T => { if (!r.ok) throw new Error(r.reason); return r.value }
const dir = '/tmp/tycoon-stage7-economic'; mkdirSync(dir, { recursive: true })
const botHash = createHash('sha256').update(readFileSync('/tmp/tycoon-stage7-bot.mjs')).digest('hex')
const root = (seed: number) => unwrap(createCareerSave(createInitialState(seed), { careerId: `played-${seed}`, companyId: 'first' }))
const roundtrip = (s: ReturnType<typeof root>) => unwrap(deserializeCareerSave(unwrap(serializeCareerSave(s))))
function run(seed: number, policy: string, label: string, resume?: ReturnType<typeof createInitialState>, extra: Record<string, string> = {}, years = '12') {
  const path = `${dir}/${label}`, stage = `${path}-stages`; mkdirSync(stage, { recursive: true })
  if (resume) writeFileSync(`${path}-input.json`, serialize(resume))
  const key = JSON.stringify({ botHash, seed, policy, extra, years, resume: resume ? createHash('sha256').update(serialize(resume)).digest('hex') : null })
  const cached = process.env.ACCEPTANCE_RESUME === '1' && existsSync(`${path}-cache-key.json`) && readFileSync(`${path}-cache-key.json`, 'utf8') === key
  const output = cached ? readFileSync(`${path}.log`, 'utf8') : execFileSync(process.execPath, ['/tmp/tycoon-stage7-bot.mjs', String(seed), years, 'quiet'], {
    env: { ...process.env, BOT_POLICY: policy, BOT_RESUME: resume ? `${path}-input.json` : '',
      FINAL_SAVE: `${path}.json`, METRICS_SAVE: `${path}-metrics.json`, SAVE_DIR: stage, ...extra }, timeout: 120000, encoding: 'utf8',
  })
  writeFileSync(`${path}.log`, output)
  writeFileSync(`${path}-cache-key.json`, key)
  const game = deserialize(readFileSync(`${path}.json`, 'utf8')); assert.ok(game)
  const metrics = JSON.parse(readFileSync(`${path}-metrics.json`, 'utf8'))
  const journal = game.journal.filter((e) => e.day >= (game.chapterStartDay ?? 0))
  const counts: Record<string, number> = {}; for (const e of journal) counts[e.kind] = (counts[e.kind] ?? 0) + 1
  const summary = { seed, policy, label, day: game.day, companyDays: game.day - (game.chapterStartDay ?? 0), elapsedDays: game.day - (resume?.day ?? 0), ending: game.ending?.kind ?? 'running',
    money: Math.round(game.money), revenue: Math.round(game.lifetimeRevenue), staff: game.employees.length, floors: game.offices.length,
    stageDays: journal.filter((e) => e.kind === 'stage').map((e) => ({ day: e.day, text: e.text })), counts,
    journalEntriesPerCompanyDay: journal.length / Math.max(1, game.day - (game.chapterStartDay ?? 0)),
    explicitOperatingDecisionsPerCompanyDay: journal.filter((e) => /^(operations\.|people\.lead\.|people\.conversation|end\.)/.test(e.kind)).length / Math.max(1, game.day - (game.chapterStartDay ?? 0)), // Core hiring/project commands do not all journal; not a complete human-click count.
    monthlySamples: metrics.samples.length, lastDecisions: metrics.decisions, lastReviews: metrics.reviews }
  console.log(`${label}: ${summary.ending} at ${summary.companyDays} company days; $${summary.money}, ${summary.staff} staff, ${summary.floors} floors`)
  return { game, summary }
}
const pace = []
// Earned IPO-ready active state for actual-island browser acceptance; no fixture promotion or rewinding an exit.
const ready = run(1, 'observed', 'earned-ready', undefined, { BOT_STOP_AT_IPO: '1' }).game
assert.equal(ready.gameOver, false)
const earned = root(1); earned.game = ready
writeFileSync('/tmp/tycoon-stage7-earned-ready.json', unwrap(serializeCareerSave(earned)))
// Close the genuinely played ready first company, then compare paid starts on its real private proceeds.
let source = root(1); source.game = structuredClone(ready); assert.equal(goPublic(source.game).ok, true)
source = roundtrip(unwrap(settleCareerSave(source)))
assert.ok(unwrap(financeSummary(source.finance)).liquid > 0)
const starts = []
for (const ambition of ['modest', 'studio', 'venture'] as VentureAmbition[]) {
  const offered = unwrap(foundingOffers(source))
  const candidateIds = ambition === 'studio' ? offered.offers.filter((p) => p.role === 'designer' || p.role === 'tester').map((p) => p.id) : []
  const q = unwrap(quoteFounding(source, { companyId: `paid-${ambition}`, companyName: `Played ${ambition}`, ambition, focus: 'web_app', candidateIds }))
  assert.equal(q.affordable, true)
  const next = roundtrip(unwrap(foundPaidCompany(source, q)))
  assert.equal(unwrap(financeSummary(next.finance)).liquid, unwrap(financeSummary(source.finance)).liquid - q.selection.investment)
  assert.equal(next.game.products.length, 0)
  const end = run(1, 'observed', `paid-${ambition}`, next.game, { BOT_EXIT: 'sold' })
  next.game = end.game; const closed = roundtrip(unwrap(settleCareerSave(next)))
  starts.push({ ambition, minimum: q.minimum, investment: q.selection.investment, initialCompanyCash: q.companyCash, reserve: q.privateReserve, runwayMonths: q.runwayMonths,
    outcome: end.summary, liquidAfter: unwrap(financeSummary(closed.finance)).liquid })
}
// Earn every paid Venture charter/IPO gate through normal delivery, staffing, research and campaigns.
const ipoQuote = unwrap(quoteFounding(source, { companyId: 'earned-paid-ipo', companyName: 'Earned Professional IPO', ambition: 'venture', focus: 'web_app', candidateIds: [] }))
const paidReady = roundtrip(unwrap(foundPaidCompany(source, ipoQuote)))
const paidIpo = run(1, 'observed', 'paid-venture-ipo', paidReady.game, { OPERATING_GROWTH: '1', RIVAL_RESPONSE: '1', BOT_STOP_AT_IPO: '1' })
assert.equal(ipoBlocker(paidIpo.game), null, 'professional paid company must be able to satisfy all original revenue/profit and actual charter gates')
paidReady.game = paidIpo.game
writeFileSync('/tmp/tycoon-stage7-earned-paid-ready.json', unwrap(serializeCareerSave(paidReady)))
for (const seed of [1, 2, 3, 4, 8]) pace.push(run(seed, 'optimistic', `optimistic-${seed}`).summary)
for (let seed = 1; seed <= 12; seed++) pace.push(run(seed, 'observed', `observed-${seed}`).summary)
// Actual Store unattended baseline stops for genuine blocking decisions; never silently answers them.
const snapshot = deserialize(readFileSync(`${dir}/observed-1-stages/stage-4.json`, 'utf8'))!; assert.ok(snapshot)
const idle = structuredClone(snapshot), store = createStore(idle, 1)
for (let t = 0; t < 90 * MS_PER_DAY; t += 250) store.tick(250)
const unattended = { elapsedDays: idle.day - snapshot.day, dialog: store.dialog.value, running: store.running(), business: businessOverview(idle) }
console.log('unattended live clock:', unattended.elapsedDays, 'days; blocked:', unattended.dialog?.kind)
// Explicit neglect policy: cancel work, leave teams idle and reviews off, but answer mandatory events to keep time moving.
const neglected = structuredClone(snapshot)
for (const o of neglected.offices) if (o.assignment) assert.equal(assignOperation(neglected, o.id, { kind: 'idle' }, true).ok, true)
if (neglected.peopleManagement) neglected.peopleManagement.policy.automatic = false
for (let d = 0; d < 360 && !neglected.gameOver; d++) {
  const event = describePendingEvent(neglected); if (event) { const i = event.choices.findIndex((c) => !c.disabled); if (i >= 0) resolveRandomEvent(neglected, i) }
  if (neglected.exit.pending) declineBuyout(neglected)
  drainEvents(neglected); advanceDay(neglected)
}
const neglect = { elapsedDays: neglected.day - snapshot.day, before: businessOverview(snapshot), after: businessOverview(neglected),
  departures: neglected.journal.filter((e) => e.day >= snapshot.day && e.kind === 'people.departure').length, ended: neglected.ending }
const intentional = run(1, 'observed', 'intentional-comparison', snapshot, {}, '1').summary
const recovery = !neglected.gameOver ? run(1, 'observed', 'neglect-recovery', neglected, {}, '2').summary : null
// No-cash bankrupt recovery: every dollar comes from explicit completed 30-day personal contracts.
const recoveries = []
for (const seed of [2, 8]) {
  const played = deserialize(readFileSync(`${dir}/optimistic-${seed}.json`, 'utf8'))!
  if (played.ending?.kind !== 'bankrupt') continue
  let s = root(seed); s.game = played; s = roundtrip(unwrap(settleCareerSave(s)))
  const beforeSkills = JSON.stringify(s.game.employees); let contracts = 0
  while (contracts < 100) {
    const developer = unwrap(foundingOffers(s)).offers.find((p) => p.role === 'developer' && (p.region ?? 'us') === 'us')
    assert.ok(developer, 'solo bankrupt founder must select an ordinary paid developer, never receive a free returning friend')
    const q = unwrap(quoteFounding(s, { companyId: `recovered-${seed}`, companyName: 'Paid Recovery', ambition: 'modest', focus: 'web_app', candidateIds: [developer.id], investment: 1 }))
    if (unwrap(financeSummary(s.finance)).liquid >= q.minimum) {
      const affordable = unwrap(quoteFounding(s, { ...q.selection, investment: q.minimum }))
      s = roundtrip(unwrap(foundPaidCompany(s, affordable))); assert.equal(s.game.products.length, 0); break
    }
    const quote = unwrap(quoteConsulting(s, `contract-${++contracts}`))
    s = roundtrip(unwrap(startConsulting(s, quote)))
    s = roundtrip(unwrap(advanceConsulting(s, 7)))
    assert.equal(JSON.stringify(s.game.employees), beforeSkills)
    s = roundtrip(unwrap(advanceConsulting(s, 23)))
  }
  assert.ok(s.game.founding); recoveries.push({ seed, contracts, elapsedDays: contracts * 30, initialCompanyCash: s.game.money, remainingPersonalCash: unwrap(financeSummary(s.finance)).liquid })
}
const report = { pace, starts, paidIpo: paidIpo.summary, unattended, neglect, intentional, recovery, recoveries,
  measurementNotes: 'Monthly per-floor rate/remaining-days/bottleneck and required-work-share are estimates before RNG/overshoot, not causal output. Raw journals include system notices; command counts are separate. Decisions retain observed before/after deltas; reviewers record promotions, payroll, uncovered staff and deferrals. Human UX approval remains separate.' }
writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2))
console.log(`All economic invariants passed; report and raw monthly team/decision/management metrics: ${dir}`)
