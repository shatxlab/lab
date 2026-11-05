// Explicitly synthetic UI fixtures. Economic playthrough evidence is generated independently by stage7-acceptance.ts.
import { writeFileSync } from 'node:fs'
import { charterFixture } from '../../tests/tycoon/charter-fixtures'
import { paidFoundingSource, unwrap } from '../../tests/tycoon/paid-founding-fixtures'
import { createCareerSave, serializeCareerSave, settleCareerSave } from '../../src/lib/tycoon/career-save'
import { createInitialState, serialize } from '../../src/lib/tycoon/sim/state'
const write = (kind: string, text: string) => writeFileSync(`/tmp/tycoon-stage7-${kind}.json`, text)
write('ipo', unwrap(serializeCareerSave(charterFixture('venture'))))
write('paid', unwrap(serializeCareerSave(paidFoundingSource())))
const bankrupt = unwrap(createCareerSave(createInitialState(1), { careerId: 'synthetic-bankrupt', companyId: 'first' }))
bankrupt.game.day = 500; bankrupt.game.money = -10; bankrupt.game.gameOver = true
bankrupt.game.ending = { kind: 'bankrupt', day: 500, worth: 0 }
write('bankrupt', unwrap(serializeCareerSave(unwrap(settleCareerSave(bankrupt)))))
const legacy = paidFoundingSource().game
legacy.legacy = [{ studio: 'Historical Only', ending: 'ipo', worth: 900000000, years: 10 }]
write('legacy', serialize(legacy))
write('fresh', serialize(createInitialState(1)))
