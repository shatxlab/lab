// Picks build plots for a set of roads, the way maps 4 to 20 were laid out: greedily take the spot that sees the most
// road, then the next that is clear of the road, clear of the plots so far and still in reach of the archers.
//
//   npx esbuild scripts/kingsroad/plots.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/plots.mjs
//   node /tmp/plots.mjs <count> "x,y x,y ... ; x,y x,y ..."     (roads separated by ;)
//
// Prints the roads and plots as the `road(...)` and `plots(...)` calls `sim/maps.ts` uses.

import process from 'node:process'
import { ARENA, PLOT_RADIUS, PLOT_REACH, ROAD_HALF, TOWERS, WALL_Y } from '../../src/lib/kingsroad/sim/balance.ts'
import { distanceToPath, makePath, roadWithin } from '../../src/lib/kingsroad/sim/path.ts'

const count = Number(process.argv[2] ?? 16)
const roads = (process.argv[3] ?? '')
  .split(';')
  .map((road) => makePath(road.trim().split(/\s+/).map((pair) => { const [x, y] = pair.split(',').map(Number); return { x, y } })))
const biggest = 13.5 + 3 * 1.5
const range = TOWERS.archer.levels[0].range
const gap = PLOT_REACH * 2 - 6 + 2

const picked: { x: number; y: number }[] = []
const candidates: { x: number; y: number; seen: number }[] = []
for (let x = PLOT_RADIUS; x <= ARENA.width - PLOT_RADIUS; x += 4) {
  for (let y = 20; y < WALL_Y - PLOT_RADIUS - 2; y += 4) {
    if (roads.some((road) => distanceToPath(road, x, y) <= ROAD_HALF + biggest + 1)) continue
    const seen = roads.reduce((sum, road) => sum + roadWithin(road, x, y, range), 0)
    if (seen > 70) candidates.push({ x, y, seen })
  }
}
candidates.sort((a, b) => b.seen - a.seen)
for (const spot of candidates) {
  if (picked.length >= count) break
  if (picked.every((other) => Math.hypot(other.x - spot.x, other.y - spot.y) > gap)) picked.push({ x: spot.x, y: spot.y })
}
picked.sort((a, b) => a.y - b.y || a.x - b.x)
console.log(`plots(${picked.map((p) => `[${p.x}, ${p.y}]`).join(', ')})`)
console.error(`${picked.length} plots`)
