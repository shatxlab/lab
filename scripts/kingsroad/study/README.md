# KingsRoad strategy/pacing study tooling

**Study only.** No shipping simulation, UI, balance, spawn schedule, saves, or RNG behavior changes.
Read `kingsroad-balance-study.md`, `kingsroad-roadmap.md` and `game-design-improvements.md` §6B/§9.

## Reproduce

From the repository root, with dependencies installed (the project already has esbuild):

```sh
bash scripts/kingsroad/study/reproduce.sh
# Optional explicit output locations; use a clean RAW directory.
RAW=/tmp/kr-study-raw REPORT=/tmp/kr-study-report bash scripts/kingsroad/study/reproduce.sh
```

This builds study-only bundles, runs equivalence checks, runs the matrices in groups of at most three
workers, then exports JSON summaries, wave-granular pacing probes, run-level CSV and simulation-input hashes.
Node's native TypeScript stripping is used for the tiny builder; the actual runners are esbuild bundles.
The default files stay in `/tmp`; no browser/localStorage/campaign progress is read or written.
The individual matrix commands have been run; the reproduction wrapper is a convenience with the same arguments.

The cadence diagnostics are separate arms with their own wrappers:

- `reproduce-cadence.sh`: spacing x2 for runner, bat and scamp only (waves get longer; superseded in part).
- `reproduce-matched.sh`: matched-2x (fast x2, slow spacing scaled to hold each wave's length) and the density-only control.

```sh
RAW=/tmp/kr-cadence-raw REPORT=/tmp/kr-cadence-report bash scripts/kingsroad/study/reproduce-cadence.sh
RAW=/tmp/kr-matched-raw REPORT=/tmp/kr-matched bash scripts/kingsroad/study/reproduce-matched.sh
```

The role-appropriate Archer policy probe runs `archer-smart` against the stock archer at stock stats, and the roster
diagnostic splits fast ground swarms across roads (`roster-spread`):

```sh
RAW=/tmp/kr-archer-raw bash scripts/kingsroad/study/reproduce-archer-policy.sh
RAW=/tmp/kr-roster-raw bash scripts/kingsroad/study/reproduce-roster.sh
RAW=/tmp/kr-bulwark-raw bash scripts/kingsroad/study/reproduce-bulwark.sh  # dose lives in variant.ts BULWARK
```

For a smaller run:

```sh
node --experimental-strip-types scripts/kingsroad/study/build.ts /tmp/kingsroad-study.mjs
node /tmp/kingsroad-study.mjs --self-test
node /tmp/kingsroad-study.mjs --maps=ford,watch --seeds=1,2,3 \
  --strategies=ballista,archer,mixed --out=/tmp/kr-small/rows.jsonl
node /tmp/kingsroad-study.mjs --maps=watch --seeds=1,2,3 \
  --strategies=ballista,mixed --pacing --out=/tmp/kr-small/pacing.jsonl
```

The full summarizer deliberately requires the complete primary 20×8×3 matrix; do not use it to present a
partial run as the campaign study. CSV terminal hashes and `manifest.json` allow auditing reruns.
The input hashes include KingsRoad's six sim files plus the shared Tower balance/RNG inputs.
Full raw JSONL contains purchase histories, per-source and per-tower damage, wave boundaries, outcomes and hashes;
it is not checked in (about 19 MB). `reports/kingsroad-study/` retains the compact evidence. Do not put unrelated
`.jsonl` experiments in the same input directory, or the summarizer will include them as additional matrices.

## Policies and controls

- `ballista`: repeating three Ballistas, one frost; `archer`: three Archers, one frost. These are **heavy**, not pure.
- `mixed`: the previous playthrough bot's 18-entry tower mix, repeating if necessary, not an optimized composition.
- `pure-ballista` / `pure-archer`: no frost, to distinguish support from primary tower strength.
- All use the same map starting cash/kill rewards and a decision every 30 fixed ticks (0.5 simulated seconds).
  They use only legal `build`, `upgrade`, `castVolley`, and optional `callWave` actions. No gold grants or changed waves.
- `staged`: aim for L1 before wave 4, L2 before wave 9, then L3. When plots fill, top up remaining upgrades.
  `spread`: fill plots at L1 first. `rush`: finish each existing tower before adding another.
- `balanced` Archer forks alternate Fire/Lune by **Archer construction order**, not plot parity. `--branch=fire|lune`
  forces a branch on maps that permit it. Branch comparisons do not establish editorial descriptions as balance fixes.
- Placement maximizes L1 road coverage, calculated with the shipped `roadWithin`. `--placement=lines` weights Ballista
  positions by a deterministic narrow-ray path-alignment heuristic. Neither uses future enemy routes or oracle targeting.
- Volley targets the gate-leading foe every available decision; `--no-volley` removes this automation.
- `--early` calls only with the field and current spawn schedule empty. It also earns the **existing** early-call gold;
  this is not an income-controlled pure timing experiment. Default never calls early.
- `--cap=archer-plots`: common cumulative spend ceiling `230 × map.plotCount`, regardless of strategy.
  It is a ceiling, not equal actual spend: failed defenses can lose income or die before using the ceiling. The policy
  can also stop at its next unaffordable/cap-blocked planned action rather than searching every cheaper alternative.

## Observations, not another game implementation

`instrumented-game.ts` is a type-safe facade. This section describes the default **baseline** variant. The builder substitutes an in-memory copy of the actual `game.ts` with
read-only observer calls inserted at exact guarded anchors. Missing or duplicate anchors fail loudly. Source files
are never rewritten. `telemetry.ts` keeps all state in an external WeakMap; it adds no `Game` fields or random calls.
The runner refuses audited execution without the builder. Tests compare complete per-tick game/RNG JSON, HP ledgers,
full-run terminal hashes and every recorded checkpoint's unmodified continuation.

- **Useful damage:** HP removed capped by current HP; it includes re-damage after healing. Overkill is the excess
  post-armor/mark hit or burn damage, not hypothetical nominal power lost to a miss.
- Separate armor and fireproof reductions; Fire burning is attributed to the last refreshing Fire source. The
  arithmetic marked share is reported as a component of useful damage, **not added again** or claimed as causal Lune value.
- Piercing useful damage counts HP actually removed by contacts after the bolt's first enemy, and separately after
  its third. This describes recorded combat, not the outcome of a hypothetical penetration nerf.
- **Misses:** retired zero-hit projectiles, including homing arrows whose target died, missed stones and zero-contact
  volley arrows. Still-flying projectiles are pending, not misses. Splash/piercing contacts can exceed shots fired.
- **Availability:** tower-seconds with any valid target in range / active tower-seconds. It is not unique enemies,
  optimal placement, useful line geometry, or a causal range bonus; struggling defenses can have *higher* availability.
- A common 120-second opening window avoids comparing only long-lived Ballista runs to early Archer losses. Whole-run
  damage totals reflect different survival times, HP growth, healing and summons; do not rank damage/gold from them.
- HP conservation: spawned HP + healing = capped useful damage + leaked remaining HP + current living HP.
  Gold conservation checks starting cash + kill income + early-call bonus − purchases on each audited full run.

## Pacing and counterfactual limits

`--pacing` takes exact wave-boundary and last-purchase checkpoints. Every suffix uses the **unobserved matching-variant** simulation (the unmodified game for baseline),
absolute decision tick and saved RNG. With purchases frozen, ordinary waves/volley behavior continue. The earliest
sufficient boundary is the first winning suffix with at least baseline lives **whose later tested boundaries all
also qualify**. This avoids assuming monotonicity. Losing baselines are excluded from that threshold, not treated as
successes; both are still eligible for funded reallocation probes.

This is a wave-granular sufficient-defense observation, not the exact causal "last useful purchase", a proof of
optimal play, or proof that a human has nothing interesting to do. Independent suffixes can alter deaths, targeting,
volley RNG consumption, summons and later spawn randomness; the same seed does not lock later routes across policies.
Cutoff probes also remove new volleys after the sufficient boundary and after the actual last purchase (existing
in-flight attacks remain). Construction-exhaustion excludes selling: fully funded sell/rebuild options are counted
separately. Reallocation probes use the first two towers of a kind at a funded late checkpoint, not an oracle search.
They pay the real 60% refund/rebuild costs and compare frozen-purchase suffixes with the same volley policy.

No automated metric certifies fun or improved balance. Human/phone playtests remain required before accepting a retune.


## Isolated three-hit experiment

Authorization: compare the baseline with a three-enemy lifetime Ballista contact limit, **not** ship a retune.
Results/rejection rationale: `kingsroad-three-hit-experiment.md`. Paired evidence: `reports/kingsroad-three-hit/`.

```sh
node --experimental-strip-types scripts/kingsroad/study/build.ts /tmp/kr-baseline.mjs baseline
node --experimental-strip-types scripts/kingsroad/study/build.ts /tmp/kr-three-hit.mjs three-hit
node /tmp/kr-three-hit.mjs --self-test
# Full paired campaign, budget, early-map and sensitivity recipe:
bash scripts/kingsroad/study/reproduce-three-hit.sh
# Override only output locations if desired; start with a clean raw directory:
RAW=/tmp/kr-pierce-raw REPORT=/tmp/kr-pierce-report bash scripts/kingsroad/study/reproduce-three-hit.sh
```

The optional builder argument selects one of `baseline` (default), `three-hit`, or `range-80` (see below); never stacked. `--cap` still means a **spending**
cap, not a piercing selection. Three-hit adds only `if (shot.hitIds.length >= 3) return false` after the shipped bolt's
unique-enemy hit registration. The third contact retires the bolt immediately—even if several enemies overlap in
one tick. Existing collision iteration order remains unchanged. Distinct living targets count, not kills; prior hits
still consume the same lifetime budget. Prices, all damage/armor rules, ranges, rates, air targeting, branches, waves,
map properties, rewards and starting cash remain identical. There are no new Game/save fields or explicit RNG calls.

Both observed and unobserved facades are built with the same selection. This matters for checkpoint suffixes:
**never replay a capped run with unlimited baseline rules**. Checkpoints carry a study-only variant tag outside the
Game object and cross-variant restoration is rejected. Ordinary imports and normal production builds remain baseline.
The baseline summarizer refuses experimental rows; the paired comparison tool requires matching arm tags/policies,
complete matrices, finite measurements, reconciled HP/gold/source damage, capped bolt histograms, 792 old baseline
terminal hashes and identical non-Ballista states. An unchanged Archer-only result is an isolation check, not a failed
expectation that nerfing Ballista should directly buff Archers.

The design is 1,152 matched pairs / 2,304 full runs:
- 480 pairs: 20 maps × eight seeds × three primary strategies.
- 72 each: common spending ceiling, no volley, and rush upgrades; six control maps × four seeds × three strategies.
- 48 each: pure towers and line-aware placement; six control maps × four seeds × two strategies.
- 360 extra early pairs: first five maps × seeds 9–32 × three strategies, extending primary seeds 1–8 to 32.

`plannedComparisons()` is the validated exact design; `compare-cli.ts` writes paired outcome CSV, per-map/strategy
summaries and input hashes without overwriting the original study artifacts. Per-tick observer equivalence, matching
suffix continuation and synthetic all-ten-enemy/L1–L3 fixtures run for both variants. Fixtures alter stationary test
state to isolate collisions; campaign benchmark runs do not grant gold or alter enemies/spawns.

Individual recipe commands, both self-tests and the comparison generator have been executed. The convenience wrapper
is syntax-checked, not separately rerun end-to-end. No browser/player build or human/phone playtest was made.


## Range/coverage-only diagnostic

The user approved testing coverage separately after the three-hit findings. **No shipping retune/commit/push.**
Report: `kingsroad-range-experiment.md`; evidence: `reports/kingsroad-range/`. Predeclared `range-80` changes only
Ballista L1/L2/L3 ranges **140/150/165→112/120/132** (0.8×), restoring unlimited piercing. No other numbers/rules
change. The existing `range * 1.15 / shotSpeed` flight-life formula remains, so nominal projectile travel shortens
along with acquisition radius; this is not an acquisition-only test holding bolt travel constant.

```sh
# From repo root; outputs default to temporary locations outside the repo:
bash scripts/kingsroad/study/reproduce-range.sh
RAW=/tmp/kr-range-raw REPORT=/tmp/kr-range-report bash scripts/kingsroad/study/reproduce-range.sh
# Smaller selected-range build/run:
node --experimental-strip-types scripts/kingsroad/study/build.ts /tmp/kr-range.mjs range-80
node /tmp/kr-range.mjs --self-test
node /tmp/kr-range.mjs --maps=meadow,ford,rivers --seeds=1,2,3 --out=/tmp/kr-range-small.jsonl
# Complete report requires both arms and all planned rows, not the small sample:
node /tmp/kr-range-compare.mjs /tmp/kr-range-raw /tmp/kr-range-report range-80
```

`variantBalanceSource` guards the three stock literals and supplies one in-memory balance module to both engines,
telemetry/fixtures and bot policy. No imported balance object mutation. `variantSource(game, "range-80")` is identity:
the three-hit guard is absent. Actual run range metadata is validated before pairing. Default baseline output and
shipping input hashes remain unchanged. Ordinary production imports do not load the experiment tooling.

The primary/adaptive policies re-rank using reduced L1 range; line placement's reach/trajectory heuristic also uses
the selected range. All 20 maps change Ballista ordering. The labeled `--placement=baseline-coverage` sensitivity
control freezes the stock L1 Ballista ranking while keeping reduced-range combat; it does not freeze purchase
chronology, actual target selection or future spawns. Other tower rankings are unchanged. All ranking and budget
rules otherwise match the earlier study.

Design: **1,200 pairs / 2,400 full runs** = original 1,152-pair design plus six maps × four seeds × Heavy/Mixed with
fixed stock ranking (48 pairs). `plannedComparisons("range-80")` defines the exact expected matrix. Default
`plannedComparisons()` retains the 1,152-pair three-hit design, and default comparator arm remains `three-hit`.
Select `range-80` explicitly to avoid accidentally mislabeling it as the piercing study. The baseline-only
summarizer rejects either experimental arm.

The report validates **840** old terminal hashes (792 original cases + 48 fixed-stock-ranking equivalents), all
HP/gold/source ledgers, variant tags/parameters, complete policy pairing and identical non-Ballista states. It writes
raw-input hashes, per-map geometry, matched-subset adaptive/fixed-placement summaries, early 32-seed results and
both terminal hashes for every pair. Original reports remain separate/preserved.

Both builds also pass 12 actual ground/air L1–L3 inside/outside acquisition-boundary fixtures (including radius
slack), projectile speed/damage/reload/lifetime checks, fixed/adaptive rank checks on all 20 maps, unlimited contact
fixtures, observed/unobserved per-tick parity and matching-variant checkpoint suffixes. Synthetic stationary setup
is confined to fixtures, never campaign runs. Range-80 is not automatically playable or accepted for phone fun.

**Executed the range wrapper end-to-end**, then reran extra fixture checks and expanded report generation. The
original three-hit corpus also passes the updated comparator independently without overwriting its retained
artifacts. No browser UI, physical-phone or new human playtest was performed. Final sequential test/typecheck/build
results are recorded in the range report and both roadmaps.
