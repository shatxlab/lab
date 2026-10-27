# KingsRoad roadmap (`/kingsroad`)

The single source of TODOs and design notes for the game. Nothing here is blocking: the ten maps below build, pass
their tests and ship.

## Where it stands (2026-10-27)

Ten maps on one canvas (the phone-shaped field, woods along the top, castle wall and gate along the bottom), each opened by
winning the one before it. In `src/lib/kingsroad/sim/maps.ts`: meadow, ford, crossroads, switchback, rivers, serpent,
saltire, gorge, trident, citadel (8 to 28 waves, `toughness` 1 to 2). Difficulty was tuned with
`scripts/kingsroad/playthrough.ts` (usage in its header): run it over several seeds after any balance change. The bot never
calls waves early and only uses the volley, so it is a floor, not an average player. The warlord waves (10, 20, last) are
where it loses most, and Crossroads was eased from 1.6 to 1.4 after a player found it near-impossible.

**Next: the player plays maps 4 to 10.** Only the bot has played them. Watch Twin Rivers, The Gorge and Last Stand.
The lever is `toughness` per map; wave counts are the other (Last Stand is 28 waves, about 23 minutes).

## Next: maps 11 to 20 (the second canvas)

Decided with the user, not started. **A new canvas every 10 maps, and something new in the gameplay with each one.**
Ten maps is the unit: the first ten teach and exhaust the meadow canvas, the next ten arrive with a new look, new
rules and new enemies, so the second batch is not just harder roads.

**Canvas.** A different setting from the meadow, with its own palette, scenery, road surface and gate/wall art. Today
the look is baked in `render/draw.ts` (`COLORS`, `ROAD`, `HOUSES`, `TREELINE`, `sceneryFor`, keyed by map id), so
the first step is to make a canvas/theme a property of the map (a `theme` field on `MapDef`, or a canvas id) and draw
from it. The simulation (`sim/`) stays theme-free. Keep the field size and `GATE`/`WALL_Y` unless the new canvas truly
needs otherwise: the plot generator and map tests assume them.

**New tower upgrades (archers first).** Beyond the three levels, archers branch into special arrows, picked on
upgrade. Ideas so far:
- *Lune (moon) arrows*, and *fire arrows*. Fire: a burn that keeps damaging after the hit. Lune: to be designed (a
  crit, a mark that makes the target take more damage, or hits that pass through).
- Whether the other towers (catapult, frost, ballista) get a branch too, or only archers in this batch.
- Open design points: is the branch a level-4 choice, a replacement for level 3, or a one-time side-grade with its own
  cost? Is it per tower or unlocked globally by winning a map? How does it show on the tower card (the cards already
  show what each level gives) and in `i18n.ts` (English and Russian together)?

**New enemies.** Ones that make the new upgrades matter and that the meadow's five (grunt, runner, brute, bat, boss)
do not cover. Ideas to pick from: an armoured foe that shrugs off small arrows (rewards ballistas and catapults), a
foe that resists or is immune to fire (so fire arrows are not always right), a healer or shield-bearer that supports
the column, a swarm of tiny fast ones, a flying foe tougher than bats. Each needs a `FOES` entry in `sim/balance.ts`, a
roster rule in `sim/waves.ts` (`waveRoster`, `SPACING`), a drawing in `render/draw.ts`, and a bot-visible counter.

**Pacing.** Unlock the new upgrades and enemies at the start of the second canvas, not mid-batch, and consider
introducing them gently on map 11 the way meadow introduces the first five. Maps 11 to 20 need their own `toughness`
ramp; they should start near where map 10 ends and not reset to 1.

**Practical.**
- The bot (`playthrough.ts`) needs to know the new upgrades to be a fair judge: teach it to take the branch, or its
  results on maps 11+ will read too hard.
- `meta.ts` unlocks by list order and the save is keyed by `MapId`, so more maps just extend the list, but the menu
  (`KingsroadApp.tsx`, ten cards in a grid) will want grouping by canvas once there are twenty.
- Save key is `lab:kingsroad:v1`; if per-tower branches or global unlocks are stored, bump it and keep `normalizeSave`
  tolerant.
- Reuse the plot generation approach from the maps 4 to 10 session: pick road shapes, then greedily place plots clear of
  the road (more than `ROAD_HALF + towerRadius(3)`), apart from each other (more than `PLOT_REACH * 2 - 6`) and in reach
  of the archers. `tests/kingsroad/maps.test.ts` checks all of it for every map.

## Later (every further 10 maps)

The same pattern: a new canvas, a new mechanic, new enemies. Nothing designed yet; decide when maps 11 to 20 are done.
