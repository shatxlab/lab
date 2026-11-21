# KingsRoad shielded-foe prototype: the bulwark

**Status: complete, offline only, not shipped.** A study-only foe built entirely in memory — no shipping source, stat,
map, save or UI change, no commit of balance. Evidence: `reports/kingsroad-bulwark/` (two doses). Harness:
`scripts/kingsroad/study/reproduce-bulwark.sh`; variant `bulwark` in `variant.ts`.

## The mechanic

The **bulwark** marches behind a tower shield: **any single hit counts for at most 12** damage, whatever fired it.
Bolts (32/56/95), stones (44), and volley arrows are all capped; arrows at 6–16 and frost at 3–8 lose little or
nothing; burning ticks are not blows, so fire arrows keep their burn. In-fiction it reads the way it plays: one mighty
shot thunks into the shield; a hail of small strikes wears the bearer down. Stats: 90 hp × hpScale, speed 26, leak 2,
gold 14, ground, spacing 1.6 s.

Engine-level proof (self-test fixture): a 95-damage bolt deals **exactly 12** to a bulwark and the full **95** to a
grunt beside it; an 8-damage frost stone keeps full damage and its slow. Ledgers reconcile; no RNG draws added.

## The two predeclared doses (both forced onto all 20 maps — a stress test, harsher than any shipping plan)

| Primary 20×8 | Stock | v1 (from wave 6, +1/4 waves) | v2 (from wave 8, +1/6) |
|---|---|---|---|
| Ballista-heavy | 160/160, 19.92 | **108/160, 9.55** | **142/160, 14.93** |
| Mixed | 153/160, 14.18 | 110/160, 9.66 | 133/160, 12.03 |
| Archer-heavy | 10/160 | 12/160 | 9/160 |
| archer-smart | 15/160 | 16/160 | 14/160 |

- **v1 is a hard counter, forbidden by the design rules:** Ballista-heavy loses citadel, kings, trident and watch
  entirely (8→0 each). But it flips the ordering the design actually wants: under the shared budget Mixed wins **15/24
  vs Ballista's 11/24**, and no-volley **12 vs 9**.
- **v2 spares 17 maps entirely** but still fails the predeclared bar (142 < 150; citadel 8→0, kings 8→2), and at this
  dose the flip is gone (budget 14 vs 16).
- **Archer-heavy is unmoved at both doses.** The cap gives archers a favoured target, but three archers and a frost
  still cannot carry the rest of a late map — consistent with every study since the policy probe. Mono-archer is not a
  viable campaign plan with or without the bulwark; that question is closed.

## What the prototype establishes

1. **The mechanic works and is dose-tunable.** A single number (presence) moves Ballista-heavy from 160 to 108 wins;
   the cap itself is proven at the hit level.
2. **Forced globally, the two design rules conflict.** The dose that makes situational (Mixed) defense the better
   answer also collapses late-map Ballista viability; the dose that spares Ballista restores its dominance. No global
   dose satisfies both.
3. **The shipping shape is per-map, not global.** Like gargoyles today (every 4th wave, only on maps that list them),
   a bulwark belongs on specific maps — a mid-campaign map or two, or a slice of maps 21–30 — so the answer to "what
   wins" depends on the map. That is situational defense without a global nerf, and it is the first lever in eight
   studies that produces it.
4. **Readability is a real shipping cost.** "Why did my ballista do 12?" needs a visible shield state (shield bar or
   hit-spark), wave-preview text, and a gentle teaching map — all UI work the offline sim cannot check.

## Shipped since (playable prototype)

The foe now ships under the name **Shieldbearer** (Щитоносец): `hitCap 12` in `FOES`, the cap in `hitFoe`, v2-dose presence (`sends("bulwark", wave >= 8 ? 1 + Math.floor((wave - 8) / 6) : 0)`) on **harvest** (teaching) and **kings** (pressure showcase), a borrowed brute figure with a filled tower shield in `draw.ts`, EN/RU copy and a `shieldRule` line in the wave intel. The study-only variant and wrapper were retired (reproduce from commit `be016a8`); shipping tests cover the cap, the roster gating, fire-through-the-shield and the intel copy. The shipping playthrough bot wins 4/5 seeds on both maps (harvest: one loss at wave 13; kings: 3–10 lives). A phone check of readability and fun is still outstanding.

## Original recommended next step (was: needs the user's approval; nothing shipped)

A playable prototype on the phone: the bulwark drawn and named, v2-dose presence on a small chosen set (for example
rivers + serpent in chapter 1 as teaching maps, or two maps of chapter 2), EN/RU copy in `i18n.ts`, sprite borrowed
like the other new foes. Then feel it: does the shield read, does the map ask for a different build, is it fun?

## Verification

- 4 tests in `tests/kingsroad/bulwark-experiment.test.ts`: exact four-file source transform, fail-closed anchors, other
  variants untouched, roster formula on every map (including foes-free maps), bulwark column spacing, ledgers
  reconciled with bulwark gold, self-test cap fixture, baseline arm clean, terminal states changed.
- The piercing fixture now knows the cap and covers the 11-kind table. Full matrix: 2 doses × 2 arms × 4 strategies ×
  (primary + budget + no-volley) = **3,328 full runs**.
- Kingsroad suite and typecheck pass at each step; no shipping input hash changed.
