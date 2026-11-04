// Synthetic saves only: v10 migration, pre-decision endings, and a continued founder's inactive blueprints.
import { writeFileSync } from 'node:fs'
import { AUDIENCES } from '../../src/lib/tycoon/data/audiences'
import { nextChapter } from '../../src/lib/tycoon/sim/chapters'
import { initialiseOperations } from '../../src/lib/tycoon/sim/operations'
import { initialisePeopleManagement } from '../../src/lib/tycoon/sim/people-management'
import { serialize } from '../../src/lib/tycoon/sim/state'
import { stage0Fixture } from '../../tests/tycoon/stage0-fixtures'
import { dayOfEra } from '../../tests/tycoon/helpers'
const s = stage0Fixture('europe')
s.day = dayOfEra(4)
initialiseOperations(s); initialisePeopleManagement(s)
s.events = []; s.lastEventDay = s.day; s.exit.closed = true; s.exit.ipoAcknowledged = true
s.surveyed = AUDIENCES.slice(0, 2).map((a) => a.id)
s.research.done = s.research.done.filter((id) => id !== 'ci_pipeline_3')
s.research.active = { id: 'ci_pipeline_3', finishDay: s.day + 100, remainingWork: 13.5 }
const legacy = JSON.parse(serialize(s)); legacy.version = 10; delete legacy.research.known
writeFileSync('/tmp/tycoon-stage4-research-legacy.json', JSON.stringify(legacy))
for (const kind of ['retired', 'bankrupt'] as const) {
  s.gameOver = true; s.ending = { kind, day: s.day, worth: s.money }
  writeFileSync(`/tmp/tycoon-stage4-research-${kind}.json`, serialize(s))
  if (kind === 'retired') writeFileSync('/tmp/tycoon-stage4-research-next.json', serialize(nextChapter(s)!))
}
