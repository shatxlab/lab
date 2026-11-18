// Synthetic acceptance only. No player journals; does not enable the live v12 browser flow.
// npx esbuild scripts/tycoon/stage6-founding-fixtures.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/stage6-founding-fixtures.mjs
// node /tmp/stage6-founding-fixtures.mjs
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { createCareerSave, deserializeCareerSave, serializeCareerSave, settleCareerSave } from '../../src/lib/tycoon/career-save'
import { foundPaidCompany, foundingOffers, quoteFounding } from '../../src/lib/tycoon/paid-founding'
import { createInitialState, serialize } from '../../src/lib/tycoon/sim/state'
import { advance } from '../../src/lib/tycoon/sim/tick'
import { unwrap } from '../../tests/tycoon/paid-founding-fixtures'
for (const seed of [1, 2, 8]) {
  const source = unwrap(createCareerSave(createInitialState(seed), { careerId: `synthetic-career-${seed}`, companyId: 'first' }))
  source.game.day = 1200
  source.game.money = 2_000_000
  source.game.gameOver = true
  source.game.ending = { kind: 'ipo', day: 1200, worth: 100_000_000 }
  source.game.research.known = ['ci_pipeline', 'user_research']
  source.game.research.done = ['ci_pipeline', 'user_research']
  const settled = unwrap(settleCareerSave(source))
  for (const ambition of ['modest', 'studio', 'venture'] as const) {
    const candidates = unwrap(foundingOffers(settled)).offers
    const candidateIds = ambition === 'studio' ? candidates.filter((p) => p.role === 'designer' || p.role === 'tester').map((p) => p.id) : []
    const quote = unwrap(quoteFounding(settled, { companyId: `synthetic-${ambition}`, companyName: `Synthetic ${ambition}`, ambition, focus: 'web_app', candidateIds }))
    const founded = unwrap(foundPaidCompany(settled, quote))
    const encoded = unwrap(serializeCareerSave(founded))
    assert.deepEqual(unwrap(deserializeCareerSave(encoded)), founded)
    writeFileSync(`/tmp/tycoon-stage6-founding-${seed}-${ambition}.career.json`, encoded)
    writeFileSync(`/tmp/tycoon-stage6-founding-${seed}-${ambition}.json`, serialize(founded.game))
    const observed = structuredClone(founded.game)
    advance(observed, 90) // Unattended startup smoke, not a played product/founding policy or survival guarantee.
    assert.equal(observed.products.length, 0)
    assert.equal(observed.stage, ambition === 'modest' ? 0 : 1)
    console.log(`seed ${seed} ${ambition}: investment $${quote.selection.investment}, setup $${quote.costs.setup}, signing $${quote.costs.signing}, monthly burn $${quote.costs.monthlyBurn}, headcount ${quote.staff.length}/${quote.desks}, runway ${quote.runwayMonths?.toFixed(2)} months; unattended day ${observed.day} cash $${Math.round(observed.money)}, ended ${observed.gameOver}`)
  }
}
