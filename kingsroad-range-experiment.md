# KingsRoad: range/coverage-only diagnostic

## Verdict

**Do not ship this 20% range reduction as a stand-alone retune.** Ballista-heavy still wins **160/160** primary
cases; Mixed drops **153→122/160**. Their mean-life gap grows **5.74→10.19**. A fixed-plot-ranking control keeps
every Heavy win while Mixed also regresses. This does not establish the desired situational tower tradeoff.

Measured maximum-level route coverage falls **42.7%→32.7%**, so the intended coverage change actually happened.
This rejects **this magnitude under the existing combat contract**, not every possible coverage-based design.
Do not silently increase the nerf or combine it with the rejected three-hit cap to chase a failure percentage.

The user authorized the next isolated hypothesis after reviewing the piercing report. No shipping source, UI, save,
other game or dependency changed. No playable candidate, human/phone acceptance, commit or push is implied.

## Predeclared single lever

Before observing results, selected `range-80`: **0.8× Ballista range at every level**.

| Level | Baseline range | Experimental range |
|---|---:|---:|
| L1 | 140 | 112 |
| L2 | 150 | 120 |
| L3 | 165 | 132 |

It still outranges base Archer (92/100/110). Unlimited, full-damage piercing is restored; no three-hit retirement
is present in this variant. Prices, damage, reloads, projectile speed (460), armor/floor, air targeting, branches,
starting cash, reward rules, HP, map properties, spawns, wave cadence and ability rules all remain unchanged.

**Existing coupling:** bolt lifetime is already `level.range * 1.15 / shotSpeed`. Changing range therefore reduces
both acquisition radius and nominal bolt-flight budget. That formula, speed and fixed-tick retirement are unchanged;
this is a range-parameter diagnostic, **not** an acquisition-only experiment holding projectile travel constant.
No second lifetime multiplier or collision rule was introduced. Foe-radius acquisition slack remains unchanged.

The builder substitutes three guarded range literals in an **in-memory balance module**, shared by the observed
engine, unobserved engine and policy ranking. It never mutates an imported balance object or rewrites shipping files.
The actual `game.ts` remains byte-identical before observer insertion. Baseline is still the default build; variants
are mutually exclusive. New run metadata records the actual three ranges, and the comparator rejects mislabeled
parameter sets. Same-variant checkpoint continuation remains enforced outside the Game/save object.

## Design and placement controls

**1,200 matched pairs / 2,400 full runs**, with a freshly executed baseline arm:

| Matrix | Pairs | Design |
|---|---:|---|
| Primary campaign | 480 | 20 maps × seeds 1–8 × Heavy / Archer-heavy / Mixed |
| Common spending ceiling | 72 | Six maps × seeds 1–4 × three strategies, plot count × 230 ceiling |
| No volley | 72 | Same six maps/seeds/strategies, ability disabled |
| Rush upgrades | 72 | Same six maps/seeds/strategies, finish towers before adding more |
| Pure towers | 48 | Same six maps/seeds, pure Ballista / pure Archer, no frost |
| Line-aware placement | 48 | Same six maps/seeds, Heavy / Mixed |
| Extra early seeds | 360 | First five maps × seeds 9–32 × three strategies |
| Fixed baseline plot ranking | 48 | Six maps × seeds 1–4 × Heavy / Mixed |

Heavy is the original 3-Ballista/1-frost repeating policy, not pure Ballista. Mixed is the original fixed 18-entry
plan, not a newly optimized composition. Six control maps: Ford, Rivers, Citadel, Harvest, Hairpin, Watch. Early
maps: Meadow, Ford, Crossroads, Switchback, Rivers. Ordinary wave calls, balanced Archer branches, legal actions/
income and no selling remain fixed. Equal economic rules/caps do not mean equal actual spend or income.

Adaptive coverage and line policies use the **experimental L1 range** for ranking. This changes Ballista plot order
on all 20 maps; failing to propagate the new balance into the bot would be a misleading test. The extra
`baseline-coverage` control retains stock L1 Ballista plot ranking while combat still uses reduced ranges.
Other towers' rankings are identical. This freezes the ranking heuristic, **not** purchase times, target decisions,
kill income or an exact action/spawn tape. Neither placement mode is an optimal search.

## Primary results

| Strategy | Baseline wins | Range-80 wins | Mean lives, baseline → experiment |
|---|---:|---:|---:|
| Ballista-heavy | 160/160 | **160/160** | 19.92→**19.54** |
| Mixed | 153/160 | **122/160** | 14.18→**9.36** |
| Archer-heavy | 10/160 | **10/160** | 0.77→**0.77** |

- Mixed: **33 won→lost**, **two lost→won**, net **31** fewer wins. Lives worsen in 108 cases and improve in 18.
  Crows falls **8→1** wins; Watch **6→2**; Serpent **7→4**; Citadel **7→4**. Not every map regresses: Parting keeps
  **8/8** and slightly improves mean lives; Switchback improves mean lives while retaining every primary win.
- Heavy: every win retained; fewer lives in 25 cases, more in two, with all 160 full terminal hashes changed.
  Its mean-life advantage over Mixed grows from **5.74** to **10.19**, rather than narrowing.
- Archer-heavy is bit-identical, as expected when neither the policy nor combat builds Ballistas. This verifies
  isolation; it is **not** an expectation that a Ballista-only change should directly buff Archer-only results.

These outcomes reject the stand-alone candidate for the stated role/mixed-defense goals, not because bots must
meet a prescribed failure rate. They do not prove every player Mixed build would regress or that the fixed Mixed
policy is optimal. Repeated harm to that policy is a warning, not a universal balance theorem.

### Geometry and bolt telemetry

Map-weighted mean of per-plot road fractions at maximum base level (no target occupancy, air routes, radius slack,
trajectory alignment or overlap union): Ballista **42.7%→32.7%**; Archer unchanged at **26.2%**. This is geometric
coverage, not an exact damage-opportunity measure.

| Ballista source metric, primary | Heavy baseline → range-80 | Mixed baseline → range-80 |
|---|---:|---:|
| Maximum retired-bolt contacts | 18→17 | 21→18 |
| Useful damage after third contact | 10.92%→10.16% | 13.59%→11.28% |
| Contacts per fired bolt | 1.76→1.78 | 1.95→1.91 |
| Zero-contact fraction of retired bolts | 8.61%→5.70% | 5.66%→4.38% |
| Bolts fired | 397,143→394,796 | 166,443→131,315 |

Unlimited piercing genuinely remains active. Reduced coverage does not translate directly into the same percentage
of lost useful damage. The lower Heavy miss fraction and similar whole-run useful damage are consistent with a
changed engagement/placement pattern; they do **not** isolate a causal explanation. Healing, summons, targets,
earned income, run length and later RNG schedules also change. Mixed's earlier losses truncate damage/spending.

## Budget and sensitivity controls

Wins, baseline → range-80; 24 cases per listed strategy/control.

| Control | Ballista-heavy | Mixed | Archer-heavy |
|---|---:|---:|---:|
| Common spending ceiling | **24→20** | 14→12 | 1→1 |
| No volley | **24→24** | 14→8 | 0→0 |
| Rush upgrades | **24→24** | 21→18 | 1→1 |
| Line placement | **24→24** | 22→15 | Not sampled |

Pure towers without frost: Ballista **24→24** (mean lives **17.12→12.83**), Archer **0→0**. The range change matters
for safety margins even when wins remain. All four budget-capped Heavy Watch cases become losses. Budget Mixed has
three won→lost and one lost→won; no-volley Mixed has seven won→lost and one lost→won. Net changes are not gross
regression counts.

### Does bot re-ranking explain the primary pattern?

Compare the **same six maps × seeds 1–4**, not 24 fixed cases against the whole 160-case primary sweep:

| Placement | Heavy wins / mean lives | Mixed wins / mean lives |
|---|---:|---:|
| Stock baseline coverage | 24/24 · 19.79 | 21/24 · 11.50 |
| Reduced range, adaptive ranking | 24/24 · 19.62 | 15/24 · 6.04 |
| Reduced range, stock ranking | 24/24 · 18.79 | 15/24 · 7.58 |

Both ranking modes preserve all Heavy wins and lose six Mixed wins relative to the baseline. Re-ranking affects
margin, but does not explain away the qualitative result on this subset. This does not eliminate policy quality as
a confound across all conceivable builds; the fixed ranking control is not an optimized human defense.

## Early teaching maps: 32 seeds each

| Map | Heavy wins | Mixed wins | Mixed mean lives |
|---|---:|---:|---:|
| Meadow | 32→32 | 32→32 | 19.12→18.84 |
| Ford | 32→32 | **31→29** | **14.56→11.69** |
| Crossroads | 32→32 | 32→32 | 18.59→18.03 |
| Switchback | 32→32 | 32→32 | 18.31→18.50 |
| Rivers | 32→32 | **30→28** | **14.75→10.34** |

Combined: Heavy **160→160** wins, mean lives **19.69→19.32**. Mixed **157→153**, mean lives **17.07→15.48**:
**five new losses and one rescue**, net four fewer wins. Archer-heavy remains **43→43**, bit-identical.

The early aggregate regresses less than the three-hit candidate, and Switchback is not worsened here, but Ford and
Rivers still lose mixed-defense safety. That does not outweigh the primary Heavy/Mixed gap or certify tutorial
safety. These are 32 deterministic seeds per early map, not a human phone playtest.

## Pacing and scope limits

On successful paired primary cases only, Heavy duration increases **0.1211 minutes** (160 both-winning pairs);
Mixed increases **0.0739 minutes** (120 both-winning pairs, excluding both losses and the two new rescues).
Shorter defeats are not called faster victories. Sufficient-defense cutoffs, passive tails and reallocation were
**not** remeasured; no pacing fix is claimed.

Same seed/policy enables reproducible pairing, not a fixed future spawn tape: changed combat can alter summons,
RNG consumption and survival duration. No health/cadence/price change or spawn-tape override was added. One selected
range scale cannot establish an optimum or rule out all coverage designs. Human fun and optimal strategies remain
unmeasured. No browser UI, physical-phone or new human gameplay check was performed for this offline experiment.

## Evidence, reproduction and correctness

- Compact evidence: `reports/kingsroad-range/{summary.json,pairs.csv,manifest.json}`. Includes per-map/strategy and
  matched placement summaries, geometry, terminal hashes, the exact delta and 20 raw-file SHA-256 hashes.
  Both prior study/three-hit artifact directories remain preserved.
- Raw data from this execution: `/tmp/kr-range/{baseline,range-80}/*.jsonl`; not checked in, fully regenerable.
- **Executed the convenience wrapper end-to-end**:
  `RAW=/tmp/kr-range REPORT=reports/kingsroad-range bash scripts/kingsroad/study/reproduce-range.sh`.
  It builds both variants, runs their self-tests, runs all matrices with at most three workers and generates the
  complete paired report. Additional boundary/ranking fixtures and final report generation were run after adding
  those checks; the only gameplay delta throughout remained the same three predeclared range literals.
- **840** baseline terminal hashes reproduce the original study (792 original control/primary cases plus 48
  fixed-ranking cases equivalent to original coverage). Extra early seeds are new baseline runs, not historical
  matches. All eight shipping/shared simulation input hashes are unchanged.
- **378** non-Ballista paired terminal states are identical: 376 Archer-heavy/pure-Archer cases plus two Mixed
  rush runs ending before a Ballista is built. All 2,400 HP/gold/source-damage ledgers reconcile.
- Both builds pass full observed/unobserved per-tick state/RNG parity for three seeds × 12,000 ticks, a complete
  Meadow Mixed game and all 13 recorded matching-variant checkpoint suffixes. Three-hit regression tests still pass;
  its 1,152-pair corpus also passes the updated comparator separately, without overwriting retained artifacts.
- Both builds pass **12 actual target-boundary fixtures**: L1–L3 × ground/flying × just inside/outside range including
  radius slack. They assert correct `levelOf`, unchanged damage/reload/speed, the existing lifetime formula and no
  extra RNG. All 20 maps' frozen ranks match stock coverage; adaptive Ballista ranks change on all 20, and other
  towers' ranks do not change. Synthetic stationary targets are test fixtures, not modifications to campaign runs.
- Both builds retain the all-ten-enemy/L1–L3 simultaneous-contact fixtures and separate-tick/prior/dead contact
  checks, now proving unlimited piercing for range-80. The full range corpus also contains >3-contact bolts.
- Added **13 range tests** covering exact three-literal isolation, anchor failures, shipping object/files unchanged,
  actual compiled parameters, unlimited piercing, boundary/flight/ranking/suffix parity, non-Ballista equality,
  frozen placements, explicit arm selection, exact 1,200-pair design and misleading baseline-report refusal.

Final verification ran **sequentially**, after the matrix workers finished:

- `NODE_ENV=test npm test`: **230 files / 3,402 tests passed**.
- `npm run typecheck`: passed.
- `npm run build`: passed (production).
- `git diff --check` and `bash -n scripts/kingsroad/study/reproduce-range.sh`: passed.

Logs: `/tmp/kr-range-{full,type,build}-verified.log`. No failures occurred in these final checks. No HR code,
existing test timeout or other game's implementation was changed. No browser check was run for this offline/non-UI
experiment.

## Next decision, not another implementation

Keep stock range and unlimited piercing in the shipping game. Do **not** combine range-80 with the three-hit cap,
try successively harsher ranges in this batch, raise HP, shorten waves, or add sinks/mandatory tiers to rescue the
candidate. The two diagnostics are evidence that simple isolated Ballista nerfs can penalize the sampled Mixed
plan more than a redundant Heavy defense; they are not proof that every Ballista adjustment must fail.

If the user wants to continue, the next distinct hypothesis is **cadence/spacing that creates an actual rapid-fire
Archer role**, tested separately at original tower stats, with equal enemy counts/HP and clear timing/exposure
controls. Policy quality/role-appropriate placement must also be checked before declaring a tower has no niche.
Neither that scenario nor another stat change is approved/implemented in this batch. Review a promising candidate
with the user on a phone before accepting balance/fun, then revisit sufficient-defense pacing. Mage/maps remain
separate work.
