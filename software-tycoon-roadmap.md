# Software Tycoon roadmap (`/tycoon`, merged 2026-10-12)

Carried over from the standalone repo's ROADMAP.md, and the single source of
TODOs for the game. The Calendar app is in `roadmap.md`. Nothing here is
blocking: the game builds, its tests pass and it ships.

**Handover (2026-10-23, evening).** The one-product pivot is built end to end: phases 0 and A (the café and the hunt for a
hit, pushed earlier), then B (the hit is the company), C (internal tools and companion products) and D (endings, Absorb, the
journey) in this session, and a bot playthrough with a first retune (E). Saves are version 7. The work of this session is
not committed yet (see "Built: Phases B to E" below). **Start with "Next steps".**

## Next steps (start here)

**1. The player plays it (waiting on them).** Everything after the garage has only been played by a bot
(`scripts/tycoon/playthrough.ts`) and looked at in screenshots, never by a person. Ask for a run log (Menu → Export run
log; `lab-tycoon-run-*.json`, untracked and gitignored: read it, never commit it; the monthly entries now carry the hit's
fields: see "Guide for the next session"). Look at:
- *The hunt* (café and garage): a bot that reads the true fit finds its first hit after 250 to 570 days (and often two or three more in the garage); a person reading it through
  an analyst's eye will be slower. If the garage is too poor, `CONTRACT_PAY_PER_POINT` and `UNDISCOVERED_REACH` come first.
- *Act 2 pace*: the bot goes from the move out to the IPO in about 3.5 to 5.5 years (6 to 8.5 years from the start). The numbers
  that set it are in `sim/balance.ts`: `HIT_GROWTH_RATE` (0.003 a day, the biggest lever), `BASE_CAPACITY`, the capacity
  and `pay` of the items in `data/workstreams.ts`, `HOSTING_PER_USER_DAY`, the stage goals in `data/stages.ts` and the
  IPO gates `IPO_*`. Money stops mattering about a year after the move out (income runs 100 times the burn): if that
  feels flat, make the late costs bite (hosting, the upkeep of tools, rent per floor) rather than slow the growth.
- *The roadmap runs dry*: every item is built about 3 years after the move out, so the late game has nothing to queue
  and money piles up. More items (per era) or repeatable ones are the natural next content.
- *Is it clear?* Whether the player finds the workstream selectors (on the hit's dashboard and in Studio → Products), the
  roadmap, the second-product slots ("Both slots are taken: retire a side product") and the Europe stream.

**2. Known gaps and rough edges**
- `scripts/tycoon/simulate.ts` (the old bots) and `scripts/tycoon/e2e.mjs` are stale. `playthrough.ts` replaces the
  first for balance; the second needs a pass (founding dialog, the café, the garage).
- The bot reads the true fit and sets an ideal roadmap, so its pace is a floor, not a forecast. Its first-floor logic is
  also crude (it rotates one floor through the streams).
- Companion products are launched from the roadmap (the Companions stream); they have no screen of their own beyond the
  dashboard's line and the Products tab. Retiring a companion frees its slot.
- A version 6 save loads with its directions mapped to workstreams, but it has no hit roadmap and may be past stages whose
  goals changed; fine for a test, not worth migrating further.
- Researches about running many products (licensing, the portfolio) were not reworked; they still exist.

## First player run, and the Spore direction (2026-10-25; design only, nothing built)

The player's first run log (`lab-tycoon-run-2026-10-25.json`, 7.4 years, ended unfinished on "First floor") and what they said.

### What the log shows
- Café 1,210 days, garage 1,100 days, the hit (a fintech app, after a second survey) on day 2317. Three products shipped, two
  dev tools retired at about $100 a day. Cash in the garage got down to one day left.
- After the hit: income $45k a day against a burn of $1.3k, cash $5.4M unspent, one 12-person floor, no second office, no
  companions (both slots free), 84k users after 350 days on "First floor" (goal 100k+). Load stayed at 14%.
- The roadmap was left with Advertising and Analytics pipeline while the floor stood on *Features*: `nextItem` only looks at
  items of the floor's own stream, so they would never be built. 20 workstream changes, 5 on day 2608 alone.

### What the player said
- **Café: keep.** Low bills let them buy research, and growing into a senior before making a hit feels right. It is the best
  part: solo with a friend, both growing, dreaming about the future.
- **Garage: fine, with shaping.** It makes you dream about the hit. Needs more *interaction* in research and building: picking
  survey tags and then building "the same way as before" is not new insight.
- **After the hit: the bottleneck.** "You don't dream any more. You reached the hit, you felt it." Nothing makes you want more.
  The roadmap is a to-do list: pick everything, then sit and watch ("a pixel movie"). The roadmap/team-mode UX is confusing
  (which feature goes where, why enable a team mode to build what I want). They stopped playing around day 2600.
- **Scaling is a burden.** In real life a hit means dull day-to-day operations and a high risk of failing; the game should
  feel hard but fun and give what real life does not. They prefer to stay a maker, and chose **deep work on the hit**.
- **Spore as the model.** Each stage has its own main action, lasts exactly as long as that idea stays fresh, and is full.

### Design direction (agreed in conversation, not scheduled)
1. **A different verb per stage**, and each stage ends while it is still fresh. Draft:

| Stage | Verb | What you do | Target length |
|---|---|---|---|
| Café | Craft | Contracts, research, growing yourself and a friend | as now (the player likes it) |
| Garage | Discover | Find what a market wants through real choices (survey, shape, test with users), not tag-picking | shorter than 1,100 days |
| First floor | Build the team | Hire and lead people; the people become characters | medium |
| Headquarters | Deep work | The founder works on the hit's flagship pieces; leads run operations | medium |
| Europe | Expand | Open a place, localise, new rules and rivals | medium |
| Global company | Steer | Few big decisions: acquisitions, the IPO or a sale, the change of guard | short, with the ending |

2. **Every stage needs a dream, not only a goal.** Café and garage have one (a hit; a dev tool people pay for). From the move
   out there is none. The dream after the hit is the missing piece: open question below.
3. **Operations should run themselves once set up**: leads with standing policies, only exceptions reach the player. The
   roadmap stops being a watched queue. The one-list roadmap (no workstream modes; floors take the first buildable item;
   queued features and Europe steps as rows; each row shows its effect and who builds it; optional per-floor focus; saves
   v8) is the likely first step, and still stands as the UI base.
4. **Patterns that remain candidates**: a funnel view of where users leak (read-only for the player), items with costs and
   exclusive paths (so you cannot build everything), events that interrupt (rivals, regulators, spikes, poaching), and money
   with somewhere to go (the hit funds making something new; Absorb already exists).

### Open questions (ask before building)
- **The dream after the hit (player's pick, 2026-10-25): a named rival to beat and a person with an arc**, plus **AI agents
  on the team** so the game feels like 2026. Not chosen: a bigger vision, a product made by hand. To design: the rival (one
  competitor with a face and a history that reacts to the player's moves; `sim/rivals.ts` has anonymous rivals today), the
  person (the friend/lead, a hope and a story across stages, tied to the stage goals), and agents (cheap, tireless workers
  the player configures and supervises: roles, autonomy, a cost per run, and failure modes such as a wrong fix or a runaway
  bill; they are also how "operations run themselves" becomes play and something fun to watch).
- Which stage to design in detail first. The player said the garage is not the biggest pain and only needs shaping; the
  office stage is the bottleneck.
- How the bot plays each new verb; its pace is a floor, not a forecast.
- Do not retune numbers in `balance.ts` until the loop changes: the log's numbers are not the problem.

### Build plan for this direction (agreed 2026-10-25: "develop it fully, then try a new run")
Phases, each playable and tested before the next. Phase 1 is built (uncommitted).
1. **Chapters (built).** `sim/chapters.ts`: a run is a career. A good ending (sold, IPO, retired) offers *Start something
   new*: you and your friend, the research you finished, 60% of your reputation and a little money (1% of the worth, between
   $15k and $150k) go back to a café; the rival world carries on (day, rivals, market, journal). Bankruptcy offers *Start
   again, alone*: no friend, no team, half the research, 25% of the reputation, $5,000. `Legacy` lists the past companies. The
   new chapter is saved and the page reloads into it (`browser.ts: startNextChapter`); `freshChapter` opens the naming dialog.
   More ways to fail (the friend leaves, the hit dies, a hostile takeover) come with phase 3.
2. **One roadmap list (built, funnel view not yet).** `sim/roadmap.ts: nextStep`: a floor takes the first row, in the player's
   order, that is on offer and that no floor is building. Rows are items plus three steps (`features`, `compliance`, `localise`).
   `Office.workstream` is now an optional *focus*: 'features' (the default, shown as "Anything") takes any row; any other value
   takes only rows of that stream, as before, so saves need no migration. A new floor is on Anything (Europe's on Europe).
   The roadmap dialog shows each row's effect in numbers, who is building it and who is next. The bot (12 years, seeds 1 to 6)
   still reaches the IPO in 6.0 to 8.0 years. Not browser-checked, only the render tests. Still to do: the funnel view
   (where users leak) on the hit's dashboard.
3. **The friend's arc and a named nemesis rival**: the dream after the hit. Stage goals reference them.
   - *3a, the nemesis (built).* `sim/nemesis.ts`, `data/nemesis.ts`: 60 days after the hit a funded newcomer (a named founder, a
     story) comes for it. Its income is `Rival.ratio` times yours (starts at 1.15, so it is ahead). Monthly it gains
     (+0.03 ambition, up to +0.1 where the hit's fit is under 90) and falls back for releases you ship (-0.015 each, cap
     -0.06), roadmap items you finish (-0.04 each, cap -0.12) and a hit at fit 95+ (-0.02). Every 100 to 160 days it moves: a
     lookalike product (crowds the hit's market and lifts it by 0.1), a poaching offer (an event; letting them go lifts it by
     0.08) or an ad blitz (revenue x0.92 for 40 days). You can *Strike back* (25 days of income, sets them back 0.2, every 60
     days): the first thing money buys late. Beaten when ratio <= 0.8 for 90 days in a row, or absorbed; the next comes 240
     days later. The Europe stage asks for it ("Overtake your rival"). Seeds 1 to 6: the bot's IPO moved from 6.0 to 8.0
     years to 6.8 to 8.8. Scripted events (`SCRIPTED_EVENTS`) are never rolled at random.
   - *3b, the friend's arc (built).* `sim/friend.ts`, four scripted events in `data/events.ts`. `friendArc` has a bond (0 to
     100, starts 60, +2 or -2 a month with the team's mood). 120 days after the hit they tell you about their own idea (back
     it, weekends, or not now). The nemesis may court them (15% of its moves): talk, match (12 months' pay) or their call;
     they stay with a chance of bond/100 plus 0.1, 0.5 or -0.1. If they go, the rival gains 0.25 and the team loses morale;
     once another rival falls they write, and you can take them back as CTO.
   - *3c, losing the company (built).* `sim/crisis.ts`: team morale under 45 and the rival at 1.4 or more, three months in a
     row, puts a vote of no confidence to you. Rally once (25% of the cash, +20 morale, rival -0.2) or step down: the new
     ending `ousted`, which restarts you alone like bankruptcy. Bankruptcy alone could not end a rich company.
   - Bot, seeds 1 to 6: the IPO at 6.0 to 9.1 years. Not played by a person yet; the numbers in `balance.ts` under "The
     friend" and "Losing the company" are a first guess.
4. **AI agents (built).** The player chose *tool*, not hire. `sim/agents.ts`, `data/agents.ts`, Studio → Agents. Four kinds, each
   with a dial: Off, Suggests, Acts-you-review, Unattended (power 0.4, 0.8, 1.4; cost x1, 2.2, 4; incident risk 0, 6%,
   22% a month). Code copilot (every team faster) and Research analyst (insight) from the AI wave, Bug triager (faster fixes)
   from the next era, Support agent (fewer of the hit's users leave) from the agent era, when all of them are 25% sharper.
   Their effects add to `toolEffects` and their bill to `toolUpkeep` (grows with the team). An incident (`agent_incident`)
   is cut by monitoring, test automation and resilience work on the hit (up to 60%): roll back (12 days of the bill), let it
   ride (bugs, quality, insight or fit; a quarter also run the bill x3 for 20 days) or pull the plug. Bot seeds 1 to 6: the
   IPO at 6.0 to 9.0 years, unchanged. Numbers are a first guess; no person has played this.
5. **A verb per stage** (First floor: build the team; Headquarters: the founder's deep work) and shaping the garage's
   discovery. Then a bot pass over 12 seeds, then a new human run.

## Guide for the next session (written 2026-10-23, before the player's first playthrough of phases B to E)

Read this first if you are picking the game up after the player has played. It says what to read in a run log, which knob
answers which complaint, how the new systems work and why they are shaped this way.

### 1. What to do when the player comes back

1. Ask for the run log (Menu → Export run log, `lab-tycoon-run-*.json`; untracked and gitignored: read it, never commit it)
   and what they felt: where they got stuck, bored or confused, where they skipped time.
2. Read the log (section 2), place each complaint in the playbook (section 5), change one knob at a time, and check it with
   the bot over 12 seeds (`playthrough.ts`) so a fix for one end does not break the other.
3. Only then think about content or features. The player's order of priority so far has been: feel the arc first,
   features later. The roadmap's "Next steps" lists the open questions (hunt length, Act 2 pace, a dry roadmap, clarity).
4. Commit only when asked, to `main`, `type(scope): summary`, staging only the task's files (see `AGENTS.md`).

### 2. Reading a run log

Each entry is `{ day, kind, text, cash, data? }`. Kinds that matter now:
- `month` (every 30 days): `income`, `incomeAverage`, `burn` (a day), `reputation`, `stage`, `employees`, `offices`, `users`,
  `lifetimeRevenue`, `productList` (each product with users, income, quality and its role), and, once there is a hit, the
  **hit fields**: `hitName`, `hitUsers`, `hitEuUsers`, `hitFit` and `hitPeakFit` (the fit its last release earned),
  `hitRetention` (% of users kept at that fit), `hitReach`, `hitWorld` (its pull on the world, a multiplier on reach),
  `hitCapacity`, `hitLoadPercent` (users over capacity), `hitIncome`, `hitPayFactor` (what Monetisation raised pay to),
  `hitBugs`, `hitPressure` (what presses on the fit, in points a day, by cause), `hitBuilt` and `hitRoadmap` (item ids),
  `floors` (each floor and its workstream, and what it is building), `hosting` and `toolUpkeep` (a day), `profitDays`,
  `secondSlotsFree`.
- `stage`, `hit` (a launch took off), `office.toGarage`, `office.moveOut` (`kept`: the side products), `team.workstream`
  (a floor changed stream), `product.roadmap` (the roadmap was edited), `team.release` (a floor shipped), `notice` (outages
  read "went down: the servers were full", items "is live on", companions "is out", Absorb "You absorbed", the change
  of guard "is the CEO now"), `exit.offer`/`exit.declined`, `end.ipo`/`end.sold`/`end.retired`/`end.bankrupt`.
- Quick checks: users and income per month against the targets (first floor 100k to 500k users, headquarters 5M to 10M,
  both buildings 20M+, $1M a day late, $1B lifetime); `hitLoadPercent` pinned at 90 to 100 for months means the player
  never built Scale (or did not find out how); `hitFit` far under `hitPeakFit` means pressure (read `hitPressure`);
  `floors` all `features` means the player never found the workstream selectors; `hitRoadmap` empty with floors idle means
  the roadmap ran dry or was never filled; `secondSlotsFree: 0` with no companion means the slots stayed taken by side products.

### 3. How the new systems work (reference)

Files: `sim/teams.ts` (floors and workstreams), `sim/roadmap.ts` (the ranked list, `nextItem`), `data/workstreams.ts` (all
items, `itemEffects`), `sim/scale.ts` (capacity, outages, hosting, the hit's pull on the world), `sim/fit.ts` (takeoff,
pressure, retention), `sim/companions.ts` and `data/companions.ts`, `sim/tools.ts`, `sim/exit.ts` (selling, the IPO),
`sim/rivals.ts` (`acquire`), `sim/founding.ts` (`changeOfGuard`), `sim/offices.ts` (`moveOut`, `openOffice`), `data/stages.ts`,
UI: `HitDashboard.tsx`, `RoadmapDialog.tsx`, `TeamControls.tsx` (per-product team and workstream), `TeamDialog.tsx` (the
move out picker), `MenuDialog.tsx` (IPO), `AbsorbDialog.tsx`.

**A floor and its workstream.** `Office.productId` is the product it looks after (the hit, for every floor that opens or
moves out) and `Office.workstream` what it works on. `teamDay` runs each day: ships a finished team release, and for an idle
floor asks `releasePlan` what is next. The plan by stream: *features*: the queued features (`Product.nextFeatures`), else
a maintenance release timed near the end of the fresh period; *quality*: a quality item, else a polishing release; *scale,
growth, monetisation, tools*: the highest roadmap item for that stream that is on offer, else the floor idles (the panel
says "Nothing on the roadmap for ..."; `nextReleaseDay` is `Number.MAX_SAFE_INTEGER`: UI code must check it); *europe*:
compliance, then localising, then its items; *companions*: a companion item, else look after the stalest companion.
An item is a normal update project (`Project.itemId`) whose work is the maintenance target times `item.work`.
Floors' releases run side by side: `productInWork(state, id, byTeam)` ignores other floors' team releases, while manual
updates and fixes still exclude each other. Items already being built are skipped by `nextItem`.

**Items** (`WORK_ITEMS` plus one launch item per companion, `ALL_ITEMS`). `minUsers` gates when an item is on offer.
When one ships, `buildItem` (in `sim/project.ts`) applies what is immediate (reach multiplier, fit and peak fit, bugs, quality),
adds it to `Product.built` and removes it from the roadmap; everything else is read live from `itemEffects(product)`:
`capacity` (scale), `pay` (monetisation), `churn` (retention), and the tool effects `fixes`, `insight`, `speed`, `morale`,
`upkeep` (read through `toolEffects(state)` from the *hit's* built items: tools go with the hit). Saves store item ids: if
you rename or delete an id, `getWorkItem` returns undefined and the effect silently disappears.

**The hit's users** (`targetUsersIn` in `sim/products.ts`): `saturate(reach x world x interest x bugFactor x retention x
expectation, cap) / (1 + crowding) + regulars`, per region, where cap is audience x regionScale x `MARKET_CAP` (5) x
`HIT_MARKET_SCALE` (300), so the market is rarely what stops a hit. Users move toward it (`nextUsers`). Then `loadDay`:
users over `capacityOf` (`BASE_CAPACITY` 300k plus Scale items) are cut to it; from `OUTAGE_LOAD` (92%) of capacity an outage
strikes with `OUTAGE_CHANCE` (2%) a day, costing `OUTAGE_USER_LOSS` of users, reputation and bugs. `growWorld`: while users are
under capacity, `world` grows by `HIT_GROWTH_RATE` x health x room x (1 + the items' reach + 0.4 per healthy Reach companion)
a day; health is (fit - 50) / 50 clamped to -1..1, room is 1 - users / market cap; a fit under 50 shrinks `world` back toward 1.
Revenue: `productRevenue` (users x price x audience pay / 30, Europe's pay factor) x `payFactor` (1 + the items' pay), and the
hit also earns x (1 + 0.15 per healthy Keep companion) through `productIncome`. Costs: `HOSTING_PER_USER_DAY` (0.002) a hit user,
plus tool upkeep, on top of salaries and rent.

**Fit pressure** (`sim/fit.ts`, `sagFit`, once a day for hits): pressure in points a day = 0.25 x (1 - interest) + 0.3 x
(1 - bugFactor) + 0.08 x min(3, crowding by others) + 0.06 x features the era expects and it lacks + 0.1 per unhealthy
companion. Above 0.02 the fit falls by it; otherwise it recovers 0.15 a day; it never exceeds `peakFit`, the fit the last
release earned (a release resets both). `retention`: 0.4 + 0.6 x min(1, fit / 75), plus (1 - that) x (the items' churn + 0.1
per healthy Keep companion), multiplies the hit's users.

**Second-product slots** (`COMPANION_SLOTS` 2): side products (kept at move out) and companions share them. A companion
launches when its item ships, with 12% of the hit's users; it has no floor of its own: a floor on the Companions stream
keeps its reach at 12% of the hit's users and updates the stalest one. Healthy means interest of at least 0.6 and fewer than
10 bugs per unit of work. To free a slot, retire a product in Studio → Products.

**Absorb** (`acquire`): needs stage 4, a hit and a rival with a product of the hit's type; costs `acquisitionPrice`. Half the
users of its competing products join the hit; its best people (by skill) fill the empty desks of real offices in its region
and nobody comes if there are none; kept products become side products; its other business adds to `acquiredIncome`. The
name is recorded in `absorbedNames` so `rivalsArrive` does not bring it back.

**Journey and endings.** Stages 0 to 6 (see "Things to know"). Opening the first European floor calls `changeOfGuard`.
The IPO is open at stage 6 when its three goals hold (10M users, $1B lifetime, `profitDays` of 360) and values the company at
cash plus `IPO_MULTIPLE` (9) years of trailing income; selling uses `EXIT_BASE_MULTIPLE` (2 years of income) and the old offer rules.

### 4. Why it is shaped this way (decisions, and what was rejected)

- *A hit is earned, and the company is built around it.* The player's own words in "The pivot". The roadmap, workstreams and
  capacity exist to give Act 2 decisions that are not money: which floor builds what, in what order, and what the hit's
  servers and fit can bear.
- *Workstreams with a ranked roadmap* (the player agreed): you rank items, floors take the top one for their stream. Rejected:
  picking an item per floor (more clicks, same choice).
- *Tools and companions reuse the roadmap machinery* (items of two more streams) instead of being separate 2 to 4 person
  projects as the plan said. A floor on Tools or Companions is the "team off the hit". Cheaper to build and test; if the
  player wants small teams inside a floor, that is a new feature.
- *Side products earn only* until they are retired or replaced (the player's call). They hold slots that companions need,
  which is deliberate: the choice of which to keep at move out has a price later. The bot retires them as soon as a hit is
  300k users; check whether the player notices the slot message.
- *The hit's growth is a "pull on the world" (`world`), not a bigger reach per release.* Per-release reach gains are small
  (a feature gives about 10%) and could never reach millions; `world` compounds with fit, so a hit that holds its fit snowballs
  until its servers or its market stop it, and one that sags shrinks. It is the single biggest pacing lever.
- *Capacity is the main wall.* Past it users are turned away rather than angry, and near it outages hurt: the player has to put
  a floor on Scale in time. A hit left alone stalls at its servers (seen in the bot runs: 4.1M users for 12 years).
- *Hosting per user, not a share of revenue*, so cheap-per-user products feel it more. Money is still plentiful (see Next steps).
- *Stage gates use things the player does* (200k users and a Scale item to leave the first floor), not reputation, which a
  bot reached years late and a person may find arbitrary.
- *Floors work in parallel on the hit.* Without it one floor on Quality blocked every other floor for good (found by the bot).
- *The IPO and selling are separate endings*: selling stays the early exit (one floor, a hit that earns), the IPO the late one.

### 5. Retune playbook (symptom, then knob, in `sim/balance.ts` unless noted)

- Garage too poor or the hunt too long: `CONTRACT_PAY_PER_POINT`, `UNDISCOVERED_REACH`, `CAFE_*`, `GARAGE_READY_MONEY`, `FIT_BASE`,
  `FIT_TAKEOFF`, `TAKEOFF_MAX_CROWDING`.
- Act 2 too fast or too slow: `HIT_GROWTH_RATE` first; then the capacity and `minUsers` of the Scale items and `BASE_CAPACITY`
  (`data/workstreams.ts`); the stage goals (`data/stages.ts`); `HIT_REACH` for the hit's starting size.
- Money does not matter: `HOSTING_PER_USER_DAY`, item `upkeep`, `NEW_OFFICE_COST`, `EU_OFFICE_COST`, salaries, or new sinks (the roadmap
  has no costs per item today: an item could cost money, not only work).
- Outages too harsh or too rare: `OUTAGE_LOAD`, `OUTAGE_CHANCE`, `OUTAGE_USER_LOSS`, `OUTAGE_REPUTATION`.
- The fit sags too fast or never: `FIT_*_PRESSURE`, `FIT_RECOVERY`, `HIT_RETENTION_FLOOR`.
- Companions pointless or mandatory: `COMPANION_REACH_BOOST`, `COMPANION_KEEP_*`, `COMPANION_SHARE`, `COMPANION_CARE_FIT`.
- Late game empty: add items (per era or repeatable ones) in `data/workstreams.ts`, more companions in `data/companions.ts`.
- IPO too early or late: `IPO_USERS`, `IPO_REVENUE`, `IPO_PROFIT_DAYS`, `IPO_MULTIPLE`.
- After any change run the bot (`playthrough.ts`) over 12 seeds, then `npm test` and `npm run typecheck`.

### 6. Pitfalls

- `sim/products.ts`, `fit.ts`, `companions.ts`, `scale.ts` and `economy.ts` import each other (functions only, no top-level use);
  keep it that way (no constants computed from another module at import time) or an import cycle will bite.
- `STAGES.length - 1` is the IPO stage; adding or removing stages shifts the stage numbers in `balance.ts`/`data` and needs a save
  upgrade (see "Things to know").
- `moveOut(state)` without `keepIds` keeps nothing and sells everything else; the store passes the picker's choice.
- `nextReleaseDay` may be `MAX_SAFE_INTEGER` (idle floor); `changeOfGuard` runs once, on the first European floor, and does nothing
  if the founders are gone.
- The tests that pin balance numbers are few; most numeric checks live in `tests/tycoon/scale.test.ts`, `pressure.test.ts`,
  `workstreams.test.ts`, `companions.test.ts`, `moveout.test.ts`, `endings.test.ts`, `competition.test.ts` (Absorb),
  `journal.test.ts` (the log's hit fields) and `ui-smoke.test.tsx` (the new screens).
- Bot-based numbers are optimistic (true fit, ideal roadmap). Do not tune late-game pace to the bot alone.

**Things to know before changing code.**
- Verify with `npm test` and `npm run typecheck`; for UI, run `npm run dev -- --port 4321` (base path `/lab/tycoon/`)
  and look. Dev shortcuts use a throwaway game: `?garage` (skip the café), `?offices=N`, `?money=`, `?rep=`, `?stage=`,
  `?clock=`. To look at a prepared state, write it into `localStorage['lab:tycoon:save']` before the page loads
  (puppeteer-core and a headless Chrome were used for screenshots; neither is in `package.json`).
- Stage numbers are indices into `STAGES` (`data/stages.ts`) and are used as numbers (`MOVE_OUT_STAGE`,
  `NEW_OFFICE_STAGE`, `ACQUISITION_STAGE`, `LEADER_STAGE`, `PROJECT_SIZES[...].stage`, research `stage`). Inserting a
  stage shifts them all, plus a save upgrade, as the café did (`upgradeFromV5`).
- `inGarage` is true at the café too; `inCafe` is the café alone. `makeState` in `tests/tycoon/helpers.ts` puts the
  studio in its garage at the Garage startup stage; tests about the café start from `createInitialState`.
- Balance checks: bundle a script with `npx esbuild <file>.ts --bundle --platform=node --format=esm --alias:@=./src
  --outfile=<out>.mjs` and run it with node. `scripts/tycoon/simulate.ts` predates the pivot (its bots still play
  the old game); `scripts/tycoon/e2e.mjs` is stale (it imports moved files and assumes the old start).
- `npx esbuild scripts/tycoon/playthrough.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/playthrough.mjs`
  then `node /tmp/playthrough.mjs [seed] [years] [quiet]` plays the whole game with a bot (see its header; `SAVE_DIR=<dir>`
  writes a save per stage). Use it for pacing checks after balance changes, run over many seeds, and remember it is an
  optimistic player. The stages now are 0 café, 1 garage, 2 indie (`MOVE_OUT_STAGE`), 3 first floor, 4 headquarters
  (`NEW_OFFICE_STAGE`, `ACQUISITION_STAGE`), 5 Europe (`LEADER_STAGE`), 6 global company (the IPO).
- Dev server for screenshots: Playwright's Chromium is cached under `~/.cache/ms-playwright` and `@playwright/cli` has
  `playwright-core` globally; point `createRequire` at it and `executablePath` at the cached chrome.
- Commit straight to `main` as `type(scope): summary`, only when asked; stage only the task's files.

**Earlier handover (2026-10-22, evening).** The player played the building build. The visual fixes from that are built (see
"Fourth feedback: the building, routines, and one product" below); the bigger pivot it proposes (a long garage hunt
for a hard hit, then a company built around that one product) has its direction agreed (2026-10-23) and a build plan
in phases 0 to E in that section: go through the plan and its open questions with the player before building.

**Earlier handover (2026-10-22).** The third logged run was analysed and Phase 1 of its fixes is built (see "Third
logged run, and the building pivot" below); the next big piece is the two-building pivot, to be planned with
the player first.

**Earlier handover (2026-10-20).** Everything agreed with the player is built and pushed (commits
`82ac407` to `ee37b24`; the "Built: the roadmap pass" and "Built: regions, Europe and Absorb"
sections below say what and where). The player is playtesting it for a day and will bring a
fresh run log (`lab-tycoon-run-*.json`, untracked and gitignored: read it, never commit it) or
concerns. **Next work is retuning from that log, not new features.** The first-guess numbers to
tune are in `sim/balance.ts` (`BUDGET_PER_POINT`, `START_MONEY`, `KNOWLEDGE_*`, `PM_*`,
`ENTERPRISE_*`, `LICENSE_*`, `EU_*`, `RIVAL_ABROAD`, `ERA_WAGE_*`, `ABSORB_*`) and
`data/regions.ts`. Not yet looked at in a real browser or on a phone: the Team, Products, Industry,
Absorb, New project, Employee and Research dialogs (only `tests/tycoon/ui-smoke.test.tsx` renders
them). The bots (`scripts/tycoon/simulate.ts`) overexpand late and never localise or absorb well,
so do not retune from them. Agreed and dropped: Subsidiary, non-contract garage income.

**Where things stand (as of 2026-10-20: older than the sections above; where they differ, "Built: Phases B to E" and the handover win. Saves are now version 7, the journey has seven stages, floors work on workstreams, not directions).** The studio has a real arc: garage (4 desks) → office →
more offices; client contracts; users and bugs on every product; breakout hits;
six journey stages; ten rival studios, split between the US and Europe (and a newcomer at each of nine eras, to year 17) and an
industry ranking; eras that shift demand and expectations; careers from Junior to
Lead; bug fixing by a developer and tester pair; retiring and selling products;
a two-act shape (sell from the garage, or earn a hit and move out), a 5-product
portfolio that products grow through, audiences, and an exportable run log.
Saves are version 5 (`STATE_VERSION` in `src/lib/tycoon/sim/state.ts`); bump it
and say so in the commit whenever the save shape changes. The 2026-10-20 additions (regions,
knowledge, insight, roles, licensing...) are all optional or defaulted on load, so they did not. Version 3 and 4 saves are
upgraded on load (`upgradeFromV3`, `upgradeFromV4`). Optional fields (such as
`audienceId`) need no bump.

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

## Fourth feedback: the building, routines, and one product (2026-10-22)

From playing the building build, no run log. What the player said:

- The building from outside looked clunky and unfinished; the team sat in one row, unlike the floor up close; the
  laptops sat at the far end of the desks, so people typed on the bare desk.
- Stand-ups and coffee breaks are culture, not switches. A stand-up lasted one game day, gone in a blink at 2x;
  up close nobody went to the breaks or the stand-up. Gather everyone at a physical Scrum board, in both views,
  instead of a meeting room.
- Directions (Grow, Polish, Keep it running, Expand) are unclear and counterintuitive.
- Analysts and PMs seemed missing. They are not: they are only offered once *User research* is done (one candidate
  per pool), and look like developers at their desks.
- The pivot, below.

**Built (2026-10-22).**
- **The building** (`render-support/building.ts`, `render/BuildingScene.ts`): always all five floors, the ones not
  rented dark with their lights off (`BuildingBox.vacant`, "+ Rent floor N" on the next one); rooftop unit and aerial,
  a ledge at every floor, an awning and planters at the lobby, trees and clouds. A floor is laid out as up close: two
  partitions to a row, three rows (`floorPartitionAt`), computers at the near edge of the desk under the hands
  (`render/furniture.ts` is shared with `OfficeScene`), and both views share one `SeatMap` per office, so everyone has
  the same desk in both. `FLOOR_H` is 128, so the building is drawn at 0.75 on a phone (eighth steps now).
- **Routines are culture**: `Office.standup`/`breaks`, `setRoutine`, the toggles and `STANDUP_*`/`BREAKS_*` are gone.
  They only show, on a clock of running time, not game days (`render-support/routines.ts`: every 90 s a 16 s stand-up
  and a 24 s coffee break, offset per floor), so they read the same at any speed. Up close (`OfficeScene`, options
  `standup`, `breaks`, `boardProgress`, `seatMaps`) everyone walks to the Scrum board on the wall and stands round it,
  and coffee breaks use the Focus office's outings; on the street the team huddles at the board at the floor's right
  end and takes turns at the coffee corner. The board's notes move from to do to done with the project.
- Dev shortcut `?clock=ms` starts the routines' clock there.

**The pivot (direction agreed 2026-10-23; the build plan below is to go through with the player first).** The
player's words: "Garage is to play one mode of the game: try to make a hit, grow as a small team, live this life for a
while, then make a hit (finally!) and rent the office floor (look ma I made it!) with a 12-desk team, work on the hit
to make it better (the whole focus on this second part) in order to grow to a whole building, and then expand to
Europe, perhaps build a couple of internal tools or products that accompany the main hit." Companies with buildings
maintain and grow one big product; they do not ship a new one every month.

Decided with the player (2026-10-23):
- **A hit is earned, not rolled** (option B). Every product has a product–market fit that only releases move: features
  its audience loves raise it, ones they shrug at add nothing, and a crowded or cold market holds it back. Past a
  threshold, with room in the market, it takes off. Bad products stall; you kill them and try again.
- **You are the analyst.** A new game asks your name; you start as the analyst, with a developer friend. You read the
  market in the garage, become the hit's PM when it takes off (the key role in Act 2), and become CEO when the company
  opens in Europe, with your developer friend as CTO and one of your analysts as the hit's PM.
- **A café before the garage**: just the two of you working from a café, short and entertaining, earning enough to
  hire two more and move into the garage. A new scene with a barista and customers.
- **After the garage the hit is the company**: internal tools, plus one or two companion products at most, to
  millions of users and billions in revenue. Internal tools help the main product (earning from them later, maybe).
- **Moving out**: keep up to 2 garage products, sell the rest. What a second product is for needs a clear role (below).
- **Absorb** a rival: its best people take your empty desks, and only those.
- **Endings**: sell (with a confirmation that the game ends), an IPO, bankruptcy, and retiring (kept: it does no harm).
- Capacity and outages are a good Act 2 pressure, alongside rivals.

### Build plan (the design record: all phases are now built, see "Built: Phases B to E" for what changed from it)

Each phase is playable on its own and ends with a playtest. Numbers are first guesses for the retune.

**Phase 0: you, a friend, and a café.**
1. *A proper start.* The new game asks your name and the studio's, each with a dice button on the right of the input
   to make one up. You are a founder analyst with your name, and
   your friend a founder developer (the start's designer goes). Founders cannot be fired or quit, and draw a small
   salary. You gather insight from day one; PM needs no research for you.
2. *The café* (a new office kind before `garage`, 2 seats at a window table, no rent but coffee money, about $10 a
   day). Only easy work: small client gigs (a landing page, a bug fix, a plugin) and small dev tools. Goal: save
   enough to hire two people and pay the garage's deposit; then you pick the two and move. Aim for 5–10 minutes at
   1×. Café happenings to keep it lively: the barista passes on a lead (a client job), the Wi-Fi drops (a slow day),
   coffee over a laptop (a cost), a regular asks what you are building (a first user interview: insight).
3. *The café scene*: a counter with an espresso machine and a barista who works it, tables, the two of you at the
   window with laptops and cups, and customers who come in now and then, queue, order, wait and leave with a cup to
   go (some sit down a while). Same pixel style; anything the PixelOffice pack lacks is drawn by hand like the Scrum
   board.

**Built: Phases B to E (2026-10-23).** Decided with the player: a ranked roadmap, side products for income only until
Phase C, and defaults for the numbers (recorded here, to retune from a real log).
- *B1 Moving out with the hit* (`moveOut(state, keepIds)` in `sim/offices.ts`, the picker in `TeamDialog.tsx`): the hit
  stays, up to `SIDE_PRODUCT_LIMIT` (2) other products come along as side products (`Product.role: 'side'`), the rest are
  sold to rivals without the usual reputation and morale cost (`sunsetProduct(..., { planned: true })`). The floor that
  was the garage works on the hit.
- *B2 Workstreams* (`data/workstreams.ts`, `sim/teams.ts`, `sim/roadmap.ts`; `Direction` is gone, saves are version 7 with
  `upgradeFromV6`): a floor works on one of Features (the queued features, else upkeep), Quality (the roadmap's quality
  items, else polishing), Scale, Growth, Monetisation, Europe (compliance, then localising, then its items), Internal
  tools or Companions. The hit's roadmap (`Product.roadmap`, `setRoadmap`, `RoadmapDialog.tsx`) is a ranked list of items;
  a floor takes the highest one for its stream that is on offer (`minUsers`, localised for Europe, a free slot for a
  companion), builds it as a release (`Project.itemId`, work scaled by the item's `work`) and it joins `Product.built`.
  Floors work on the hit side by side: a floor's own release (`byTeam`) does not block another's (`productInWork(..., true)`).
  New floors take the hit and the first free stream (Europe's on the European building).
- *B3 Scale to millions* (`sim/scale.ts`): a hit holds `BASE_CAPACITY` (300k) users plus its Scale items (up to 60M more);
  past it users are turned away, near it (`OUTAGE_LOAD`) outages strike (users, reputation, bugs). Its market cap is
  `HIT_MARKET_SCALE` (300) times a normal one, so what stops it is capacity and its pull on the world: `Product.world`
  multiplies its reach and grows `HIT_GROWTH_RATE` a day while it fits (`hitHealth`) and has room, faster with Growth work.
  Servers cost `HOSTING_PER_USER_DAY` a user; Monetisation items raise what a user pays (`payFactor`, up to 4.8 times).
  `formatMoney` and `formatCount` write billions.
- *B4 Pressure* (`sim/fit.ts`): a hit's fit sags each day by what presses on it (staleness, open bugs, rivals in its market,
  features the era expects, an unlooked-after companion; `fitPressure`) down from the fit its last release earned
  (`Product.peakFit`), and recovers when nothing presses. Churn follows fit (`retention`), softened by Quality items.
- *B5 The hit's dashboard* (`HitDashboard.tsx`, under the scene once out of the garage): users (and Europe's), income and
  what a user pays, servers' load and capacity, the fit meter with what presses on it, a selector of each floor's
  workstream, the companions, and the roadmap button.
- *C Tools and companions* (`sim/tools.ts`, `sim/companions.ts`, `data/companions.ts`): internal tools are roadmap items of
  the Tools stream with upkeep (admin panel: bugs fixed faster; analytics pipeline: insight; deploy pipeline: faster
  teams; people portal: morale). Companions (six, each Reach or Keep, each suiting some kinds of hit) are launched from
  the Companions stream, share `COMPANION_SLOTS` (2) with side products, start with a slice of the hit's users and need
  a floor on Companions to look after them: healthy, a Reach one speeds the hit's growth, a Keep one keeps users and
  lifts pay; neglected, one presses on the hit's fit. That floor is the price: people off the hit.
- *D Endings, Absorb, the journey*: selling asks "Sure? This ends the run" in the offer dialog. The IPO (`ipoBlocker`,
  `goPublic`, Menu) needs the Global stage's goals (10M users, $1B lifetime, a year in profit, `profitDays`) and ends the
  run at `IPO_MULTIPLE` years of income. Absorb (`acquire`) now needs a hit and a rival that competes with it; half its
  competing users move to the hit (`ABSORB_USERS_SHARE`), its best people take your empty desks in its region and only
  those, products can be kept as second products; no office is opened. Absorbed studios no longer return when their
  year comes (`absorbedNames`). The journey is Café, Garage, Indie, First floor (200k users, a Scale item, 12 people),
  Headquarters (1M users, 2 floors, $30k a day), Europe (a building there, localised, 3M users, 3 floors) and Global
  company (the IPO gates). Opening the European building makes you CEO and your friend CTO (`changeOfGuard`); the best
  analyst becomes the hit's product manager; the CEO gathers no insight.
- *E The playthrough* (`scripts/tycoon/playthrough.ts`, run it as its header says; `SAVE_DIR=<dir>` writes a save at each
  stage, to load into the real UI by writing it to `localStorage['lab:tycoon:save']`): over 12 seeds the bot reaches the
  IPO in 6.0 to 8.5 years, with its first hit after 250 to 570 days. What it found and fixed: one floor on one stream
  could not build anything else (so a floor can now work next to another); a hit stalled for years at its servers' limit
  when no floor was on Scale (the dashboard says "outages likely: build Scale"; the player has to act); absorbed studios
  came back; the stage gates passed in days because one of them was reputation, now replaced by building servers; a bot
  that keeps launching into a crowded market never finds a hit (it now reads the takeoff blocker and moves on).
  `HIT_GROWTH_RATE` went 0.011, 0.008, 0.004 and ended at 0.003.
- Screenshots were taken with the cached Playwright Chromium against `npm run dev -- --port 4321` (no page errors at
  any stage from the café to the Global company, on desktop and a 390px phone).

**Built: Phase 0 (2026-10-23).**
- *The start* (`sim/founding.ts`, `components/tycoon/FoundingDialog.tsx`): a new run opens "A new studio" with your
  name and the studio's, each with dice (`rollPersonName`, `rollStudioName`, which use their own randomness, not the
  run's). `state.studioName` (optional) names you in the ranking. The founders are an analyst (you, `you(state)`) and
  a developer; a founder analyst becomes a PM without the research (`pmBlocker`).
- *The café* (office kind `cafe`, 2 desks, $300 a month of coffee, `OFFICE_KINDS.cafe`): founders draw no pay there
  (`monthlySalaries`), there are no outings, only Small products (`sizeLock`), and the panel and the new-project
  dialog lead with client work ("Find a job"). It is the first journey stage, "Two friends at a café": deliver
  `CAFE_JOBS` (3) jobs, then save `GARAGE_READY_MONEY` ($6,000) and move (`moveToGarage`, a $1,000 deposit; the
  Team dialog's button). `inGarage` is true in the café too; `inCafe` is the café alone. The run starts with
  `CAFE_START_MONEY` ($2,500); `START_MONEY` is gone. A bot that takes the best-paying job moved out after about
  75 days (45 to 200 by seed), two minutes or so at 1x.
- *Café events* (`CAFE_EVENTS` in `data/events.ts`, drawn only at the café, from day 6, 15 days apart, 12% a day):
  Rosa the barista passes on a better-paid lead (`offerJob`), the Wi-Fi goes down, coffee on your friend's laptop,
  a curious regular (insight, or a lead).
- *The café scene* (`OfficeScene.buildCafe`, `buildCounter`; the crowd in `render-support/cafe.ts`): a green wall
  over panelling, a glass door, a shop window onto the street, a chalkboard menu and cup shelf, lamps, a checked
  floor, two tables. Rosa works the till and the espresso machine behind the counter; guests come in at the door,
  queue, order (a speech bubble with a cup), wait while she brews it and carries it back, take the
  cup she sets down at the end of the counter (with a heart), and leave with it by a lane nearer the front, or sit
  at a free table for a while, the cup on the table only while they sit there. The
  crowd runs on game running time, deterministic, and stands still while paused. The founders have mugs on their
  desks; there is a cat but no dog.
- *Stages moved up one*: `MOVE_OUT_STAGE` 2, `NEW_OFFICE_STAGE` and `ACQUISITION_STAGE` 4, `LEADER_STAGE` 5, the
  Flagship size 3, every research `stage` +1. Version 5 saves are upgraded with `stage + 1` (`upgradeFromV5`). The
  garage's client-job goal counts the café's: 5 now. `makeState` in the tests puts the studio in its garage at the
  Garage startup stage.
- Dev shortcut `?garage` skips the café.
- Not done: `scripts/tycoon/e2e.mjs` was already stale before this (it imports `render/characters.ts` and
  `render/layout.ts`, which moved to `render-support/`) and now also assumes the old start (no founding dialog, the
  garage, `START_MONEY`): it needs a pass before it can run again.

**Built: Phase A (2026-10-23).**
- *Fit* (`sim/fit.ts`): `Product.fit` (0–100, optional) is set by every release: the share of everything the audience
  loves that the studio can build now (`bestLove`, by value × how much more than 1 they like it), less
  `FIT_SHRUG_PENALTY` per feature they shrug at, from a `FIT_BASE` floor, times what quality allows
  (`qualityAllowance`: all of it from 90). `fitOf` takes off what the era expects and the product lacks. A product
  manager raises a release's fit (`pmFitFactor`, `PM_FIT_BONUS`; `PM_HIT_BONUS` is gone). A product for no audience
  has no fit.
- *Takeoff* (`takeoffBlocker`, `takeOff`, `fitDay` every day and at every release): fit ≥ `FIT_TAKEOFF` (75), market
  not cold, crowding by others (`crowdingAround`) under `TAKEOFF_MAX_CROWDING` (1.2), and fresh. It becomes a hit and
  the signature, its reach is given back and multiplied by `HIT_REACH`, and the users follow over the weeks. On the
  first hit the founder analyst becomes its PM. Until then a product reaches only `undiscovered(fit)` of its reach
  (`UNDISCOVERED_REACH` 0.7, more the better it fits); a launch campaign reaches everyone (`estimateReach(..., false)`).
  A hit can hold `HIT_MARKET_SCALE` (4) times the market (`saturate(..., hit)`). The roll is gone:
  `hitBreakdown`, `hitChance`, `launchesSinceHit`, `HIT_BASE_CHANCE` and the rest; rivals keep their own roll.
- *Reading it* (`fitRange`, `components/tycoon/FitMeter.tsx`): the fit shows as a range as wide as the studio's eye
  for users is poor (`FIT_BAND_MAX` 40 to `FIT_BAND_MIN` 4, by `readingSkill`, the best analyst's or PM's analysis),
  sitting differently round the true value for each release. On the product card with why it has not taken off, in
  the ship dialog with the market's demand and room. Feedback (loved, shrugged, wished for) now comes in sooner the
  sharper the analyst (`feedbackFor`), and all at once for a surveyed audience.
- *No market scan*: the Industry tab already shows each market's demand and crowding, so it was left out; insight
  goes on surveys.
- *Pivot* (`startPivot`, `pivotBlocker`, the "Pivot…" picker on the product card with the fit each audience would
  give): an update's work without new features; when it ships the product is for the new audience, keeps
  `PIVOT_KEEP` (a fifth) of its users, starts again as a launch, and cannot pivot again. Not for a hit.
- *Garage limit*: `GARAGE_PRODUCT_LIMIT` (3) live products in the café and the garage, counting one being made.
- *Journey*: the garage asks for 3 products shipped and a product that takes off; Indie studio only for the move;
  the breakout stage's "3 lasting products" became "grow your hit to 50,000 users".
- *Money*: client work pays `CONTRACT_PAY_PER_POINT` 18 (was 12), so a hire on client work about pays for themselves;
  the café asks `GARAGE_READY_MONEY` $8,000 (was 6,000) to keep it about as long.
- What a bot found (`hunt.ts` in the session scratchpad, not kept): a garage of four that launches guesses, adds what
  the audience wishes for and takes client work when short found its hit after 240 to 970 days, and 4 of 10 found
  none in four years, mostly by staying in the crowded web market; hits earned $300–770 a day after six months
  against $200–250 of costs. Products that do not take off earn little ($5–40 a day in a crowded market): the first
  thing to retune from a real run if the garage feels too poor.

**Phase A: the hunt (garage).**
4. *Fit, not a roll.* `Product.fit` 0–100, set at launch and moved by every update: `audienceFit` (what the audience
   loves, by value), quality, expected features present, market demand, and crowding (`marketCrowding`). The breakout
   roll goes: `hitBreakdown`, `HIT_BASE_CHANCE`, `HIT_CHANCE_PER_MISS`, `launchesSinceHit`, the PM hit bonus. Rivals
   keep their simple roll.
5. *Takeoff.* Past the line (about 75), with room in the market, the product takes off over the next weeks: word of
   mouth climbs, the toast and journal say so, it becomes the signature, and you become its PM. Fit can still sag
   afterwards (stale, rivals, bugs), which is what Act 2 is about.
6. *Reading the market is your job.* Fit shows as a meter whose precision is your analysis skill: a wide band at
   first ("somewhere between lukewarm and warm"), narrowing to a number as you grow and as feedback comes in, with
   what moved it. Beside the audience survey, a *market scan* (insight) ranks product type × audience pairs by room
   and demand. More analysts can be hired later; PMs stay behind research for anyone but you.
7. *Non-hit money.* A good product that is not a hit earns the garage's costs and a bit more (about 1.2× a 4-person
   garage's burn); a weak one 0.8–1×. Contracts stay the safety net.
8. *Kill and pivot.* The garage holds at most 3 live products; killing one is quick and costs no reputation.
   *Pivot*: point a live product at another audience of its type, keeping its code.
   - Gets you: every feature already built counts at once (no work to rebuild them), fit is worked out afresh for the
     new audience, and it costs about an update's work instead of a launch's. Right when what you built is good but
     for someone else (the feedback says *shrugged* where another audience *loves*).
   - Costs you: most of the users leave (about a fifth stay), the product restarts as a launch (word of mouth from the
     bottom), its bugs and its quality stay, fit can come out lower, and a product pivots once.
   - Against killing it and starting over: pivot when the features are right for someone else, start over when the
     features are wrong.
9. *Garage goals* (`data/stages.ts`): find the hit, then save up and move out. The breakout stage's "3 products earning
   $300 a day" goes.

**Phase B: the hit is the company.**
10. *Moving out* needs the hit. Keep up to 2 garage products as side products (they earn what they earn and take a
    second-product slot, below) and sell the rest to rivals for cash towards the office.
11. *Workstreams instead of directions.* Every floor works on the hit, on one workstream with concrete items to queue:
    **Features**, **Quality** (bugs, performance), **Scale** (capacity: the users the servers hold; past it come
    outages and churn), **Growth** (onboarding and marketing), **Monetisation** (plans, a business tier, ads: what a
    user pays), **Europe** (data rules, localising, European growth). As the hit's PM you set the order of the
    roadmap; your level speeds how much fit each release wins. Grow, Polish, Keep it running and Expand go, with
    `setDirection` and `queueFeatures`.
12. *Scale to millions.* A hit's market is no longer capped at five times its type's audience: its ceiling is set by
    capacity, features, regions and the era. Rough targets: first floor 100k–500k users, full headquarters 5–10M, both
    buildings 20M+, daily income $1M+ late on, $1B+ lifetime. Server costs grow with users. `formatMoney` and
    `formatCount` learn billions.
13. *Pressure on the hit.* Rivals launch into its market, eras bring features users start to expect, fit sags without
    releases, and outages when users outrun capacity: churn is the Act 2 enemy. A dashboard for the hit (users by
    region, fit, capacity, revenue per user, churn) is the main screen once you have moved out.

**Phase C: internal tools and second products.**
14. *Internal tools*: small projects for a 2–4 person team that help the hit, with upkeep, and earn nothing: admin
    panel (bugs fixed faster), analytics dashboard (insight, and fit in detail), CI/deploy pipeline (faster releases,
    fewer bugs), HR tool (hiring and morale), landing pages (Growth). Later idea: spin one out as a product (as Slack
    came out of an internal tool).
15. *Second products: two slots, each with a job.* A second product exists to make the hit bigger, in one of two ways:
    - **Reach**: brings new people to the hit, such as a mobile app for a web hit, a free tier, a creator tool for a
      game. It raises the hit's ceiling and growth.
    - **Keep**: makes the hit's users stay and pay more, such as a pro add-on, an integrations marketplace, an
      analytics add-on. It lowers churn and raises what each user pays.
    It is offered from a short list that suits the hit's type, starts with a slice of the hit's users (cross-sell, no
    hunt), earns some money of its own, and needs a team, which is people off the hit: that is the trade. A buggy or
    stale one costs the hit a little fit. A garage product kept at move-out fills a slot as a side product (its
    income only) until you switch it off to make room for a real one.

**Phase D: endings, Absorb, the journey.**
16. *Selling*: an offer comes when the hit takes off: "sell the hit to Big Co, or go big". Accepting asks for
    confirmation that the game ends there, with the final score. Turned down, it comes back larger while you have one
    floor; renting the second ends the offers.
17. *IPO*: the other ending. Once the company is big enough (to set: about 10M users, $1B lifetime, a year in profit)
    you can take it public: a bell-ringing moment, a valuation at a higher multiple, the run's final screen. Endings
    are then sell, IPO, retire or bankruptcy.
18. *Absorb*: buy a rival that competes with the hit. Its best people, by skill, take your empty desks and only
    those (no free desks, nobody comes); a share of its users move to the hit, and its product shuts down (or, with a
    free slot, is kept as a second product).
19. *The journey*: Café → Garage (find the hit) → First floor → Headquarters (1M users, a full building) → Europe →
    Global (10M users, $1B lifetime) → the IPO. You become CEO, and your friend CTO, at Europe. Research items about
    running many products (licensing, the portfolio) are reworked or dropped.

**Phase E: retune** from a run log, as before. Saves become version 6 (the founder, the café, a `fit` per product,
workstreams, capacity, second-product and tool slots); old saves are upgraded with the signature as the hit, a
founder analyst added, and the rest kept as side products or switched off.

**Why hire analysts when you are one** (proposed to the player, 2026-10-23):
- *Your time runs out.* In the garage you study users full time. As the hit's PM you spend half the day steering (as
  PMs do now, `PM_INSIGHT_SHARE`); as CEO or CTO none of it.
- *Act 2 needs far more insight than the garage.* Spending it is what makes the hit's releases count: user research
  on the hit shows which roadmap items its users want most and how much fit each would win; churn analysis shows why
  people leave, so you know which workstream to put a floor on; A/B tests make Growth and Monetisation items pay more;
  a survey of each European audience before localising; a market scan for each second product. Without enough
  insight the roadmap is a guess.
- *Analysts are where PMs come from.* Each second product needs a PM to run it, and the hit needs a new one when you
  move up. Analyst, senior analyst, PM is the only way to grow one, so hiring analysts early is planning ahead.
- In the garage a second analyst is possible but rarely worth one of four desks: that seat is better as a builder.

**Moving up** (decided 2026-10-23): when the company opens in Europe you become CEO and your developer friend CTO;
one of your analysts becomes the hit's new PM.

## Third logged run, and the building pivot (2026-10-21)

**The run** (`lab-tycoon-run-2026-10-21 (1).json`, about 4 hours): 19.4 years, retired as Tech giant with
$39M cash and a worth of $59M. Garage for 4.4 years (contracts until day 611; the save started on the old
$25k), Zebu hit on the third launch, one $740k offer turned down, moved out 70 days later. Europe at 9.3,
offices 3 and 4 on the same day at 10.1, Industry leader 10.1, Tech giant 18.6. 15 products, 5 hits.

What it showed, and what the player said about it:

- **Promotion was the economy**: $99.8M of $170M revenue. A promotion brought users by the product's raw
  reach (Zebu: ~2.8M) while the market only held ~90k for it, so every push was a 4-6x sawtooth in users,
  income and rank.
- **Tech giant could only be bought.** `daysAtTop` reset on any day off #1, the rank swung with the sawtooth,
  so the player held Industry leader 8.5 years and then spent ~$27M in a year on promotions at 25-30%
  effect to stay #1. "There's no way to reach Tech giant if I don't try the manual promotion."
- **Absorb was never used**: the player forgot how it worked and opened offices 3 and 4 once money stopped
  mattering, which closed it; later wondered why the button was disabled.
- **Sold good products for slots** (Dawn, Nebula, a hit) to make more flagships for the climb. Knows small,
  then grow, is better ("cheaper features too") but flagships were simpler; "shrugged" feedback made adding
  every feature feel wrong.
- **People were a number**: 39 left after 6+ years unnoticed; the player refilled headcount.
- **Europe felt the same as the US.** Moving people between regions was never understood, and hiring
  failed silently ("22/24 and can't hire": the US office was selected).
- **Analysts and PMs did nothing visible.** Study results never showed in the New project list on a phone
  (all `.feature .tag` were hidden under 520px), and the list ignored them.
- **Validation messages** sat at the bottom of long modals, out of sight.
- Most fun: nourishing 3-5 products.

### Built from it (2026-10-22)

- **Trailing income.** `trailingIncome` (an average over `INCOME_AVERAGE_DAYS`, `GameState.incomeAverage`)
  drives the ranking, the income goals, the buyout price and worth. A day off #1 costs `TOP_SLIP_DAYS`
  of `daysAtTop` instead of all of them.
- **Promotions sized by the market.** A promotion (and a launch campaign) speaks to its reach but at most
  `PROMO_AUDIENCE` times the users the market holds for the product (`promotionAudience`,
  `campaignAudience`), and is priced from that. `PROMO_KEEP` of the users it brings stay on as regulars
  (`Product.loyalUsers`, part of the target, fading over `PROMO_LOYAL_DAYS` and with staleness). The
  Promote buttons show the expected payback (`promotionReturn`, about 1.5x rested, under 1 soon after the
  last one) and the log records it. Costs (`PROMOTIONS`, `CAMPAIGNS`) were retuned to that.
- **Building more never hurts.** `audienceFit` only rises with features the audience loves; ones they barely
  notice add nothing (`AUDIENCE_FIT_VALUE`; `HIT_AUDIENCE_MIN` is gone). Feedback says "Barely noticed".
- **Studies you can see.** Taste tags show on phones; once studied, the feature list leads with what the
  audience loves and says so. Product managers' effect is spelled out (`pmEffectText`) on the person, the
  office row and the New project summary.
- **Hiring by region**: a US/Europe switch with free desks, defaulting to where there is room; the Team
  dialog explains desks versus *Works on*; other-region desks are marked; a row's controls get their own line
  with several offices (they overflowed on desktop).
- **Messages next to the button**: errors live in the sticky action bar (`.action-note`) or the row.
- **Smaller**: the first buyout offer waits `EXIT_FIRST_OFFER_DAYS` after the hit; demand news at most once
  per `MARKET_NEWS_GAP_DAYS` per type (Web App made the news 111 times); names are never reused in a run
  (`GameState.usedNames`); the monthly log has the average income, Europe users and regulars.

Not retuned yet: late-game income without the pump is much lower, so whether #1 and Tech giant are reachable
needs the next run (bots do not promote, so they cannot tell). Saves stay version 5 (all new fields optional).

### Next: two buildings instead of four offices (agreed direction, needs planning)

The player's pivot: four offices ruin the focus and add nothing. Instead **one US and one European
location, each growing into a building** of up to **5 floors**, seen from outside like Fallout Shelter
(the existing office scene, one 12-desk floor each, turned into a cutaway), **all on one screen without
scrolling**. Decided so far:

- Selling the studio stays open past the garage, until the building: renting one office floor is still the
  early days. The first offer comes some time after the hit, not the day of it (done).
- Teams can be reassigned between products; the design must keep the player acting, not watching
  ("explore options so you are not just an observer").
- Releases stay something the player does, in some form (to explore with the above).
- ~~Stand-ups and coffee breaks affect the team, not only the look~~ (2026-10-22: they are culture, always on, look only).
- A floor holds several things: the team's desks, ~~a meeting room on the right~~ a Scrum board on the right
  (2026-10-22), and coffee and snack machines and coolers along the wall, as in the Focus office, but drawn in the
  cutaway view.
- Europe differs by stricter data rules, its own tastes, and a slightly but noticeably European interior.
- Garage desks are in two rows of two with the pets below (built: the garage always uses the `tall`
  arrangement, cropped like the office so the whole garage stays in view).

- Europe's stricter data rules mean all of: a product needs a compliance feature before it launches there,
  and bugs and breaches cost more there.
- An absorbed rival arrives as a new floor in your building in its region; stage goals that ask for 3 or 4
  offices are replaced (floors, teams, products per team).
- Monthly loop (agreed 2026-10-22): a team owns a product and works on it non-stop under a
  *direction* (Grow, Polish, Keep it running, Expand to Europe) and ships a release on its own every 2-3
  months; the player picks the features of the next release, when to grow, moves teams, picks new products
  and runs the floor (stand-ups, breaks, meeting room). Fewer teams than wanted, and Europe's rules pulling
  Expand against Grow, make the trade-offs.
- Screen size (mockups, 2026-10-22): on a phone, 5 floors fit one screen at about 390x120 px each for one
  building, or 190x120 for both side by side. At a readable size a floor shows about 4-6 desks, not 12, so the
  agreed shape (2026-10-22) is a building overview on one screen (floors with status at a glance), tapping a floor to zoom
  into today's detailed office view, and on phones one building at a time with a US/Europe switch.

Built 2026-10-22 (commits f3b9250 to cb90e79): offices are floors (`REGION_OFFICE_LIMIT` 5 per building, `MAX_OFFICES` 10; selling
stays open until a second floor, `canBeSold`/`closeSale`); `sim/teams.ts` (a floor looks after a product under a direction, ships its own
releases, queued features, stand-up and coffee-break routines); Europe's rules (Privacy compliance before localising, `EU_*` in
`data/regions.ts`, fines on breaches); `render/BuildingScene.ts` + `render-support/building.ts` + `BuildingOverlay` for the street view
(tap a floor to go in, one building at a time on phones). Not done: meeting room, coffee corner and EU interior inside the zoomed-in
floor, watching stand-ups and breaks play out, retuning the first-guess numbers, a phone check of the new dialogs.

## Redesign: two acts (2026-10-18)

From a year-20 playthrough (4 offices, Tech giant, ~80k/day, 75M lifetime, 5 promoted
products, 3 rivals bought). The late game was grinding: promote five products, no
reason to build or keep anything, rival purchases gave nothing, extra offices were
redundant, client work stopped mattering at ~20k/day, and the player never fired
anyone. Hits felt random, and feature choice was "pick the 3-star ones".
Saves are not migrated for this work (one player); old saves load with defaults.

**Shape.** Act 1 is the startup: build products until one clicks. At the garage the
studio can sell (**the fork**); moving out closes that for good. Act 2 is a company
with a few products it cares about, teams that own them, and a long run.

### Built

- **Names.** 247 product words; `freshProductName` (`sim/naming.ts`) avoids every
  name in play, retired or on a rival's list, and falls back to two-word names.
- **Offices.** The offer for a fifth office is hidden at the cap of 4.
- **Hit chance** is explained in the launch dialog (`hitBreakdown`): streak,
  quality, market, buzz, audience fit, and whether it hit the cap.
- **Run log.** `GameState.journal` records every player decision with the cash and
  numbers at the time (`sim/decisions.ts`, written from the store), the sim's own
  events (stage, era, hit, event offered, notices) and a monthly snapshot
  (`sim/journal.ts`). Export it from the Menu or the end screen ("Export run log").
  Capped at `JOURNAL_LIMIT`.
- **Lifecycle.** Decay is about twice as slow (`FRESH_DAYS` 120, `STALE_DAYS` 180)
  and slower again per update (`MATURITY_PER_UPDATE`, up to 4). An update with no
  features is a cheaper **maintenance release** (`MAINTENANCE_TARGET_SHARE`).
  Products show a phase (Launch, Growing, Established, Fading). **Marketing
  automation** (Business research) lets a product promote itself at a chosen tier,
  never below `AUTO_PROMOTE_RESERVE_DAYS` of burn (`autoPromoteDay`).
- **Garage buyout.** Once the garage has a hit earning `EXIT_MIN_INCOME`, a rival
  offers 2 years of income (times a little for reputation); "Not yet" brings a
  slightly better one (+0.2 years, up to 6 times) 90 days later, but buyers lose
  interest `EXIT_WINDOW_DAYS` (540) after the first offer (`sim/exit.ts`, `EXIT_*`).
  Selling ends the run (`GameState.ending`). Moving out clears and closes it (the
  button asks twice). First run's log: the first version (3 years, +0.6 per "no", no
  end date) made waiting in the garage free money (offers $12M to $39M, 89% of the
  final worth), so the player never moved out; hence the flatter multiple and the window.
- **Legacy.** Menu, "Retire and see your legacy" ends the run at any time. Every
  ending (sold, retired, bankrupt) shows the same numbers and a *worth*: cash plus what
  a buyer would pay at the base multiple (`studioWorth`), so runs compare.
- **Promotions wear off** (`promotionEffect`): right after one ends the next brings
  25% of its users, recovering to full over 180 days (`PROMO_*`); a launch campaign
  counts as a promotion. Auto-promotion waits for 80% (`AUTO_PROMOTE_MIN_EFFECT`), so
  about once per product every five months. Bot check: a bot that promotes only when
  it pays reaches ~4.3k/day at year 20, against ~11k when it promoted every time it
  could, so about 60% of that bot's income was promotion spam.
- **Log** also records income per product per month, and logs a launch's breakout.
- **Portfolio.** Outside the garage: 5 live products including ones being made
  (`PORTFOLIO_LIMIT`), one new product per `NEW_PRODUCT_GAP_DAYS` once there are 3.
  Updates and growth are not limited. **Growing** a product (Small, Medium, Large,
  Flagship, in order, at least `GROW_MIN_AGE_DAYS` old, not fading) costs the
  difference between sizes and scales its reach (`growBlocker`, `growTarget`,
  `Project.grows`).
- **Hit gate and growth rolls.** Moving out needs a breakout hit (`moveOutBlocker`:
  `signatureId`), so the garage, which has no new-product limit, is where the hit is
  hunted. Every grow gets its own breakout roll (`shipUpdate`, same `hitChance` as a
  launch, no campaign; a hit multiplies reach by `HIT_REACH` of the new size and
  skips products that already hit). A good grow that misses counts toward the streak.
  The launch dialog shows the chance for grows too. Why: the second logged run
  (office, 7 years) had 8 new-product shots at 2.4% to 29% and no hit (about a 1 in 4
  streak), and a single shot a year felt like too few; growing is the act of caring for
  a product, so it should be a chance for it to take off.

Balance note: with these caps the best bot reaches ~11k/day at year 20 (was ~26k) and
stalls at Industry leader. The bots are cruder than a person (they do not auto-promote
or tune), so retune from a human run and its log, not from the bots.

- **Audiences and feature fit** (`data/audiences.ts`). Each product type has 2-3
  audiences, picked when a product is started and kept for its life. A wide audience
  reaches more people and pays less, a narrow one the reverse. Each values features
  differently (`likes`, default 1): that moves reach (`featureScore`), revenue per user,
  and a new `audience` factor in the hit chance (`HIT_AUDIENCE_MIN/MAX`). The picker
  shows only a hint; after launch the product card says what they loved, shrugged at
  and wished for (`audienceFeedback`). Open: analysts revealing the weights before
  launch, feedback over time, and audience-specific research.

### From the first logged run (sold from the garage at year 11)

Two and a half years of contracts only before the first product; 500 days between
products in years 4 to 7; cash with nothing to buy (875k at year 8, 4.8M at the sale,
all 16 research done by year 10.8); 115 auto-promotions at Large cost $5.97M, half of
the $12.0M lifetime revenue, and the player calls Marketing automation a cheat code
that made income grow exponentially. The player did not know which features affect hit
chance (audiences, below). Nothing in the log says whether a promotion paid back, so
the monthly snapshot now has income per product. Since then: promotions wear off, the
garage sale is flatter with an end date, and products sell by income (all in Built
above). Still open: whether that tamed auto-promotion enough (check against a new log;
otherwise diminishing returns, a cap, or a cost that grows), a garage that has
something to buy (the budget now covers that). The contract-only start stays as it is.

### Built: the roadmap pass (2026-10-20)

Saves stay version 5: every new field is optional or defaulted on load (`dropRemovedContent`).

- **Garage hustle.** Starting a new product, or growing one, costs a *budget*:
  `BUDGET_PER_POINT` (15) per point of work (`projectBudget`), and the bank must keep
  `BUDGET_RESERVE_DAYS` of wages after paying (`budgetBlocker`). `START_MONEY` is 8k, so the
  first product with a few features costs more than the garage starts with and contracts are
  the way in. Updates are free. Bot check: contract-taking bots end up where they were; bots that
  never take client work now go bankrupt in the garage, by design.
- **Knowledge** (`sim/knowledge.ts`). Working days on a product type and on a product make a
  person faster on them (`KNOWLEDGE_*`, up to +12% and +15%); shown on the person's page. A
  *Knowledge base* (research) lets a team keep 40% of a leaver's knowledge (`depart`).
- **Teams.** `Employee.teamId` puts a builder on another office's project (`assignTeam`), at
  `REMOTE_SPEED` (0.9); the Team dialog has a "Works on" select. Desks stay with the office.
- **Analyst and Product Manager.** Roles `analyst` and `pm` (`Employee.analysis`), laptop on the
  desk, no project work. Analysts need the *User research* research and gather insight
  (`sim/insight.ts`): spend `SURVEY_COST` to study an audience, which then shows loved/fine/shrug
  tags in the feature list. Without an analyst, launch feedback arrives over 20/60/120 days
  (`feedbackFor`). A Senior analyst becomes a PM (*Product management* research, `becomePm`, one
  per office, Mid to Lead): hit chance and launch/growth reach go up with their level
  (`sim/direction.ts`).
- **Research as mechanisms.** `stage` gates on nodes; *Audience study* (repeatable, money for an
  audience reveal), *Knowledge base*, *Enterprise sales*, *Licensing programme*, and second and third
  steps of the speed lines (CI pipeline II/III...). `ERA_WAGE_*`: wages rise 12% per early era, 4%
  per late one.
- **Act 2 income.** With *Enterprise sales*, a big client asks for a Large/Flagship product to be
  customised (`ContractOffer.productId`, `sim/contracts.ts`); delivery pays by what the product
  earns and counts as a release of it. With *Licensing programme*, a Flagship can be licensed:
  `LICENSE_SHARE` of its income on top while it stays fresh and clean (`sim/licensing.ts`).
- **Content.** Four more eras (trust years, agent era, spatial years, sovereign cloud; to year 17),
  five product types (Marketplace, Creative Suite, Fintech App, Data Platform, XR Experience),
  fourteen features with audiences, milestones reworked for a portfolio (team of 4, shelf of 5,
  past products count), and "Tech giant" legacy goals that never gate. Newcomer studios are
  generated (`generatedNewcomer`) for eras with no hand-written one.
- **Tests** for the ranking, buyouts, eras, crowding and `settledUsers` (`competition.test.ts`).

Open from the first pass: the audience-weights reveal could also come from a PM automatically; bots
still overexpand late (they hire up to the bank, never fire), so retune from a human run.

### Built: regions, Europe and Absorb (2026-10-20)

- **Two regions** (`Region`, `data/regions.ts`). Offices, rivals and employees have one; the
  garage and first office are US. Each region is a market with **room of its own**: crowding,
  saturation and market weight are per (type, region) (`marketKey`, `marketWeights`), Europe's market
  for a type is `EU_TYPE_SIZE` of the US one, and users pay `EU_PAY` as much. A rival weighs in full
  in its home market and `RIVAL_ABROAD` in the other.
- **Subscribers per region.** `Product.users` stays the total; `euShare` (of reach) and `euUsers`
  say how much of it is in Europe (`usersIn`, `reachIn`, `targetUsersIn`). Europe also has its own
  tastes (`EU_LIKES` on top of an audience's).
- **Localising** (`startLocalisation`, `Project.localises`): a maintenance-sized update per product,
  needs an office in Europe and costs its budget; on shipping the product gains
  `euGain` of reach there and a launch's first users. Products start US-only.
- **Offices.** The second office is Europe (`EU_OFFICE_COST`); the third and fourth are one more in
  each region (`REGION_OFFICE_LIMIT`, `openableRegions`). Hiring pools per region (candidates carry
  a region; European pay is `EU_WAGE`); people only transfer within a region but can work on another
  region's team.
- **Absorb** (`acquire(state, rivalId, keepIds)`, `AbsorbDialog`): from Established company, needs
  the European office first and a place for the rival's region; price is its income times
  `ACQUISITION_DAYS` times its growth; its office opens as yours with 5 to 8 builders who know what it
  made; you keep the products you choose (they take portfolio places); the rest leave with it.
- **Decided against:** a *Subsidiary* option for absorbed studios, and a non-contract way into
  the garage (grants, pre-orders, sponsorship): contracts stay the garage's income.
- **Not built:** regional freshness (a release refreshes both markets) and EU-only rivals'
  products competing outside their region beyond the `RIVAL_ABROAD` weight. Rivals' growth is unchanged (they still reach the cap
  late); the player can buy early, from Established.

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
- **The journey is the point.** (Superseded 2026-10-18: selling the studio from
  the garage is an ending, and the long game gets a legacy summary; see the
  redesign above.) Near the end of the
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
- Under `SALE_MIN_INCOME` ($500 a day; it was 100,000 users, which ignored what a user pays) a product is *retired*: removed, free. At or
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

- **Living products.** (Partly built: slower decay, maintenance releases, phases and
  growing a product into the next size.) A longer life per product: a roadmap of updates that keep
  opening content, slower and more visible decline, a reason to care after the
  last update.
- **People you care about.** Visible skill growth, tenure and promotion stories,
  retirement with a farewell, fewer pointless leavers.
- **Why it worked.** (Partly built: the product card says what the audience loved,
  shrugged at and wished for, and the launch dialog explains the hit chance.) Still
  missing: a post-launch report on what drove quality and users (era fit, crowding),
  and eras that change what sells.
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
- **Hits** (now legible: the launch dialog shows the streak, quality, market, buzz and
  audience factors, and grows roll too; still to retune from a new log):
  `HIT_BASE_CHANCE`, `HIT_CHANCE_PER_MISS`, `HIT_MAX_CHANCE` put the
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

- **Rivals and eras are thinly tested.** `tests/tycoon/rivals.test.ts` covers the
  roster, newcomers, arrival years and launch announcements. Still only exercised by
  the bot runs: ranking (`standings`, `rankingDay`), business growth, `acquire`,
  `data/eras.ts`, crowding, expected-feature penalties and `settledUsers`. Add tests,
  including a save round trip with rivals and an acquisition (do this before building
  Absorb).
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

- ~~The last era starts in year 9~~ Built: eras to year 17.
- **Tech giant has no goals.** The long game stays a journey; the redesign above
  adds a legacy summary and no IPO-style reset. Options still open: an endless mode
  with growing rivals; a legacy / new-studio start.
- Research (16 items) is finished early (by year 10.8 in the first logged run); repeatable research (CI II, III…) is
  not built.
- Only 7 product types and 24 features; era "expected features" stop at the
  platform age. More product types are wanted.
- Milestones were not reworked into the journey: "Fill all 12 desks" and "A real
  team" (5 people) assume the old single office.
- Contracts do not scale into the late game (see the redesign: enterprise contracts).

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
