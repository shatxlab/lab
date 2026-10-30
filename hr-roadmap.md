# HR Department roadmap

The single source of TODOs, design record and handoff notes for the office-coworker games. Start with "Status" and "Next
steps", then read "Guide for the next session" (at the end) before changing anything in `src/lib/roster/` or
`src/lib/hr/`.

## Status (2026-10-28)

- **Live and public:** <https://shatx.ru/hr/> (dev: `http://127.0.0.1:4321/lab/hr`, the site's base is `/lab`). Listed
  under Games on the home page (`src/lib/apps/tools.ts`, id `hr`). The user is about to play it on a phone; their
  feedback is the next input.
- **Built:** the shared roster (`src/lib/roster/`), the hero run (sim, bot, renderer, page) with 3 fixed starters, run
  suspend/resume, English and Russian copy.
- **Career slice (2026-10-30, built, not yet committed or deployed):** pick one starter to grow, one run = one day,
  review XP after each run raises career level (+1 stat per level, promotion every 5 levels), foes scale with the level,
  gold is banked in `lab:hr:v1`. See "The career" below.
- **Not built:** burnout, quitting, packs (the gold sink), the interview bosses, the HR loop, stages, weapon
  combinations, the panic button, real foe art, the auto-battler.
- **Commits:** `3ebf673` roster, `2847ae5` sim and bot, `edff191` page and listing (all on `main`, deployed).

## Next steps (start here)

1. **Take the user's phone feedback** on the live run and act on it first. Things already suspected (see "Known
   rough edges"): foes look small, the floor is dim, starters are uneven, the stick's feel and the run length are
   untested by a human. Retune with the bot (see the playbook) before adding features.
2. **Step 4 is half built** (see "The career"). Next in it: **packs**, the gold sink: spend banked gold on a pack of
   candidate cards (daily pool of the HR loop); then **stages** (office areas with a hazard each) and **promotion
   unlocks** (today a promotion is only a title and +2 to the favourite stat). Burnout and quitting stay off until
   there is a bench to swap to.
3. **Step 5: the HR loop** (Game 2 below): a daily pool of candidates from `generateCoworker(save)`, interviews that
   reveal quirks, hire / pass / hold, desks, the codex. Then turn `stakes` on and tune the quit chance and the price of
   keeping someone with the bot (needs the bot to play the meta, not just runs).
4. **Hero run backlog:** even out the starters (the intern is the weakest, not the easiest), weapon combinations
   ("evolutions"), the optional panic button, real foe sprites, a falling animation for the hero, an "Overtime"
   difficulty for desktop.
5. Later: the auto-battler (Game 3), then the hospital (parked).

## Direction (2026-10-30, after the user won with all three starters)

Playtest feedback (phone only): foes are a fine size, the floor's contrast is ok but it is a bit boring, the intern felt
the strongest (the three starters read as three difficulty levels, intern = easy), the run length is right, and the
stick's thumb covered the view near the bottom of the map. The last is fixed (`cameraFor`: on a tall view the hero sits
at 40% from the top and the camera runs past the bottom wall; the stick ring is fainter). Not committed yet.

The shape the user and I agreed on, to build step 4 and 5 toward (the roster, quirks and sim stay as they are):

- **A journey, not a menu.** Play one focus coworker and grow them between runs over weeks, tamagotchi style. One run =
  one day, no real-time gating at first (an energy meter can come later). Growth must be slow: intern to senior takes
  weeks, promotions are milestones that unlock abilities or stages.
- **Coworkers are cards with powers.** The roster is a collection. Gold buys "loot boxes" (packs of candidates), so the
  hire is a reveal ("I just got Steve Dubois!"). Gold only, no real money. The pack is the daily pool of the HR loop.
- **Getting hired is a fight.** A new coworker starts by beating a monster HR or lead (an interview boss), then joins.
- **Difficulty scales and brings new challenges.** Office areas as stages (open space, kitchen with coffee spills,
  server room, meeting room with a projector beam, boardroom boss), each adding one hazard and a few foes. This is also
  the fix for the dull floor and for content running out after a couple of days.
- **Open:** the game's name (the "HR Department" title may change if the focus becomes one character; decide later),
  whether runs per real day are limited, how many foes/upgrades the weeks of play need, the card rarity and pack odds.
- The hospital game is a separate game, parked on its own; it is in this file only because it came up as an idea.

## The career (built 2026-10-30; `src/lib/hr/career.ts`, numbers in `REVIEW` in `sim/balance.ts`)

- **Focus coworker:** the menu first asks who to grow (the three starters); after that only the focus is shown, with
  rank, level, review progress, the day and the savings. "Start a new career" (confirm) resets the roster and career.
  Existing saves started fresh by design (no carry-over from the old version).
- **A run is a day:** the end of a run (win, fall or walk-out) moves `RosterSave.day` on and runs a review.
- **Review XP** = 1 per 5 s survived + 50 for beating the auditor (walking out at once pays 0). XP from level L to the
  next = 60 + 20 L. Each level +1 to a stat (the department's favourite first, then the others in order); every 5
  levels a promotion (Trainee, Junior, Specialist, Senior, Lead, Director) with +2 to the favourite. Pace: about 8 runs to
  the first promotion, about 35 to 40 runs to Senior (level 16).
- **Difficulty:** `difficultyFor(level)` = 1 + 0.04 per level past 1, passed to `createRun`; it multiplies foe hp
  (bosses too) and spawn rate by half of it. `Run.difficulty` is in the snapshot (`RUN_VERSION` 2).
- **Bot check** (`node /tmp/hr.mjs 20 all - <level>`): the bot wins 55% / 63% / 67% / 58% overall at levels 1 / 6 / 11 /
  16. **The intern (Kenji) falls off at high levels** (2/20 at level 16, vs 7/20 at 11): his favourite stat is hustle
  and sticky notes scale poorly with the +1 stat points; look at it before the curve is trusted past level 15.
- **Gold is banked but nothing spends it yet.** The menu shows the savings.

## The idea in one paragraph

You are the HR manager of a chaotic office. Each day you hire quirky pixel coworkers from a pool of candidates; each
coworker is also a **playable hero**. A run is a short fight in which you steer the hero and they attack on their own
(survivors-style, no attack button), levelling up and picking upgrades as the office's hordes close in. Coworkers who
fall can quit for good, so hiring is a real decision. Tone: funny office life, not fantasy. Mobile first, like Tower
and KingsRoad.

## Decided with the user

- **Hero game first.** The auto-fighting hero with RPG elements is what the user craves most; build it before the rest.
- **Hiring must matter.** A coworker who falls in a run can quit for good (see "Stakes"), the desk count is limited
  and every hire costs salary. Hiring is a choice, not a menu.
- **Tone is a funny office.** Enemies and weapons are office things (Reply-All Storm, Monday Blob, spreadsheets,
  sticky notes). No swords-and-dragons.
- **Hospital is parked** (a Theme Hospital style game: rooms, queues, silly illnesses). It is a whole new scene and
  engine; the classic feel is fine when its turn comes. See "Parked".
- **Colony / dungeon sim is a maybe**, not planned.
- **Paying to stop a quit is allowed, and expensive.** See "Stakes".
- **Everything is named `hr`:** route `/hr` (`src/pages/hr.astro`), code in `src/lib/hr/`, the bot in
  `scripts/hr/`, saves under `lab:hr:`. Not "office": `src/lib/focus/office.ts` already means the Focus app's office.
  "HR Department" is the shown title (EN) / "Отдел кадров" (RU).
- **The solutions to sprites, ids, the sim and bot, run length and starters** (below) were proposed and accepted.
- **Made public** on 2026-10-28 at the user's request, to test on prod.

## Shared core: the roster (`src/lib/roster/`, pure, seeded; built)

One module every game here can use. Tycoon's `appearanceFor(id: number)` already gives a person a stable face from an
id; the roster builds on the same idea.

- A coworker (`types.ts`): `id`, name, department, rarity, 1 or 2 quirks, stats, level, xp, status (`active`,
  `burnedOut` until a day, `quit` on a day).
- **Ids are numbers**, taken from a `nextId` counter in the save, like Tycoon's `Employee.id`, so `appearanceFor(id)`
  works unchanged. `generateCoworker(source)` takes any `{ rng, nextId }` (a `RosterSave` is one) and advances both.
- **Departments:** Engineering (rubber duck), Finance (spreadsheet), Legal (contract), Sales (business card), IT
  (server rack), HR (policy binder), Interns (sticky notes). Seven, one per Tycoon shirt ramp, so the shirt tells the
  department; Facilities waits for an eighth ramp. Each favours one stat (`DEPARTMENTS` in `data.ts`).
- **Stats:** grit (health), output (damage), hustle (move speed), focus (attack rate), luck (gold). Base 10, +3 on
  the department's favourite, ±1 jitter, plus rarity bonus points; capped at 99.
- **Quirks:** 13 in `data.ts` (`QUIRKS`), each a set of percent effects on a stat or on gold, xp, damage taken, own
  quit chance, colleagues' quit chance, salary. Every quirk has an upside (a test enforces it). Names and the
  "+20% speed" lines are copy, in `src/lib/hr/i18n.ts` (`quirkLine`).
- **Rarity:** common / uncommon / rare / legend, weights 60 / 27 / 10 / 3, bonus points 2 / 5 / 9 / 14, quirks 1 / 1 /
  2 / 2 (`RARITY`).
- **Starters** (`STARTERS`, `starters()`): ids 1 to 3, each from its own fixed seed, so they never change: Kenji Dubois
  (Interns, steals lunches), Noor Kowalski (Finance, clock-watcher), Casey Okafor (IT, networker).
- **Look:** `rosterAppearance(id, department)` (`appearance.ts`): sprite and hair from `appearanceFor(id)`, shirt from
  the department.
- **Save** `lab:roster:v1` (`save.ts`): `rng`, `nextId`, `day`, `stakes`, `coworkers` (quit ones stay, as a gap on the
  desk), `codex` (`coworkers` seen and `quirks` seen). `defaultSave(seed)` holds the starters; `normalizeSave` repairs
  field by field, drops coworkers without an id or with a duplicate id, and pushes `nextId` past every id in use;
  `recordSeen` adds to the codex once. The page writes the save straight back on first visit, so a new player keeps
  the roster (and rng seed) they were dealt.

## Game 1: the hero run (`/hr`; built)

- **Controls:** a floating stick (it appears where the thumb lands), or arrow keys / WASD. The hero attacks on its
  own. Escape pauses. An optional "panic button" is still only an idea.
- **A run:** about **6 minutes** on normal. The Middle Manager (mini-boss) at 2:30, the Auditor at 5:00, and **the
  audit closes at 7:30**: if the Auditor still stands, the run is lost. Beating the Auditor wins. A typical bot win
  lands around 6:00. Level-ups offer 3 picks (new weapon, weapon level, passive, or a heal / gold when the build is
  full); up to 4 weapons (level 6 max) and 4 passives (level 5 max).
- **Weapons** (one per department; the starter carries its department's): sticky notes (homing), spreadsheet
  (thrown at the nearest foe, pierces), server rack (lands on a nearby foe after a delay, area), policy binder (swing
  around the hero with knockback), rubber duck (orbiting), fine print / contract (slowing, damaging aura), business
  cards (a fan thrown the way the hero faces). **Combining weapons is not built.**
- **Passives:** coffee (cooldowns), gym membership (health), sneakers (speed), lanyard (gem magnet), mentor (xp),
  ergonomic chair (damage taken), power tie (damage).
- **Foes:** Reply-All Storm (swarm), Monday Blob (slow tank, from 1:15), Meeting Invite (summons reply-alls, from
  1:30), Printer Jam (stationary turret that blocks the hero and spits toner, from 2:00, at most 3), the Middle Manager
  (charges) and the Auditor (rings of red tape, cc's a chain of reply-alls every third ring).
- **Suspend and resume (built):** the run is plain JSON, saved to `lab:hr:run:v1` when the page is hidden or closed,
  and whenever a level-up offer appears; the menu then offers "Continue the run". Closing the tab just before dying
  therefore does not dodge the fall. **Walk out** (pause → Walk out) counts as falling. The save is cleared when a run
  ends.
- **Between runs (not built):** gold and "performance review" XP should raise the coworker's permanent stats and
  unlock a skill tree. Today the result panel shows time, level, kills and gold, and nothing is kept.

### Starters

The hero run shipped before the HR loop, with the **3 fixed starters**. The plan for them: performance reviews from day
one, **burnout on, quitting off** (`stakes: false`) until the HR loop lands. The starters are ordinary coworkers in the
save, so the HR loop needs no save migration. As of now none of that meta exists (see Next steps, step 4).

### Sim and bot

As in Tower and KingsRoad: `src/lib/hr/sim/` pure and seeded, rendered on a plain canvas by `src/lib/hr/render/`.

- **Files:** `types.ts`, `balance.ts` (every number), `grid.ts`, `hero.ts` (stats and quirks to numbers), `picks.ts`,
  `run.ts`; `src/lib/hr/snapshot.ts` saves and resumes a run.
- **API**, on a fixed timestep `STEP = 1/60`: `createRun(coworker, seed)`, `step(run, { dx, dy })` with the stick at
  most length 1, `choose(run, index)` while `run.picks` is set (`step` does nothing until then), `abandon(run)`.
- **Arena:** a walled 1400 × 1400 floor; the camera follows the hero and stops at the walls. No obstacles but printers.
- **Spatial grid:** 64-unit cells rebuilt every step, for projectile-vs-foe, foe-vs-hero and foe separation.
- **Caps:** 300 foes alive (bosses and printers may pass it by a few), 200 hero shots; above 150 XP gems the oldest is
  folded into the next.
- **Bot** (`scripts/hr/playthrough.ts`, usage in its header): every 6 ticks it tries 16 directions, looks half a
  second ahead at where each would take it and where the foes would be, and goes the way with the least danger and the
  most gems, clear of the walls and close to its last heading. Picks follow a fixed priority list. Prints per seed how
  the run ended and when, level, kills, gold and damage by weapon; per starter, the win rate and the share of damage
  taken from each foe; overall, the win rate.
- **Target:** the bot wins about 50–60% on normal, wins land around 6:00. It is sensible but unhurried; a human
  should do better.
- **As tuned (30 seeds per starter):** 53% overall, wins at 5:37 to 7:05 (median 6:04). Deaths spread across every
  foe. By starter: Finance 70%, IT 50%, Interns 40%. About 1 second of CPU per run.

### Rendering and page

- `src/lib/hr/render/heroes.ts`: `loadSheet()` reads `PixelOfficeAssets.png` (served from `assets/pixeloffice/`,
  the site's public dir); `heroPixels(sheet, id, department)` (pure, tested) cuts the character out, recolours it,
  and poses a standing frame, the 4 `STEP_CYCLE` strides (from Tycoon's `poses.ts`) and a white silhouette for the
  hit flash; `bakeHero` turns them into canvases. If the sheet fails to load, the hero is drawn as a plain disc.
- `src/lib/hr/render/draw.ts`: `fitView` (about 420 world units across the short side; a wide screen zooms in so
  nobody sees foes spawn), `cameraFor`, `drawRun` (floor, aura, gems, drop shadows, foes sorted by y, hero, ducks,
  shots, foe shots, falling racks, effects, then arrows to off-screen bosses and the stick), `stickInput` (dead zone
  0.15). The hero is drawn at 2 world units per sprite pixel and mirrored when facing left. **Foes are placeholder
  shapes** drawn in code (envelope, blob, calendar, printer, two suits).
- `src/components/hr/HrApp.tsx`: menu (title, how-to, "Continue the run", coworker cards with a pixel portrait,
  quirks, stats, "Send in"), the result panel. `RunView.tsx`: the canvas loop (fixed-step sim, catch-up capped at
  0.1 s), the stick, keys on the window, HUD (clock and next boss, gold, health, XP and level, boss bar), level-up cards,
  pause / walk out, saving the run.
- `src/lib/hr/i18n.ts`: every string, English and Russian together (`HR_TEXT`), plus `quirkLine` and `clock`.
- `src/styles/hr.css` recolours Tower's `tower-*` panels, buttons and run layout (`src/styles/tower.css`) for an office
  at night and adds the cards and bars. The page loads both stylesheets.

## Game 2: the HR loop (wraps game 1; not built)

- **Daily pool** of candidates. Each shows a CV with some stats visible and quirks hidden.
- **Interview:** spend an action to reveal one hidden quirk. Limited actions per day force choices.
- **Hire, pass, or hold:** hiring costs a signing fee and a daily salary; passing is final for that candidate.
- **Desks:** a cap on the roster. A new hire means someone leaves or the office expands (the budget sink).
- **The risk that makes it fun:** a great CV can hide a bad quirk, a weak CV can hide a legend.
- **Codex and collection:** every coworker and quirk found is recorded (`recordSeen` exists); the user chases rarities.

## Stakes ("make hiring matter"; not built)

- A coworker who falls in a run is **burned out** for a number of days (cannot be sent out), and has a chance to
  **quit for good**, rising with the run's difficulty and falling with their loyalty / level. (There is only one
  difficulty today.)
- Quitting is permanent and visible: a goodbye line and a gap on the desk. Legends are worth the risk.
- **Paying to keep someone (decided):** the player can spend gold to cut the quit chance (a raise, a day off), and it
  is expensive: costly enough to compete with hiring and upgrades, so it is a choice made for a legend or a favourite,
  not a routine fee. It gives gold a second sink and makes losing a legend partly the player's call, not only luck.
  Tune the price with the bot so a normal player loses a coworker every few runs and not every run.
- Quirk effects `quitChance`, `teamQuitChance` and `salary` are already in the data for this; the run ignores them.

## Later: Game 3, the auto-battler

A side-view board: your 6 to 8 coworkers on the left, a crisis on the right, a bench below. Drag units into slots
between rounds, then watch the fight. Hook: **department synergies** (three Engineers give a bonus, Finance plus Legal
shield the squad). Pure sim, bot-balanceable, reuses the same roster, so it is cheap once the roster and the hero
sprites exist.

## Parked

- **Hospital (Theme Hospital style).** Rooms, patients with silly illnesses, queues, doctors and nurses, reputation
  and cash. Shares "hire staff with quirks" with the HR loop and the people engine with Tycoon, but needs a room
  placement UI, pathing and a queue sim. Revisit after games 1 and 2.
- **Colony / dungeon sim.** Needs pathfinding, needs, jobs and emergent events. The office in the HR loop could grow
  into a small colony later.

## Guide for the next session (written 2026-10-28, before the user's first phone playtest)

Read this if you are picking the game up. It says where things are, how to run and check them, how the sim works, which
knob answers which complaint, what was tried, and what bites.

### 1. What to do when the user comes back

1. Ask what they felt on the phone: readable? too easy / hard? which starter? where they died? did the stick feel
   right? was 6 minutes right? any stutter? Ask for screenshots if something looked wrong.
2. Place each complaint in the playbook (section 5), change one knob at a time, and check it with the bot over 20 to
   30 seeds per starter so a fix for one end doesn't break the other. Keep the win rate at 50–60% and wins near 6:00
   unless the user asks otherwise.
3. Before building step 4, ask the open questions (section 8): they are design calls.
4. Verify before reporting: `npm test`, `npm run typecheck`, and for UI changes look at the page (section 2). Commit
   only when asked, to `main`, `type(scope): summary` (`feat(hr): ...`, `feat(roster): ...`), staging only the task's
   files (see `AGENTS.md`). Pushing to `main` deploys to prod through `.github/workflows/deploy.yml` (typecheck, test,
   build, GitHub Pages); the user tests on prod.

### 2. Running and checking

- **Tests:** `tests/roster/` (generator, save, appearance) and `tests/hr/` (`run.test.ts` sim, `parts.test.ts` grid /
  hero numbers / weapons / picks, `snapshot.test.ts`, `render.test.ts` view, camera, stick, sprite baking and copy,
  `hr-app.test.tsx` the menu, a run, walking out, continuing). Run just these with `npx vitest run tests/hr tests/roster`.
- **The bot:**
  ```
  npx esbuild scripts/hr/playthrough.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/hr.mjs
  node /tmp/hr.mjs 30            # 30 seeds per starter
  node /tmp/hr.mjs 5 interns verbose   # one department, a line per minute
  ```
  Rebuild with esbuild after every balance change; the bundle doesn't watch.
- **The page:** `npm run dev` serves at `http://127.0.0.1:4321/lab/hr` (the base is `/lab`; `/hr` alone is a 404).
  The user may already have a dev server running on 4321 (`astro dev` refuses to start a second one and says so);
  reuse it rather than killing it. The first request to a new route can take a few seconds to compile.
- **Looking at it headless:** there is no `chromium-cli` here and the Playwright headless shell isn't downloaded.
  What works: require Playwright from
  `/home/shatxme/.local/share/shell-scripts/node/lib/node_modules/@playwright/cli/node_modules/playwright` and launch
  `chromium.launch({ args: ['--no-sandbox'], executablePath: '/home/shatxme/.cache/ms-playwright/chromium-1247/chrome-linux64/chrome' })`
  with a phone context (`{ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }`;
  also try 360 wide, and Russian via `localStorage.setItem('lab:lang', 'ru')`). Drive the stick with `page.mouse`
  down / move / up on `canvas.tower-canvas`; pick with `.tower-choice`; pause with `Escape`. Keep driver scripts in
  `/tmp`, not in the repo.
- **A late run on demand:** play a run in node (bundle a small script with esbuild like the bot: `createRun`, then
  `step` with a circling input and `choose(run, 0)` until `run.time` ≈ 290), print `JSON.stringify(run)`, put it in
  the page's `localStorage['lab:hr:run:v1']`, reload, click "Continue the run". That is how the 300-foe view was checked
  (60 fps in headless Chromium on a desktop CPU). The run's `coworkerId` must be in the roster (1 to 3).

### 3. How the sim works (reference)

- **Tick order** (`run.ts` `step`): fade effects → (stop if over or a pick is waiting) → clock → move hero (and push
  out of printers) → spawn (bosses on time, the horde by `spawnRate`, printers every 25 s) → index the grid → move foes
  (timers: summon / shoot / charge; walk at the hero, stop at its edge; knockback fades; slow resets) and separate them
  → index again → fire weapons → move shots → land racks → move foe shots → contact damage → reap the dead (gems, gold,
  pops; the Auditor's death wins) → collect gems (levels queue picks) → lose at 0 hp or when the audit closes, else
  offer the next queued pick.
- **Units:** world units; the hero's radius is 12; speeds in units per second; damage per hit, contact damage per
  second (`touch`). Foe hp scales with time by `hpScale`, contact by `touchScale`; bosses don't scale; toner and red
  tape don't scale.
- **Hero numbers** (`hero.ts`): `HERO_BASE` (100 hp, 120 speed, ×1 damage, ×1 cooldown, 80 magnet, ×1 xp, ×1 gold,
  ×1 taken), each stat point away from 10 moves its number by 5% (`STAT_STEP`; focus divides the cooldown), then each
  quirk moves its numbers by its percent (`QUIRK_NUMBER`). `run.base` is that; `run.numbers` is `base` with passives
  (`withPassives`), recomputed only when a passive is picked. Gaining max hp heals the difference.
- **Weapons** (`balance.ts` `WEAPONS`): a `pattern` plus `base` numbers and `perLevel` additions; `weaponNumbers(id,
  level)` floors `count` and `pierce`. `fire` handles orbit and the aura's slow every tick and everything else on its
  cooldown (`numbers.cooldown × run.numbers.cooldown`, floor `MIN_COOLDOWN`). A weapon with nothing to aim at stays
  ready instead of wasting the shot. Damage dealt is credited per weapon in `run.dealt`, damage taken per foe kind in
  `run.takenFrom` (the bot's report reads both).
- **Picks** (`picks.ts`): `possiblePicks` = next level of owned weapons / passives below their max, plus new ones while
  slots are free; `rollPicks` draws 3 different ones with the run's rng and tops up with heal and gold.
- **Randomness:** only through `run.rng` (`random(run)` from `src/lib/tower/sim/random.ts`). Never `Math.random` in the
  sim; the replay and resume tests depend on it.
- **State outside the run:** `run.ts` keeps one module-level `Grid` and a `byId` map, rebuilt at the start of every
  phase that uses them. They must never be stored on the run (it must stay plain JSON).
- **Snapshot:** `normalizeRun` accepts only `version === RUN_VERSION` and `status === "playing"`, and checks shape
  shallowly. **Bump `RUN_VERSION` in `run.ts` whenever the `Run` shape changes**; an old saved run is then dropped
  instead of misread.

### 4. Why it is shaped this way (decisions, and what was rejected)

- **A bounded arena, not an endless field:** simpler camera and bot; the walls are part of the dodge.
- **The bot samples directions; a potential field was rejected:** the field version lost to a bot that just walked in a
  circle, because it got pinned and chased gems into the horde.
- **Bosses at 2:30 / 5:00 instead of 3:00 / 6:00:** with the later clock, wins took 7 to 9 minutes; the boss fight
  itself lasts a minute or two.
- **The audit closes at 7:30:** without a deadline one bot run kited the Auditor past 11 minutes.
- **Toner and red tape don't scale with time:** scaled toner made printers a third of all damage taken.
- **Interns is a department** (for the sticky-notes starter); Facilities waits for an eighth shirt colour.
- **Russian "grit" is "Закалка":** "Стойкость" didn't fit the five-across stats row on a 360 px phone.
- **The site's `TOOLS` list was left out until the user said "make it public".**

### 5. Retune playbook (symptom, then knob, in `src/lib/hr/sim/balance.ts`)

- **Too hard / too easy overall:** the Auditor's `hp` (moves the win rate most once builds converge), `hpScale` slope,
  `RED_TAPE.damage`. Earlier tries: Auditor 7000 to 9000 hp with the Auditor at 6:00 → 78–80% wins; 12000 with the
  Auditor at 5:00 → 12%; 7000 at 5:00 → 37%, then 53% after the charge and sticky-note changes.
- **Dies in the first two minutes:** `FOES.replyAll.hp`, `spawnRate` intercept, the starter weapon's base damage.
- **Monday Blobs pile up mid-run:** `mondayBlob.hp` and its `MIX` weight and start time (at 60 hp from 1:00 they killed
  most runs).
- **Printers dominate damage taken:** `printerJam.every`, `TONER.speed` / `damage`, `MAX_PRINTERS`; the bot's printer
  weight in its `danger()`.
- **The Middle Manager kills too often:** `CHARGE.speed` (a charge faster than the hero's 120 can't be outrun) and its hp.
- **Runs too long / short:** `MINI_BOSS_AT`, `BOSS_AT`, `AUDIT_CLOSES`, then the Auditor's hp.
- **One weapon carries every build:** its `perLevel` (the server rack's radius and count growth was the culprit).
- **A starter lags:** its signature weapon's `base` and `perLevel` (sticky notes for Interns). Note the starters'
  quirks differ too (Noor's clock-watcher costs 15% XP and Finance still wins most).
- **Levels come too fast / slow:** `xpToNext`, foe `xp`, `HERO_BASE.magnet`.
- **Hard to read on a phone** (render only, `draw.ts`): `fitView`'s 420 (smaller = zoomed in, but keep the view under
  `SPAWN_DISTANCE.min`, a test checks it), foe drawing sizes (you can draw bigger than the hit radius), `FLOOR` /
  `FLOOR_ALT` colours.

### 6. Pitfalls

- **The base path is `/lab`.** Links and assets go through `withBase` (`@/lib/apps/paths`).
- **The editor's TypeScript diagnostics go stale** after edits made with shell tools (it reported `AUDIT_CLOSES` and
  `FoeShot.from` missing when they existed). Trust `npx tsc --noEmit -p .` / `npm run typecheck`.
- **Copy:** every new string goes in `src/lib/hr/i18n.ts` in both languages; a test checks both have the same keys.
  Check Russian at 360 px wide: it is longer and broke the card layout once.
- **`hr.css` overrides `tower-*` classes** under `.hr-root`; mind specificity (`.hr-root .tower-button` once restyled the
  quiet button; it now uses `:not(.tower-button-quiet)`).
- **Keys are read on `window`** (`RunView`), not the canvas, because the canvas has no focus right after "Send in".
- **Tests stub `fetch`** so the sprite sheet fails to load and the hero is drawn as a disc; `getContext` returns null
  and `requestAnimationFrame` never fires, so the screen stays put.
- **Don't commit build output or driver scripts:** `dist/` is the build; keep Playwright scripts and screenshots in
  `/tmp`.
- **The bot keeps `heading` in a module variable;** fine for the CLI, don't import `steer` into the app.

### 7. Known rough edges (from the headless check, not yet confirmed by the user)

- Foes are small on a phone (an envelope is about 15 px); the carpet is dim and low contrast.
- The intern starter is the weakest of the three by the bot, though meant to be the easy one.
- The hero has no falling animation; the hit flash lasts `HURT_FLASH` (0.15 s).
- Frame rate was measured only on a desktop CPU (60 fps at 300 foes).

### 8. Open questions for the user (ask before building step 4)

- What does a run's gold buy: stat points per coworker, a shared upgrade shop, or both? Is gold per coworker or for
  the whole office?
- How do performance reviews work: XP from runs raising `level`, a point to spend per level, a skill tree per
  department? How big should a reviewed coworker's edge be over a fresh one?
- What is a "day" before the HR loop exists (one run = one day?), and how many days does burnout last?
- With only 3 starters, should burnout be on at all before hiring exists (all 3 burned out = nothing to play)?
- Should the run's difficulty scale with the coworker's level, so progress doesn't make runs trivial?
