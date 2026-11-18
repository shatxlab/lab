import { acceptContract } from '../../src/lib/tycoon/sim/contracts'
import { startProject } from '../../src/lib/tycoon/sim/project'
import { CAFE_JOBS } from '../../src/lib/tycoon/sim/balance'
// Synthetic workspace/navigation acceptance states; no player journals.
import { moveToGarage } from '../../src/lib/tycoon/sim/offices'
import { writeFileSync } from 'node:fs'
import { initialiseOperations } from '../../src/lib/tycoon/sim/operations'
import { initialisePeopleManagement } from '../../src/lib/tycoon/sim/people-management'
import { serialize, deserialize } from '../../src/lib/tycoon/sim/state'
import { stage0Fixture } from '../../tests/tycoon/stage0-fixtures'
for (const kind of ['cafe', 'cafe-contract', 'garage', 'garage-build', 'one-floor', 'europe', 'large-company'] as const) {
  const s = stage0Fixture(kind === 'garage' || kind === 'garage-build' || kind === 'cafe-contract' ? 'cafe' : kind)
  if (kind === 'garage' || kind === 'garage-build') {
    // Layout fixture, not an earnings proof: satisfy the real paid transition prerequisites.
    s.money = 20000; s.contractsDone = CAFE_JOBS; s.stage = 1
    if (!moveToGarage(s).ok) throw new Error('Synthetic garage transition rejected')
  }
  if (kind === 'cafe-contract' && !acceptContract(s, s.contracts[0].id).ok) throw new Error('Synthetic client assignment rejected')
  if (kind === 'garage-build' && !startProject(s, 'web_app', ['accounts']).ok) throw new Error('Synthetic product assignment rejected')
  if (s.offices[0].project) s.offices[0].project.name = 'Synthetic long delivery project with engineering, design and quality work'
  if (kind === 'one-floor' || kind === 'europe' || kind === 'large-company') {
    initialiseOperations(s); initialisePeopleManagement(s)
    s.products[0].name = 'Intercontinental business intelligence and collaboration platform'
    s.employees[0].name = 'Alexandria Montgomery-Wellington the Third'
    s.exit.closed = true; s.exit.ipoAcknowledged = true
  }
  s.events = []; s.lastEventDay = s.day
  const json = serialize(s)
  if (!deserialize(json)) throw new Error(`Invalid synthetic fixture ${kind}`)
  writeFileSync(`/tmp/tycoon-stage5-workspace-${kind}.json`, json)
}
