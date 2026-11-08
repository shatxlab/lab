# KingsRoad: three-hit Ballista experiment

> Latest follow-up: `kingsroad-range-experiment.md` completes the separately approved 20%-range diagnostic with
> unlimited piercing. It also is **not recommended as a stand-alone retune**. The roadmaps hold current next steps;
> recommendations below record the earlier batch, not an unexecuted range hypothesis or shipping approval.

## Verdict

**Do not adopt the three-hit limit as a stand-alone shipping retune.** It removes the intended long piercing tail,
but the sampled Ballista-heavy strategy still wins all 160 primary cases while Mixed drops from 153 to 127 wins.
The mean-life advantage of Ballista-heavy over Mixed grows from **5.74 to 9.61 lives**. Early mixed defenses also
suffer new losses. This is a completed diagnostic, not a playable release or a claim of better balance/fun.

No shipping source, tower/enemy number, map, wave, UI, reward, save or other game changed. No commit/push authorized.
The unlimited-piercing baseline remains the production rule and the default study build.

## Isolated rule and design

The study builder changes an **in-memory copy** of the actual simulation. Immediately after the existing
`shot.hitIds.push(foe.id)` in `flyBolt`, it inserts:

```ts
if (shot.hitIds.length >= 3) return false;
```

The bolt retires on its third distinct living-enemy contact, including overlapping contacts in one tick. Existing
iteration order, repeated/dead-target skipping, armor/floor, air hits, mark amplification and all L1–L3 damage
numbers remain unchanged. A contact is not necessarily a kill. No range, damage, price, rate, HP, spawn/cadence,
branch, starting-cash or reward changes are stacked with this rule. There are no extra RNG calls or Game fields.

Both observed and unobserved copies use the selected variant. Study checkpoints carry an external variant tag;
cross-variant continuation is rejected. This prevents accidentally evaluating a capped defense's suffix using
unlimited baseline combat. Default/ordinary imports remain unchanged. The baseline-only summarizer refuses tagged
experimental rows; the comparison report checks both arms and their exact policies.

### Paired matrix

| Matrix | Matched pairs | Scope |
|---|---:|---|
| Primary campaign | 480 | All 20 maps × seeds 1–8 × Ballista-heavy / Archer-heavy / Mixed |
| Common spending ceiling | 72 | Six maps × seeds 1–4 × three strategies; plot count × 230 ceiling |
| No volley | 72 | Same six maps/seeds/strategies, no ability casts |
| Rush upgrades | 72 | Same six maps/seeds/strategies, finish towers before adding more |
| Pure towers | 48 | Same six maps/seeds, pure Ballista / pure Archer, no frost |
| Line placement | 48 | Same six maps/seeds, Ballista-heavy / Mixed |
| Extra early seeds | 360 | First five maps × seeds 9–32 × three strategies |
| **Total** | **1,152** | **2,304 terminal full runs: 1,152 per arm** |

Six control maps: Ford, Rivers, Citadel, Harvest, Hairpin, Watch. Early maps: Meadow, Ford, Crossroads, Switchback,
Rivers. Policies otherwise match the original study (balanced Archer branches, ordinary calls, legal gold/actions,
no selling). These are fixed bounded bots, not optimal strategy searches. Shared caps do **not** guarantee equal
actual spending or income. Extra seeds extend early coverage; they are not a selected subset chosen for a result.

## Primary results

| Strategy | Baseline wins | Three-hit wins | Mean lives, baseline → experiment | Won → lost |
|---|---:|---:|---:|---:|
| Ballista-heavy | 160/160 | **160/160** | 19.92 → **19.56** | 0 |
| Mixed | 153/160 | **127/160** | 14.18 → **9.95** | 26 |
| Archer-heavy | 10/160 | **10/160** | 0.77 → **0.77** | 0 |

- Ballista-heavy loses some lives in 15 cases, improves lives in none, but keeps every win. All primary terminal
  hashes change, so identical win counts do not mean the rule never mattered.
- Mixed loses lives in 101 cases and gains lives in seven; there are no primary lost→won conversions. The largest
  win regressions are Winding **8→2**, Watch **6→1**, Gorge **8→4** (eight seeds per map). Rivers drops **7→5**.
- Archer-heavy's identical outcome/state is **expected by construction**, because it never builds Ballistas.
  It is a valuable isolation check, not evidence that a Ballista-only rule should directly buff Archers.
- Rejection follows the increased Ballista-heavy/Mixed gap and early mixed-defense damage, not an arbitrary desired
  bot failure percentage. The constraint is not a stand-alone solution to the reported universal-answer problem.

### Contact telemetry: rule works, damage shares are not causal forecasts

| Ballista source metric | Heavy baseline → experiment | Mixed baseline → experiment |
|---|---:|---:|
| Maximum retired-bolt contacts | 18 → **3** | 21 → **3** |
| Useful damage after third contact | 10.92% → **0%** | 13.59% → **0%** |
| Useful damage after first contact | 50.72% → **46.76%** | 52.57% → **46.47%** |
| Contacts per fired bolt | 1.76 → **1.65** | 1.95 → **1.74** |
| Bolts fired across primary runs | 397,143 → **424,142** | 166,443 → **158,028** |

The high-contact tail is gone in every experimental row, but two extra full-damage targets plus unchanged long
coverage still support the heavy strategy in these cases. Mixed has fewer Ballistas and loses more survival margin.
That pattern is **consistent with** greater reliance on each bolt's long line, not proof that piercing alone explains
the whole result or that one range value would solve it.

Heavy fires about 6.8% more bolts and records about the same total useful Ballista damage. This is not proof of
identical workload: altered combat changes healing, summons, income, target availability and later random schedules.
Mixed's shorter losses also truncate its whole-run damage/spend. Do not subtract the original beyond-third share
from final totals and call that a causal damage or win prediction.

## Budget and sensitivity controls

Win counts, baseline → three-hit; each primary strategy has 24 cases in these controls.

| Control | Ballista-heavy | Mixed | Archer-heavy |
|---|---:|---:|---:|
| Common spending ceiling | **24→20** | 14→13 | 1→1 |
| No volley | **24→24** | 14→9 | 0→0 |
| Rush upgrades | **24→24** | 21→18 | 1→1 |
| Line placement | **24→24** | 22→19 | Not sampled |

Pure towers, without frost: Ballista **24→23**, Archer **0→0**.

The constraint **does** matter economically: all four capped Watch Ballista-heavy cases turn from wins into losses;
mean capped Heavy lives fall **19.54→16.25**. The capped Mixed loss is Rivers seed 2. Under this forced ceiling the
Heavy/Mixed win gap narrows; it does not negate the contrary uncapped primary result or early mixed-defense harm.
No-volley Mixed has six won→lost and one lost→won conversion, net five fewer wins—do not conflate net and gross
regressions or assume every weaker bolt produces monotonically worse outcomes under changed combat/RNG.

These controls do not establish a new optimal build, nor that all player defenses would regress by these amounts.

## Early teaching maps: 32 seeds each

| Map | Heavy wins | Mixed wins | Mixed mean lives |
|---|---:|---:|---:|
| Meadow | 32→32 | 32→32 | 19.12→19.09 |
| Ford | 32→32 | 31→31 | 14.56→14.00 |
| Crossroads | 32→32 | 32→32 | 18.59→17.78 |
| Switchback | 32→32 | **32→31** | **18.31→15.34** |
| Rivers | 32→32 | **30→22** | **14.75→8.69** |

Across those five maps: Heavy **160→160** wins, mean lives **19.69→19.14**; Mixed **157→148**, mean lives
**17.07→14.98**, with **nine new losses**. Archer-heavy remains **43→43** wins and bit-identical. Rivers Heavy also
loses margin (**19.97→17.81** mean lives), despite retaining every win. The first tutorial map is stable; that is not
a blanket early-map safety pass. Early mixed-defense regressions argue against accepting this candidate as-is.

## Pacing and limitations

Successful paired primary runtimes barely move: Heavy +**0.0155 minutes** on 160 both-winning pairs; Mixed
+**0.0141 minutes** on 127. Earlier losses are not counted as pacing improvements. This experiment does **not**
rerun the original sufficient-defense/reallocation pacing matrix or demonstrate that passive tails are fixed.

Same map/seed/policy gives a deterministic, reproducible comparison, but later random schedules can diverge when
combat changes RNG-consuming summons or when the run ends earlier. No forced replay of a single baseline spawn
tape was added; that would change the existing contract. There is no inferential claim about human win rates, phone
fun or optimal Archer/Mixed play. No browser UI, physical-phone or new human gameplay evaluation was performed.

## Evidence, reproduction and correctness

- New compact evidence: `reports/kingsroad-three-hit/{summary.json,pairs.csv,manifest.json}`. Every pair includes
  both terminal hashes. Original `reports/kingsroad-study/` is preserved, not overwritten.
- Raw evidence from this execution: `/tmp/kr-pierce/{baseline,three-hit}/*.jsonl` (regenerable, not checked in).
- `scripts/kingsroad/study/reproduce-three-hit.sh` documents the complete recipe; see the study README. Individual
  matrix commands, both self-tests and comparison generation **were executed**. The convenience wrapper was
  syntax-checked, **not** separately rerun end-to-end.
- All **792** overlapping fresh baseline runs reproduce their prior-study full terminal hashes. All eight shipping
  simulation/shared input files retain their prior-study SHA-256 values.
- **378** paired runs without Ballistas have identical complete terminal states: 376 Archer-heavy/pure-Archer
  controls plus two Mixed runs that terminate before building a Ballista. Variant labels prevent mixing arms.
- All 2,304 full-run HP/gold/source-damage ledgers reconcile; complete policy/map/seed pairing and terminal statuses
  are required. No experimental retired bolt exceeds three contacts; beyond-third useful damage is zero.
- Both builds pass rich per-tick observed/unobserved equivalence for seeds 1/7/31 × 12,000 ticks, a full Meadow
  Mixed run and all 13 recorded suffix continuations. The capped control remains capped, not baseline.
- Both builds also pass **30 simultaneous-contact fixtures** (all ten enemy kinds × L1–L3), asserting unchanged
  damage/armor arithmetic, immediate retirement and unchanged collision RNG. Separate fixtures cover contacts on
  different ticks, duplicate skipping, two prior hits, and dead-target exclusion. Stationary synthetic fixtures
  alter only test setup; campaign simulations do not modify gold, enemies or spawn rules.
- Added 13 experiment/reporting tests alongside the original 45 study tests: exact one-line source delta, unchanged
  shipping hashes, variant selection, real compiled cap behavior, matching suffix rules, non-Ballista parity,
  cross-variant checkpoint refusal, exact planned matrices, duplicate/missing/mismatched-arm rejection, accounting,
  impossible cap metrics and excluding losses from successful-run duration comparisons.

Final checks ran **sequentially** (no concurrent build/test load):

- `NODE_ENV=test npm test`: **229 files / 3,389 tests passed**.
- `npm run typecheck`: passed.
- `npm run build`: passed (production build).
- `git diff --check` and `bash -n scripts/kingsroad/study/reproduce-three-hit.sh`: passed.

Logs: `/tmp/kr-pierce-{full,type,build}-verified.log`. No failures occurred in these final checks. No HR code,
test or timeout change was needed. No browser check was run for this offline, non-UI experiment.

## Next decision—not another change in this batch

Keep the shipping baseline unchanged. Prefer a **separate range/coverage diagnostic**, restoring unlimited piercing
so that only coverage changes, before choosing any further number. A separate equal-count/equal-HP staggered-fast
cadence test remains another hypothesis; do not combine it with range or the three-hit cap. Neither follow-up is
approved or implemented here. Do not escalate the cap, boost Archers, raise HP, add mandatory tiers/gold sinks,
change waves or shorten the campaign to rescue this failed stand-alone candidate.

After an explicitly approved candidate produces useful situational tradeoffs without punitive early teaching,
review it with the user on a phone, then revisit sufficient-defense/passive-tail pacing. Mage/maps 21–30 remain a
separate decision. Bot findings alone do not certify acceptance.
