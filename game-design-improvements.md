# Game-design improvements

Planning backlog based on the seven-game design review and the user's follow-up decisions. This document records agreed implementation scope, proposed experiments, acceptance criteria, and deferred work. It is not a claim that the tasks have been implemented or verified.

For HR and KingsRoad implementation, also consult their existing game roadmaps. Keep those roadmaps in sync with decisions and completed work rather than creating conflicting design records. Software Tycoon's existing roadmap remains its source of truth.

## Evidence and limits

- The original review reported 350 passing tests across Alias, Couples, Crosswords, Tower, and KingsRoad with explicit test-mode configuration; 59 completed KingsRoad simulations; and 15 HR simulations. These results were reported by the reviewer, not rerun for this plan.
- The review was source inspection and headless simulation, not hands-on phone testing. The referenced detailed report was not included in this conversation.
- The user has played all 20 KingsRoad maps and reports infrequent losses and a dominant Ballista-spam strategy. This supersedes the older KingsRoad roadmap's statement that maps 11–20 were unplayed by a human.
- The HR sample does not justify class-balance changes.
- Source spot-checks confirmed Alias's earlier-team tie resolution, Crosswords' removable reveal markers, and the absence of active-run restoration in KingsRoad and Lone Tower.
- The game-design skill was consulted for the KingsRoad discussion. Its relevant principles are meaningful choices, readable consequences, teaching before combining threats, and prototype/playtest iteration. Design proposals below are not validated balance conclusions.

## Status and sequencing

Implemented in the first scoped batch: section 1 (Alias), sections 4A/4B (HR promotion disclosure and Intern onboarding), section 5 (Crosswords), and section 7A (HR pack odds). The follow-up batch implements sections 7B/7C (HR trait clarity and duck investigation/feedback). Sections 2–3 (KingsRoad and Lone Tower active-run persistence) and section 6A (KingsRoad wave clarity) are also implemented. Remaining tasks are pending unless explicitly deferred. Fixed-scope work can proceed independently of approval of balance experiments.

### First-batch implementation record

- Alias resolves a completed round only for a unique eligible leader. Ties continue full rounds with scores carried forward; EN/RU rules and tie messaging are updated. Score corrections can create or undo a win.
- New HR careers establish Intern automatically. Existing focus/cards/savings/roster are preserved; legacy suspended runs without a career retain their character. Explicit career restart also establishes Intern.
- Promotion choices show approximate relative enemy-health and spawn-rate increases for the selected accessible stage and for interviews, calculated from the unchanged difficulty functions. Values are rounded for display, not added as new balance modifiers. Long disclosures wrap on phone screens.
- Pack odds are derived from the same rarity weights as the draw: common 60%, uncommon 27%, rare 10%, legend 3%. EN/RU copy explicitly states independent draws and no rare-or-better guarantee. Draw behavior is unchanged.
- Crosswords stores `assistanceCount` separately from highlight markers. Clear preserves assistance and elapsed time; Play Again resets the attempt. Old saves migrate from unique surviving markers as a lower bound. Already-correct/locked cells do not consume a no-op hint.
- Verification: `NODE_ENV=test npm test` passed 219 files / 3,086 tests; `npm run typecheck` passed. Chromium phone-sized checks passed in EN/RU at 360px for HR onboarding, odds, promotion disclosure/wrapping, existing focus/resume, and Crosswords assisted completion/replay; Alias at 390px passed a 32–32 tie followed by a full 33–34 round. No real-device playtest or balance simulation was performed for this batch; combat balance was not changed.
- User subsequently authorized committing and pushing this batch to `main`. Deployment status must be checked separately from push success.

Suggested sequence:

1. Alias full-round tiebreak resolution.
2. HR promotion disclosure and Intern-first onboarding.
3. KingsRoad active-run persistence.
4. Lone Tower persistence and safe reward settlement.
5. Crosswords durable assistance history.
6. KingsRoad wave clarity, HR odds/mechanics clarity, and Couples skipping.
7. KingsRoad strategy benchmarks, balance prototypes, and pacing investigation.
8. Mage branch decision and maps 21–22 vertical slice, then maps 23–30.
9. Couples English editorial pilot.

No calendar delivery dates are committed. Software Tycoon improvements are deferred while the user tests the latest changes.

## 1. Alias — full-round tiebreaks, no shared winners

**Priority:** P0. **Scope:** small. **Decision:** agreed; replaces the original proposal for joint winners.

### Rules

- Reaching the target does not end the game until every team has completed its turn in the round.
- At round end, a unique highest-scoring team wins only if its score is at or above the target.
- If the highest score is tied at or above the target, play another complete round. Scores carry forward.
- Repeat full rounds until there is a unique eligible leader. There is no mid-round sudden-death victory and no shared victory.
- For more than two teams, everyone continues to play in each additional round; do not silently eliminate teams.
- If no team is at or above the target, continue normally.

### User's acceptance example

Target 30; first team ends its turn with 32. The second team still plays:

- 33 or more: second team wins at round end.
- 31 or less, including 30 or 31: first team wins at round end.
- 32: another full round, then compare again.

### Tasks and acceptance

- [x] Replace earlier-team tie resolution with unique-leader resolution at completed-round boundaries.
- [x] Show an EN/RU message such as “Scores tied—another round!” rather than a final results screen.
- [x] Preserve normal single-winner behavior and equal-turn rules.
- [x] Test the user's example, multi-way ties, repeated tied rounds, team-order independence, and below-target rounds.

## 2. KingsRoad — save and continue active runs

**Priority:** P0. **Scope:** medium–large. **Decision:** agreed.

Use HR suspend/resume as a reference, not a blind copy. Late-map runs in the review took roughly 25–32 simulated minutes at normal speed, making lost progress particularly costly.

- [x] Add a versioned, validated active-run snapshot separate from campaign/meta progress.
- [x] Save periodically, on important state changes, and when hidden; do not rely exclusively on unload events.
- [x] Offer Continue Run and an explicit discard/new-run flow so starting a new run does not silently erase the suspended one.
- [x] Restore paused, without offline simulation advancement.
- [x] Preserve map, enemies, towers and branches, resources, wave progress, timers, projectiles/effects needed for simulation continuity, and RNG state.
- [x] Clear terminal runs and handle malformed/incompatible saves and unavailable/full storage safely.
- [x] Ensure continuing or reloading cannot duplicate campaign rewards.

**Acceptance:** a reload mid-wave preserves the simulation state; equivalent subsequent inputs produce equivalent results. Test round-trip snapshots, invalid versions/data, lifecycle saves, no offline time jump, terminal cleanup, and reward duplication protection.

**Limit:** mobile process termination cannot guarantee a final save; periodic checkpoints bound potential loss. Do not promise lossless persistence under every browser shutdown condition.

### Implementation record

- Added the independent `lab:kingsroad:run:v1` slot with a versioned envelope, leaving `lab:kingsroad:v1` campaign stars unchanged. Validation checks nested simulation fields, map/road/plot references, enums, tower branches, ID uniqueness, spawn order, and terminal-state consistency before the sim or renderer uses a checkpoint. Corrupt or incompatible checkpoints are removed without changing campaign stars.
- Saves include ready/pre-wave setups and active runs: all resources, towers/branches, foe routes and status timers, pending spawns, shots, volleys, effects, RNG, cooldowns, and wave progress. Periodic checkpoints run every five wall-clock seconds, with immediate saves after builds/upgrades/sales, volleys, manual/automatic wave starts, pause, visibility changes, pagehide, and Save & menu.
- Continue Run identifies the map and wave and opens paused, at normal speed, with transient selection/aim cleared. No wall-time advancement occurs. Wave/volley controls are disabled while paused, including restored setups.
- Pause offers Save & menu without surrendering. Discard and starting any replacement run require confirmation; cancellation preserves the checkpoint, and either action preserves campaign stars.
- Finished runs first journal their outcome, then write best-stars, then remove the checkpoint. Startup recovers an interrupted terminal settlement without offering it as a playable run. Best-stars are idempotent, not additive, and cannot be lowered by a replay. A failed campaign write keeps the terminal journal for retry; starting another run is blocked until an unsaved win is persisted. Storage failures are surfaced in EN/RU while ordinary play remains usable.
- Snapshot round-trip tests cover all 20 maps' setups and deterministic late-map continuation with Fire/Lune towers, pending spawns, foes, live shots, volley arrows, effects, and RNG. Additional tests cover malformed nested state, inaccessible/full storage, lifecycle/periodic checkpoints, confirmation flows, result recovery at both write boundaries, duplicate finish callbacks, and stale-run prevention.
- Verified with `NODE_ENV=test npm test` (221 files / 3,165 tests), `npm run typecheck`, and `npm run build`. Chromium EN/RU checks at 360px and 390px passed against both the dev server and the production build served by Astro preview: exact mid-wave reloads, paused/no-offline advancement, resume, Save & menu, discard/replacement cancellation and confirmation, pre-wave setups, terminal recovery, incompatible checkpoints, and quota-failure playability. Screenshots were inspected. No real-device playtest or balance retune was performed.
- No game balance, wave composition, preview feature, or Lone Tower behavior changed. The user authorized committing and pushing this batch to `main`; deployment status must be checked separately from push success.

## 3. Lone Tower — save active runs and settle rewards once

**Priority:** P0. **Scope:** medium–large. **Decision:** agreed.

Separate from KingsRoad because death/retreat banks run rewards into meta progression.

- [x] Add versioned, validated snapshots and Continue/Discard controls.
- [x] Preserve upgrades, combat state, resources, timers, and RNG.
- [x] Save periodically, on important state changes, and when hidden; resume paused without offline advancement.
- [x] Make death/retreat settlement safe against reloads and repeated completion callbacks.
- [x] Clear terminal snapshots and handle invalid saves/storage failures safely.

**Acceptance:** equivalent continuation inputs yield equivalent simulation results. A completed or retreated run banks rewards exactly once, including after reload. Test crash/reload boundaries around settlement, not only a normal finish callback.

### Implementation record

- Added `lab:tower:run:v1`, a validated `{ version: 1, id, run }` checkpoint independent of permanent progress. The identity is separate from the seed so identical-seed runs can each earn rewards once. Combat state includes enemies and burn/frost/boss timers, arrows and hit history, in-flight volleys, caltrops/effects, resources, cooldowns, aim, upgrades/perks, spawn schedules, and RNG.
- Head-start and between-wave pickers are saved with exact offered choices/order and remaining picks. Continue opens paused in either phase. Resume releases held fire and clears pointer/double-tap tracking, without discarding aim or simulating offline time. The pause menu is available during choices and includes Save & menu; suspending never banks rewards.
- Checkpoints run every five foreground wall-clock seconds, immediately at wave/picker transitions, upgrade picks, volleys, firing start/end, pause, visibility changes, pagehide, and Save & menu. No unmount cleanup writes can resurrect old runs. Discard/replacement confirmations explicitly warn that unbanked run gold is lost while permanent progress is retained.
- Meta keeps the existing `lab:tower:v1` key and tolerantly migrates legacy saves with empty `settledRunIds`. Terminal settlement journals the result, atomically writes additive gold/run count and the run-ID receipt in one meta payload, then clears the matching checkpoint. Replayed results cannot repay even after later runs or perk purchases; delayed old results do not erase newer checkpoints. Startup also suppresses an already-paid active checkpoint if terminal journaling/cleanup failed.
- Pending reward writes block new runs and perk purchases until a retry succeeds. Failed purchases do not charge/apply a perk. Strict meta reads prevent overwriting unknown receipts; failed checkpoint reads retain the unknown data, show a warning, and require confirmation before starting anyway. EN/RU Retry controls recover pending results or reread unavailable storage. Newly purchased perks apply only to new runs, not the suspended run.
- Added 74 regression tests (120 total in `tests/tower`), including exact rich-state round trips, deterministic continuation across four seeds, head-start and wave-clear choices, nested malformed saves, read/write/delete failures, both settlement crash boundaries, repeated callbacks, natural death, retreat, delayed results, and preservation of old progress/receipts.
- Verification: `NODE_ENV=test npm test` passed 222 files / 3,239 tests; `npm run typecheck` and `npm run build` passed. Chromium checks in EN/RU at 360px and 390px passed on dev and the built production pages via Astro preview, covering mid-wave reloads, paused/no-offline/no-ghost-fire restoration, Save & menu, choice preservation, confirmations, perk isolation, death/retreat, both settlement crash boundaries, paid-active suppression, and incompatible saves. Additional browser checks verified a real five-second periodic save, phone touch volleys, selective meta-quota failures, all writes blocked, replacement blocking, and successful retry without duplicate rewards. Screenshots were inspected; no real-device playtest was performed.
- No combat, upgrade/perk balance, wave generation, KingsRoad, or Tycoon changes. The user authorized committing and pushing this batch to `main`; deployment status must be checked separately from push success. Further implementation notes and persistence limits are in `tower-roadmap.md`.

### Follow-up gameplay plan

The user reports that volley is unusable and never used, and requested a full plan including alternatives such as area
freeze and a more dependable fireball/catapult. `tower-roadmap.md` is now the single source for that design and sequenced
implementation plan. Its next proposed batch replaces the hidden double-tap/random-scatter volley with one visible,
targeted active skill: Catapult (area burst) or Frost Field (control), plus explicit old-run migration. Prototype numbers
remain hypotheses; the plan does not approve a numerical retune, implementation, commit or push by itself.

**Implemented locally (uncommitted):** the two-skill vertical slice shipped as described — Catapult and Frost Field with
visible button/drag-release targeting, keyboard support, skill upgrades replacing volley upgrades, Tactics converted,
and explicit v1→v2 checkpoint migration. Verified with the full suite (242 files / 3,530 tests), typecheck, production
build, and EN/RU phone-size Chromium checks on dev and production. A 30-seed baseline harness exists
(`scripts/tower/playthrough.ts`); its numbers are an un-tuned signal, not a balance verdict. Full record, open items and
the required real-phone playtest: `tower-roadmap.md`.

## 4. HR — disclose promotion tradeoffs and start with Intern

### 4A. Promotion tradeoffs

**Priority:** P0. **Scope:** small–medium. **Decision:** agreed; no immediate rebalance.

- [x] Show each selectable perk's benefit and actual difficulty contribution before selection.
- [x] Derive displayed values from the configuration/calculation used by the simulation.
- [x] Explain affected encounters accurately, including any difference between normal runs and interviews.
- [x] Do not describe an internal difficulty coefficient as an identical percentage increase to every enemy stat.
- [x] Update EN/RU copy without changing combat balance.

**Acceptance:** every offered perk exposes its tradeoff; copy matches the calculation; simulation numbers are unchanged.

### 4B. Intern-first onboarding

**Priority:** P0. **Scope:** small–medium. **Decision:** user requested.

- [x] Remove the initial choice among three starting characters.
- [x] Automatically establish Intern as the initial career character for a new player.
- [x] Preserve existing careers, unlocked characters, roster progress, and suspended runs.
- [x] Keep later character/roster choices intact; this is an onboarding simplification, not a roster reset.

**Acceptance:** a fresh player does not encounter the three-character choice and starts with Intern. Existing players retain their selected career and progress. Test new and existing save paths and suspended-run restoration.

## 5. Crosswords — durable assistance accounting

**Priority:** P1. **Scope:** small–medium. **Decision:** agreed.

- [x] Track successful reveal usage separately from visual cell markers.
- [x] Preserve usage through typing, deletion, clearing the grid, saving, and reloading.
- [x] Reset assistance history only when explicitly starting a new attempt, not when merely clearing cells.
- [x] Do not count a reveal action that has no effect.
- [x] Show the durable count at completion.
- [x] Migrate old saves using surviving reveal markers as a lower bound. Previously erased history cannot be reconstructed; do not pretend migration recovers it.

**Acceptance:** reveal → edit/clear → finish still reports assistance; reload preserves the count. Explicit new-attempt reset clears it. Highlighting remains independent of accounting.

### Crosswords follow-up — expanded grids and native-keyboard navigation

Implemented locally on user authorization: 50 EN + 50 RU puzzles, exact 10→50-word progression,
readable zoom/pan and cursor following, unchanged stock-keyboard input, versioned layout IDs,
and resumable previous-edition saves. Details and verification: `crossword-roadmap.md`.
The user subsequently authorized committing and pushing this batch to `main`; deployment must be verified separately.

## 6. KingsRoad — wave clarity, meaningful difficulty, and maps 21–30

### 6A. Upcoming-wave composition and enemy counters

**Priority:** P1. **Scope:** medium. **Decision:** agreed.

- [x] Show upcoming enemy types and counts before the player commits to a wave.
- [x] Generate composition from actual wave definitions, not separately maintained copy.
- [x] Explain fire immunity, armor, healing, flying, and relevant attack/targeting interactions.
- [x] Keep explanations accessible on a narrow phone screen and without hover.
- [x] Update EN/RU copy.

**Acceptance:** preview matches actual spawned composition; descriptions match damage and targeting rules; threats can be understood before a costly loss.

#### Implementation record

- Added a compact next-wave peek above the call-wave/volley controls, showing the upcoming wave, total scheduled count, and enemy names/counts. Tap Details for the complete roster and enemy guide. The peek updates after manual and automatic wave starts, including after Continue Run. During the final wave, it offers the guide with “No more waves scheduled,” rather than inventing another wave; it is hidden after the run ends.
- Composition is read directly from `waveRoster` through `wave-intel.ts`, not separately maintained counts or a second randomized spawn schedule. Previewing never consumes live RNG or mutates the simulation. Tests compare every wave of all 20 maps against `buildSpawns` across four seeds. The guide's available types are also derived from the map's actual wave definitions, including types absent from the immediate next wave.
- Counts describe new scheduled arrivals, not enemies currently left on the field. EN/RU copy explains that existing enemies remain, warlord summons are additional, and column order/roads are randomized when the wave starts. The preview does not claim to predict routes or summoned totals.
- Details pauses and checkpoints the run while reading. Close/Escape leave the normal pause menu open; only explicit Resume returns to the field. The scrollable body keeps Close/Resume reachable on short phones, uses native tap/keyboard disclosures (no hover dependency), and traps Tab/Shift+Tab within the new dialog. Resume returns keyboard focus to the battlefield.
- Added EN/RU profiles for all ten enemy types, covering flying, armor, fire immunity, healing, reinforcements, leak costs, and counter suggestions. Numeric traits and air-capable tower lists come from combat configuration. The guide accurately distinguishes armor reduction/floor from immunity, Fire-arrow impact from burning, burning's armor bypass, Lune amplification, frost duration/nonstacking, healer self/warlord exclusions (including healing other healers/flyers), and volley versus ground-only catapult splash. It explicitly explains automatic tower targeting instead of promising manual healer focus.
- Added 64 tests: composition/guide parity, non-mutating deterministic continuation, UI pause/update/final-wave/Continue behavior, EN/RU accessibility and keyboard focus, and controlled combat contracts for healing exclusions/range, burning/marks, airborne volley hits, and ground-only catapult splash.
- Verification: `NODE_ENV=test npm test` passed 225 files / 3,303 tests; `npm run typecheck` and `npm run build` passed. Chromium EN/RU checks passed at 360px/390px × 780px on dev and production via Astro preview, plus 360px/390px × 640px on production. Checked first-wave setup, complete/crowded rosters, native disclosures, modal focus/Tab/Escape, paused timers/RNG/state, manual-wave updates, short-screen scrolling and fixed actions, final-wave guide, and Continue/reload. The prior production save/recovery/quota browser regression also passed. Screenshots were inspected; no real-device playtest or balance benchmark was performed.
- No simulation code, tower/enemy numbers, wave composition/order/timing, reward logic, save schema, or other game changed. The user authorized committing and pushing this batch to `main`; deployment status must be checked separately from push success. Strategy/pacing investigation and any balance retune remain separate pending work.

### 6B. Strategy balance — investigate Ballista dominance

**Priority:** high design investigation. **Decision:** user requested harder, more interesting play rather than simply increasing enemy health. Specific mechanics remain proposals to prototype.

#### Player feedback

The user completed all 20 maps, rarely loses, and finds that placing Ballistas everywhere wins. Mage slowing has an understandable role, but Arrow towers do not feel clearly preferable to Ballistas, even with Lune/Fire branches.

#### Source observations, not a balance verdict

Ballista combines long range, high per-hit damage, air targeting, and piercing bolts. At maximum base level before armor, misses, support effects, and piercing:

- Archer: 16 damage per 0.5 seconds = 32 nominal damage/second; range 110; total purchase/upgrade cost 230.
- Ballista: 95 damage per 2 seconds = 47.5 nominal damage/second; range 165; total purchase/upgrade cost 400.

Price matters, but piercing and coverage may make Ballista's breadth too strong. Paper DPS alone cannot establish this.

#### Desired tower identities

- **Archer:** efficient rapid single-target damage; useful against scattered, fast targets.
- **Ballista:** heavy directional damage, strong against armor and along favorable firing lines, but not the universal answer.
- **Mage:** crowd control and support with a meaningful branch choice.
- **Catapult:** dense ground-group damage.

#### Benchmark before retuning

- [x] Compare Ballista-heavy, Archer-heavy, and mixed strategies across the existing campaign with comparable budgets and several seeds.
- [x] Record wins, lives lost, spending, damage, overkill, missed shots, enemies hit per bolt, and useful coverage where practical.
- [x] Separate bot behavior from tower strength; test strategies that actually use each tower's intended strengths. (Upgrade-order, line placement, branch and support controls; not an optimal-strategy proof.)
- [ ] Include hands-on playtests, especially on a phone, before claiming improved balance or fun.

#### Benchmark implementation record — findings, not a retune

- Full study: `kingsroad-balance-study.md`; reproducible tools: `scripts/kingsroad/study/`; compact CSV/JSON evidence,
  hashes and wave-granular counterfactuals: `reports/kingsroad-study/`. KingsRoad's game-specific record is synchronized
  in `kingsroad-roadmap.md`. Baseline `542ae08`; no shipping simulation/UI/balance/save changes.
- **480 primary runs** (20 maps × 8 seeds × 3): Ballista-heavy **160/160 wins, 19.92 mean lives**, Mixed **153/160,
  14.18**, Archer-heavy **10/160, 0.77**. Total **1,032 distinct full configurations**, plus 36 baseline repeats and
  **926 suffix counterfactuals**. Shared spending caps, pure towers, upgrade order, line placement, branches, volley
  removal and safe early-call controls do not erase the sampled Ballista advantage. Equal economic rules/caps do
  not mean equal actual income/spend, and bot policies are not human play or an optimal Archer search.
- **50.7%** of Ballista-heavy Ballista capped useful damage comes after the first pierced enemy; **10.9%** after
  the third (Mixed: **52.6% / 13.6%**). Max-base-range average plot route coverage is **42.7%** versus Archer's
  **26.2%**. Damage, overkill, armor/fireproof losses, healing, burning, arithmetic mark share, misses versus pending
  shots, and availability are separate. Common 120-second windows avoid comparing whole-game damage across very
  different survival times. These observations do not identify a final nerf magnitude or prove piercing is the only lever.
- Recommend separately diagnosing penetration limits/falloff and equal-count/HP staggered fast approaches, with
  range/coverage isolation if needed, **before** shipping any change. Human/phone tests remain uncompleted and
  required before claiming better balance/fun. No new mandatory tier, gold sink, immunity or global health increase.
- Added **45 tests**. Full suite passed **228 files / 3,376 tests** on the unchanged rerun; typecheck/build passed.
  Initial concurrent checks hit the existing HR 5,000 ms cap-test timeout; no HR code/tests/timeouts changed. Source
  instrumentation is read-only and in-memory; per-tick state/RNG parity and full-run/checkpoint continuation are
  checked, and retained data passes HP/gold accounting. Individual matrix/report commands ran; shell wrapper syntax
  checked, not separately rerun end-to-end. No browser/new human gameplay check for this non-UI study. No commit/push authorized yet.

#### Three-hit diagnostic — completed, not a shipping retune

- User-approved study-only three-enemy cap: `kingsroad-three-hit-experiment.md`, evidence
  `reports/kingsroad-three-hit/`. **1,152 matched pairs / 2,304 full runs** include repeated primary sweep, shared
  spending/no-volley/rush/pure/line controls, and first-five-map coverage extended to 32 seeds. No other rule/number change.
- Primary Ballista-heavy **160→160/160 wins**, **19.92→19.56** mean lives; Mixed **153→127/160**, **14.18→9.95**;
  Archer-heavy **10→10/160**, bit-identical as expected. Heavy/Mixed life advantage grows **5.74→9.61**.
- Common spending cap Heavy **24→20/24** (four Watch losses), Mixed **14→13**; other Heavy no-volley/rush/line
  controls remain **24/24**. So the cap has an effect, but does not deliver the desired stand-alone tradeoff.
- Early first-five-map Mixed **157→148/160** wins: eight new Rivers losses, one Switchback loss. Heavy stays
  **160/160**. Retired bolt maximum becomes **3**, beyond-third useful damage **0** in all experimental cases.
- **Do not adopt this cap alone.** Shipping/default baseline stays unlimited. Ask before a separate coverage test
  with unlimited piercing restored, or a separate cadence test; no stacked range/price/HP/wave change. Phone play
  still required before claiming improved balance/fun, and sufficient-defense pacing not remeasured here.
- **792** prior baseline terminal hashes reproduced; **378** non-Ballista states identical across arms; all ledgers
  and unchanged shipping input hashes verified. Added **13** focused experiment/report tests, with matching-variant
  controls/checkpoints and all-ten-enemy/L1–L3 collision fixtures. Final sequential verification: **229 files /
  3,389 tests**, typecheck and production build passed; diff/shell syntax checks clean. Individual recipes/self-tests/comparison ran; wrapper syntax checked, not separately rerun end-to-end.
  No browser/new human/physical-phone playtest, shipping change, commit or push.

#### Range/coverage diagnostic — completed, not a shipping retune

- User-approved next hypothesis: `kingsroad-range-experiment.md`, evidence `reports/kingsroad-range/`.
  Predeclared **0.8× Ballista ranges, 140/150/165→112/120/132**, **unlimited piercing restored**. No other stat,
  wave, economy or save change; the existing range×1.15 bolt-flight coupling remains, with unchanged speed.
- **1,200 matched pairs / 2,400 full runs**, including 48 fixed stock-ranking controls beyond the earlier matrix.
  Adaptive placement uses new ranges; fixed control retains stock ranking, not a frozen purchase/spawn tape.
- Primary Heavy **160→160/160**, mean lives **19.92→19.54**; Mixed **153→122**, **14.18→9.36** (33 new losses,
  two rescues); Archer **10→10**, bit-identical as expected. Mean-life gap grows **5.74→10.19** despite measured
  max-level map-weighted plot road coverage shrinking **42.7%→32.7%**. Both placement modes keep **24/24 Heavy**
  wins and reduce same-subset Mixed **21→15/24**, so re-ranking does not explain away the pattern on that subset.
- Early five maps × 32 seeds: Heavy **160→160**, Mixed **157→153**, with five new losses and one rescue. Ford
  **31→29**, Rivers **30→28**; Switchback is stable/slightly better. Shared-cap Heavy **24→20** (Watch), Mixed **14→12**.
- **Do not ship range-80 alone or stack it with three-hit.** One scale does not disprove coverage as a lever. Next
  separate hypothesis is cadence/spacing at original tower stats, with equal count/HP and role-appropriate policy
  controls—only after user approval. No phone fun/optimal-play claim or sufficient-defense pacing remeasurement.
- **840** historical baseline hashes reproduced; **378** non-Ballista states identical; all ledgers/shipping input
  hashes verified. Added **13** range tests with actual ground/air acquisition and flight boundaries, all-map fixed/
  adaptive ranks, unlimited piercing and matching-variant suffix parity. Final sequential checks: **230 files /
  3,402 tests**, typecheck and production build passed; diff and shell syntax checks clean. Wrapper ran end-to-end; extra fixture/report checks afterward. No browser/human/physical-phone
  playtest, shipping change, commit or push.

#### Candidate experiments

1. **Piercing budget:** diminishing damage per enemy pierced or a limited penetration count. Preserve satisfying line-clearing without full damage through an entire procession.
2. **Cadence pressure:** spaced fast enemies and staggered approaches that expose slow, expensive shots and give rapid arrows a natural role.
3. **Placement and mixed defenses:** branching routes, dense groups, armored anchors, and support enemies. Teach threats before combining them; avoid surprise hard counters and arbitrary Ballista immunity.
4. **Targeting/damage-waste audit:** distinguish theoretical damage from useful damage before changing costs or stats.

**Current next diagnostic recommendation:** review the completed three-hit and range-80 findings, then separately test equal-count/equal-HP cadence/spacing at original tower stats with role-appropriate policy controls if the user approves. Do not combine levers, escalate a nerf to chase failures, or claim one range scale disproves every coverage design. Cadence work and any shipping rule remain unapproved.

**Success criteria:** mixed defenses and situational tower choices become meaningful. Ballista-heavy play can remain viable, but should not be the easiest answer almost everywhere. Do not target an arbitrary failure rate or make early teaching maps punitive.

### 6C. Maps 21–30 — third campaign chapter

**Decision:** schedule development of the next ten maps. A new visual theme and Mage tier-3 branches are proposed; exact theme, branch mechanics, and numbers need approval/playtesting.

Follow the existing structure: a new canvas/theme and a meaningful gameplay addition per ten-map chapter. Mage branches should replace the third upgrade, analogous to Archer branches, rather than add a mandatory fourth tier.

#### Candidate Mage branches

- **Deep Freeze:** stronger control, lower damage; brief freezes with per-enemy recovery protection to prevent permanent lock from stacked towers.
- **Brittle:** weaker slow, but enemies temporarily take more damage from subsequent hits. This overlaps Lune's damage mark and must be differentiated before approval; choose another branch if the distinction is not meaningful.

These are brainstorming candidates, not committed mechanics.

#### Proposed teaching progression

- **21–22:** introduce Mage branches in forgiving situations.
- **23–24:** teach rapid-target and firing-line challenges.
- **25–27:** combine split lanes, armor, crowds, and support enemies.
- **28–29:** harder mixed-defense tests with multiple viable builds.
- **30:** finale combining previously taught rules, not a surprise mechanic.

#### Milestone schedule

- [x] Establish strategy benchmarks on maps 1–20.
- [ ] Prototype and playtest the Ballista/Archer adjustment.
- [ ] Decide, implement, and test the Mage fork and campaign unlock rules.
- [ ] Build maps 21–22 as a playable vertical slice with the new visual theme.
- [ ] Validate clarity, balance, performance, and phone layout through human play.
- [ ] Build maps 23–30 using the approved chapter rules, then run regression simulations and human acceptance playtests.
- [ ] Update `kingsroad-roadmap.md` with the user's completed 20-map playthrough, final design decisions, and measured results.

## 7. HR — pack odds and mechanics clarity

### 7A. Exact pack odds

**Priority:** P1. **Scope:** small. **Decision:** agreed.

- [x] Display exact rarity probabilities derived from the actual draw configuration.
- [x] Explain whether a guarantee exists; do not imply one if it does not.
- [x] Test that displayed probabilities match draw rules and sum correctly.

A visible rare-or-better guarantee/pity system is a separate progression decision, not approved by agreeing to show odds. The review estimated roughly one in four players could open ten packs without a rare or legendary at the current odds; verify the underlying configuration before using that figure in product copy.

### 7B. “Chance to quit” and inactive trait effects

**Decision:** investigate and clarify the user's confusion about “chance to quit.”

**Completed:** this means employee resignation, not dodging an attack or abandoning an action. End-to-end tracing found no resignation roll or salary system in HR. The shared roster can store quit/burnout status and a `stakes` flag, but HR has no logic that rolls these modifiers or pays salaries. These effects are absent from `QUIRK_NUMBER`, ignored by `baseNumbers`, and unused by career review, hiring, pack opening, and run settlement.

Cards now show active modifiers first and explicitly name unused effects as inactive in HR, without displaying misleading probability/cost numbers. A trait with only dormant effects says it has no active run effect. Expandable EN/RU help explains gem XP versus career review XP, cooldown-based attack speed versus duck orbit speed, and the absence of resignation rolls/salaries. Trait data and saves are unchanged.

- [x] Trace quit-related modifiers end-to-end, including whether and when any resignation roll occurs.
- [x] Audit other displayed trait effects for applicability in HR.
- [x] Hide or clearly label inactive effects instead of presenting them as current gameplay benefits/costs.
- [x] For active effects, explain what changes, when it is evaluated, and what the displayed number means. Distinguish modifiers from absolute probabilities.
- [x] Update EN/RU descriptions and add regression tests for the actual behavior.

Do not invent a base resignation chance or add a resignation system merely to make existing labels true.

### 7C. Rubber ducks — verify contact damage and make it readable

**Decision:** investigate the user's report that flying/orbiting ducks appear never to hit or damage enemies.

Source observations:

- Damage is intended at the ducks' orbit positions, not throughout the circle around the hero.
- Base configuration specifies 8 contact damage and a 0.4-second per-enemy duck-hit cooldown.
- The inspected duck attack path applies damage but no knockback, despite copy saying ducks “bump” enemies.
- The original spot-check did not prove collision worked in actual play. Follow-up controlled tests now verify contact damage, hero damage scaling, shared per-enemy cooldown, separate targets for multiple orbiters, upgraded counts/radii, tangent/interior/exterior cases, kills/overkill, and JSON continuation. Recorded canvas draw calls match actual collision positions at levels 1, 3, and 6. No collision failure was reproduced; the empty interior of the orbit and misleading bump wording explain a plausible source of confusion, but this is not proof of the cause of every reported miss.

Tasks:

- [x] Reproduce contact in a controlled combat scene and verify rendered positions match collision positions.
- [x] Test contact damage, per-enemy cooldowns, multiple orbiters, upgrades, and non-contact cases.
- [x] Distinguish collision failure, weak effective damage, and insufficient hit feedback.
- [x] Add readable contact feedback where missing.
- [x] Correct misleading copy, or separately decide whether knockback belongs in the weapon's role.

Do not apply a blanket damage buff before establishing the cause. Any approved balance change requires broader HR simulations under the existing roadmap guidance.

### HR clarity/duck implementation record

- Duck description now explicitly says contact damage on the orbit, no knockback, and no protection inside the ring. It appears on Engineering cards and weapon upgrade offers in EN/RU.
- Successful duck hits add a brief gold contact ring with four rays, at most one effect per contacting duck per tick even in a dense pack. Empty space, cooldown-blocked contacts, and already-dead enemies create no duck flash. Existing enemy hurt flashes remain.
- No weapon stats, damage, knockback, cooldowns, trait values, RNG, progression, rewards, or required save fields changed. The additive render-only effect kind does not require invalidating existing run snapshots.
- Controlled before/after comparisons across 18 seeded 90-second scenarios (all three starters with ducks plus Engineering at duck levels 1/3/6) matched combat, RNG, progression, and rewards exactly after excluding render effects. These are regression comparisons, not win-rate or class-balance evidence.
- Full verification: `NODE_ENV=test npm test` passed 220 files / 3,121 tests; `npm run typecheck` passed. Chromium checks at 360px and 390px in EN/RU verified mixed/inactive trait labels, expandable help, duck card and upgrade descriptions, a rendered hit flash, saved damage, and unchanged knockback. Screenshots were inspected; no real-device playtest was performed.
- The phone check also exposed pre-existing stage-button overflow; stage buttons now wrap instead of overflowing the menu.
- User subsequently authorized committing and pushing this follow-up batch to `main`. Deployment status must be checked separately from push success.

## 8. Couples — temporary skipping and partner consent

**Priority:** P1. **Scope:** medium. **Decision:** agreed.

- [x] Add Skip this time without adding the card to persistent hidden content.
- [x] Keep Hide forever as a distinct action.
- [x] Allow either partner to decline, including the second partner after the first has answered.
- [x] Do not expose the first partner's answer when the second declines.
- [x] Exclude declined cards from agreement scoring and show skipped counts separately.
- [x] Handle all-skipped sessions without an invalid or misleading agreement score.
- [x] Cover both together and match modes and EN/RU UI.

**Acceptance:** no forced answer, no mismatch penalty for declining, and no permanent hiding caused by a temporary skip.

### Implementation record

- Implemented for all three games, both modes, EN/RU. **Skip this time** is a session-wide decline, separate from **Hide forever**. It advances without drawing a replacement and does not change persistent hidden IDs; normal seen-history ranking still applies in future deals.
- Partner A's declined cards are omitted from partner B's pass. Partner B can decline after A answered: A's withheld answer is erased immediately without truncating later answers, and the skipped result contains no picks. Recaps omit declined prompts/answers and partner attribution, showing only an aggregate skipped count.
- Agreement percentages, mismatch discussion, Together tallies, and lifetime agreement denominators exclude skipped cards. All-skipped sessions finish neutrally without a percentage, fraction, verdict, or disagreement prompt; replay/reload still leaves these cards available. A game with no lifetime scored answers no longer shows a fabricated menu percentage. Completing a session still increments games played; Together still does not add to lifetime agreement statistics.
- Existing permanent hiding/replacement/restoration is retained. During partner B's pass, hiding remains a future preference; the separate Skip action stays enabled to decline the current card, with explanatory EN/RU copy. No persisted setup/stats/history schema changed, and answers remain session-only.
- Both actions have 44px touch targets outside the scrolling question card. Long prompts remain reachable from the top, native keyboard activation works, and answer shortcuts are blocked behind the exit confirmation.
- Added 28 tests (6 pure, 22 integration). Full verification: `NODE_ENV=test npm test` passed **227 files / 3,331 tests**; Couples regressions passed **11 files / 103 tests**; typecheck and production build passed. Development and production Chromium checks passed at **360×640 and 390×780** in EN/RU across all three games/both modes, both-partner decline flows, all-skipped A/B/Together, replay/reload, privacy/scoring/persisted stats, permanent hiding interactions, long-card scrolling, native Enter activation and visible touch targets. Representative screenshots were inspected; no physical-device playtest was performed.
- Detailed game handoff: `couples-roadmap.md`. No English catalog expansion or other game changes. The user subsequently authorized committing and pushing this batch to `main`; deployment status must be checked separately from push success.

## 9. KingsRoad pacing — shaped investigation, not automatic shortening

**Decision:** investigate alongside strategy balance before choosing a remedy.

**Question:** after a player has effectively finished building a defense, does the remaining map still require meaningful decisions?

The original review found some late victories with 4,000–7,000 unspent gold. This is a signal to investigate, not proof of excessive length: the bot may hoard or fail to use available options, and Ballista dominance may end meaningful purchasing early.

- [x] Measure last useful purchase, not merely the last purchase a bot happens to make. (Operational wave-boundary sufficient-defense probes, not an exact causal last-purchase oracle.)
- [x] Measure time from that point to victory, remaining spending options, threats/leaks, and ability use.
- [x] Compare maps, seeds, and several strategies; inspect whether Ballista spam causes the apparent early finish.
- [x] Deliver a recommendation for a bounded experiment rather than immediately changing the whole campaign.

### Pacing findings

- See `kingsroad-balance-study.md` §5 for the exact definition and data. Ordinary Watch Ballista-heavy runs have
  **13.6 minutes** after their final purchase and about **5,856 gold** left, every plot maxed. Earlier frozen-purchase
  boundaries preserve baseline lives with **19.0 minutes** still remaining on average over three Watch seeds, while
  ordinary volley behavior continues. This is a sufficient-defense observation, not a precise causal final useful action.
- After the actual final purchase, **18/18 Ballista-heavy** suffixes preserve lives/wins with no further inputs;
  earlier removing both buying and volley still wins 18/18 but preserves lives only 10/18. Winning Mixed suffixes
  preserve lives after last-purchase input removal in **14/16**. Large cash does not by itself prove no decisions:
  direct upgrades may be exhausted but paid reallocation remains; late two-Archer→Ballista swaps rescue a Watch loss.
- Safe existing early calls save only **0.47 minutes** across 24 paired Ballista-heavy wins (plus existing bonus
  gold), not the long construction tail. Late spawn streams and combat are more important than gap removal alone.
- Recommend balancing situational tower roles first, repeating these probes and human play, then considering a
  bounded late-stream pacing experiment only if meaningful decisions still end too early. No wave shortening applied.

Possible outcomes:

- Dominant strategy: address balance first, then reassess pacing.
- Repetitive solved waves: shorten or make that section more distinctive.
- Useful choices exist but go unused: improve clarity or bot decision-making.

Do not add another mandatory upgrade tier solely to absorb excess gold. Avoid conflating higher enemy health with better pacing or challenge.

## 10. Software Tycoon — deferred

**Status:** explicitly deferred by the user, who is testing the latest iteration. No improvement work now.

Retain the review idea for later reconsideration only: a compact “current assignment → next result → bottleneck → consequence” summary, with detailed rates underneath, using existing data and no new subsystem. Hands-on phone comprehension testing should precede replacing the current presentation.

Any future task must begin with `software-tycoon-roadmap.md` and incorporate the user's results from the current testing. This document does not authorize a parallel Tycoon redesign.

## 11. Couples English — authored-content editorial pilot

**Status:** explained proposal; a full rollout is not yet approved. The user asked whether this means the same authored-content approach used for Russian.

Yes: replace weak template-generated English prompts with deliberately written cards and useful follow-ups, not simply a higher generated prompt count. Reuse strong Russian ideas where appropriate, but adapt English naturally rather than translating mechanically. Aim for comparable quality, not necessarily identical language counts.

### Pilot

- [ ] Select one bounded theme for an English editorial sample.
- [ ] Write distinct ideas rather than many paraphrases.
- [ ] Give both answer options credible appeal; avoid an obvious “good partner” answer.
- [ ] Use natural, concrete English situations.
- [ ] Write follow-ups that invite stories, negotiation, or reflection rather than a generic “Why?”
- [ ] Check duplicates, missing fields, theme/game fit, and consistency with existing curated-content handling.
- [ ] Review with the user and fluent speakers before expanding to other themes.

Illustrative example, not a committed card:

> **Card:** You have one free evening together: make a plan, or leave it open?
>
> **Follow-up:** When does planning feel caring to you, and when does it feel restrictive?

Automated checks can verify structure and catch duplicates; they cannot certify conversation quality. Do not expand counts before validating the editorial standard.

## Verification requirements

For implementation tasks:

- Run targeted regression tests, the full test suite, and typecheck with the project's required test configuration. Record the configuration used.
- Update EN/RU user-facing copy together where applicable.
- Check changed UI flows in the browser and on a narrow phone layout when possible; report when a hands-on check was not performed.
- For persistence, test round-trip state, corrupt/incompatible saves, storage failures, reload/lifecycle behavior, terminal cleanup, and duplicate-reward boundaries.
- For balance changes, follow each game's roadmap simulation guidance; compare strategies and multiple seeds, not just a single successful bot run.
- Keep human playtesting separate from headless verification. Do not claim either occurred unless it actually did.
- Do not infer HR class-balance changes from the review's small sample.

## Decisions intentionally left open

- Final Ballista balance mechanism and numbers, after benchmarks/prototypes.
- Final Mage tier-3 branches, especially how the second branch differs from Lune.
- Third chapter visual theme and detailed map designs.
- Pack guarantee/pity rules, if any; exact odds disclosure is already agreed.
- Whether duck knockback is desirable versus correcting the description.
- English editorial pilot theme and approval of expansion after review.
- Any Tycoon change while the user's current test is ongoing.
