# KingsRoad roadmap (`/kingsroad`)

The single source of TODOs and design notes for the game. Nothing here is blocking: the ten maps below build, pass
their tests and ship.

## Where it stands (2026-10-30)

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

**Maps 11 to 20 are in (2026-10-30), unplayed by a human.** A second canvas, `autumn` ("The Amber Woods": straw ground,
rust woods, mud roads), with ten maps after Last Stand: harvest, orchards, hairpin, crows, detour, parting, winding,
gauntlet, kings, watch (16 to 28 waves). All have `archerBranches: true`. New foes are introduced one a map: harvest
knights; orchards + scamps; hairpin + imps; crows + healers; detour + gargoyles, then all five. Roads were picked by
hand and plots by `scripts/kingsroad/plots.ts` (usage in its header); the menu groups maps by canvas. Bot results, 8
seeds, after three tuning rounds (avg lives left, all won unless noted): harvest 11 (1.75), orchards 13 (1.4), hairpin
14 (2.45, 7/8), crows 13 (1.3), detour 14 (1.3), parting 15 (1.4), winding 14 (1.4), gauntlet 14 (1.7), kings 11 (1.3),
watch 9 (1.4, 28 waves). **The toughness ramp is not monotone**: it follows the bot, not the number, because roads
with two or three lanes dilute fire (a map with three roads at 1.3 is harder than one road at 1.75), and a map can swing from
18 lives to near-loss across 0.4 of toughness (Hairpin: 2.3 gives 18, 2.7 gives 1). Not seen yet: the new canvas drawn in
a browser, and any human play. The rest of this section is the design record.

## Maps 11 to 20 (the second canvas): design record

Decided with the user, not started. **A new canvas every 10 maps, and something new in the gameplay with each one.**
Ten maps is the unit: the first ten teach and exhaust the meadow canvas, the next ten arrive with a new look, new
rules and new enemies, so the second batch is not just harder roads.

**Canvas (groundwork done 2026-10-30).** Each `MapDef` has a `canvas: CanvasId` (`"meadow"` and `"autumn"`, in
`sim/types.ts`) and `render/themes.ts` holds a `Theme` per canvas: woods, ground and courtyard colours, road, plot pads,
town houses, treeline, gate colours. `draw.ts` reads them through `THEMES[map.canvas]`; the meadow's values are the old
ones, so nothing looks different. The simulation only carries the id. To add a third canvas: extend `CanvasId`, add a
`THEMES` entry and a `canvases` title in `i18n.ts`, set `canvas` on its maps. Trees, tufts and the courtyard cobbles now take a
palette from the theme (`sprites.ts` defaults keep Lone Tower unchanged). Still baked in and not themeable: the tufts, trees, wall, courtyard
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

**New enemies (built 2026-10-30, off until map 11).** All five ideas are in. A map lists the ones it sends in
`MapDef.foes` (empty for maps 1 to 10, so they play as before); `FoeKind` in `sim/types.ts` is Lone Tower's five plus
`NewFoeKind`. Stats are `FOES` in `sim/balance.ts` (now with `color`, `armor`, `fireproof`, `heal`), rosters are in
`waveRoster`/`SPACING` in `sim/waves.ts`, drawing is `drawKingsroadFoe` in `render/draw.ts` (each borrows a Lone Tower
figure via `FoeSprite.color`, plus a mark):
- *Knight* (130 hp, armour 5): every hit loses 5 damage, down to 25% of the hit. Burning ignores armour. From wave 5.
- *Imp* (55 hp, fireproof): ignores burning, and a fire arrow's own hit does half. Lune or longbow is right. Odd waves from 7.
- *Healer* (40 hp): mends allies within 48 units for 6% of their max hp per second (not warlords). Slipped into the
  grunt column, not a column of its own, so it walks with them. From wave 7.
- *Scamp* (8 hp, fast, tiny): a swarm of 6 + wave on even waves. Catapults and frost sweep them.
- *Gargoyle* (140 hp, armour 2, flies, leaks 3): only archers, ballistas and frost reach it. Every fourth wave from 8.
**Balance is a first pass, not a tuned value.** Bot, 10 seeds a map, branches on, all five foes forced onto maps 1 to 10
(which is harsher than shipping, since map 11 will list one or two): early and middle maps lose 1 to 7 lives against the
same maps with branches and no new foes (Meadow 19.5 to 18.0, Ford 15.9 to 11.8, Serpent 17.6 to 11.8) and stay
winnable; Last Stand and The Gorge turn near-unwinnable for the bot (3/10 and 1/10 wins). Two earlier rounds
bracketed it: a softer one gave the bot more gold than threat, a harder one lost Ford 4/10. Note the branches alone
already lift the bot a lot (Last Stand 11.0 to 15.6 lives), so judge new maps with both on. Not done: the bot does not
counter (it never aims at healers or picks lune against imps), so real players should beat these numbers; a gentler
intro (one or two foes on map 11, adding the rest across maps 12 to 20) is the planned way to use them.

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
