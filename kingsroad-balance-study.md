# KingsRoad: strategy balance and pacing study

> Latest follow-up: `kingsroad-range-experiment.md` completes the separately approved 20%-range diagnostic with
> unlimited piercing. It also is **not recommended as a stand-alone retune**. The roadmaps hold current next steps;
> recommendations below record the earlier batch, not an unexecuted range hypothesis or shipping approval.

> Follow-up completed: `kingsroad-three-hit-experiment.md` tests the isolated three-hit limit in 1,152 matched
> pairs. It is **not recommended as a stand-alone retune**: Heavy keeps every primary win while Mixed regresses.
> This original report remains the unchanged-balance reference; see the follow-up and roadmaps for current next steps.

**Scope:** findings, reproducible tools and a recommendation—not a retune. Shipping simulation, maps, enemies,
wave schedules, rewards, UI and saves are unchanged. Baseline: `542ae08` (after Couples skipping).
The user's completed 20-map playthrough is independent human evidence; this study adds deterministic bots,
**not a new human or phone playtest**. No commit/push authorized for this batch yet.

## Verdict

1. **Ballista dominance is reproduced, not explained away by the old mixed bot.** Ballista-heavy won 160/160
   campaign runs with 19.92/20 mean lives. It also won every sampled capped-budget, no-volley, pure-tower,
   upgrade-order and line-placement control. These are sampled outcomes, not a guarantee for every seed or player.
2. **Piercing and broad coverage are credible contributors.** About 50.7% of Ballista's capped useful damage in
   Ballista-heavy runs came after the bolt's first enemy; 10.9% came after its third. Max-level base-range road
   coverage averages 42.7% per plot versus Archer's 26.2%. These observations do not isolate a causal nerf size.
3. **The late construction tail is real.** On Watch, Ballista-heavy averaged 13.6 minutes after its final purchase,
   with about 5,856 unspent gold and no remaining direct build/upgrade choices. At earlier sufficient-defense
   checkpoints, an average 19.0 minutes remained with future purchases disabled but the normal volley policy retained.
4. **Not every rich late defense is solved.** Some mixed builds still leak or lose despite all towers being maxed.
   Legal paid sell/rebuild changes can improve them. Therefore "no direct upgrades left" is not "no meaningful choice".
5. **Recommend an isolated penetration/cadence experiment, then reassess pacing.** Do not shorten the campaign,
   raise global HP, add a mandatory tier or a gold sink, or ship a Ballista adjustment from these bot results alone.

## Evidence and reproduction

- **1,032 distinct full-run configurations**, plus 36 identical baseline reruns to collect checkpoints: **1,068 full runs**.
- **926 suffix counterfactuals:** 796 purchase-freeze runs, 68 volley cutoffs, 20 reallocation controls, 42 paid swaps.
  Equivalence fixtures/test-suite simulations are additional, not counted as campaign benchmarks.
- Primary sweep: **20 maps × seeds 1–8 × 3 strategies = 480 runs**. No timeouts in the reported matrices.
- Policies, commands, definitions and caveats: `scripts/kingsroad/study/README.md`.
- One-command recipe: `bash scripts/kingsroad/study/reproduce.sh` (defaults to `/tmp`, not campaign storage).
- Compact evidence: `reports/kingsroad-study/summary.json`, `runs.csv`, `pacing.json`, `manifest.json`.
  The manifest hashes shipping simulation inputs; CSV includes full terminal-state SHA-256 hashes. Full JSONL,
  including per-tower damage and purchase histories, can be regenerated; it is not checked in (~19 MB).

### Guardrails

The study builder inserts read-only observations into an **in-memory copy of the actual game source**. It does not
maintain a forked combat model or rewrite source files. Missing/duplicate insertion anchors fail loudly. The runner
refuses an uninstrumented import rather than silently reporting zero damage. Observers use an external WeakMap,
not new `Game` fields or RNG calls. Complete per-tick state/RNG parity is tested, as are full-run terminal hashes and
all wave checkpoints' unchanged continuation. HP conservation is checked on every reported audited run; current
full-run tooling also checks gold conservation. All 36 pacing baseline hashes match the primary sweep.

## 1. Comparable policies, not optimal play

| Strategy | Composition |
|---|---|
| Ballista-heavy | Repeating 3 Ballistas + 1 frost |
| Archer-heavy | Repeating 3 Archers + 1 frost |
| Mixed | Previous playthrough bot’s mix: 6 Archers, 5 Catapults, 4 Ballistas, 3 frost at 18 plots |

**Exact mixed plan:** Archer, Catapult, Archer, frost, Ballista, Archer, Catapult, Ballista, frost,
Archer, Catapult, Ballista, Archer, Catapult, frost, Ballista, Archer, Catapult. This is **6 Archers,
5 Catapults, 4 Ballistas, 3 frost** at 18 plots, costing 5,460 at full upgrades. Smaller maps use a prefix.
This fixed mix is a control, not a proposed optimal defense.

All primary policies use the same starting gold, real kill income, legal purchases, 0.5-second decisions and a
volley aimed at the gate-leading foe when ready. They never call waves early. Placement maximizes L1 sampled road
coverage. They target L1 before wave 4, L2 before wave 9, then L3; a filled board tops up remaining upgrades.
Archer forks alternate Fire/Lune by Archer construction order (not plot parity).

Budget comparability means **the same economic rules**, not identical realized income/spend: failed defenses lose
kill income and die earlier. An additional common cumulative cap (`230 × map plots`) tests whether the broad result
is only a consequence of allowing Ballista builds a larger total bill. That is a shared ceiling, not forced equal spend.
The bot may wait for its planned upgrade instead of choosing another affordable action; alternate upgrade orders test
some of that bias. No policy searches optimal build/upgrade/sale sequences or manually focuses tower targets.

## 2. Primary campaign results

Mean lives include losses as zero. Early Archer losses are not counted as short successful playthroughs.

| Strategy | Wins | Mean lives | Mean spent | Mean simulated duration* |
|---|---:|---:|---:|---:|
| Ballista-heavy | **160/160** | **19.92** | 5,247 | 19.57 min |
| Mixed | 153/160 | 14.18 | 4,500 | 19.61 min |
| Archer-heavy | 10/160 | 0.77 | 1,356 | 5.41 min |

\*Includes time until loss, so the duration column is **not** a cross-strategy pacing ranking.

| Map | Ballista-heavy wins / mean lives | Mixed wins / mean lives | Archer-heavy wins |
|---|---:|---:|---:|
| Meadow | 8 / 20.0 | 8 / 19.4 | 8 |
| Ford | 8 / 18.9 | 8 / 15.8 | 1 |
| Crossroads | 8 / 20.0 | 8 / 19.1 | 0 |
| Switchback | 8 / 20.0 | 8 / 17.2 | 1 |
| Twin Rivers (`rivers`) | 8 / 20.0 | 7 / 11.0 | 0 |
| Serpent | 8 / 20.0 | 7 / 12.4 | 0 |
| Saltire | 8 / 20.0 | 8 / 13.6 | 0 |
| Gorge | 8 / 20.0 | 8 / 11.8 | 0 |
| Trident | 8 / 20.0 | 8 / 15.0 | 0 |
| Last Stand (`citadel`) | 8 / 20.0 | 7 / 10.5 | 0 |
| Harvest | 8 / 20.0 | 7 / 12.8 | 0 |
| Orchards | 8 / 20.0 | 8 / 18.9 | 0 |
| Hairpin | 8 / 20.0 | 7 / 14.4 | 0 |
| Crows | 8 / 20.0 | 8 / 13.0 | 0 |
| Detour | 8 / 20.0 | 8 / 16.5 | 0 |
| Parting | 8 / 20.0 | 8 / 17.8 | 0 |
| Winding | 8 / 19.5 | 8 / 13.9 | 0 |
| Gauntlet | 8 / 20.0 | 8 / 13.8 | 0 |
| Kings | 8 / 20.0 | 8 / 10.6 | 0 |
| Watch | 8 / 20.0 | 6 / 6.2 | 0 |

Archer-heavy usually fails before a full endgame branch composition exists. This is evidence against that sampled
campaign strategy, **not** a clean Fire-versus-Lune endgame experiment or proof Archers have no supporting value.

## 3. Sensitivity checks

Unless stated otherwise: Ford, Rivers, Citadel, Harvest, Hairpin, Watch; seeds 1–4. Each primary strategy has 24 cases.
The matched staged reference is Ballista-heavy 24/24, Mixed 21/24, Archer-heavy 1/24.

| Changed control | Ballista-heavy wins | Mixed wins | Archer-heavy wins |
|---|---:|---:|---:|
| Spread: fill L1 slots before upgrades | 24/24 | 12/24 | 0/24 |
| Rush: finish existing towers before expanding | 24/24 | 21/24 | 1/24 |
| Shared `230 × plots` spend cap | 24/24 | 14/24 | 1/24 |
| Line-aware Ballista plot heuristic | 24/24 | 22/24 | Not run |
| No volleys from the start | 24/24 | 14/24 | 0/24 |
| Early calls only on a cleared field | 24/24 | 22/24 | 0/24 |
| Pure towers, no frost | Pure Ballista **24/24** | Not run | Pure Archer **0/24** |

Removing frost lowers pure Ballista's mean lives to 17.12; support matters, but does not explain away Ballista wins.
Archer-heavy remains weak across sampled upgrade orders; the old staging policy is not the only cause.
The line heuristic improves mean Ballista-heavy lives on this subset from 19.79 to 19.96, but coverage-only placement
was already sufficient to win. The player does not have to exploit an exceptional line for this strategy to work.

Separate second-chapter branch probe: Harvest, Orchards, Hairpin, Crows, Detour, Watch; seeds 1–4; **rush** policy.
Mixed with forced Fire wins 19/24; forced Lune wins 22/24. Archer-heavy wins 0/24 with either branch.
This small sample suggests Lune synergy remains useful in a mixed team; it does not establish universal branch rankings.

## 4. Useful damage, piercing, misses and coverage

Useful damage is HP actually removed, capped by remaining HP. Healing can make total useful damage exceed initial
spawned HP. Overkill is excess post-armor/mark hit or burn damage. A miss is a **retired zero-hit projectile**;
this includes homing shots whose target died and zero-contact volley arrows, not just bad aim. Unresolved shots
remain pending. Splash contacts are counted separately from projectile count.

| Whole-run source/cohort | Contacts / shot fired | Zero-hit retired shots | Overkill / applied damage |
|---|---:|---:|---:|
| Ballista in Ballista-heavy | 1.76 | 8.6% | 10.8% |
| Ballista in Mixed | 1.95 | 5.7% | 11.6% |
| Catapult in Mixed | 2.70 | 6.3% | 4.2% |
| Plain Archer in Archer-heavy* | 0.95 | 4.6% | 4.4% |

\*Different survival times/exposure: not a causal DPS-per-gold ranking. Whole-run Fire/Lune/volley/frost accounting is
in `summary.json`; marked damage is included once, with its arithmetic amplified share reported separately.

- **50.7%** of Ballista useful damage in Ballista-heavy came from contacts after the first enemy; **10.9%** after the
  third. In Mixed the corresponding shares are **52.6% / 13.6%**. A single recorded bolt reached 18 enemies in
  Ballista-heavy and 21 in Mixed. About 9.4% / 11.9% of retired bolts hit more than three enemies.
- Those useful-damage shares are retrospective accounting. A three-hit cap would change deaths, retargeting, gold,
  summons and RNG consumption; **do not turn them into a predicted win-rate change**.
- The max-base-range geometric footprint, averaged over every plot within each map and then all 20 maps, is
  **42.7% of route length for Ballista versus 26.2% for Archer**. For each tower's best five plots it is 51.3% versus
  31.3%. This is the shipped 4-unit path sampler, not unique targets or projectile travel paths; overlapping roads
  and actual lane/air movement differ. Fire/Lune range differs slightly from the plain L3 Archer used here.
- Ballista's target availability is 50.7% in Ballista-heavy and 72.5% in Mixed, while plain Archer in struggling
  Archer-heavy is 62.2%. A failing defense can have *more* targets in reach. Availability is not useful coverage
  or a substitute for actual damage/placement; the geometry and live target-time measures answer different questions.
- A common **first 120 seconds** exists for all 480 primary runs (none ended before 165 seconds). Mean spend is
  601 Ballista-heavy, 615 Archer-heavy, 617 Mixed; mean capped useful damage including volley is 3,261 / 2,955 / 3,099.
  Ballista's early overkill is higher (25.2%) yet does not erase its overall effectiveness. The gap is not merely
  a comparison of a 32-minute winner to a five-minute loser.

The source-level explanation is credible: long range, air capability, large per-hit damage with little proportional
armor loss, and full damage on unlimited pierces through existing column-shaped waves. Projectile flight continues
for `range × 1.15 / speed`; automatic acquisition and actual bolt geometry still constrain it. This study measures the
combined package. It does **not** prove that piercing alone, rather than range, acquisition, support or placement,
accounts for the entire advantage.

## 5. Pacing: last purchase is not last useful purchase

A purchase receiving later damage credit does not prove it was needed. Conversely, cash remaining does not prove
spending was impossible. The study therefore replays exact checkpoints, freezing **all future purchases** while
retaining ordinary wave/volley decisions. A boundary qualifies if it wins with at least baseline lives; the reported
boundary is the first for which **every later tested boundary also qualifies**. No monotonicity is assumed.

This is an **observed sufficient-defense checkpoint**, at wave granularity—not an exact causal last necessary
purchase. Losing baselines are excluded, not scored as successful freezes. The same seed does not lock later routes
across changed policies: altered deaths and volley calls can consume RNG differently. These are whole-policy
counterfactual outcomes, not perfectly coupled isolated hit experiments.

### Ballista-heavy, seeds 1–3

| Map | Mean sufficient-defense time | Mean time still remaining | Wins preserved |
|---|---:|---:|---:|
| Ford | 5.3 min | 5.0 min | 3/3 |
| Rivers | 5.8 min | 7.4 min | 3/3 |
| Citadel | 11.2 min | 14.8 min | 3/3 |
| Hairpin | 8.2 min | 10.6 min | 3/3 |
| Gauntlet | 9.7 min | 19.1 min | 3/3 |
| Watch | 13.3 min | 19.0 min | 3/3 |

The ordinary bot continues buying well after these thresholds. Extra purchases can improve redundancy even if
baseline lives do not improve; they are not therefore all meaningful decisions or all useless in every objective.

Two ability cutoffs distinguish construction exhaustion from total passivity:

- From the **earlier sufficient checkpoint**, remove purchases **and new volleys**: Ballista-heavy still wins 18/18,
  but only 10/18 retain baseline lives. Aiming can still matter to a perfect-lives objective with a thinner defense.
- From the **actual final-purchase checkpoint**, remove **all further inputs**: Ballista-heavy preserves the win and
  baseline lives in **18/18**. Existing in-flight attacks complete normally. On late maps this is a genuinely passive
  construction tail under the tested objective, not just a bot sitting on money while missing affordable upgrades.
- For winning Mixed baselines, only **14/16** retain baseline lives without new inputs after the last purchase.
  The two others still win but lose additional lives. One earlier-threshold Mixed cutoff turns a Watch win into a loss.

### Ordinary late-map construction tails (primary eight seeds, Ballista-heavy)

| Map | Mean last purchase | Mean time after it | Mean gold remaining |
|---|---:|---:|---:|
| Citadel | 19.8 min | 6.2 min | 2,224 |
| Gauntlet | 18.7 min | 10.1 min | 4,201 |
| Kings | 18.7 min | 13.5 min | 5,822 |
| Watch | 18.6 min | 13.6 min | 5,856 |

These layouts have every plot occupied/maxed: zero direct build/upgrade choices remain. **Selling/rebuilding is still
legal**, however—54 fully funded different-kind replacement options on these Ballista layouts at the terminal
position, if play were to continue. The bot does not sell. Direct-action exhaustion alone is not a claim that all
legal decisions have disappeared.

### Useful spending still exists for some mixed defenses

Paid swaps use the first two existing towers of a kind, at a late funded checkpoint, with actual 60% refunds and
full rebuild costs; no oracle plot search. Controls freeze purchases with the same volley policy.

| Case | Untouched mixed suffix | Two Archers → Ballistas | Net gold cost |
|---|---:|---:|---:|
| Citadel seed 1, wave 24 | Win, 4 lives | Win, 14 lives | 524 |
| Watch seed 1, wave 21 | Win, 4 lives | Win, 18 lives | 524 |
| Watch seed 2, wave 21 | Win, 14 lives | Win, 19 lives | 524 |
| Watch seed 3, wave 21 | **Loss** | **Win, 5 lives** | 524 |

Not every swap helps: on Gauntlet seed 1 the same Archer replacement reduces final lives from 12 to 9. Replacing
Ballistas with Archers causes losses in several of these mixed suffixes. Reallocation remains situational, and its
frequent reward for moving *toward Ballista* reinforces the balance problem. "No upgrades left" should not be
presented as a solved-defense proof for every mixed board.

### Does skipping existing gaps solve the duration?

Not by itself. On 24 Ballista-heavy matched wins, safe clear-field early calls save only **0.47 minutes on average**.
For Mixed's 21 pairs that win under both policies, the mean saving is **0.10 minutes**; other changed outcomes are
not treated as faster successful completions. These policies also gain existing early-call income, so they are not
pure timing controls. They do not test aggressive overlapping-wave calls.

Late duration is largely in long spawn streams plus travel/combat, not just fourteen-second waits after clearing a
wave. `buildSpawns` emits shuffled sequential columns, increasing counts with wave number; `WAVE_GAP` starts after
the last scheduled spawn, **not** after every enemy dies. Removing every nominal gap is not equivalent to this safe
policy and would change overlap, income and difficulty.

## 6. Recommendation for the next bounded experiment

**Do not ship a fix in this batch.** The next authorized task should build an isolated comparison, retaining the
shipping baseline:

1. **Penetration-only diagnostic:** test a three-contact ceiling against baseline, or a modest diminishing-damage
   alternative as a separate arm—not a simultaneous price/range/HP overhaul. Three is a diagnostic candidate, not an
   approved final number. It preserves a line-clearing identity; the observed beyond-third useful damage suggests
   this mild lever may also be insufficient. Re-run whole games, including the teaching maps and pure/heavy builds.
2. **Cadence/geometry diagnostic:** separately compare equal-count, equal-HP staggered/isolated fast approaches with
   the existing columns on a small late-map sample. Avoid arbitrary Ballista immunity or surprise hard counters.
   If it merely punishes every defense or does not create an Archer niche, reject it. If penetration is not the
   main lever, isolate range/coverage next rather than escalating global enemy health.
3. **Human/phone check before acceptance:** Archer should have a readable use against scattered fast targets,
   Ballista satisfying heavy lines/armor, Catapult ground clusters, Mage support. Test placement/readability and
   interaction workload. Keep viable Ballista-heavy play; do not target an arbitrary failure percentage.
4. **Then reassess pacing** with the same frozen-purchase/volley probes and actual player decision timelines. If
   balanced situational defenses still leave 10–19 minutes of passive late play, propose a small late-wave cadence/
   compression experiment that preserves threat variety and meaningful decisions. Do not assume fewer waves or
   faster spawns will be harmless; they change income, overlap and available choices.

## Verification and limits

- Added **45 regression tests** for guarded source instrumentation, shipping-source nonmutation, per-tick state/RNG
  equivalence, continuation parity, useful/overkill/piercing/burn/armor/mark/healing/leak accounting, pending versus
  missed projectiles, source ownership, gold/HP checks, every map's deterministic placement, common caps, frozen
  buying with active volley, direct versus rebuild choices, early-call constraints and timeout censoring.
- `NODE_ENV=test npm test`: **228 files / 3,376 tests passed** on the unchanged rerun. The first full run, concurrent
  with build/typecheck, hit an existing HR test timeout: `tests/hr/run.test.ts > keeps foes, shots and gems under
  their caps` — `Error: Test timed out in 5000ms.` No HR code/tests/timeouts were changed; the full suite passed when
  rerun without those concurrent checks.
- `npm run typecheck` and `npm run build`: passed. `bash -n scripts/kingsroad/study/reproduce.sh`: passed. The individual
  matrix commands and report generator were executed; the wrapper was not separately run end-to-end.
- No UI change: browser checks were not rerun for this study. No physical-device or human gameplay/fun test occurred.
  A retune cannot be accepted as more interesting solely from these results.
- Eight fixed seeds in the primary sweep, four in most controls and three for expensive pacing probes are a bounded
  sample, not statistical guarantees. No strategy optimizer, enemy-target priority optimization, aggressive early
  calls, sale-aware live policy, player reaction-delay model or campaign-wide optimal Archer search is claimed.
- Compact artifacts retain outcomes and counterfactuals; raw detailed telemetry is reproducible. Tools fail if
  instrumented source anchors drift. No persistent production telemetry or analytics was introduced.
