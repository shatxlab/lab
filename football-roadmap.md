# Sunday League roadmap

The single source of TODOs and design record for the football game (`/football`; code in `src/lib/football/`,
`src/components/football/`, tests in `tests/football/`).

## What it is

Eight-a-side pixel football, men only, played as a casual RPG: the lads play the match on their own, and when the
player's side wins the ball up the pitch the game stops on a **moment**: shoot, pass to one of three teammates, or run
with it, each with its odds. Mobile first, **landscape only** (the match pauses behind a "turn your phone" screen when
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

1. **Season layer (the RPG part).** A squad you keep between matches: stats that grow with training, traits, injuries,
   a small transfer market, a league table of rival clubs. Footballer ids are already stable; `makeSide(seed, ...)`
   is where a saved squad would replace generated ones. Replace the friendly's fixed `HOME_STRENGTH`.
2. **Defensive moments.** When the rival is in your final third: where to press, when to go in for the tackle.
3. **More moments.** Free kicks, corners (the corner taker already starts a moment), penalties.
4. **Squad screen** with the sprites at large scale, shirt numbers, a captain.
5. **Sound** (kick, whistle, crowd), and a goalkeeper save animation that matches the shot's height.
6. **Wider variety**: pitches, weather, referee, substitutions, a second formation.
7. Tune the pace if matches feel too busy (about 5 goals in two minutes now).
