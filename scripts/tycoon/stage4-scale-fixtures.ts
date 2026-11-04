// Synthetic scale-readiness / rivalry acceptance state, never a player journal.
import { writeFileSync } from 'node:fs'
import { stage0Fixture } from '../../tests/tycoon/stage0-fixtures'
import { initialiseOperations } from '../../src/lib/tycoon/sim/operations'
import { initialisePeopleManagement } from '../../src/lib/tycoon/sim/people-management'
import { nemesisMonth } from '../../src/lib/tycoon/sim/nemesis'
import { NEMESIS_FIRST_DAYS } from '../../src/lib/tycoon/sim/balance'
import { serialize } from '../../src/lib/tycoon/sim/state'
const s = stage0Fixture('europe')
initialiseOperations(s)
initialisePeopleManagement(s)
s.hitDay = s.day - NEMESIS_FIRST_DAYS
nemesisMonth(s)
s.events = []
s.lastEventDay = s.day
s.exit.closed = true
s.exit.ipoAcknowledged = true
writeFileSync(process.argv[2] ?? '/tmp/tycoon-stage4-scale.json', serialize(s))
