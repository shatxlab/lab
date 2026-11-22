// Plays consecutive days of the HR career with the bot — the hero keeps their level, XP, build and kit between days,
// exactly like the game's settlement — and prints how each day went, so the persistent progression's curve can be
// judged over a whole campaign rather than one run.
//
//   npx esbuild scripts/hr/campaign.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/hr-camp.mjs
//   node /tmp/hr-camp.mjs [seeds] [days] [fieldRep|compliance|systems|-]
//
// Each seed plays each starter through `days` days: a lost day still banks the levels earned on the way down, the
// perks are taken (the first on offer) as promotions come due, and the desk takes the day's loot.

import process from 'node:process'
import { starters } from '../../src/lib/roster/generate.ts'
import { choosePerk, defaultCareer, difficultyFor, perkOffer, perksPending, settle, careerBuild } from '../../src/lib/hr/career.ts'
import { isClassId } from '../../src/lib/hr/sim/classes.ts'
import { createRun } from '../../src/lib/hr/sim/run.ts'
import { mergeKit, type ItemState } from '../../src/lib/hr/kit.ts'
import type { Run } from '../../src/lib/hr/sim/types.ts'
import { playRun } from './bot.ts'

function minutes(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

const seeds = Number(process.argv[2] ?? 5)
const days = Number(process.argv[3] ?? 10)

const requestedClass = process.argv[4]
if (requestedClass && requestedClass !== '-' && !isClassId(requestedClass)) throw new Error(`Unknown class: ${requestedClass}`)
const classId = isClassId(requestedClass) ? requestedClass : null
for (const base of starters().filter((coworker) => !classId || coworker.department === 'interns')) {
  for (let seed = 1; seed <= seeds; seed += 1) {
  console.log(`${base.name} (${base.rarity} ${base.department}) seed ${seed}`)
  let coworker = base
  let kit: ItemState[] = []
  let career = defaultCareer()
  const ends: string[] = []
  for (let day = 1; day <= days; day += 1) {
    const run: Run = createRun(coworker, 9000 + seed * 1000 + day, difficultyFor(coworker.level, coworker.rarity, coworker.perks, career.slump), null, kit, career.build, classId)
    playRun(run)
    const won = run.status === 'won'
    ends.push(won ? 'W' : 'L')
    coworker = settle(coworker, run.level, run.xp).coworker
    while (perksPending(coworker) > 0) {
      const offer = perkOffer(coworker)
      if (offer.length === 0) break
      coworker = choosePerk(coworker, offer[0]) ?? coworker
    }
    const merge = mergeKit(kit, run.lootFound, won)
    kit = merge.kit
    career = { ...career, classId, build: careerBuild(run, career.build), slump: won ? 0 : Math.min(career.slump + 1, 5) }
    console.log(
      `  day ${day}: ${won ? 'won' : `fell to ${run.lastHitBy} on floor ${run.floor}`} at ${minutes(run.time)}, level ${run.level}, floors ${run.floorsCleared}, ${Object.keys(career.build.weapons).length} weapons, kit ${kit.length}`,
    )
  }
  console.log(`  days: ${ends.join(' ')}; final level ${coworker.level}, rank ${Math.floor((coworker.level - 1) / 5)}, perks ${coworker.perks.length}`)
  }
}
