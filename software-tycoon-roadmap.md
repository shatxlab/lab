# Software Tycoon roadmap (`/tycoon`, merged 2026-10-12)

Carried over from the standalone repo's ROADMAP.md, and the single source of
TODOs for the game. The Calendar app is in `roadmap.md`. Nothing here is
blocking: the game builds, its tests pass and it ships.

**Where things stand.** The studio has a real arc: garage (4 desks) → office →
more offices; client contracts; users and bugs on every product; breakout hits;
six journey stages; ten rival studios (and a newcomer at each new era) and an
industry ranking; eras that shift demand and expectations; careers from Junior to
Lead; bug fixing by a developer and tester pair; retiring and selling products.
Saves are version 4 (`STATE_VERSION` in `src/lib/tycoon/sim/state.ts`); bump it
and say so in the commit whenever the save shape changes. Version 3 saves are
upgraded on load (`upgradeFromV3`).

Tools: `scripts/tycoon/simulate.ts [years] [seeds] [policy]` (bot players; with a
policy name it also prints the year each stage was reached). It cannot run as
`node scripts/tycoon/simulate.ts` because the sources import `@/...`; bundle it
first: `npx esbuild scripts/tycoon/simulate.ts --bundle --platform=node
--format=esm --alias:@=./src --outfile=/tmp/sim.mjs && node /tmp/sim.mjs 14 8`.
Also `node scripts/tycoon/e2e.mjs` after `npm run build` (real Chrome; needs
`puppeteer-core`, which is not in `package.json`; `CHROME_PATH`, `E2E_SHOTS=dir`,
`--only <scenario>`), and dev URL shortcuts that use a throwaway game:
`?offices=2&stage=3&money=1000000&rep=60` (dev server only). Art sources
(`.aseprite`, large preview, CC0 licence) live in `art/pixeloffice/`, outside
`assets/` so they are not published or precached.

## First real playthrough (2026-10-15)

The first human feedback, from two runs on a phone. Run 1 (about 30 minutes)
never left the garage; run 2 reached two offices and 24 people in game year 12,
with 7–8 products, after roughly 1.5–2 hours of play spread over a day (mostly
2× speed, paused often). Run 2 is still saved. **Decision: no journey log or
"expert mode".** Both runs predate any logging and the player does not want to
replay; the feedback below is the data.

### What the player reported

- **Garage start is scary.** A 2–4 person garage team burns about $250/day, so
  the player was afraid to start a project and spent run 1 watching money fall.
  Run 2 worked because contracts were rushed first to build a cash pile before the
  first medium product.
- **Contracts feel forced, and that is fine in the garage.** Later they are a
  side job. A weaker second office cannot take them because contracts finish
  faster than its team can.
- **Never secure, always firefighting.** Even with 24 people and 8 products,
  money felt on the edge: fix bugs, push updates, promote, repeat. There is no
  stretch of "this product earns, I have time". The biggest promotion (about
  $150k) rarely paid off. Pace per day is fine, but the *demands per day* are too
  many: slower pace and fewer demands are both wanted.
- **Bugs never stop.** Wanted: pick which employees fix bugs, or an auto-fix
  mode.
- **Products die with nothing to do.** A hit was updated with everything
  possible, after which only promoting and fixing were left, while users drifted
  away. It did not feel like a living product. Flops (medium, large, flagship)
  stay in the list and take attention. The player wants to **sunset** a product,
  and the 12th-year list still shows a product with one user.
- **Products feel random.** Beyond the three-star features, it was not clear
  what makes a good product, and the first hit felt random, not earned.
- **People leave before they matter.** The player wants to care about employees
  (skills growing, a senior from the garage still there at the end) but
  there is no time to, and the only story is a "retired after nine years"
  notice. Wanted: the office as a home, with physical things like servers.
- **Rivals and eras have no weight.** Rivals are a scoreboard; eras did not
  change any decision. Reactions from rivals would help.
- **The journey is the point.** No ending is wanted. Near the end of the
  content after about 2 hours (research nearly done, a third office is the only
  step left), so late content is needed.
- **Unnoticed:** the 12% wage rise per era (higher pay was read as "more
  experienced"), and that an office of more than 4 is 10% slower without a Lead
  (the UI only says it needs one). A Senior was promoted to Lead in time.
- **Charts** look nice but mean little. **Sound:** unsure; maybe reuse the lo-fi
  from the Focus app.

### Done from this feedback

- "Job offer" no longer always picks the best-skilled person. The target is
  weighted by salary and low morale, and anyone kept by a counter-offer is left
  alone for 540 days (`keptDay` on the employee; optional, so old saves load and
  `STATE_VERSION` is unchanged).
- The squashed-bug animation on fix sprints is gone. Only the bug icon with the
  red number stays. Removed `DayWork.bugs` and the squash popup.
- Team dialog on phones: when a row has several buttons (Promote, office
  select, Details, Fire) they wrap onto their own row instead of widening the
  dialog into a horizontal scroll. **Not yet checked on a device.**
- The popup number is the sum of design, engineering and QA points, tinted by the
  largest. QA does grow in the background while the number is blue. Left as is.

### Built: garage rework (second session)
Second-session feedback: contracts only covered the burn, nothing felt doable,
hardware events fired three times in 15 minutes, "merge quickly" had no cost.
- **Founders.** The two starting people can't be fired, poached, quit or retire;
  they draw half of market pay (`FOUNDER_PAY_SHARE`), which still rises with eras.
  Shown in the Team dialog. Saves are v5; old saves' day-0 hires become founders.
- **Contracts.** Half the pay up front (`CONTRACT_DEPOSIT`); a rolling board (a
  job every 7–13 days, max 4, expires after 35 days); pay per point 12.
- **Events.** Rarer, no repeats within a window, hardware only once in a real
  office, "merge quickly" adds bugs.
- **Rivals.** Only the original five at the start; the other five move in later.
- **Garage goals.** Ship 3 products (was 2).
- **Not done:** odd jobs (small always-available gigs), a bot that stays in the
  garage to tune its length, and a phone check of the new UI. Needs a play session.

### Built: pair bug fixing, bug model, sunset, more rivals (2026-10-16)

Save version 4. A bot check (14 years, 8 seeds) left the stage years about where
they were: *Tech giant* by the best bot around year 7.7 (7.8 before). No human has
played it yet; the numbers below are first guesses.

**Pair bug fixing**
- A fix is a developer plus a tester (by `Employee.role`), from any office. The
  developer adds engineering and the tester QA; design counts for nothing
  (`FIX_SPLIT`). The rest of each office keeps its project. The pair gains skill
  while fixing. A studio with no tester cannot fix. State: `GameState.fixes`;
  `workersOf` leaves fixers out of their office's work.
- One pair per product, any number of products at once. Stopping keeps progress.
- **Incident management** (Quality branch, needs Test automation, $30k, 40 days)
  lets the player put a developer and a tester on call (`GameState.onCall`). Each
  day the pair starts a fix on the buggiest product above `AUTO_FIX_DENSITY`
  (10 bugs per unit of size), and works on its office's project otherwise. If one
  of them leaves, the arrangement ends with a notice.
- UI: *Fix bugs…* on a product opens a developer and tester picker with an
  estimate in days; running jobs show in a strip above the project panel; the
  on-call picker is at the top of the Products tab once researched.

**Bug model**
- An update's new bugs are hidden (`Product.pendingBugs`) and surface over about
  20 days (`BUG_SURFACE_RATE`), so a release no longer adds dozens in a day.
- Those bugs and the ones users find day to day scale with how bug-prone the
  product is: `bugProneness(quality)` = (100 − quality) / 40, between 0.25 and
  1.5, so a polished product stays calm. Launch bugs are unchanged.

**Sunset**
- Under `SALE_MIN_USERS` (100,000) a product is *retired*: removed, free. At or
  above it, a rival buys it: price = 12 months of its income now (×1.25 for a hit,
  less while buggy), the product joins that rival with its users, everyone's
  morale −5 and reputation −3 (−6 for a hit). Blocked while an update is being
  built; a fix on it is cancelled. With no rival left the sale still pays.
- Past products are listed in Studio → Stats; the Journey still names a sold
  signature hit. The morale hit goes to the whole team, because the game does not
  record who built a product.

**Rivals**
- Ten studios in all (five new ones in `data/rivals.ts`; since the garage rework only the original five start, the rest move in over years 2–6), and a newcomer
  appears at each new era (`NEWCOMERS`). Version 3 saves get the five new studios
  with one product each. Rival launches now toast only for a hit or a product
  type you also make.

### Directions, not yet ranked or scheduled

To discuss and order. Themes: *attachment* (people, products, the office as home)
and *cause and effect* (why a product worked, rivals and eras that matter).

- **Living products.** A longer life per product: a roadmap of updates that keep
  opening content, slower and more visible decline, a reason to care after the
  last update.
- **People you care about.** Visible skill growth, tenure and promotion stories,
  retirement with a farewell, fewer pointless leavers.
- **Why it worked.** A post-launch report that says what drove quality and users
  (features, era fit, crowding), and eras that change what sells.
- **Breathing room.** Slower pace and fewer demands per day (see "Play it, then
  retune"). A garage that is less frightening in the first two months.
- **Late-game content.** More product types and research, server bills and
  outages with physical servers in the office, an HQ scene, staff retirement.
- **Lo-fi sound** from the Focus app. (A hit, an era and a deal now have their
  own sounds; they are short synthesised notes and untested by ear on a phone.)

## Play it, then retune (most important)

Balance so far comes mostly from bots, plus the one human run above.

- **Real-time pacing.** A game day is 1.5 s (`MS_PER_DAY`): a year is 9 min at
  1×, 4.5 at 2×. The best bot reaches *Tech giant* around year 7. The human run
  reached year 12 in about 1.5–2 hours at mostly 2×, which the player found
  about right per day. The ask is for more room per day, not more speed: see
  *Breathing room*.
- **The garage is tight.** Start money $25k, daily burn about $250 for a small
  team (about 100 days of runway), projects take 2.5× the work (`WORK_SCALE`).
  Bots that never take client work go bankrupt early; a human who is afraid to
  start a project does not progress either. One client job is a stage goal.
- **Money is tight all game for a human** (the opposite of the bots' millions by
  year 10–12). Rival buyouts, the late sink, were not reached. Re-check the
  bots' late money against real play before adding sinks.
- **Hits:** `HIT_BASE_CHANCE`, `HIT_CHANCE_PER_MISS`, `HIT_MAX_CHANCE` put the
  first hit at about year 3 for the best bot (range 1.4–8). The human's second
  product hit but "felt random". Decide whether to keep it luck-based or make it
  legible.
- **Rivals** earn from "other business" outside the shared markets, growing
  yearly up to a cap (without it the player passed them all by year 4). Works,
  but abstract, and they do not react to what you do.
- **Wages** grow 12% per era (`ERA_WAGE_GROWTH`); a fixing pair uses only
  engineering and QA (60 / 40). Both were judgement calls. The wage rise is now
  stated in the Team and Era dialogs, but is not retuned.
- **Leads:** an office of more than 4 people works 10% slower without a Lead; a
  Lead needs 80 skill in their discipline; hires start at Senior at most (65).
  A Lead appeared in the human run. The Team dialog now states the slowdown (and
  the 5% a Lead adds).

## Test and check gaps

- **No unit tests for rivals or eras:** `sim/rivals.ts` (launches, ranking,
  buyouts, business growth), `data/eras.ts`, crowding, `saturate`,
  expected-feature penalties and `settledUsers` are only exercised by the bot
  runs. Add tests, including a save round trip with rivals and an acquisition.
- **Browser checks do not cover** the breakout, era and stage dialogs, the
  buyout button, promoting a person, the Lead warning, or opening a second
  office from the Team dialog.
- **Phones:** the scene, top bar, project panel and New project dialog were
  checked on a Pixel 9 (installed app) and in emulation. The first human runs
  were on a phone and worked, apart from the Team dialog overflow fixed above.
  Still not checked: the Journey and Industry tabs (wide tables), office tabs,
  the client-work list.
- **Tall tablets** (768×1024) keep rows of four desks and show spare floor at
  the bottom. Accepted: Tycoon always lays desks out in rows of four, on every
  screen (the automatic one-column switch, `arrange`, was removed); only the
  Focus office uses the one column, on touch screens.
- Not tested on iOS Safari.
- `scripts/tycoon/e2e.mjs` imports `puppeteer-core` and `pngjs`; the former is
  not in `package.json`, so the script does not run from a clean install.

## Content that runs out

- **The last era starts in year 9** and nothing changes after it: add eras or
  make them cycle. (The human run reached year 12 and saw nothing change.)
- **Tech giant has no goals.** The agreed direction is a long journey, not an
  ending or IPO-style reset, so anything here should extend the journey rather
  than reset it. Options discussed, not chosen: an endless mode with growing
  rivals; a legacy / new-studio start.
- Research (14 items) is finished early; repeatable research (CI II, III…) is
  not built.
- Only 7 product types and 24 features; era "expected features" stop at the
  platform age. More product types are wanted.
- Milestones were not reworked into the journey: "Fill all 12 desks" and "A real
  team" (5 people) assume the old single office.
- Contracts do not scale into the late game.

## From the original plan, not done

- Upkeep on live products beyond bugs and staleness (server bills, support load,
  churn from outages). Wanted by the player, with physical servers in the office.
- Per-market reputation instead of one number.
- Scenario starts (a downturn, starting in debt).
- Rivals that act on you: really hiring staff away (today only the "Job offer"
  event names a rival), reacting to your hits, going bankrupt.
- A big HQ scene as a late visual reward.
- Staff retirement as more than a notice (people only "move on" after six
  years; the player wants to know who has been there and to say goodbye).

## Rough edges

- Stats charts show money and income only; no users, ranking history or
  per-product charts, and the player did not find them meaningful.
- `ProductsTab` sends updates and fixes to the office currently shown; a
  product another office is working on is blocked with "Another team is working
  on it". A picker would be clearer with several offices.
- The product page recomputes market weights for every product on every render;
  revisit if the catalogue grows.
- Office floors have four colour themes (`OFFICE_THEMES` in `lib/tycoon/theme.ts`);
  the garage is the only room with its own art.
- Installed-app layout: the game root is pinned with `position: fixed` +
  `100dvh` because the page's flex chain resolved ~56px too tall in an installed
  Android app. Keep that if the page layout changes.
