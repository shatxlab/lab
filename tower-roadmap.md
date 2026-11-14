# Lone Tower roadmap and persistence notes

This is Lone Tower's design, implementation and handoff record. The completed persistence batch is recorded below.
The next gameplay iteration starts with the active-skill redesign in this document; the earlier cross-game persistence
scope remains in `game-design-improvements.md`, section 3.

## Next gameplay iteration — goals and evidence

### Player feedback

The user reports that **volley is unusable and never used**. They would rather have different active skills, such as a
freezing area or a fireball/catapult with more dependable damage. This is direct hands-on feedback and supersedes the
previous source-only assumption that clearer instructions or more damage alone would be enough.

The current volley combines a hidden double-tap gesture, a six-second cooldown, ten randomly scattered arrows and a
small per-arrow splash. It can therefore be both awkward to cast and unreliable on moving targets. Do not respond by
only multiplying its damage, forcing players to use it, or adding another mandatory upgrade tier.

### Goals

- Give the player a visible, reliable active decision that works with one finger on a phone.
- Make active skills useful in different situations: dependable area burst versus deliberate crowd control.
- Make aiming, upgrades, enemies and bosses create distinct decisions rather than only increasing numbers.
- Give runs a satisfying milestone while retaining endless play and the existing local-first, deterministic sim.
- Preserve existing permanent gold, perks, reward receipts and unfinished runs through explicit save migration.

### Non-goals for the first iteration

- No global enemy-HP inflation, across-the-board archer nerf, or balance verdict from source inspection alone.
- No large skill tree, rarity grind, mana system, second skill slot, online leaderboard or cloud save.
- No mandatory hard counter that makes manual arrows useless.
- No ten-enemy/ten-skill content dump before the core controls and two-skill prototype are playable.

## P0 — replace volley with a readable active-skill foundation

### Product shape

New runs offer **one equipped active skill**, selected before wave 1. Both launch skills are available immediately so
the player can experiment without first grinding unlocks. The current randomly scattered volley is retired as the
default new-run skill; it does not remain as a hidden gesture competing with the new controls.

Initial skills, with working names and **prototype-only** numbers:

| Skill | Role | Proposed behavior | Initial prototype values |
| --- | --- | --- | --- |
| **Catapult** (theme/name may become Fireball) | Reliable area burst | Tap a visible target; a marked projectile lands after a short delay, deals full damage throughout the shown circle and briefly burns enemies hit. No random per-enemy damage distribution. Hits ground and flying enemies so its basic purpose is not hidden behind an immunity. | 8 s cooldown; 45-unit impact radius; 0.65 s flight/telegraph; 35 impact damage; small 3 s burn |
| **Frost Field** | Emergency control | Freeze ordinary enemies in the shown circle, then leave a short slow. Burning continues. Freeze pauses movement and enemy action timers without a catch-up burst afterward. Bosses receive a clearly disclosed shorter slow instead of a hard freeze. No damage. | 12 s cooldown; 55-unit radius; 1.25 s ordinary-enemy freeze; 35% slow afterward; reduced boss control |

These numbers are starting hypotheses, not approved shipping balance. Preserve a clear reason to choose either skill:
Catapult kills or weakens a group now; Frost Field buys time and improves subsequent manual targeting. Neither should
be universally correct for every wave.

Do not add both Catapult and Fireball as separately balanced copies of the same area-damage role. Pick one theme after
the mechanics feel good. Chain lightning, turrets, additional slots and further skills are deferred.

### Controls and feedback

- Replace the passive volley status strip with a **real skill button** showing icon, skill name, cooldown seconds and
  ready state. Keep it reachable in the phone safe area with at least a 44px touch target.
- Tap the skill button, then touch/drag on the field; the exact target circle follows the pointer and release confirms.
  Mouse/pointer preview follows the same rules. Keep an obvious cancel action; Escape cancels targeting before it pauses
  the game. After casting, the impact marker remains visible for the projectile's full flight.
- Skill targeting is a distinct input mode: it must not accidentally start normal fire, reuse a stale pointer, or cast
  behind pause/upgrade/result dialogs. Multi-touch must not leave firing or targeting stuck.
- No double-tap is required. An optional quick-cast shortcut can be considered only after the visible flow is reliable.
- Add distinct cast, impact, freeze and ready feedback. A target marker must match the actual collision area. Damage
  and control feedback must be visible without relying on sound or haptics.
- Provide keyboard controls for ordinary aiming/firing as well as skill selection, targeting, confirmation and cancel.
  Keep visible EN/RU instructions and accessible names synchronized with the actual bindings.

### Upgrades and progression interaction

- Generalize the existing volley radius/cooldown concepts into equipped-skill radius/cooldown upgrades. Present them
  with skill-specific EN/RU names and values rather than displaying obsolete volley copy.
- Preserve the purchased permanent **Tactics** benefit by converting it to active-skill cooldown reduction. Existing
  levels and gold are retained; only its explained effect changes.
- Define explicitly which archer damage/fire/frost upgrades affect each skill. Avoid double-dipping or making a
  Catapult's built-in burn silently identical to the Fire arrows upgrade. Upgrade cards must derive their displayed
  values from the same stat calculation used by combat.
- Add at most one skill-specific behavioral capstone per launch skill in the later build-diversity batch, not in the
  first control prototype.

### Save compatibility

- Introduce a versioned active-skill state containing equipped skill, cooldown, valid in-flight impacts/fields and any
  gameplay status timers needed for deterministic continuation. Transient pointer/targeting mode is cleared on restore.
- Write an explicit active-checkpoint migration rather than silently deleting an unfinished v1 run. Define how old
  volley upgrades, cooldown and in-flight arrows map to the new model. Migration must preserve wave, enemies, HP,
  gold, RNG and reward identity; a schema bump alone is not a migration.
- Keep permanent `lab:tower:v1` reward receipts intact. Do not reset purchases or allow settlement to pay twice.
- Restored runs remain paused, require deliberate input to resume, and do not advance cooldowns while away.

Implemented migration mapping: storage key and permanent saves stay unchanged; active envelope version becomes 2.
V1 `volleySize`/`volleyCooldown` become `skillSize`/`skillCooldown`, `volleyLeft` becomes `skillLeft`, and the equipped
skill becomes Catapult. Existing enemies receive `freezeLeft: 0`. Pending random-scatter arrows keep their IDs, positions,
flight timers and damage under the legacy landing rule until exhausted; no new scatter is generated. seed, RNG, wave,
HP, gold, perks, other actors and reward identity remain unchanged. Migration occurs on read and is persisted by the
normal checkpoint/settlement path; repeating the read is harmless.

### Active-skill acceptance criteria

- A fresh player can discover and complete a cast using only visible controls on a 360px phone.
- Catapult's marked area, actual hit area and damage agree at center, edge and outside the boundary; repeated casts do
  not apply the same impact twice. Its outcome does not depend on random arrow scatter.
- Frost affects movement/action timers exactly as described, including burn during freeze, ordinary-enemy recovery,
  boss resistance, overlapping fields and death while frozen.
- Cooldowns, pause, upgrade selection, death/retreat, save/continue and offline time behave consistently.
- Old permanent saves and representative rich v1 runs migrate without lost rewards or nondeterministic continuation.
- Both skills are tested with mouse, touch, multi-touch cancellation and keyboard at 360×640 and 390×780 in EN/RU.
- Human phone playtesting is required before calling either skill fun, balanced or preferable to the old volley.

### Implementation record — two-skill vertical slice (shipped in `216242f`)

- **Skills:** Catapult (8 s, radius 45, 0.65 s flight, 35 impact damage, 4/s for 3 s burn, hits ground and air) and
  Frost Field (12 s, radius 55, 1.25 s freeze + 35%/2 s slow; bosses 35% slow for 1.25 s, never frozen) implemented as
  deterministic `SkillCast`s saved in-flight; casting consumes no RNG. Freeze pauses movement, wall attacks and boss
  summons with no catch-up; burn and hit flash continue; the follow-up slow applies after recovery.
- **Controls:** the volley strip/double-tap are gone (`double-tap.ts` deleted). Run start offers both skills on a
  picker with values derived from `towerStats`. A real skill button shows name, charge fill, ready state and a live
  seconds countdown; pressing it enters targeting with the exact area circle drawn on the field (plus projectile in
  flight after release). Touch/drag then release casts; the same finger or another works, pointercancel cancels, the
  button toggles targeting off, Escape cancels before pausing, and pause/over/choosing cancel targeting. Keyboard:
  hold Space to fire, arrows/WASD to aim, 1/Enter to target, arrows to move the target, Enter to cast. EN/RU copy for
  picker, button, targeting help, field label and both skills' stats.
- **Upgrades/perks:** `volleySize`/`volleyCooldown` became `skillSize`/`skillCooldown` (skill-specific names, values
  from the same stat calculation combat uses). Tactics now reduces skill cooldown; existing purchases keep their
  levels. Catapult impact scales with damage upgrades once; Fire arrows improve only its burn.
- **Saves:** envelope v2 (`skill`, `skillLeft`, `skillCasts`, enemy `freezeLeft`) with full validation of casts (skill
  match, timers, radius/damage bounds). v1 checkpoints migrate on read per the mapping above; migrated legacy volley
  arrows resolve under the legacy splash/caltrop rule; identity, RNG, rewards and receipts untouched. A run keeps its
  equipped skill forever, including after restore; cooldowns do not advance while away.
- **Verification:** targeted tower suite **6 files / 126 tests** (skills incl. edge-of-area hits, freeze/attack/summon
  pause, boss resistance, cancel paths, keyboard fire/cast, picker values, v1 migration incl. terminal journals and
  in-flight legacy arrows, deterministic continuation with both skills). Full suite **242 files / 3,530 tests**;
  `npm run typecheck` and `npm run build` passed. Chromium EN/RU at 360×640 and 390×780 on the dev server and the
  production build (Astro preview): picker → cancel → drag-release cast → checkpoint v2 → reload → paused Continue →
  impact lands, no horizontal overflow, 48px skill button, no console errors. jsdom covers touch, pointercancel,
  multi-finger and pause-during-targeting. KingsRoad's frozen-input guard now chains a second re-ship record
  (`tests/kingsroad/study-inputs-after-tower-skills.json`); KingsRoad imports only the unchanged `ENEMIES`.
- **Baseline harness:** `scripts/tower/playthrough.ts` (usage in its header). 30 seeds × {catapult, frostField, none},
  wave cap 15: catapult 5/30 fell, mean wave 14.4; frostField 15/30 fell, wave 12.3; none 6/30 fell, wave 14.0. Recorded
  as an un-tuned first signal only — Frost Field looks weak under this bot's cast policy, but no numbers were changed
  and no balance conclusion is drawn. No real-device playtest yet; nothing committed or pushed.

## P0/P1 — clarity and low-friction combat

After the active-skill vertical slice is coherent:

- [x] Show the actual next-wave enemy types/counts in the between-wave picker and remaining enemies during combat.
- [x] Explain new traits before they can cause a costly loss; no hover-only information. (Bestiary trait lines for the
  current five enemies; extend per enemy as new ones arrive.)
- [x] Telegraph boss summons, charges and wall attacks, with the warning matching the gameplay timer. (Summons done;
  charges/wall-attack windups wait for those mechanics to exist.)
- [x] Add optional auto-fire/aim assist while retaining manual target priority as the skilled option.
- [x] Let the player inspect current upgrades, derived stats and skill effects without leaving or losing the run.
- [x] Add a short contextual first-run tutorial for aim, manual fire, the equipped skill and upgrade selection.

Avoid turning Lone Tower into an idle game by default. Auto-fire is an accessibility/comfort option, not a substitute
for interesting target selection.

### Implementation record — clarity and comfort batch (shipped in `877cb25`)

- **Next-wave preview:** the between-wave picker (and the head-start picker) lists the next wave's exact enemy names and
  counts with a one-line trait each, read from `waveRoster` through `src/lib/tower/wave-intel.ts` — never a second
  schedule, never consuming RNG. Tests compare the preview against `buildSpawns` for waves 1–25 across four seeds.
  EN/RU bestiary lines cover all five current enemies (bats over caltrops, the warlord's 8 s call, brute hits).
- **Enemies left:** the HUD shows the spawn queue plus field count during combat, hidden while choosing or over.
- **Boss-summon telegraph:** for the last 1.5 s of a warlord's summon timer the renderer draws a pulsing dashed orange
  ring with markers where the grunts will appear, matching `BOSS_SUMMON` exactly. Render-only; no simulation change.
- **Auto-fire:** a menu toggle persisted in `lab:tower:settings:v1` (`autofire`, `tutorialSeen`), off by default. When
  on, the archer aims at the wall-nearest enemy with arrow-flight lead and fires whenever combat runs, the game is
  unpaused and no finger holds the field; an empty field holds fire. It is pure input on top of `aimAt`/`holdFire` —
  no sim, RNG or checkpoint change — and restored runs still open paused without ghost firing.
- **Loadout inspection:** the pause menu gains a native `<details>` section with the equipped skill's current stats and
  every owned upgrade's level and derived numbers, computed by the same `towerStats`/`upgradeStats` functions combat
  uses. Inspecting never suspends, banks or mutates the run.
- **First-run hints:** "Hold the field to shoot" (suppressed while auto-fire is on) and a skill hint appear over the
  field until the player has both scored a kill and cast the skill once; `tutorialSeen` then persists and they never
  return. Both hints are `role="status"`, EN/RU.
- **Verification:** tower suite **8 files / 142 tests** (wave-intel parity and ordering, settings normalization and
  failed writes, picker preview contents, enemies-left, auto-fire on/off proven through the periodic checkpoint,
  loadout disclosure, hint lifecycle). Full suite **244 files / 3,546 tests**; `npm run typecheck` and
  `npm run build` passed. Chromium EN/RU at 360×640 and 390×780 on the dev server and the production build: toggle →
  hints → auto-fire engaging on its own → pause/loadout → Save & menu → resume without hints returning; boss-telegraph
  and picker-preview screenshots inspected; no console errors, no horizontal overflow.
- **Not done:** real-device playtest (still the gating acceptance step for the whole iteration); charge/wall-attack
  telegraphs and any new-enemy trait copy wait for those mechanics. No balance, save-schema or skill numbers changed.

## P1 — builds with identities, not just linear stats

- [ ] Add one reroll per run; show exactly when it is consumed and persist it in checkpoints.
- [ ] Give existing paths recognizable identities:
  - **Multishot:** broad crowd coverage with a real single-target tradeoff.
  - **Pierce:** lined-up groups and armored fronts.
  - **Ricochet:** scattered targets, distinct from Pierce rather than another generic arrow multiplier.
  - **Fire:** damage over time and a death/area capstone.
  - **Frost/caltrops:** control and setup for follow-up damage, without permanent ordinary-enemy lock.
- [ ] Prototype behavioral capstones before adding rarity. Examples: burning enemies explode on death; slowed enemies
  become more vulnerable to crits; multishot trades per-arrow damage for coverage. Select only a few that create real
  decisions and make all tradeoffs visible on cards.
- [ ] Ensure random offers cannot routinely force three irrelevant picks once a build is established. Weighting must
  remain deterministic and explainable; do not hide dynamic difficulty behind offer manipulation.
- [ ] Expand results beyond wave/kills/gold: run time, shots/accuracy, useful damage by source, skill casts and enemies
  hit per cast, damage taken, chosen upgrades and cause of death. Keep detailed stats expandable rather than crowding
  the result panel.

No upgrade changes should ship as one stacked bundle. Benchmark one hypothesis at a time against the unchanged base.

## P1 — enemies and bosses that create target priorities

Introduce one teaching encounter at a time, then combinations:

1. **Healer/support enemy:** a visible healing link and a clear manual-priority target. Healing exclusions and rate are
   derived from combat configuration, not separate guide copy.
2. **Shieldbearer:** frontal arrow protection with a visible arc and at least two counters, such as Fire/Catapult and
   timing around a lowered shield. Avoid blanket immunity or mandatory Frost.
3. **Boss variants:** reuse the summoner as one behavior, then prototype a telegraphed charger and an armored boss with
   vulnerable windows. Different waves should not be the same boss with only more HP.
4. **Risk/reward wave modifier:** an explicitly accepted modifier, such as faster enemies for bonus gold. Do not apply
   surprise mutators to an ordinary run.

Every enemy gets a concise bestiary entry with actual stats, counters and known control resistance. The next-wave
preview uses the real generated roster and never consumes gameplay RNG.

## P2 — run goals and horizontal progression

- [ ] Prototype **wave 15 as a victory milestone**, followed by an explicit Continue endless or Bank & finish choice.
  Preserve exactly-once settlement if the player continues and later dies or retreats.
- [ ] Add starting bow/loadout sidegrades after baseline balance is understood: for example slow/powerful/piercing
  versus rapid/lower-damage/crowd coverage. Sidegrades should change early play, not be strict power upgrades.
- [ ] Prefer milestone unlocks and new options over more permanent damage/HP levels.
- [ ] Consider a seeded challenge with fixed loadout/perks only after ordinary runs are enjoyable. No online dependency.
- [ ] Keep endless best-wave tracking separate from the finite milestone so both accomplishments remain meaningful.

## Measurement and balance method

Create `scripts/tower/playthrough.ts` or an equivalent deterministic harness before approving numerical retunes. Use
competent target-leading and skill-casting policies; a bot that ignores a skill is not evidence that the skill is weak.
The user's report already establishes the old control's usability problem regardless of simulated DPS.

For the old baseline and each single-variable prototype:

- Run at least 30 seeds per strategy at fresh, mid and near-max permanent progression where relevant.
- Compare Catapult-focused, Frost-focused and no-skill-dependency controls with equivalent archer policies.
- Record death/cleared wave, run time, wall damage, shot accuracy, useful/overkill damage, skill casts per minute,
  targets hit per cast, control duration, upgrade offers/picks and unspent rerolls.
- Separate control reliability from numerical strength. Human success with targeting and cooldown timing matters even
  when a bot can produce high theoretical damage.
- Do not optimize for an arbitrary loss rate, force equal skill pick rates, or conclude that mixed builds are better
  from simulations alone. Finish with human phone comparisons.

Initial active-skill success means players understand the cast flow, intentionally use both skills in plausible
situations, and can predict the result. Numerical targets are set from baseline data rather than invented in advance.

## Delivery sequence

1. **Baseline and migration design:** add metrics/harness, save fixtures and detailed v1→v2 mapping; no combat retune.
2. **Active-skill vertical slice:** skill picker, Catapult, Frost Field, visible targeting/cooldowns, input feedback,
   perk/upgrade mapping, checkpoint migration and focused regression tests. This is the next implementation batch.
   *(Done locally, uncommitted — see the implementation record above; harness included.)*
3. **Clarity and comfort:** next-wave preview, remaining count, telegraphs, optional auto-fire and contextual tutorial.
   *(Shipped in `877cb25` — see the clarity record below. Deployment to be verified separately.)*
4. **Build iteration:** reroll, build panel and one bounded capstone/tradeoff experiment; add richer run results.
5. **Encounter iteration:** healer vertical slice, then shieldbearer, then one new boss behavior; human test each.
6. **Goals/progression:** wave-15 milestone and one bow sidegrade prototype; defer seeded challenges until later.

Each shipping batch gets targeted tests, the full suite, typecheck, production build, EN/RU narrow-phone browser checks
and screenshots. Combat/save changes also get deterministic continuation tests across old/new checkpoints. A real-phone
playtest remains a separate required acceptance step, not something inferred from headless tests.

### Decisions still open

- Catapult versus Fireball as the area-burst theme; the reliable-area mechanics come first.
- Final prototype numbers after baseline comparisons.
- Exact legacy volley-to-skill migration mapping, documented before any schema implementation.
- Whether a reworked volley ever returns as a third distinct skill; not part of the launch scope.
- A second equipped skill slot; explicitly deferred until one slot and two skills are proven understandable.

## Completed persistence batch — status

- Active-run persistence is implemented for combat, head-start choices, and between-wave upgrade choices.
- Continue Run identifies the wave and unbanked gold. Restore opens paused with no wall-clock catch-up. Aim and
  simulation state are kept, but held fire and pointer/double-tap input are released; the player must hold again to shoot.
- Pause is available in combat and during an upgrade choice. Save & menu suspends without surrendering or banking.
- New/replacement runs and Discard require confirmation when a saved run exists. The confirmation explicitly explains
  that unbanked gold is forfeited and permanent gold/perks are retained. An unreadable run is not silently overwritten:
  a warning, Retry, and explicit confirmation protect the unknown slot.
- Perks bought while a run is suspended apply to new runs only. The run's perk snapshot is not retroactively changed.
- EN/RU warnings and Retry controls cover failed saves. A pending terminal reward blocks new runs and perk purchases
  until it is persisted, rather than allowing a new checkpoint to overwrite an unbanked result.

## Storage and settlement design

- Permanent key remains `lab:tower:v1`. `TowerSave` adds `settledRunIds: string[]`; old gold, best, runs, and perk levels
  normalize as before, with empty receipts when this field is absent. Keep receipts through purchases and future
  migrations. Never prune them casually: an old result must not become payable again after later runs.
- Active key is `lab:tower:run:v1`, with `{ version: 1, id, run }`. The unique ID is independent of the simulation seed.
  Bump the envelope version if run fields/semantics become incompatible; consider terminal-reward migration before
  deliberately invalidating old envelopes. Ordinary site backups include both keys through the existing `lab:` prefix.
- `src/lib/tower/snapshot.ts` validates all required nested fields, levels, enemy kinds, ordered spawns, actor IDs and
  hit references, choice offers, phase consistency, and array/allocation limits before the renderer/sim uses saved data.
  Corrupt/incompatible checkpoints are removed without touching permanent progress. Failed reads are not corruption
  and must not delete the unknown slot.
- A five-second wall-clock timer saves foreground runs, including pickers. Significant actions and wave/picker
  transitions save immediately; pause, visibility changes, pagehide, and Save & menu also checkpoint. Cleanup only
  removes listeners/timers; it does not write a potentially stale run.
- `settleRun` is the only persistence entry point for finished rewards. `bankRun` is merely the pure calculation.
  Settlement journals a terminal checkpoint, then writes gold + best + run count + receipt together in one atomic
  localStorage meta write, then clears only the matching checkpoint. Retry after a crash before the meta write pays
  once; retry after that write sees the receipt and never pays again.
- If terminal journaling fails but the meta write succeeds, the receipt still proves payment. Startup suppresses an
  already-paid active checkpoint as well as recovering terminal journals. Delayed paid results neither rewrite the
  journal nor erase a newer run. Death and voluntary retreat share this path, including retreat during choices.
- `readSaveState` distinguishes fresh/absent meta from inaccessible/malformed data or unknown receipts. Settlement
  and perk purchases never overwrite unreadable meta as if it were a new account. Failed purchases do not change
  displayed/applied progress. Purchase handlers reread current meta so they preserve existing receipts and rewards.

## Limits and non-goals

- One active checkpoint per browser profile; no cross-tab transaction lock or cloud sync was added. Avoid concurrent
  editing from multiple tabs or older app versions. Atomic receipt/reward writes handle ordinary interruption and
  repeated callbacks, not arbitrary manual edits, storage deletion, or rolling the entire profile back to an old backup.
- Mobile process termination need not emit pagehide. Five-second foreground saves reduce potential loss, but suspended
  timers, unavailable storage, and failed writes prevent a universal lossless or maximum-five-second guarantee.
- Receipts grow with completed runs. They are small IDs, but future compaction needs an equivalent durable
  idempotency mechanism, not truncation to the most recent receipt.
- Combat, RNG algorithms, wave definitions, upgrade/perk numbers, reward values, and aiming rules were not changed.

## Verification

- `NODE_ENV=test npm test`: **222 files / 3,239 tests passed**.
- `npm run typecheck` and `npm run build`: passed.
- Lone Tower targeted suite: **7 files / 120 tests**. New regression coverage includes rich-state round trips,
  deterministic continuation across four seeds, head-start/between-wave choices, nested malformed payloads,
  unavailable/full storage, cleanup fallbacks, unreadable-data preservation, confirmation flows, lifecycle/periodic
  saves, natural death/retreat, both settlement crash boundaries, repeated callbacks, stale paid snapshots, delayed
  results, failed purchases, and legacy progress/receipt preservation.
- Chromium EN/RU at 360px and 390px passed on both dev and production build via Astro preview: exact paused live-state
  reload, no offline advancement/ghost fire, resume, Save & menu, offer/pick preservation, confirmations, perk isolation,
  natural death/retreat, terminal recovery before/after payment, paid-active suppression, and incompatible snapshots.
- Extra browser checks covered real five-second saving, phone touch volleys, selective meta quota failure, all writes
  blocked, new-run/perk blocking while a result is pending, and successful retry without duplicate rewards.
- Screenshots were inspected. No real-device playtest or balance retune was performed. The user authorized committing and pushing this batch to `main`; deployment status must be checked separately.

## Next session

- Continue working on `main`; commit/push subsequent batches only when explicitly authorized. The full plan above
  records the proposed design direction; it does not by itself approve numerical balance changes or a commit/push.
- **The two-skill vertical slice is implemented, verified and shipped to `main` (`216242f`); deployment status is
  separate from push success.** The required next step after deployment is a real-phone comparison of both skills:
  discover the cast flow, target/cancel, reload during combat and choices, then retreat and verify banked
  gold/run count once, including a pre-skill v1 run carried over. Do not treat the bot baseline as the fun verdict.
- Then decide Catapult vs Fireball theming and the first single-number adjustments (Frost Field looked weak in the
  baseline) — one variable at a time against the harness, with a fresh 30-seed comparison per change.
