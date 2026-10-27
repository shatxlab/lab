// Plays every Kingsroad map with a bot and prints how each game went, so a balance change can be judged on whole games.
//
//   npx esbuild scripts/kingsroad/playthrough.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/kingsroad.mjs
//   node /tmp/kingsroad.mjs [seeds] [map] [verbose]
//
// The bot is a sensible but unhurried player: it builds a fixed mix of towers on the plots that see the most road,
// brings them up a level as the waves get harder, drops the volley on whatever is closest to the gate, and never
// calls a wave early. A real player who places for the map's shape should do better.

import process from 'node:process'
import { MAX_LEVEL, TOWERS, starsFor } from '../../src/lib/kingsroad/sim/balance.ts'
import { build, callWave, castVolley, createGame, leadFoe, step, STEP, towerOn, upgrade, upgradeCost, buildCost } from '../../src/lib/kingsroad/sim/game.ts'
import { MAPS } from '../../src/lib/kingsroad/sim/maps.ts'
import { roadWithin } from '../../src/lib/kingsroad/sim/path.ts'
import type { Game, MapId, TowerKind } from '../../src/lib/kingsroad/sim/types.ts'

const PLAN: TowerKind[] = ["archer", "catapult", "archer", "frost", "ballista", "archer", "catapult", "ballista", "frost", "archer", "catapult", "ballista", "archer", "catapult", "frost", "ballista", "archer", "catapult"]

/** The level the bot wants every tower at by this wave. */
function targetLevel(wave: number): number {
  return wave < 4 ? 1 : wave < 9 ? 2 : MAX_LEVEL
}

function coverage(mapIndex: number, plot: number, kind: TowerKind): number {
  const map = MAPS[mapIndex]
  const { x, y } = map.plots[plot]
  return map.roads.reduce((sum, road) => sum + roadWithin(road, x, y, TOWERS[kind].levels[0].range), 0)
}

function decide(game: Game, mapIndex: number): void {
  const map = MAPS[mapIndex]
  const lead = leadFoe(game)
  if (lead && game.volleyLeft === 0) castVolley(game, lead.x, lead.y)
  for (;;) {
    const behind = game.towers
      .filter((tower) => tower.level < targetLevel(game.wave))
      .sort((a, b) => (upgradeCost(a) ?? 0) - (upgradeCost(b) ?? 0))[0]
    if (behind) {
      if (!upgrade(game, behind.plot)) return
      continue
    }
    const kind = PLAN[game.towers.length]
    const free = map.plots.map((_, index) => index).filter((index) => !towerOn(game, index))
    if (kind && free.length > 0) {
      if (game.gold < buildCost(kind)) return
      const plot = free.sort((a, b) => coverage(mapIndex, b, kind) - coverage(mapIndex, a, kind))[0]
      if (!build(game, plot, kind)) return
      continue
    }
    // Every plot taken: top up whatever is cheapest to raise.
    const next = game.towers.filter((tower) => upgradeCost(tower) !== null).sort((a, b) => upgradeCost(a)! - upgradeCost(b)!)[0]
    if (!next || !upgrade(game, next.plot)) return
  }
}

function play(mapIndex: number, seed: number, verbose: boolean) {
  const map = MAPS[mapIndex]
  const game = createGame(map.id as MapId, seed)
  decide(game, mapIndex)
  callWave(game)
  let lastWave = 0
  let livesAtWave = game.lives
  let tick = 0
  const leaks: Record<string, number> = {}
  while (game.status === 'playing' && tick < 60 * 60 * 40) {
    const before = new Map(game.foes.map((foe) => [foe.id, foe]))
    step(game, STEP)
    // Gone from the field without being killed: it got through the gate.
    const after = new Set(game.foes.map((foe) => foe.id))
    for (const [id, foe] of before) if (!after.has(id) && foe.hp > 0) leaks[`w${game.wave} ${foe.kind}`] = (leaks[`w${game.wave} ${foe.kind}`] ?? 0) + 1
    tick += 1
    if (tick % 30 === 0) decide(game, mapIndex)
    if (game.wave !== lastWave) {
      if (verbose && lastWave > 0) console.log(`    wave ${lastWave}: lost ${livesAtWave - game.lives} lives, gold ${game.gold}, towers ${game.towers.map((t) => t.kind[0] + t.level).join(' ')}`)
      lastWave = game.wave
      livesAtWave = game.lives
    }
  }
  if (verbose) console.log('    leaks:', JSON.stringify(leaks))
  return { status: game.status, wave: game.wave, lives: game.lives, gold: game.gold, minutes: (tick * STEP) / 60, kills: game.kills }
}

const seeds = Number(process.argv[2] ?? 5)
const only = process.argv[3]
const verbose = process.argv[4] === 'verbose'
for (const [index, map] of MAPS.entries()) {
  if (only && only !== map.id) continue
  console.log(`${map.id} (${map.waves} waves)`)
  for (let seed = 1; seed <= seeds; seed += 1) {
    const result = play(index, seed, verbose)
    const stars = result.status === 'won' ? '★'.repeat(starsFor(result.lives)) : '-'
    console.log(`  seed ${seed}: ${result.status} at wave ${result.wave}, ${result.lives} lives ${stars}, ${result.kills} kills, ${result.gold} gold left, ${result.minutes.toFixed(1)} min`)
  }
}
