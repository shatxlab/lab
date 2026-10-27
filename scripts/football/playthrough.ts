// Plays whole matches with the bot on both sides and prints what the games looked like, so a balance change can be judged on matches.
//
//   npx esbuild scripts/football/playthrough.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/football.mjs
//   node /tmp/football.mjs [matches] [strengthA] [strengthB]
//
// Equal squads should give watchable, close games: a few goals, shots on both sides, most passes completed. A squad
// two points stronger should win most of the time, but not all of it.

import process from 'node:process'
import { autoplay, createMatch, winner } from '../../src/lib/football/sim/match.ts'
import { makeSide } from '../../src/lib/football/sim/squad.ts'

const matches = Number(process.argv[2] ?? 200)
const strengthA = Number(process.argv[3] ?? 5)
const strengthB = Number(process.argv[4] ?? 5)

const total = { goals: [0, 0], shots: [0, 0], onTarget: [0, 0], xg: [0, 0], passes: [0, 0], done: [0, 0], tackles: [0, 0], poss: [0, 0] }
const results = { a: 0, b: 0, draw: 0 }
const scoreline = new Map<string, number>()
let goalless = 0

for (let seed = 1; seed <= matches; seed += 1) {
  const m = createMatch([makeSide(seed * 7, 'A', 1, strengthA), makeSide(seed * 13 + 1, 'B', 3, strengthB, 100)], seed, null)
  autoplay(m)
  for (const t of [0, 1] as const) {
    total.goals[t] += m.score[t]
    total.shots[t] += m.stats[t].shots
    total.onTarget[t] += m.stats[t].onTarget
    total.xg[t] += m.stats[t].xg
    total.passes[t] += m.stats[t].passes
    total.done[t] += m.stats[t].passesDone
    total.tackles[t] += m.stats[t].tackles
    total.poss[t] += m.stats[t].possession
  }
  const w = winner(m)
  if (w === 0) results.a += 1
  else if (w === 1) results.b += 1
  else results.draw += 1
  if (m.score[0] + m.score[1] === 0) goalless += 1
  const key = `${m.score[0]}-${m.score[1]}`
  scoreline.set(key, (scoreline.get(key) ?? 0) + 1)
}

const per = (n: number): string => (n / matches).toFixed(2)
console.log(`${matches} matches, strength A ${strengthA} vs B ${strengthB}`)
console.log(`wins A ${results.a}  B ${results.b}  draws ${results.draw}  goalless ${goalless}`)
for (const [i, name] of ['A', 'B'].entries()) {
  console.log(
    `${name}: goals ${per(total.goals[i])}  shots ${per(total.shots[i])}  on target ${per(total.onTarget[i])}  xG ${per(total.xg[i])}` +
      `  passes ${per(total.passes[i])} (${((total.done[i] / total.passes[i]) * 100).toFixed(0)}% done)  tackles ${per(total.tackles[i])}` +
      `  possession ${((total.poss[i] / (total.poss[0] + total.poss[1])) * 100).toFixed(0)}%`,
  )
}
console.log('scorelines:', [...scoreline.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}×${v}`).join('  '))
