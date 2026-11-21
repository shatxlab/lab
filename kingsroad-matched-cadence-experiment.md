# KingsRoad duration-matched cadence: fast spacing x2 with the wave length held

**Status: complete, offline only, not adopted.** Nothing shipped: no simulation source, tower stat, price, HP, count,
road, reward, save or wave change, no commit, no push. Evidence: `reports/kingsroad-matched/` (two arms, each with pairs,
summary and manifest). Harness: `scripts/kingsroad/study/reproduce-matched.sh`; variants `matched-2x` and `density-only`.

## Why this needed a control

Doubling fast spacing adds 2 to 21 seconds per wave. The game starts the wave clock from the last spawn (or the warlord),
so the earlier cadence arm ran 2.6 minutes longer per win. Holding the wave length means shrinking something else, and the
column gaps only hold 6 to 12 seconds, so the slow kinds had to shrink. That makes the matched arm denser on slow kinds, so
I also ran a control that keeps the same slow densities but leaves fast spacing at stock.

## The two arms (predeclared)

- **matched-2x:** runner, bat, scamp spacing x2 (0.55/0.45/0.2 to 1.1/0.9/0.4 s). Every slow kind (grunt, brute, knight,
  imp, gargoyle) is scaled by one per-wave factor `s`, solved so the last spawn and the warlord keep their stock times. With
  fast stock F and slow stock S, last column L: `s = 1 + (s_L - F)/S` if L is fast, else `s = 1 - F/(S - s_L)`.
  Counts, HP, roads, `COLUMN_GAP`, tower stats are unchanged.
- **density-only (control):** fast spacing stock, same per-wave slow factor `s` as matched-2x. Waves are shorter by about
  the fast stock time. It isolates the denser slow columns from fast spacing.
- Measured across 408 waves with fast kinds: `s` averages **0.71**, ranges **0.32 to 1.0**, and is below 0.7 in 190 waves.
  So matched-2x makes grunt columns substantially denser, sometimes about 3x, in some waves. That is the price of holding
  the length.

## Design

Same 1,152-pair design as the three-hit and cadence arms. Three arms (stock, matched-2x, density-only) at 2,304 full runs
each: 6,912 full runs, with the stock baseline shared by both comparisons. Checks: 792 historical baseline hashes match; ledgers reconcile; shipping input hashes unchanged. Tests (8 new)
show the wave's last spawn and warlord times equal stock in matched-2x on every map and wave; density-only is shorter by
exactly the fast stock time less the last column's own fast spacing; fast gaps are exactly 2x and slow gaps exactly `s`,
with identical roads and counts. Kingsroad tests and typecheck pass.

## Results (bot outcomes, not human balance)

Both-win run time, minute change: matched-2x is within **±0.06 min** in every matrix (length held in play). density-only is
**−2.2 min** on Ballista-heavy.

| Primary matrix | Stock | matched-2x | density-only (control) | cadence-2x (earlier, longer waves) |
|---|---|---|---|---|
| Ballista-heavy wins, mean lives | 160, 19.92 | 160, 19.98 | 160, 19.98 | 160, 19.96 |
| Mixed wins, mean lives | 153, 14.18 | 153, 14.70 | 146, 12.82 | 157, 16.51 |
| Archer-heavy wins, mean lives | 10, 0.77 | 9, 0.75 | 9, 0.99 | 12, 1.05 |

- **The earlier Archer and Mixed gains came from longer waves, not spacing.** Early-map Archer (32 seeds, 5 maps): stock 33
  wins, cadence-2x 55, **matched-2x 32**, density-only 24. Ford 5→3 and switchback 5→6 of 24 under matched-2x, so the
  teaching-map niche disappears when the length is held.
- **Fast spacing does help, at a fixed density.** Against the density-only control, matched-2x gives Mixed **+7 wins and +1.9
  lives**, and early Archer **+8 wins**. But the denser slow columns cost what fast spacing gains: density alone takes Mixed
  to 146/160 and 12.82 lives.
- **Heavy vs Mixed life gap:** stock 5.74; matched-2x **5.28**; density-only 7.16. The matched arm narrows the gap only a
  little, and the control widens it. The earlier cadence arm narrowed it to 3.45, but that was a duration effect.
- Controls point the same way. matched-2x helps Mixed a little (budget 14→18, no-volley 14→16, rush 21→23 wins of 24) and
  leaves Ballista-heavy unchanged. density-only hurts Mixed in the same controls (for example no-volley 14→11). Archer-heavy
  and pure Archer stay at about 0 wins on the later maps.

## Interpretation and verdict

Holding the wave length reverses the cadence result. Fast spacing at fixed density is a real, modest help to Mixed, but in
this bot test it is cancelled by the density change needed to keep the stream length. Ballista-heavy remains 160/160 in every
arm. The Archer niche did not survive. **Not adopted.** There is no duration-neutral version of this lever that the bot
finds worthwhile.

## Corrections to the cadence write-up

- The 2.6-minute increase is the wave-length cost. The earlier cadence gains for Mixed and early Archer should not be read
  as spacing effects; they were mostly longer waves.
- The earlier claim that the Heavy-vs-Mixed gap narrowed to 3.45 does not survive the duration control (matched-2x: 5.28).

## Limits

- Bot policies only. No phone or human playtest, and no fun, readability or optimal-play claim.
- The slow densities are the confound. A version that keeps grunt spacing stock would need a different way to hold the
  length (for example, a different wave timing), which is a separate design decision.
- The control is not a neutral baseline: density-only is shorter by 2.2 minutes. It is only there to show the density effect.

## Next steps (ask before any of these)

1. Review with the user. The likely answer is to drop the cadence line, unless a length-neutral design without slow
   densification is proposed.
2. If the user wants to keep going, a phone check of early teaching waves is the only way to tell whether spaced fast
   enemies read better, since the bot can't measure that.
3. No shipping change for cadence without that check and a repeat pacing probe.
