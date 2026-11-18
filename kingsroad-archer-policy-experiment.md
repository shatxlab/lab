# KingsRoad role-appropriate Archer policy: can the bot play Archer well?

**Status: complete, offline only. Answers option C: Archer-heavy's failure is the game's design, not the bot's policy.**
Nothing shipped: no simulation source, tower stat, wave, price, HP, reward or save change, no commit, no push.
Evidence: `reports/kingsroad-archer-policy/summary.json`. Harness: `scripts/kingsroad/study/reproduce-archer-policy.sh`,
strategy `archer-smart` in `policy.ts`.

## The predeclared policy (stock rules, smarter play)

The stock Archer bot builds archer-archer-archer-frost on the best L1 road-coverage plots, alternates fire/lune by
construction order, and never looks at what is marching. The smart policy keeps the same engine, economy, volley and
early-call rules, and changes only how it plays its own towers:

1. **Plan order** `archer, frost, archer, archer` — the frost comes second, when archer damage is lowest and slowing
   buys the most time in range.
2. **Placement** adds the air lanes to road coverage: bats set off from a random x along the woods and fly straight at
   the gate, so the expected flight-line length within range is static geometry every player can learn.
3. **Focus fire:** among the five best-covered free plots, the new archer takes the one whose range overlaps the
   standing archers' the most.
4. **Branches:** lune where the map sends fireproof imps (fire arrows half-hurt and never burn them), fire everywhere
   else (burn ignores plate and adds flat damage). Only `balanced` uses this; a forced `--branch` still overrides.

## Result (bot outcomes, stock stats)

| Matrix | Stock archer | archer-smart | For reference |
|---|---|---|---|
| Primary 20 maps × 8 seeds | 10/160, 0.77 lives | **15/160, 1.34 lives** | Heavy 160/160 (19.92), Mixed 153/160 (14.18) |
| Budget-capped control | 1/24 | 1/24 | Heavy 24/24 |
| No-volley control | 0/24 | 0/24 | Heavy 24/24 |
| Early maps × 24 seeds | 33/120 | 42/120 | Heavy 120/120 |

- **18 of 20 maps stay at zero wins under both policies.** The gains: meadow 8→8 with 15.1→20.0 lives, switchback
  1→6, rivers 0→1. The one regression: ford 1→0 primary and 5→0 of 24 on the early sweep — the frost-second plan is
  wrong for that map's opening, evidence the policy is predeclared rather than tuned.
- The three levers move individual maps by a few wins. None of them, together, comes near Mixed or Heavy.

## Interpretation

Policy quality is not why Archer-heavy loses. Even a foe-aware, wave-legal Archer policy that knows where bats fly and
which arrows to fork cannot keep single-target 16-damage archers alive against the late maps' scaled HP. This closes the
confound the earlier studies flagged ("the bot does not counter"): the counter-play existed, was implemented, and did
not matter. Archer's problem is structural — its role (cheap rapid single-target) is out-scaled by the late waves,
while Ballista's pierce and the volley carry.

**Consequence for the roadmap:** stop testing number nerfs and stop blaming the bot. If Archer is to matter past the
teaching maps, it needs a design change — a role only it can fill (D-1 roster pressure, a stronger fork, or new content),
not a smarter player.

## Verification

- 9 new tests (`tests/kingsroad/archer-policy.test.ts`): plan order, air-lane geometry determinism and gate bias,
  archer-role ranking, focus-fire distance, fork branches on imp and no-imp maps, row validity, determinism, the frozen
  study's stock-archer terminal hash reproduced exactly, shipping inputs byte-identical.
- Kingsroad suite: **14 files / 337 tests pass**, typecheck passes. The historical-hash suite passing proves the stock
  strategies are untouched by the policy addition.
- Runs: 2 arms × (160 primary + 24 budget + 24 no-volley + 120 early) = **656 full runs**.

## Limits

- Bot-only; no phone or human playtest, no fun or readability claim.
- The policy is predeclared and uniform, not per-map optimal (the ford regression shows this); a tuned policy might
  squeeze out a few more wins, but 18 maps at zero leaves no room for policy alone to close a 140-win gap.
- `archer-smart` ignores `--branch=balanced` semantics only; other flags apply unchanged.
