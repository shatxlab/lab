// Synthetic ecosystem acceptance state, never reconstructed from the player's journal.
import { writeFileSync } from 'node:fs'
import { stage0Fixture } from '../../tests/tycoon/stage0-fixtures'
import { dayOfEra, makeProduct } from '../../tests/tycoon/helpers'
import { initialiseOperations } from '../../src/lib/tycoon/sim/operations'
import { initialisePeopleManagement } from '../../src/lib/tycoon/sim/people-management'
import { launchCompanion } from '../../src/lib/tycoon/sim/companions'
import { serialize } from '../../src/lib/tycoon/sim/state'
const s = stage0Fixture('europe')
s.day = dayOfEra(4)
s.products[0].productTypeId = 'data_platform'
s.products[0].users = 500_000
s.products[0].releaseDay = s.day - 300
s.products[0].updates = [{ day: s.day }]
for (const offer of s.contracts) offer.expiresDay = s.day + 100
initialiseOperations(s)
initialisePeopleManagement(s)
launchCompanion(s, 'mobile_app')
if (process.env.CAPACITY_REVIEW === '1') {
  launchCompanion(s, 'free_edition')
  launchCompanion(s, 'integrations')
  s.products.push(makeProduct({ id: s.nextId++, name: 'Retained ledger', role: 'side' }), makeProduct({ id: s.nextId++, name: 'Retained planner', role: 'side' }))
}
s.events = []
s.lastEventDay = s.day
s.exit.closed = true
s.exit.ipoAcknowledged = true
writeFileSync(process.argv[2] ?? '/tmp/tycoon-stage4-company.json', serialize(s))
