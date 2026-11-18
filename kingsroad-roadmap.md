# KingsRoad roadmap (`/kingsroad`)

The single source of TODOs and design notes for the game. Cross-game improvements are tracked in
`game-design-improvements.md`; keep implementation decisions synchronized here.

## Current state and active-run persistence

- The user has completed all 20 maps and reports infrequent losses and a dominant Ballista-heavy strategy. This supersedes historical notes below saying the second chapter has not had human play. Wave clarity is now implemented (see below). The strategy/pacing study and study-only three-hit/range-80 diagnostics are complete (see below); neither tested rule is recommended as a stand-alone retune, and an actual playable balance prototype and maps 21–30 remain separate pending work. Neither persistence, clarity nor the study changes shipping balance.
- Active runs now use `lab:kingsroad:run:v1`, an envelope `{ version: 1, game }`, separate from permanent stars in `lab:kingsroad:v1`. Bump the envelope version when simulation state/map semantics become incompatible. `src/lib/kingsroad/snapshot.ts` validates nested fields, indices, branches, IDs, spawn ordering, and status consistency before restoration. All 20 maps, including Fire/Lune branches, are covered.
- Both pre-wave setups and active waves are saved every five wall-clock seconds and immediately on player purchases/sales/upgrades, volleys, wave starts, pause, hidden/pagehide, and Save & menu. The full JSON simulation state is retained; no wall time is simulated while away. A discarded mobile tab can still lose work since the most recent successful checkpoint—unload callbacks cannot be guaranteed.
- Continue Run shows the map and wave and restores paused at 1x, without transient selection/aim. Pause includes Save & menu; Discard and replacement runs ask for confirmation. Wave and volley controls are blocked while paused. EN/RU storage-failure warnings avoid silently promising that an unavailable save succeeded.
- `settleRun` journals a terminal result before writing campaign best-stars, then clears the checkpoint. Startup recovers terminal journals without resuming finished runs. Star writes are idempotent/max-only. Failed campaign writes keep the journal, and an unsaved win cannot be overwritten by starting a new run. No new rewards were introduced. `writeSave` now returns a success boolean so settlement can distinguish failure from completion.
- Verification: `NODE_ENV=test npm test` passed 221 files / 3,165 tests; `npm run typecheck` and `npm run build` passed. Chromium EN/RU checks at 360px and 390px passed on both dev and the built production pages via Astro preview: exact live-state reload, paused restoration, resume, Save & menu, discard/replacement confirmation and cancellation, setup saves, terminal recovery, incompatible-save cleanup, and quota-failure playability. Screenshots were inspected; no real-device test or balance retune was performed.
- The sections below are historical design/measurement records where they conflict with this current-state summary.

## Wave clarity and enemy guide

- A compact peek above the wave/volley bar shows the next wave, scheduled total, and enemy types/counts. Tap Details
  for the full roster and a guide to all enemy types scheduled on the selected map. Long compact text is ellipsized;
  the full counts remain available in the dialog. During the final wave, show Enemy guide / No more waves scheduled,
  not a fictitious extra wave. Hide the peek after terminal results.
- `src/lib/kingsroad/wave-intel.ts` reads `waveRoster` directly. It never builds a randomized schedule, consumes live
  RNG, changes the run, or predicts column order/roads. Counts are scheduled new arrivals; old enemies on the field
  remain, and a warlord's summoned footmen are extra. EN/RU copy states these limits explicitly.
- Opening the guide pauses and checkpoints even during a countdown or pre-wave setup. Close/Escape leave the game
  paused; explicit Resume returns to the field. This is player-controlled inspection, not a change to wave timing.
  Native disclosures work by tap or keyboard without hover. Tab/Shift+Tab stay within the new dialog, focus returns
  to the battlefield on Resume, and the scrollable body keeps Close/Resume accessible on shorter phone screens.
- All ten enemy profiles explain relevant counters without claiming that one strategy guarantees success. Trait
  numbers, leak costs, and air-targeting tower lists come from the combat configuration. Explain armor subtraction
  with its floor, burning's armor bypass, fireproof impact reduction and burn immunity, Lune damage amplification,
  strongest/refreshing frost slows, and healing range/rate/exclusions. Other healers and flyers can be healed, but
  the healer itself and warlords cannot. Volley arrows can hit flyers; catapult splash cannot.
- Tower targeting is automatic: the foe closest to the gate along its route within range; frost prefers foes with
  absent/expiring slow. The player can aim a volley at a healer, not order individual towers to focus it. No targeting
  mechanic was added. Archer branch copy describes existing Fire/Lune rules, not a new tier or mandatory upgrade.
- Added 64 tests. Preview composition matches `buildSpawns` for every wave of all 20 maps across four seeds; guide
  membership matches actual scheduled kinds. Inspection preserves RNG and subsequent sim behavior. UI tests cover
  ready/marching/countdown/final/terminal states, manual/automatic updates, Continue, pause/close/resume, EN/RU
  accessibility, and keyboard focus. Extra controlled sim tests verify healing, burning/marks, volley air hits,
  and catapult ground-only splash against the explanations.
- Verification: `NODE_ENV=test npm test` passed **225 files / 3,303 tests**; `npm run typecheck` and `npm run build`
  passed. Chromium EN/RU at 360px/390px × 780px passed on dev and the production build via Astro preview; production
  also passed at 360px/390px × 640px. Checked first-wave peek, complete/crowded rosters, tap/keyboard disclosures,
  paused timers/RNG/state, Close/Escape/Resume/focus, early calls, short-screen scrolling and fixed actions, final-wave
  guide, and Continue/reload. The previous production save/recovery/quota browser regression passed as well.
- Screenshots were inspected. No real-device playtest or balance benchmark was performed. No sim code, balance,
  wave timing/composition, rewards, persistence schema, or other game changed. The user authorized committing and pushing this batch to `main`; deployment status must be checked separately.
- Couples temporary skipping and the KingsRoad strategy/pacing study have since been completed. Study-only three-hit and range-80 diagnostics have since completed without a shipping change (see below). The next separate
  choice is a cadence/role diagnostic or another explicitly approved prototype, not a claim that clarity or benchmark code fixes dominance.
  Mage branches/maps 21–30 remain pending.

## Strategy balance and pacing study — complete, no retune

Full findings: `kingsroad-balance-study.md`. Reproducible harness and definitions: `scripts/kingsroad/study/README.md`.
Compact evidence and simulation-input hashes: `reports/kingsroad-study/`. Baseline is `542ae08`; no shipping sim,
UI, enemy/tower numbers, maps, wave timings, rewards or saves changed. No commit/push authorized for this batch yet.

- Primary sweep: **20 maps × 8 seeds × 3 strategies = 480 runs**. Ballista-heavy (3 Ballistas/1 frost repeating)
  wins **160/160**, mean **19.92 lives**; Mixed wins **153/160**, mean **14.18**; Archer-heavy (3 Archers/1 frost)
  wins **10/160**, mean **0.77**. These are bounded bot outcomes, not human win rates or optimal defenses.
- Total **1,032 distinct full-run conditions**, plus 36 repeated baselines for checkpoints (**1,068 full runs**),
  and **926 suffix counterfactuals**. Controls include shared spending ceilings, spread/rush upgrades, pure towers,
  line-aware placement, Fire/Lune branches, no volley and safe early calls. Ballista-heavy/pure Ballista win every
  sampled control case. Actual earned income/spending are not equal merely because starting cash/caps match.
- Ballista gets **50.7%** of its useful capped damage after a bolt's first enemy in Ballista-heavy runs; **10.9%**
  after the third (Mixed: **52.6% / 13.6%**). Whole-run mean contacts/shot are **1.76 / 1.95**; overkill about
  **10.8% / 11.6%**. Max-base-range route coverage averages **42.7% per plot** versus Archer **26.2%**. Useful
  damage, overkill, fireproof/armor loss, healing, burn, marks, misses/pending shots and live target availability
  are tracked separately. Common 120-second opening windows avoid treating early deaths as shorter victories.
- Watch's ordinary Ballista-heavy final-purchase tail averages **13.6 minutes** with **5,856 gold** left, all plots
  maxed. Wave-boundary freezes locate earlier sufficient defenses with **19.0 minutes** remaining on average
  (three seeds, normal volley policy). These are sufficient-defense thresholds, not an exact causal last useful
  purchase. Every later tested boundary must also preserve a win with at least baseline lives.
- Removing every new input after the actual final purchase preserves lives/wins in **18/18 Ballista-heavy** pacing
  cases; removing purchases/volleys at the earlier sufficient boundary still wins all 18 but preserves lives in only
  10. For winning Mixed baselines, last-purchase cutoff preserves lives in **14/16**. Do not equate no upgrades with
  no meaningful play: paid sell/rebuild options remain, and two Archer→Ballista swaps turn Watch seed 3's late loss
  into a 5-life win. Some swaps hurt. See full counterfactuals and costs in the report.
- Clear-field early calls save only **0.47 minutes** on 24 paired Ballista-heavy wins. Existing early-call gold also
  changes, so this is not a pure timing test. Long late spawn streams, not only 14-second gaps, dominate duration.
- **Initial recommendation (before the three-hit diagnostic below):** separately diagnose a mild piercing budget and equal-count/HP staggered fast approaches,
  retaining baseline controls; isolate range if piercing is insufficient. No global HP increase, arbitrary Ballista
  immunity, mandatory tier, gold sink or automatic wave cut. Human/phone validation must precede accepting a retune;
  then reassess whether balanced defenses still have long passive tails.
- Instrumentation is an in-memory build of the real game source with read-only external observers and guarded
  anchors; shipping files are never rewritten. Per-tick full state/RNG parity, HP/gold ledgers, full-run hashes,
  original-engine suffix continuations, policy/budget controls and all maps' plot ranking are checked.
- Verification: **45 added tests**; `NODE_ENV=test npm test` passed **228 files / 3,376 tests** on an unchanged rerun.
  Initial concurrent build/typecheck/testing hit HR's existing `keeps foes, shots and gems under their caps` 5,000 ms
  timeout; no HR code/tests/timeouts changed. Typecheck and production build passed. Individual matrix commands and
  summary generation ran; the equivalent convenience shell wrapper passed syntax checking but was not separately
  run end-to-end. No UI browser check or new human/phone gameplay test was performed for this non-UI study.

## Three-hit Ballista diagnostic — complete, not adopted

Full findings: `kingsroad-three-hit-experiment.md`; paired evidence: `reports/kingsroad-three-hit/`.
The user authorized this isolated offline experiment, **not** a live retune, commit or push.

- **1,152 matched pairs / 2,304 full runs**: repeated 20×8×3 primary sweep, shared-budget/no-volley/rush/pure/line
  controls, plus first-five-map coverage extended to 32 seeds each. All other combat/economic/wave rules fixed.
- The study-only bolt retires immediately on its third distinct living-enemy hit; no same-tick fourth hit.
  Both observed/unobserved engines use the same selected variant; cross-variant checkpoint restoration is refused.
  Ordinary/default builds remain unlimited. No shipping Game/save field, range, rate, damage, price, HP or wave change.
- Primary Heavy **160→160/160 wins**, mean lives **19.92→19.56**; Mixed **153→127/160**, **14.18→9.95**;
  Archer-heavy **10→10/160**, bit-identical. Heavy/Mixed mean-life gap widens **5.74→9.61**. Archer's unchanged
  result is an expected isolation control, not a requirement that a Ballista-only nerf directly improve Archers.
- Under the shared ceiling Heavy **24→20/24** (all four Watch losses), Mixed **14→13**. No-volley/rush/line Heavy
  retains **24/24** each; pure Ballista **24→23**. Thus the cap matters, but not in the desired stand-alone pattern.
- First five maps × 32 seeds: Heavy **160→160**, Mixed **157→148**, with eight new Rivers losses and one Switchback
  loss. Early mixed-defense margin worsens. Do not treat a stable Meadow as a blanket tutorial safety pass.
- Retired-bolt maximum contacts Heavy **18→3**, Mixed **21→3**; beyond-third useful damage becomes **zero** everywhere.
  All ledgers reconcile; **792** overlapping fresh baseline terminal hashes match the old report, and **378**
  non-Ballista paired terminal states are identical. All eight shipping/shared input hashes remain unchanged.
- **Recommendation: do not adopt this cap alone.** Keep unlimited baseline, ask before a separate coverage experiment
  (or separately staggered-fast cadence), and do not stack another lever to rescue this candidate. No phone fun or
  optimal-play claim; sufficient-defense pacing was not remeasured. Mage/maps remain separate.
- Added **13** experiment/report tests; both builds pass per-tick observer parity, all-ten-enemy/L1–L3 collision
  fixtures and matching-variant suffix continuations. Final sequential verification: **229 files / 3,389 tests**,
  typecheck and production build passed; diff/shell syntax checks clean. Recipe commands ran; wrapper syntax checked, not separately rerun end-to-end.
  No UI browser or human/physical-phone gameplay test; no shipping change, commit or push.

## Range/coverage diagnostic — complete, not adopted

Full report: `kingsroad-range-experiment.md`; paired evidence: `reports/kingsroad-range/`.
The user approved testing this next hypothesis, not shipping a rule, committing or pushing.

- Predeclared **20% less range at every Ballista level: 140/150/165→112/120/132**, with unlimited piercing restored.
  Only three in-memory balance literals change; no damage, price, reload, HP, wave, reward or save change. Existing
  range×1.15 projectile-life coupling remains; this is not an acquisition-only test with flight distance frozen.
- **1,200 pairs / 2,400 full runs**: the same primary/budget/no-volley/rush/pure/line/32-seed early matrix, plus
  48 fixed-baseline-plot-ranking controls. Adaptive bot ranking uses the new range, not stale stock geometry.
- Primary Heavy **160→160/160 wins**, mean lives **19.92→19.54**; Mixed **153→122**, **14.18→9.36**;
  Archer-heavy **10→10**, bit-identical as expected. Mixed has **33 new losses, two rescues**. Heavy/Mixed mean-life
  gap grows **5.74→10.19**, despite measured max-level map-weighted plot road coverage shrinking **42.7%→32.7%**.
- On the same six maps × four seeds, adaptive/fixed ranking both retain **24/24 Heavy** wins and drop Mixed
  **21→15/24**. Re-ranking changes margins but does not explain away the qualitative outcome on this subset.
- Under the shared spending ceiling Heavy **24→20** (four Watch losses), Mixed **14→12**. No-volley/rush/line and
  pure Ballista each retain all **24/24** wins, though safety margins decline. A stable win count does not mean no effect.
- First five maps × 32 seeds: Heavy **160→160**, Mixed **157→153** (five new losses, one rescue); Ford **31→29**,
  Rivers **30→28**. Switchback retains every win and slightly improves mean lives. Not a blanket early safety pass.
- **Recommendation: do not ship range-80 alone, and do not stack it with three-hit.** This does not disprove every
  coverage design. Pause escalating stat nerfs; separately test cadence/spacing and role-appropriate policy at
  original tower stats if the user approves. No optimal-play or human/phone-fun claim; passive tails not remeasured.
- **840** original-study baseline terminal hashes match, **378** non-Ballista paired states identical, all ledgers
  reconcile, all eight shipping inputs unchanged. Both engines pass target/flight boundaries, unlimited contact
  fixtures, all-map rank checks, observed/control state/RNG parity and matching-variant suffix continuations.
- Added **13** range tests. Final sequential checks: **230 files / 3,402 tests**, typecheck and production build
  passed; diff and shell syntax checks clean.
  The range wrapper ran end-to-end; additional fixtures and expanded report generation ran afterward. Earlier
  three-hit corpus also passes the updated comparator, without overwriting its retained evidence. No browser,
  human/physical-phone gameplay check, production change, commit or push.

### Next steps

1. Review the range-only findings; ask before another diagnostic, playable prototype or retune. ~~Prefer a separate
   equal-count/equal-HP cadence/spacing hypothesis at original tower stats, checking role-appropriate bot policies~~ —
   both the cadence/spacing pair and the role-appropriate policy arm are now complete (see their sections); number
   nerfs and policy work are both exhausted. The remaining lever is design: roster pressure, stronger Archer forks,
   or new content, plus a phone playtest.
2. Review with the user on a phone, including early teaching maps, isolated runners, armor, air, dense lines and
   mixed defenses. The user's existing all-20-map feedback remains valuable; headless runs do not certify fun.
3. Repeat sufficient-defense/ability/reallocation probes after an approved balance direction, then decide whether
   any late-stream compression is needed. Mage fork/third chapter design remains separate.

## Cadence diagnostic — complete, not adopted

Full findings: `kingsroad-cadence-experiment.md`; paired evidence: `reports/kingsroad-cadence/`. Offline only: runner,
bat and scamp spawn spacing x2 (0.55/0.45/0.2 to 1.1/0.9/0.4 s), with counts, HP, roads and all tower stats unchanged.

- **1,152 pairs / 2,304 full runs**, the three-hit design. Stock Ballista-heavy stays **160/160** (mean lives 19.92 to 19.96);
  Mixed **153 to 157/160** (14.18 to 16.51); Archer-heavy **10 to 12/160**; pure Archer 0 to 1/24.
- The Heavy-vs-Mixed life gap narrows from **5.74 to 3.45**. No Ballista-only nerf has done that before.
- The Archer effect is real only on teaching maps (ford and switchback 5 to 14 and 5 to 16 of 24). Not on the later maps.
- **Pacing cost:** each winning run gets about **2.6 minutes longer** (about +13%). Not a free change.
- Verdict: **not adopted alone**. Do not stack it with three-hit or range. Shipping any cadence change needs the user's
  choice and a phone check of the teaching maps, plus a pacing probe.
- **Duration-matched follow-up (`kingsroad-matched-cadence-experiment.md`, `reports/kingsroad-matched/`):** fast spacing
  x2 with the slow spacing scaled so each wave keeps its stock length (matched-2x), plus a density-only control.
  Both-win run time is within 0.06 min of stock. Ballista-heavy stays **160/160** (19.98 lives); Mixed **153→153** wins
  (14.70 lives); Archer-heavy **10→9**. The earlier Mixed and early-Archer gains were mostly longer waves; the early
  Archer niche does not survive (ford 5→3, switchback 5→6). Matching the length forces slow columns about 30% denser on
  average (up to about 3x in some waves); the density-only control alone takes Mixed to 146/160. Fast spacing at fixed
  density helps Mixed (+7 wins, +1.9 lives versus density-only), but that roughly cancels the density cost.
  **Not adopted.** Keep the earlier cadence result as superseded for timing claims.

## Role-appropriate Archer policy — complete: the bot was not the problem

Full findings: `kingsroad-archer-policy-experiment.md`; evidence: `reports/kingsroad-archer-policy/`. Offline only;
`archer-smart` strategy in `policy.ts`, stock rules everywhere.

- The predeclared policy: frost-second plan order, road + expected air-lane placement, focus-fire plot re-rank, and
  foe-aware forks (lune vs imps, fire otherwise). 656 full runs against the stock archer on the same build.
- **Primary 10/160 -> 15/160** (lives 0.77 -> 1.34); 18 of 20 maps stay at zero wins. Budget 1/24, no-volley 0/24
  unchanged. Early maps 33 -> 42/120 (switchback 5 -> 18 of 24; ford 5 -> 0, the one regression). For reference:
  Heavy 160/160 (19.92), Mixed 153/160 (14.18).
- **Conclusion: Archer-heavy's failure is structural, not policy.** The confound flagged since the first study is now
  measured and closed. Do not expect smarter bots or number nerfs to fix the late maps for archer-heavy; a design
  change (roster pressure, a stronger fork, new content) is the remaining path.
- Added 9 policy tests (frozen stock-archer terminal hash reproduced exactly); kingsroad suite **14 files / 337 tests**
  and typecheck pass. No shipping change, commit or push.

## Roster distribution diagnostic — complete: distribution is not the lever either

Full findings: `kingsroad-roster-experiment.md`; evidence: `reports/kingsroad-roster/`. Offline only; `roster-spread`
variant splits scamp/runner columns round-robin across roads — same foes, counts, times and RNG draws, single-road
maps untouched.

- 1,664 full runs, 2 arms x 4 strategies (incl. archer-smart) over primary + budget + no-volley. **Ballista-heavy
  160/160 (19.88), Archer 10->10, archer-smart 15->14, Mixed 153->150.** Not one map changes hands for either Archer
  policy; gate convergence keeps pierce valuable; Archer loses to HP scaling, not swarm shape.
- Predeclared criteria: not punitive **PASS**, niche **FAIL**, Mixed holds **PASS** at the boundary. Conclusion: every
  lever inside the current rules is now measured (nerfs, spacing, policy, distribution). A real Archer role needs new
  mechanics (per-hit shields / damage caps / rapid-fire-only pressure) or new content (Mage branches, maps 21-30);
  archer-as-support (lune) already works in Mixed.
- 6 new tests; shipping inputs byte-identical; no commit/push of balance.

## Shielded-foe prototype (bulwark) — mechanic proven, shipping shape decided

Full findings: `kingsroad-bulwark-experiment.md`; evidence: `reports/kingsroad-bulwark/` (two doses). Offline only;
study-only foe in memory: any single hit counts for at most 12 (bolts, stones and volley capped; burn ticks are not
blows), 90 hp x hpScale, speed 26, leak 2.

- Two predeclared doses, both forced onto all 20 maps (stress test): **v1** (wave 6, +1/4) drops Ballista-heavy to
  108/160 and loses four late maps outright but flips the budget/no-volley ordering to Mixed (15 vs 11, 12 vs 9);
  **v2** (wave 8, +1/6) spares 17 maps, Ballista 142/160, but the flip is gone (Mixed 133; budget 14 vs 16).
- Archer-heavy unchanged at both doses (10->12->9): mono-archer stays closed; the cap favours *mixed* defenses, which
  is the design goal, not archer spam.
- Conclusion: the cap mechanic works, is dose-tunable, and is the first lever in eight studies that makes situational
  defense the better answer — but only at globally punitive doses. **The shipping shape is per-map presence.**
- **Shipped as the Shieldbearer (follow-up session):** hitCap 12, v2 dose from wave 8 on **harvest** (teaching map) and
  **kings** (pressure showcase: study ballista-heavy 2/8 vs mixed 7/8), drawn as a brute behind a filled tower shield,
  with EN/RU copy and a shield rule line in the wave preview. Roster gated by `map.foes` like every other new foe; the
  offline variant retired (reproduce from `be016a8`); frozen-study input guards now accept exactly the five re-shipped
  sim files (`tests/kingsroad/study-inputs-after-bulwark.json`). Playthrough bot: harvest 4/5 (one wave-13 loss), kings
  4/5 at 3–10 lives. **Phone check of readability and fun still outstanding**; dial presence (parting/trident instead of
  kings) if kings proves too harsh in hand play.
- Guard chain extended once more, unrelated to balance: Lone Tower's `sim/balance.ts` was re-shipped for its active-skill
  batch (volley constants replaced; KingsRoad imports only the unchanged `ENEMIES` from it), recorded in
  `tests/kingsroad/study-inputs-after-tower-skills.json`. No KingsRoad sim input changed.

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
tuned value: retune once there are enemies that resist fire or armoured ones. No save change was needed at the time (towers were not yet
saved; active-run persistence now includes branches). Open: do the other towers get a branch in this batch? Still to decide with the enemies.

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
- Campaign save key is `lab:kingsroad:v1`; keep `normalizeSave` tolerant when extending campaign data. Active runs and branches use the separate versioned envelope in `lab:kingsroad:run:v1`; see the current-state section above.
- Reuse the plot generation approach from the maps 4 to 10 session: pick road shapes, then greedily place plots clear of
  the road (more than `ROAD_HALF + towerRadius(3)`), apart from each other (more than `PLOT_REACH * 2 - 6`) and in reach
  of the archers. `tests/kingsroad/maps.test.ts` checks all of it for every map.

## Later (every further 10 maps)

The same pattern: a new canvas, a new mechanic, new enemies. Nothing designed yet; decide when maps 11 to 20 are done.
