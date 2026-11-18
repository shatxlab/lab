// The HR bot's steering core, shared by the single-run and campaign scripts: a sensible but unhurried player. A few
// times a second it tries 16 directions, looks where each would take it half a second from now and where the foes and
// foe shots would be by then, and goes the way with the least danger and the most gems nearby, keeping clear of the
// walls and keeping roughly to its last heading. At a level-up it takes the best pick on a fixed list: its own
// weapon, then a heal when low, then other weapons, then passives. A real player who herds the horde and plans a
// build should do better.

import { ARENA } from '../../src/lib/hr/sim/balance.ts'
import { choose, descend, step } from '../../src/lib/hr/sim/run.ts'
import type { Input, Pick, Run } from '../../src/lib/hr/sim/types.ts'

/** How far ahead the bot looks, in seconds. */
const LOOK_AHEAD = 0.5
const DIRECTIONS = 16
/** Foes further than this from a spot don't count against it. */
const DANGER_REACH = 220
/** Room the bot likes to keep between itself and a foe's edge. */
const MARGIN = 26
const GEM_REACH = 260
const GEM_WEIGHT = 0.6
/** How hard the bot wants to close in on the floor's boss. */
const BOSS_ATTRACT = 90
/** The bot stops closing in once it is this close to the boss. */
const BOSS_STOP = 140
const WALL_MARGIN = 80
const KEEP_HEADING = 0.35

const WEAPON_ORDER = ['policyBinder', 'contract', 'rubberDuck', 'serverRack', 'spreadsheet', 'stickyNotes', 'businessCard']
const PASSIVE_ORDER = ['gym', 'ergoChair', 'coffee', 'powerTie', 'sneakers', 'lanyard', 'mentor']

export function score(run: Run, pick: Pick): number {
  const signature = run.weapons[0]?.id
  switch (pick.kind) {
    case 'weapon':
      if (pick.id === signature) return 100
      return pick.level > 1 ? 80 - WEAPON_ORDER.indexOf(pick.id) : 60 - WEAPON_ORDER.indexOf(pick.id)
    case 'passive':
      return 50 - PASSIVE_ORDER.indexOf(pick.id) - (pick.level - 1)
    case 'heal':
      return run.hero.hp < run.numbers.maxHp * 0.5 ? 90 : 10
    case 'gold':
      return 0
    case 'mutation':
      // A hammer bends a pattern for the rest of the day: strong, take it over a plain level but not over heal/signature.
      return 70
  }
}

export function decidePick(run: Run): number {
  const picks = run.picks ?? []
  let best = 0
  for (let index = 1; index < picks.length; index += 1) if (score(run, picks[index]) > score(run, picks[best])) best = index
  return best
}

/** How bad it would be to stand at (x, y) in `LOOK_AHEAD` seconds. */
function danger(run: Run, x: number, y: number): number {
  let total = 0
  for (const foe of run.foes) {
    // Where the foe will be: walking straight at that spot.
    const dx = x - foe.x
    const dy = y - foe.y
    const now = Math.hypot(dx, dy)
    if (now > DANGER_REACH + foe.speed * LOOK_AHEAD) continue
    const closer = Math.min(now, foe.speed * LOOK_AHEAD)
    const distance = Math.max(1, now - closer - foe.radius)
    const weight = foe.kind === 'auditor' || foe.kind === 'middleManager' ? 6 : foe.kind === 'mondayBlob' || foe.kind === 'printerJam' ? 2 : 1
    total += (weight * MARGIN * MARGIN) / (distance * distance)
  }
  for (const shot of run.foeShots) {
    const distance = Math.max(1, Math.hypot(x - (shot.x + shot.vx * LOOK_AHEAD), y - (shot.y + shot.vy * LOOK_AHEAD)))
    total += (3 * MARGIN * MARGIN) / (distance * distance)
  }
  // Floor hazards: a vent that is blasting or about to blast within the look-ahead, and a microwave about to
  // ring. A sensible player keeps off a flashing vent.
  for (const hazard of run.hazards) {
    if (hazard.kind === 'vent') {
      if (hazard.active <= 0 && hazard.timer > LOOK_AHEAD) continue
    } else if (hazard.kind === 'microwave') {
      if (hazard.timer > 0.6) continue
    } else continue
    const distance = Math.max(1, Math.hypot(x - hazard.x, y - hazard.y) - hazard.radius)
    total += (6 * MARGIN * MARGIN) / (distance * distance)
  }
  return total
}

function gems(run: Run, x: number, y: number): number {
  let total = 0
  for (const gem of run.gems) {
    const distance = Math.hypot(gem.x - x, gem.y - y)
    if (distance < GEM_REACH) total += gem.value / (1 + distance / 40)
  }
  // The floor's boss is the point of the phase, so the bot closes in on it like a player would — but stops short
  // of its touch.
  const boss = run.foes.find((foe) => foe.id === run.bossId)
  if (boss) {
    const distance = Math.hypot(boss.x - x, boss.y - y)
    total += BOSS_ATTRACT * Math.max(0, Math.min(1, (distance - BOSS_STOP) / 120)) / (1 + distance / 60)
  }
  return total
}

let heading = { dx: 1, dy: 0 }

export function steer(run: Run): Input {
  const { hero } = run
  const reach = run.numbers.speed * LOOK_AHEAD
  let best = { dx: 0, dy: 0 }
  let bestCost = Infinity
  for (let index = 0; index < DIRECTIONS; index += 1) {
    const angle = (index / DIRECTIONS) * Math.PI * 2
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    const x = hero.x + dx * reach
    const y = hero.y + dy * reach
    const wall = [x, y, ARENA.width - x, ARENA.height - y].reduce((sum, gap) => sum + (gap < WALL_MARGIN ? (WALL_MARGIN - gap) / 10 : 0), 0)
    const cost = danger(run, x, y) - GEM_WEIGHT * gems(run, x, y) + wall - KEEP_HEADING * (dx * heading.dx + dy * heading.dy)
    if (cost < bestCost) {
      bestCost = cost
      best = { dx, dy }
    }
  }
  heading = best
  return best
}

export function playRun(run: Run, verbose = false) {
  let tick = 0
  let input: Input = { dx: 0, dy: 0 }
  let nextReport = 60
  while (run.status === 'playing') {
    if (run.cleared) {
      descend(run)
      continue
    }
    if (run.picks) {
      choose(run, decidePick(run))
      continue
    }
    // A thumb doesn't change direction sixty times a second.
    if (tick % 6 === 0) input = steer(run)
    step(run, input)
    tick += 1
    if (verbose && run.time >= nextReport) {
      nextReport += 60
      const build = run.weapons.map((weapon) => `${weapon.id}${weapon.level}`).join(' ')
      console.log(`    ${Math.round(run.time)}s: level ${run.level}, hp ${Math.round(run.hero.hp)}/${Math.round(run.numbers.maxHp)}, ${run.foes.length} foes, ${build}`)
    }
  }
  return run
}

