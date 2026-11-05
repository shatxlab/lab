// Synthetic acceptance only: ready companies are constructed, not played achievements.
// npx esbuild scripts/tycoon/stage6-career-fixtures.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/stage6-career-fixtures.mjs
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { charterFixture } from '../../tests/tycoon/charter-fixtures'
import { unwrap } from '../../tests/tycoon/paid-founding-fixtures'
import { createInitialState, serialize } from '../../src/lib/tycoon/sim/state'
import { createCareerSave, settleCareerSave, deserializeCareerSave, serializeCareerSave } from '../../src/lib/tycoon/career-save'
import { quoteConsulting, startConsulting, advanceConsulting } from '../../src/lib/tycoon/consulting'
import { financeSummary } from '../../src/lib/tycoon/sim/founder-finance'
import { foundingOffers, quoteFounding, foundPaidCompany } from '../../src/lib/tycoon/paid-founding'
import { charterRequirements } from '../../src/lib/tycoon/sim/charter'
for (const ambition of ['modest', 'studio', 'venture'] as const) {
  for (const healthy of [true, false]) {
    const save = charterFixture(ambition)
    if (!healthy) save.game.products[0].fit = 0
    assert.equal(charterRequirements(save.game).every((r) => r.met), healthy)
    writeFileSync(`/tmp/tycoon-stage6-charter-${ambition}-${healthy ? 'ready' : 'blocked'}.json`, serialize(save.game))
  }
}
for (const seed of [1, 2, 8]) {
  const source = unwrap(createCareerSave(createInitialState(seed), { careerId: `synthetic-${seed}`, companyId: 'bankrupt' }))
  source.game.day = 500
  source.game.gameOver = true
  source.game.money = -100
  source.game.ending = { kind: 'bankrupt', day: 500, worth: 0 }
  let save = unwrap(settleCareerSave(source))
  for (let count = 0; count < 60; count++) {
    const offers = unwrap(foundingOffers(save))
    const dev = offers.offers.find((p) => p.role === 'developer')!
    const selection = { companyId: 'recovered', companyName: 'Synthetic Recovery', ambition: 'modest' as const, focus: 'web_app', candidateIds: [dev.id] }
    const quote = unwrap(quoteFounding(save, selection))
    if (quote.available >= quote.minimum) {
      const selected = unwrap(quoteFounding(save, { ...selection, investment: quote.minimum }))
      const founded = unwrap(foundPaidCompany(save, selected))
      assert.equal(founded.game.employees.length, 2)
      const reserve = unwrap(financeSummary(founded.finance)).liquid
      console.log(`Recovery seed ${seed}: ${count} explicitly selected contracts / ${save.game.day - source.game.day} days; earned $${quote.available}, paid Modest minimum $${quote.minimum}; company cash $${selected.companyCash}, private reserve $${reserve}`)
      break
    }
    const contract = unwrap(quoteConsulting(save, `contract-${count}`))
    const started = unwrap(startConsulting(save, contract))
    const partial = unwrap(advanceConsulting(started, 13))
    assert.equal(unwrap(financeSummary(partial.finance)).liquid, quote.available)
    save = unwrap(advanceConsulting(unwrap(deserializeCareerSave(unwrap(serializeCareerSave(partial)))), 17))
    assert.equal(unwrap(financeSummary(save.finance)).liquid, quote.available + contract.payout)
    if (count === 59) throw new Error('Recovery did not reach an affordable actual Modest start')
  }
}
