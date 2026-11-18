// Synthetic low-volume family fixtures; no player journal or reconstructed player state.
import { writeFileSync } from 'node:fs'
import { initialiseOperations, assignOperation } from '../../src/lib/tycoon/sim/operations'
import { initialisePeopleManagement } from '../../src/lib/tycoon/sim/people-management'
import { serialize, deserialize } from '../../src/lib/tycoon/sim/state'
import { stage0Fixture } from '../../tests/tycoon/stage0-fixtures'
import { dayOfEra } from '../../tests/tycoon/helpers'
for (const family of ['cloud_platform', 'data_platform', 'xr_experience', 'small_cloud'] as const) {
  const s = stage0Fixture('europe')
  s.day = dayOfEra(7)
  const p = s.products[0]
  p.productTypeId = family === 'small_cloud' ? 'cloud_platform' : family
  p.size = family === 'small_cloud' ? 'small' : 'medium'
  p.users = 8000; p.quality = 95; p.bugs = p.pendingBugs = 0
  p.releaseDay = s.day; p.updates = []
  initialiseOperations(s); initialisePeopleManagement(s)
  assignOperation(s, s.offices[1].id, { kind: 'standing', productId: p.id, service: 'reliability' })
  s.events = []; s.lastEventDay = s.day; s.exit.closed = true; s.exit.ipoAcknowledged = true
  const json = serialize(s)
  if (!deserialize(json)) throw new Error(`Invalid synthetic family fixture: ${family}`)
  writeFileSync(`/tmp/tycoon-stage4-family-${family}.json`, json)
}
