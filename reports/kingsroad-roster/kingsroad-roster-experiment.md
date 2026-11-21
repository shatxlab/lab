# KingsRoad roster diagnostic: splitting the fast ground swarms across roads

**Status: complete, offline only.** Nothing shipped: no simulation source, tower stat, price, HP, count, spawn time,
reward, save or map change, no commit, no push. Evidence: `reports/kingsroad-roster/`. Harness:
`scripts/kingsroad/study/reproduce-roster.sh`; variant `roster-spread` in `variant.ts`.

## Why this lever, and not the imp/gargoyle hypothesis

The roadmap's older idea — "imp/gargoyle-heavy waves reward archers/frost" — does not survive the engine's own rules:
Ballista hits air, ignores fireproof, and out-damages Archer per shot against armour, so those foes favour nobody in
particular (imps only punish the fire fork; gargoyles only punish the catapult). What actually separates the towers:

- **Ballista's edge is concentration**: a bolt pierces a line, and its huge per-shot damage is wasted on small foes only
  when they arrive together. Its weakness is **fire rate** (one shot per 2 s) and single-target tracking.
- **Archer's edge is fire rate and cost**: cheap, 2 shots/s, single target.
- Today every column marches down **one road** (`buildSpawns` draws a single road per column), so swarms arrive as a
  bunched line — the exact shape that maximizes pierce and splash value.

So the predeclared roster lever is **distribution, not composition**: the fast ground swarm kinds (scamp, runner) split
round-robin across the map's roads within their column. Same foes, same counts, same spawn times, same RNG draws — only
the `road` field changes. Single-road maps (8 of 20) are untouched and act as in-experiment controls; bats are already
scattered (random flight lines) and stay as they are.

## Predeclared hypothesis and success criteria (written before the runs)

Hypothesis: splitting fast ground swarms across roads lowers line-pierce and splash value enough to favour high
fire-rate defenses, raising Archer-heavy and Mixed outcomes on multi-road maps, without hurting Ballista-heavy.

Criteria, fixed in advance:

1. **Not punitive:** Ballista-heavy stays 160/160 with mean lives ≥ 19. Any Ballista-heavy loss rejects the arm as a
   hard counter, per the roadmap's own rule.
2. **A niche appears:** archer-smart at least doubles its primary wins (≥ 35/160) or stock archer reaches ≥ 30/160, with
   wins on at least three maps that stock archer loses.
3. **Mixed does not collapse:** Mixed stays ≥ 150/160.
4. If 2 fails while 1 and 3 hold, the finding is: roster distribution alone cannot create the Archer role, and the
   remaining design lever is a new mechanic or new content for maps 21–30, not redistribution.

## Design

- **1,664 full runs:** 2 arms × 4 strategies (ballista, archer, mixed, archer-smart) × (primary 20 maps × 8 seeds +
  budget-capped and no-volley controls on 6 control maps × 4 seeds). archer-smart is the role-appropriate policy from
  the closed policy study, giving Archer its best legal shot.
- 6 new tests (`tests/kingsroad/roster-experiment.test.ts`): exact source transform, no added RNG draws, fail-closed
  anchors, per-wave schedule equality (kinds and times everywhere; roads for non-spread kinds; round-robin roads for
  scamp/runner on multi-road maps; single-road maps untouched), meadow bit-identity with stock, self-test parity.
- Baseline arm reproduces the frozen study's stock strategies (historical-hash suite still passes).

## Results (bot outcomes, stock stats)

| Primary (20 maps × 8 seeds) | Stock | roster-spread |
|---|---|---|
| Ballista-heavy | 160/160, 19.92 lives | 160/160, 19.88 |
| Mixed | 153/160, 14.18 | 150/160, 14.04 |
| Archer-heavy | 10/160, 0.77 | 10/160, 0.77 |
| archer-smart | 15/160, 1.34 | 14/160, 1.32 |

- **Criterion 1 (not punitive): PASS.** Ballista-heavy never loses and keeps 19.88 lives; budget 24/24, no-volley 24/24.
- **Criterion 2 (a niche): FAIL, decisively.** Archer wins the same 10 runs on the same maps; archer-smart 15→14 (loses
  rivers, gains nothing). Not one map changes hands for either Archer policy.
- **Criterion 3 (Mixed holds): PASS at the boundary.** 150/160; watch drops 6→4 wins, budget and no-volley rise 14→15.
- Single-road maps are bit-identical controls, as designed; multi-road maps changed terminal states everywhere.

## Interpretation

Predeclared outcome 4 applies: **roster distribution alone cannot create the Archer role.** The mechanism is now clear
from three sides. Spreading swarms across roads barely touches Ballista because every road ends at the same gate, so
gate-side towers keep line-piercing value regardless of where foes started. Archer-heavy, meanwhile, does not lose to
swarm shape at all — it loses to HP scaling (knights, warlords, the quadratic `hpScale`), which no distribution of the
same foes changes. Combined with the five earlier diagnostics, every lever available inside the current rules is now
measured: stat nerfs backfire, spacing buys time rather than roles, policy quality is not the bottleneck, and
distribution is not the bottleneck.

What remains for a genuine Archer (or any new-tower) role is **new mechanics or new content**: a foe whose defence
wastes slow heavy shots (per-hit shields, damage caps, or decaying stacks that only rapid fire keeps down), or the
planned Mage tier-3 branches and maps 21–30, where such a role can be designed in from the start instead of
retrofitted. Note also what already works: in Mixed, archers matter as *support* (lune marks amplify everything), which
is a legitimate role — a design can lean into that instead of forcing Archer-heavy to be viable.

## Limits

- Bot-only; no phone or human playtest, no fun or readability claim.
- Bats were already scattered, so the arm only redistributes ground swarms; runner counts are modest early (⌊0.9·wave⌋).
- Distribution changes overlap on the road near the gate (all roads end at the gate), so late-field pierce value is
  preserved; the arm mostly devalues mid-field line-ups.
