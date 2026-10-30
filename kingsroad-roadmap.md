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

**Played through (2026-10-30).** The player has now finished map 10 (Last Stand), so all ten maps have been beaten by a
human, not only the bot. The lever for any further retune is `toughness` per map; wave counts are the other (Last Stand
is 28 waves, about 23 minutes). Per-map feedback on Twin Rivers, The Gorge and Last Stand was not recorded: ask before
retuning them.

**Next: maps 11 to 20**, below.

## Next: maps 11 to 20 (the second canvas)

Decided with the user, not started. **A new canvas every 10 maps, and something new in the gameplay with each one.**
Ten maps is the unit: the first ten teach and exhaust the meadow canvas, the next ten arrive with a new look, new
rules and new enemies, so the second batch is not just harder roads.

**Canvas (groundwork done 2026-10-30).** Each `MapDef` has a `canvas: CanvasId` (today only `"meadow"`, in
`sim/types.ts`) and `render/themes.ts` holds a `Theme` per canvas: woods, ground and courtyard colours, road, plot pads,
town houses, treeline, gate colours. `draw.ts` reads them through `THEMES[map.canvas]`; the meadow's values are the old
ones, so nothing looks different. The simulation only carries the id. To add the second canvas: extend `CanvasId`, add a
`THEMES` entry, set `canvas` on maps 11 to 20. Still baked in and not themeable: the tufts, trees, wall, courtyard
cobbles and horde, which come from Lone Tower's `sprites.ts` (`COLORS`); a very different setting (snow, desert) needs
those parameterised there, or its own drawing in `draw.ts`. Keep the field size and `GATE`/`WALL_Y` unless the new
canvas truly needs otherwise: the plot generator and map tests assume them.

**Archer branches (built 2026-10-30, off until map 11).** Decided with the user: the branch *replaces level 3*, picked on
the 2 to 3 upgrade, per tower. `MapDef.archerBranches` turns it on (false for maps 1 to 10, so they play as before; set
it true on maps 11 to 20). `upgrade(game, plot, branch)` must be given a branch exactly at the fork (`atFork`) and none
otherwise; `tower.branch` is `"fire" | "lune"`. Stats are `ARCHER_BRANCHES` in `sim/balance.ts`, same 100 gold as the
longbow:
- *Fire* (13 dmg, 0.5 s, range 108): the hit sets the foe burning, `BURN` 6 damage/s for 3 s, refreshed not stacked.
- *Lune* (12 dmg, 0.5 s, range 112): the hit marks the foe, `MARK` +35% damage from every source (burn included)
  for 3 s. Strong in a mixed team, weak on its own.
The tower card shows both picks with their stats at the fork (`i18n.ts`, English and Russian), fire arrows draw orange,
lune arrows pale blue with a ring on marked foes. The bot alternates fire and lune by plot. With branches forced on, it
does as well as the plain longbow on all ten maps (Last Stand 20 lives on more seeds), so the numbers are a floor, not a
tuned value: retune once there are enemies that resist fire or armoured ones. No save change was needed (towers are not
saved). Open: do the other towers get a branch in this batch? Still to decide with the enemies.

**New enemies.** Ones that make the new upgrades matter and that the meadow's five (grunt, runner, brute, bat, boss)
do not cover. Ideas to pick from: an armoured foe that shrugs off small arrows (rewards ballistas and catapults), a
foe that resists or is immune to fire (so fire arrows are not always right), a healer or shield-bearer that supports
the column, a swarm of tiny fast ones, a flying foe tougher than bats. Each needs a `FOES` entry in `sim/balance.ts`, a
roster rule in `sim/waves.ts` (`waveRoster`, `SPACING`), a drawing in `render/draw.ts`, and a bot-visible counter.

**Pacing.** Unlock the new upgrades and enemies at the start of the second canvas, not mid-batch, and consider
introducing them gently on map 11 the way meadow introduces the first five. Maps 11 to 20 need their own `toughness`
ramp; they should start near where map 10 ends and not reset to 1.

**Practical.**
- The bot already takes the archer branch (`raise` in `playthrough.ts`); teach it any new upgrade the same way.
- `meta.ts` unlocks by list order and the save is keyed by `MapId`, so more maps just extend the list, but the menu
  (`KingsroadApp.tsx`, ten cards in a grid) will want grouping by canvas once there are twenty.
- Save key is `lab:kingsroad:v1`; bump it and keep `normalizeSave` tolerant if anything new is stored (branches are
  not).
- Reuse the plot generation approach from the maps 4 to 10 session: pick road shapes, then greedily place plots clear of
  the road (more than `ROAD_HALF + towerRadius(3)`), apart from each other (more than `PLOT_REACH * 2 - 6`) and in reach
  of the archers. `tests/kingsroad/maps.test.ts` checks all of it for every map.

## Later (every further 10 maps)

The same pattern: a new canvas, a new mechanic, new enemies. Nothing designed yet; decide when maps 11 to 20 are done.
