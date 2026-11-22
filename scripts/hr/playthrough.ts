// Plays the HR hero run with a bot, for each starter over several seeds, and prints how each run went, so a balance
// change can be judged on whole runs.
//
//   npx esbuild scripts/hr/playthrough.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/hr.mjs
//   node /tmp/hr.mjs [seeds] [department|all] [verbose|-] [level] [rarity|-] [teamLead|hrManager|recruiter|-] [fieldRep|compliance|systems|-]
//
// With a level, each starter is first grown straight to that level (stat bumps included, see `growTo`) and meets the
// matching difficulty, to check the career curve. Level 1 is a first-day coworker. The build starts empty, so this
// checks a hero who lost everything — for the real curve over consecutive days, see `campaign.ts`.

import process from 'node:process'
import { generateCoworker, starters } from '../../src/lib/roster/generate.ts'
import type { Rarity, Coworker } from '../../src/lib/roster/types.ts'
import { isClassId } from '../../src/lib/hr/sim/classes.ts'
import { LAST_FLOOR } from '../../src/lib/hr/sim/balance.ts'
import { choosePerk, difficultyFor, growTo, interviewDifficultyFor, perkOffer, perksPending } from '../../src/lib/hr/career.ts'
import { createRun } from '../../src/lib/hr/sim/run.ts'
import type { InterviewBoss } from '../../src/lib/hr/sim/types.ts'
import { createRunMetrics, playRun } from './bot.ts'

function minutes(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

const seeds = Number(process.argv[2] ?? 5)
const only = process.argv[3] === 'all' ? undefined : process.argv[3]
const verbose = process.argv[4] === 'verbose'
const careerLevel = Number(process.argv[5] ?? 1)
const rarity = process.argv[6] && process.argv[6] !== '-' ? (process.argv[6] as Rarity) : undefined
const boss = process.argv[7] && process.argv[7] !== '-' ? (process.argv[7] as InterviewBoss) : undefined
const requestedClass = process.argv[8]
if (requestedClass && requestedClass !== '-' && !isClassId(requestedClass)) throw new Error(`Unknown class: ${requestedClass}`)
const classId = isClassId(requestedClass) ? requestedClass : null
let wins = 0
let runs = 0
for (const [index, base] of starters().entries()) {
  // A card of the starter's department, the same one every run of the script.
  const starter = rarity ? generateCoworker({ rng: 1000 + index, nextId: 10 + index }, { department: base.department, rarity }) : base
  let coworker: Coworker = growTo(starter, careerLevel)
  // Each promotion takes the first perk on offer.
  while (perksPending(coworker) > 0) {
    const offer = perkOffer(coworker)
    if (offer.length === 0) break
    coworker = choosePerk(coworker, offer[0]) ?? coworker
  }
  if (only && only !== coworker.department) continue
  if (classId && coworker.department !== 'interns') continue
  console.log(`${coworker.name} (${coworker.rarity} ${coworker.department}, level ${coworker.level}, ${coworker.quirks.join(', ')}${coworker.perks.length ? `; perks ${coworker.perks.join(', ')}` : ''})`)
  let teamWins = 0
  const taken: Record<string, number> = {}
  for (let seed = 1; seed <= seeds; seed += 1) {
    const started = Date.now()
    const run = createRun(coworker, seed, boss ? interviewDifficultyFor(coworker.level, coworker.rarity, coworker.perks) : difficultyFor(coworker.level, coworker.rarity, coworker.perks), boss ? { boss, candidateId: 99 } : null, [], {}, classId)
    const metrics = classId ? createRunMetrics() : undefined
    playRun(run, verbose, metrics)
    runs += 1
    if (run.status === 'won') {
      wins += 1
      teamWins += 1
    }
    const end = run.status === 'won' ? (boss ? `beat the ${boss}` : 'beat the auditor') : `fell to ${run.lastHitBy} on floor ${run.floor}/${LAST_FLOOR}`
    const stage = run.floorsCleared >= LAST_FLOOR - 1 ? 'audit' : `floor ${run.floor}/${LAST_FLOOR}`
    const dealt = Object.entries(run.dealt)
      .sort((a, b) => b[1] - a[1])
      .map(([weapon, damage]) => `${weapon} ${Math.round(damage / 1000)}k`)
      .join(', ')
    for (const [kind, damage] of Object.entries(run.takenFrom)) taken[kind] = (taken[kind] ?? 0) + damage
    console.log(
      `  seed ${seed}: ${end} at ${minutes(run.time)} (${stage}), level ${run.level}, ${run.kills} kills, ${Math.round(run.gold)} gold | ${dealt} | ${((Date.now() - started) / 1000).toFixed(1)}s`,
    )
    if (metrics) console.log(`  metrics ${JSON.stringify(metrics)}`)
  }
  const total = Object.values(taken).reduce((sum, damage) => sum + damage, 0)
  const shares = Object.entries(taken)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, damage]) => `${kind} ${Math.round((damage / total) * 100)}%`)
    .join(', ')
  console.log(`  won ${teamWins}/${seeds}; damage taken: ${shares}`)
}
console.log(`all: won ${wins}/${runs} (${Math.round((wins / Math.max(1, runs)) * 100)}%)`)
