# KingsRoad cadence diagnostic: runner, bat and scamp spacing x2

> **Superseded in part.** The duration-matched follow-up (`kingsroad-matched-cadence-experiment.md`) shows the Mixed and
> early Archer gains below were mostly from longer waves. With the wave length held, Mixed is flat in wins and the Archer
> niche disappears. Read the numbers below as the untimed-matched baseline for that follow-up.

**Status: complete, offline only, not adopted.** Nothing shipped: no simulation source, tower stat, price, HP, count,
road, reward, save or wave change, no commit, no push. Evidence: `reports/kingsroad-cadence/` (pairs, summary, manifest with
input hashes). Harness: `scripts/kingsroad/study/reproduce-cadence.sh`, plus the `cadence-2x` variant in `variant.ts`.

## The one predeclared change

Only the `SPACING` table in `sim/waves.ts` changes, and only in an in-memory copy used by the study build:

| kind   | stock spacing | cadence arm |
|--------|---------------|-------------|
| runner | 0.55 s        | 1.10 s      |
| bat    | 0.45 s        | 0.90 s      |
| scamp  | 0.20 s        | 0.40 s      |

Counts, HP, roads, `COLUMN_GAP`, every other kind's spacing and all tower stats stay as they are. Each column keeps its
shuffled order, so the same enemies come down the same roads, just further apart. Waves get longer as a result; that is
the pacing side of the test, reported below rather than hidden.

## Design

- **1,152 matched pairs / 2,304 full runs**, the same design as the three-hit diagnostic: 20 maps × 8 seeds × {Ballista-heavy,
  Archer-heavy, Mixed}, plus shared-budget, no-volley, pure (pure Ballista and pure Archer), line-placement, rush economy and
  first-five-map × 32-seed controls. Role-appropriate controls are included: Archer-heavy and pure Archer.
- **Verification:** 792 historical baseline terminal hashes match the frozen study. All ledgers reconcile. All eight
  shipping input hashes are unchanged. Tests (9 new) show the spawn schedule changes by exactly 2× for the three fast kinds
  and nothing else, on every map and wave, with rosters and road orders identical. Kingsroad test suite: 12 files, 320 tests
  pass; typecheck passes.

## Results (bot outcomes, not human balance)

| Matrix (strategy)            | Wins stock → cadence | Mean lives stock → cadence | Both-win minutes Δ |
|------------------------------|----------------------|----------------------------|--------------------|
| Primary, Ballista-heavy      | 160 → 160 / 160      | 19.92 → 19.96              | +2.64              |
| Primary, Mixed               | 153 → 157 / 160      | 14.18 → 16.51              | +2.61              |
| Primary, Archer-heavy        | 10 → 12 / 160        | 0.77 → 1.05                | +0.70 (8 pairs)    |
| Pure Archer                  | 0 → 1 / 24           | 0 → 0.12                   | n/a                |
| Early maps ×32 seeds, Archer | 33 → 55 / 120        | 3.77 → 5.17                | +0.76              |
| Early maps ×32 seeds, Mixed  | 118 → 120 / 120      | 17.26 → 17.97              | +1.29              |

- **Heavy vs Mixed gap narrows:** the mean-life gap goes from **5.74 to 3.45**. No Ballista-only nerf did this; the three-hit
  and range candidates both widened it. Heavy is still the most reliable plan (160/160).
- **The Archer niche appears only on teaching maps.** Early-map Archer wins: ford 5 → 14, switchback 5 → 16 (of 24 each),
  meadow 23 → 24, crossroads and rivers still 0 to 1. On the 20-map primary sweep Archer-heavy barely moves (10 → 12). Pure
  Archer stays near zero on every map. So the rapid-fire role does not become a late-map answer.
- **Pacing cost:** every winning run gets about **2.6 minutes longer** (Ballista-heavy mean 19.6 min → 22.2, about +13%). That
  is more passive time, which the roadmap already flags as a problem. Lengthened waves are a pacing change, not a free
  variety change.
- Rush economy: Archer 1 → 6 wins, but Mixed and Ballista barely move. Budget-capped Archer 1 → 2.

## Interpretation

Spacing fast enemies helps the mixed defence (more lives, more wins) and narrows the Heavy lead without touching Ballista's
stats. It does not produce a real Archer role on the campaign's later maps, and it costs about 2.6 minutes per win.
Because the Ballista-heavy plan still wins every run, the lever doesn't remove dominance either. Verdict: **not adopted alone**.
Keep it as the first candidate that helps the mixed defence without a nerf, and check it against the pacing problem before
any further design. Do not stack it with the three-hit or range levers.

## Limits

- Bot policies only. The bot never targets, re-places for rapid fire, or prefers Archers on fast approaches; a better Archer
  policy could show more of the niche. Role-appropriate policy checks here are the existing Archer-heavy and pure Archer arms.
- No phone or human playtest, and no claim about fun, readability or optimal play.
- Waves are longer, so this mixes spacing with duration. A duration-preserving variant is a separate hypothesis, not tested.
- Later spawns are RNG-driven and shift once combat changes, so pair results are per configuration, not per enemy.

## Next steps (ask before any of these)

1. Review the result with the user, including the pacing cost. Decide whether this line is worth pursuing.
2. If yes, one of: a duration-preserving cadence variant (spacing ×2 with a compensating compression elsewhere) or a
   phone check on the early teaching maps, where the Archer effect is.
3. Do not ship any cadence change until a phone check and a repeat sufficient-defence pacing probe have been run.
