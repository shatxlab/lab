// Synthetic company-management acceptance state, not a player save or reconstructed journal.
import { writeFileSync } from 'node:fs'
import { stage0Fixture } from '../../tests/tycoon/stage0-fixtures'
import { initialiseOperations } from '../../src/lib/tycoon/sim/operations'
import { initialisePeopleManagement, peopleDay } from '../../src/lib/tycoon/sim/people-management'
import { salaryOf } from '../../src/lib/tycoon/sim/hiring'
import { serialize } from '../../src/lib/tycoon/sim/state'
const s = stage0Fixture('large-company')
initialiseOperations(s)
initialisePeopleManagement(s)
for (const [i, e] of s.employees.entries()) {
  e.name = i === 3 ? 'Alexandria Verylongname-Specialist' : e.name
  e.level = 1
  e.career!.grade = 1
  e.career!.gradeDay = 0
  e.skills = { design: 95, engineering: 95, qa: 95 }
  e.analysis = 95
  e.salary = salaryOf(e, s.day)
}
s.day += 30
peopleDay(s)
s.events = []
s.lastEventDay = s.day
s.exit.closed = true
s.exit.ipoAcknowledged = true
writeFileSync(process.argv[2] ?? '/tmp/tycoon-stage3-company.json', serialize(s))
