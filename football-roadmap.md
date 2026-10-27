# Sunday League roadmap

The single source of TODOs and design record for the football game (`/football`; code in `src/lib/football/`,
`src/components/football/`, tests in `tests/football/`).

## What it is

Eight-a-side pixel football, men only, played as a casual RPG: the lads play the match on their own, and when the
player's side wins the ball up the pitch the game stops on a **moment**: a shot you aim yourself, a pass to one of
three teammates, or running with the ball. Mobile first, **landscape only** (the match pauses behind a "turn your phone" screen when
the screen is upright, and asks the browser to lock landscape); keyboard (1 to 5, Space = let the bot decide, P/Esc
pauses) and mouse work too.

## Where things are

- `sim/` is pure and seeded (shares Tower's `random`). `match.ts` is the whole match: `createMatch`, `step`,
  `choose`, `autoplay`. `balance.ts` holds the pitch, the 1-2-3-2 and the ball constants. `squad.ts` makes squads.
- `render/sprites.ts` paints the footballers from layered parts (head, haircut, shirt pattern, shorts, socks, boots)
  with an automatic outline pass; nothing is a bitmap. 16 x 24 px, side view facing right (the renderer mirrors).
  Poses: stand, run0 to run3, kick, slide, dive, cheer. `lookFor(id)` hashes a man's face; `KITS` are the club colours.
- `render/draw.ts` has the `Stage` (watches the sim to animate: facing, stride, kick, slide, dive, cheer) and the
  moment overlay. The pitch is drawn once to an offscreen canvas at device resolution.
- `meta.ts` is the saved record (`lab:football:v1`: kit and results per opponent level).
- Copy is in `i18n.ts`, English and Russian together.

## Tools

- `scripts/football/playthrough.ts` plays whole matches with the bot on both sides (usage in its header). Run it over
  hundreds of seeds after any change to `sim/`.
- `scripts/football/sprite-sheet.ts` dumps every pose, kit and haircut to a zoomed PNG. Look at it after touching
  `sprites.ts`.

## What makes a moment worth having (lessons from the first playtest)

The first version was not fun, and the reasons are worth keeping in mind for every change:

- **Odds that lie kill it.** The first odds were a heuristic and read about 80% when 55% reached the target; the
  player learned to distrust the numbers. Now each option is **forecast** (`forecast` in `match.ts`): it is played out
  on 12 copies of the match with different seeds and the share that works is shown. The sim answers for itself,
  defenders chasing and all, so the numbers come true (a test holds this). Costs about 18 ms a moment.
- **A dominated choice is not a choice.** If the best option is always the highest percentage there is nothing to
  decide. `offerFor` builds a trade-off: the safest pass, the pass that leads to the best chance (`reward`: the goal
  chance the receiver would have), the best of both, plus the shot and a run. Each button shows its odds *and* what
  it leads to.
- **Skill, not just a number.** A shot is aimed by the player: a marker sweeps across the goal and a tap locks it
  (`aimAt`, `AIM_*` in `balance.ts`). The keeper tracks the ball's height, so he stands towards the shooter's side;
  the bar shows where he is (`keeperCover`, `aimZones`): red on him, amber by him, green away, grey past the posts.
  Measured: shots aimed at him score about 10%, a goal-width away about 30%, wide of the post almost never.
- **Chains.** A pass the player calls that lands gives the receiver a call straight away (`CHAIN_COOLDOWN`), so an
  attack is played pass by pass to a shot, instead of the bot taking over at the moment it gets interesting.
- **Less dead time, more drama.** The quiet middle of the pitch runs at 2.5x (`runSpeed` in `MatchView.tsx`), a shot
  in the air runs at 0.35x, and a word flashes after a save, a miss, a block or a cut-out pass.

## Balance targets (bot vs bot, strength 5 v 5, 300 matches)

About 2.5 goals a side, 10 shots, ~89% of passes completed, ~20% draws, no side bias. The odds shown at a shot
(`shotChance`) must add up to roughly the goals scored: the expected-goals total (`stats.xg`) stays within 20% of goals
(a test holds this). A one-point stronger side wins about 55%. Retune playbook: change one of `keeperReach`, the
`saved` divisor in `shotChance`, `shotSpread`, the shoot score multiplier in `options`; rerun the playthrough; keep
xG/goals near 1.

## Design notes worth keeping

- Players are updated in alternating order each tick. A fixed order gave team 1 a measurable edge (it reacted to
  team 0's new positions).
- The sim pauses on a moment without advancing its clock; the UI adds a 7 s timer and then lets the bot choose.
- A goal freezes the sim for `CELEBRATION` seconds on the wall clock (the scorers cheer, a banner shows).
- The same man always looks the same (`lookFor(id)`), which the squad layer relies on.

## Next steps

0. **Still not fun enough?** The loop is now: calls, a chain of passes, an aimed shot. What's still missing is
   something to *lose* between matches and something to *grow*: that's the season layer below. Defending is the other
   gap: while the rival attacks the player only watches. Candidates: a tackle-timing tap, choosing to press or sit
   back, a "last man" dive to block a shot.
1. **Season layer (the RPG part).** A squad you keep between matches: stats that grow with training, traits, injuries,
   a small transfer market, a league table of rival clubs. Footballer ids are already stable; `makeSide(seed, ...)`
   is where a saved squad would replace generated ones. Replace the friendly's fixed `HOME_STRENGTH`.
2. **Defensive moments.** When the rival is in your final third: where to press, when to go in for the tackle.
3. **More moments.** Free kicks, corners (the corner taker already starts a moment), penalties.
4. **Squad screen** with the sprites at large scale, shirt numbers, a captain.
5. **Sound** (kick, whistle, crowd), and a goalkeeper save animation that matches the shot's height.
6. **Wider variety**: pitches, weather, referee, substitutions, a second formation.
7. Tune the pace if matches feel too busy (about 5 goals in two minutes now).
