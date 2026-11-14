# HR Floors roadmap (`/hr` — the floor-plan refactor)

The design record for turning HR's single-arena day into a **descent through the office floor plan**:
13 floors, a different boss on every one, each with its own look and its own attack. Started from the
decision that a new action-RPG game would be a refactor of HR rather than a sibling game — HR's engine,
meta and art carry the whole thing.

`hr-roadmap.md` stays the handoff record for everything already shipped; this document is the source of
TODOs for the floor-plan work until it ships, after which its sections merge back there.

## Why a refactor, and what carries over

The engine already has every hard part, and the refactor changes none of them:

- `sim/run.ts` — movement, collision, spawning, shots, drops, gems, knockback, charge/summon machinery.
- `render/draw.ts` — camera, stick, arena drawing; `render/heroes.ts` — baked coworker sprites.
- `career.ts` — levels, review XP, promotions, perks, packs, stages. **Untouched by this refactor.**
- The **interview** is already "a short fight against one boss with a thin horde around it"
  (`INTERVIEW` config, boss walks in at `bossAt`, a thin spawn rate while it is out). A floor's boss
  phase **is** an interview fight; the refactor generalises it.
- Killing the boss already ends a fight (`run.ts`: boss death → `won`); for floors it instead opens the
  stairs, and only the auditor's death on floor 13 wins the day.
- `scripts/hr/playthrough.ts` and the sim's purity carry over — balance stays bot-testable.

What changes is the shape around the arena: one time-scaled 450-second session becomes a **floor list**.

## Current state

- **P0 (the floor skeleton), P1 (the thirteen distinct boss skills) and P2 (their looks, intro cards and the
  screenshot rigs) are implemented and verified** — see the sections below; next is the phone playtest, then P3
  (endless floors, loot) is decided against it.
- **P0, in brief:** a day at `/hr` is the thirteen-floor descent: `FLOOR_PLAN` in `sim/balance.ts` (stage, horde
  length, boss kind, boss hp), `spawnFloor`/`floorElapsed` in `sim/run.ts` (the horde ramps within its own floor; the
  floor's boss walks in after the horde and the horde thins to `bossOutShare`; the boss kind is reserved out of the
  horde mix), `descend` (the stairs: next floor, fresh stage hazards, emptied field), floor clears (`cleared` state:
  gems go straight to the hero, a pick offer appears, the arena holds), and the win on floor 13's auditor.
  `RUN_VERSION` is 7; old suspended runs are discarded; `lab:hr:v1` (career, roster) is untouched. Per-floor review
  XP: `reviewXp` gained `floorsCleared * REVIEW.perFloor` (8, hypothesis).
- Foes carry a `boss` flag (floor and interview bosses alike); the old `MINI_BOSS_AT`/`BOSS_AT`/`AUDIT_CLOSES`
  timeline is gone (a day no longer ends on the clock; only interviews keep `closesAt`). The chosen stage only sets
  the day's difficulty; the descent's themes come from the plan.
- **P1, in brief:** six new boss kinds with their own skills (meeting chair, shredder, coffee machine, vending
  machine, printer prime, blob prime), the sysadmin's blink, the auditor's enrage, slow puddles, lobs, armed shots
  and shockwaves — details in the P1 section. `RUN_VERSION` 7 covers the new foe/shot/hazard fields.
- UI: the HUD's clock line shows the current floor's boss countdown during a horde and the floor label once the
  boss is out; the cleared floor shows one panel — floor number, "Floor cleared", the pick offer, the stairs button
  (EN/RU copy together in `i18n.ts`). The result panel gained a floors-reached line.
- Verification: `NODE_ENV=test npm test` passed 244 files / 3,560 tests (HR tests rewritten for floors plus one
  controlled scene per P1 mechanic); `npm run typecheck` and `npm run build` passed. Chromium (Microsoft Edge)
  checks at 360px, EN and RU, passed on the dev server and the production build via `astro preview`
  (`scripts/hr/floors-check.mjs` + `scripts/hr/craft-run.ts`); screenshots inspected.
- Bot numbers (prototype, tuned over four passes, real-device feel pending): level 1 starters over 20 seeds each
  won **54/60 descents (90%)** before the career-curve change (below), deaths only on floors 11–13; day 10–14
  minutes.
- **Career curve check (done):** with the old `REVIEW.difficultyPerLevel` (0.06) the bot's win rate *rose* with the
  career — 96% at level 1, 100% at levels 6, 9 and 12 (15 seeds × 3 starters per level) — the climb made the bot's
  days easier, and the auditor became nearly the only threat (30% → ~50% of all damage taken). Raised to **0.14**:
  level 1 stays 96%, level 6 96%, level 12 91% — the veteran's day is slightly tighter than the first one, deaths
  spread over the descent, and the audit stays the wall. 0.18 was tried and rejected (87% with swarm deaths — too
  squeezed for the bot, likely too hard for humans); interviews at level 12 lose ~2 wins out of 18 per boss
  (baseline was already mixed: 1/6 and 2/6 starters existed at the old curve). Day length still grows gently with
  the level (≈9.5 → 11 min).
- Not done: P3 (endless floors, loot, floor-side unlocks), decided against the phone playtest.

## The shape of a run after the refactor

- A day (one run) is a descent: **13 floors**, each an arena episode ending in a boss.
- A floor has two phases:
  1. **Horde phase** — a shortened version of today's arena (target 45–75 s), with the floor's foe mix
     and a spawn rate that ramps to the floor's number, not to the wall clock.
  2. **Boss phase** — the boss walks in (interview machinery), the horde thins to `bossOutShare`, and
     the fight is about the boss. Killing it ends the floor.
- Between floors: the **floor-clear screen** — the existing three-pick offer (weapons/passives/heal/gold
  via `rollPicks`), plus the floor-clear reward, plus **Descend**. This is where build choices live now;
  mid-arena level-ups keep their pick offer as today.
- **Floor 13 is the audit**: the auditor, the existing final boss, with a second phase. Winning floor 13
  wins the day; dying on any floor still goes to settlement with the XP and gold earned so far.
- **Every floor pays**: review XP is earned per floor cleared (and partial credit for the horde phase),
  not just for winning. A death on floor 7 still advances the career — the career frame "one run = one
  day" survives, the day is just now a floor plan.

## Floor themes reuse the stages

The three built stages become the descent's acts, with their existing art, spawn tables and
`STAGES[x].difficulty`/`xp` multipliers; the audit reuses the day's endgame feel:

| Floors | Theme | Stage art reused |
| --- | --- | --- |
| 1–4 | Open space | `openSpace` |
| 5–8 | Kitchen | `kitchen` |
| 9–12 | Server room | `serverRoom` |
| 13 | The audit | `openSpace` (day's end) |

The chosen stage (level-gated today) picks where the descent is hardest, not where it starts; a stage's
unlock level now shifts the descent's difficulty curve rather than hiding arenas.

## The thirteen bosses — a different look and a different skill on every floor

Existing boss kinds are redistributed and reworked; the gaps get new bosses. Mechanics come first
(P1), distinct looks second (P2), so a playable skeleton ships before art. Numbers are **prototype
hypotheses**, tuned by the bot, not approved balance. Bosses keep their HP (`boss: true` machinery) and
take `BOSS_PUSH`-reduced knockback.

| Floor | Boss | Look | Skill (mechanically distinct from every neighbour) | Art |
| --- | --- | --- | --- | --- |
| 1 | Middle Manager | existing mini-boss sprite | Telegraphed **charge** at where the hero was (`CHARGE`) — the tutorial boss | existing |
| 2 | Meeting Chair | office chair from the furniture sheet, recoloured and enlarged | **Immobile summoner**: never moves, blocks the way, calls reply-alls in waves (`INVITE_SUMMONS` machinery) — kill the summons or eat them | new from furniture frame |
| 3 | Team Lead | existing interview sprite | **Fast repeated charges** (`LEAD_CHARGE`): shorter wind-up, shorter cooldown — dodge training | existing |
| 4 | The Shredder | new: an office shredder with teeth | **Bullet-hell fans**: spits `PAPERWORK` fans in quick sequence, and every few fans a full **360° burst** — position, don't just kite | new sprite |
| 5 | Lunch Monitor | existing kitchen mini-boss sprite | **Charging summoner**: charges, and while walking drops lunch-tray minions — punish the charge windows | existing |
| 6 | HR Manager | existing interview sprite | **Rings of paperwork**: fans, and every `ringEvery` fans a closed `ring` — spacing puzzle | existing |
| 7 | The Coffee Machine | the `coffeeMachine` furniture frame, enlarged | **Lobs + slow puddles**: arcs hot globs at the hero's position (drop pattern); where they land leaves a brief **slow zone** (new mechanic, reuses the weapon `slow` field) | new from furniture frame |
| 8 | Recruiter | existing interview sprite | **Clone floods** (`RECRUITER_CLONES`): the boss hides in its copies — target discipline | existing |
| 9 | The Vending Machine | the `vending` furniture frame, enlarged | **Arcing lob tank**: heavy, slow, lobs cans in high arcs that land where you were — keep moving | new from furniture frame |
| 10 | Printer Jam Prime | `printerJam` recoloured, scaled up | **Mobile turret**: walks slowly, spits toner streams while moving, and periodically coughs up paper wads | recolour |
| 11 | The Sysadmin | existing server-room mini-boss sprite | **Ping fans + blink**: teleports away when the hero closes in — forces ranged play or baiting the blink | existing |
| 12 | Monday Blob Prime | `mondayBlob` recoloured, much larger | **Shockwave rings**: a slow tank whose steps emit expanding damage rings (`RED_TAPE` ring machinery, anchored to the boss) — respect the radius | recolour |
| 13 | The Auditor | existing final boss sprite | **Red tape + reply-alls + enrage**: rings and chains as today, and below half HP phase 2 — `every` shortens, summons double, speed rises | existing |

The alternating rhythm is deliberate: a mobile boss is followed by a stationary one, a shooter by a
summoner, so no two floors in a row teach the same answer. Every 3rd floor's boss is an interview boss
(3, 6, 9 → team lead, HR manager, recruiter), which is why their art and behaviour already exist; the
interview encounter type keeps its own identity (it stays a solo short fight) and simply shares bosses.

New sim mechanics, in total: slow zones (7), the blink (11), the step-shockwave (12), the 360° burst
(4), the boss-anchored lob (7, 9), and the enrage phase (13). Everything else is retunes of existing
fields in `FOES`/boss constants.

## Difficulty model

- Per-floor difficulty = `difficultyFor(level, rarity, stage, perks)` (career scaling, unchanged) × a
  floor factor within its act. Time no longer scales the whole run; a floor's horde phase ramps only
  within itself (`hpScale`'s horizon shrinks to the floor's length).
- Boss HP per floor is a table in the new `FloorPlan` (see below), so the bot can tune one column.
- A floor's foe mix comes from `MIX`, re-weighted per floor: the act's stage foe set, with the floor
  number picking the cutoff. New enemy *kinds* are explicitly out of scope for P0–P2.

## Implementation plan

### P0 — floor skeleton (playable vertical slice) — done, see Current state

Sim first, reusing existing bosses as stand-ins so the structure is testable before any new mechanic:

- `Run` gains `floor` and a `phase` (horde / boss / cleared); a `FLOOR_PLAN` table in
  `sim/balance.ts` — per floor: stage theme, horde length, foe-mix weights, spawn ramp, boss kind,
  boss HP, reward.
- Horde phase = today's arena logic with the floor's schedule; boss phase = the interview machinery
  (`bossAt`, thin spawns) generalised to any floor.
- Boss death → floor cleared → stairs; floor 13's auditor death → `won`. `AUDIT_CLOSES` is retired as a
  run-length timer (no floor has a wall-clock cap; the horde phase has its own schedule).
- Floor-clear screen: picks + descend; death mid-descent → settlement with per-floor XP
  (`reviewXp` gains a floors-cleared term; `STAGES` multipliers apply per floor's theme).
- Save migration: the suspended-run envelope bumps a version; old suspended runs are discarded
  gracefully (crossword-v2 precedent). `lab:hr:v1` (career, collection, roster) is untouched.
- `scripts/hr/playthrough.ts` learns floors: report "starter × seed → floor reached", run 20–30 seeds
  per starter as usual.
- Tests: floor schedule determinism (same seed → same floors), phase transitions, boss-in/thin-spawn,
  per-floor XP, migration, settlement on death at floor N, EN/RU copy.
- Verify: `NODE_ENV=test npm test`, `npm run typecheck`, Chromium EN/RU at 360px/390px on dev and the
  production build via Astro preview; bot runs over seeds. No balance verdict from one seed.

## P1 — thirteen skills (mechanics) — done, see Current state

- Implemented: the six new boss kinds with their own skills — **meeting chair** (F2: immobile, blocks the way,
  summons reply-alls), **shredder** (F4: immobile; sleeps outside a 300-unit wake, sweeps single fans alternating
  sides, bursts a 10-shot ring every fourth fire; its shots arm after 60 units of flight, so hugging the machine is
  safe and stepping out is not), **coffee machine** (F7: immobile; lobs a glob where the hero stands; the landing
  hurts the splash and leaves a drying slow puddle), **vending machine** (F9: immobile tank; lobs cans in arcs where
  the hero was — no puddle, more hurt), **printer prime** (F10: walks, spits 3-shot toner streams, coughs up paper
  trails every fourth fire), **blob prime** (F12: slow tank whose timer sends an expanding shockwave ring that hurts
  while the band passes). Plus **blink** for the sysadmin (F11: teleports away when the hero closes in, 5 s
  cooldown) and the **enrage** for the auditor (F13: below half hp — 0.6× timer, 1.3× speed, doubled chains, red
  eyes and a hot ring so it reads). Immobile bosses block the hero like printer jams; puddles are a new hazard
  kind that dries (`Hazard.life`); lobs are foe shots with a `lob` payload (flight, splash, puddle radius).
- The floor plan now reads: 1 middle manager, 2 meeting chair, 3 team lead, 4 shredder, 5 lunch monitor, 6 HR
  manager, 7 coffee machine, 8 recruiter, 9 recruiter, 10 printer prime, 11 sysadmin, 12 blob prime, 13 auditor.
- Tuned by the bot over four passes (20 seeds per starter at level 1): the shredder's first two designs were walls
  (22/30 and 10/30 deaths on floor 4) until the wake + alternating single fans + arming distance; the auditor took
  a 3600 → 3200 hp trim. Final: **54/60 descents won (90%)**, deaths only on floors 11–13 (the audit ~17% for the
  spreadsheet starter); day 10–14 min. At career level 6 the bot won 30/30 and at level 11 10/10 — the bot's higher
  levels carry the difficulty better than its level 1; a human playtest decides whether the early floors are now
  too easy.

## P2 — thirteen looks (art + copy) — done, see Current state

- The furniture bosses wear the pack's own sprites: `render/bosses.ts` cuts the meeting chair, the coffee machine
  and the vending machine out of `PixelOfficeAssets.png` (the sheet is already loaded for the hero's frames), and
  `drawFoe` draws them scaled (`BOSS_PIXEL`) with the shape stand-ins as fallback when the sheet fails. The other
  bosses stay drawn from shapes, each distinct: the shredder dark with teeth and a blinking light, the printer
  prime dark purple, the blob prime huge with a frown, the auditor with red eyes and a hot ring once enraged.
- **Intro cards**: as a floor's boss walks in, a small non-blocking card shows the floor, the boss's name and one
  line of how to fight it (`bossHints`, EN/RU together in `i18n.ts`); it fades itself out, and
  `prefers-reduced-motion` gets a static card. The cleared floor's panel gained the next-floor line
  (`nextFloor`), and the menu's how-to now describes the descent instead of the old audit clock.
- Every boss phase screenshotted: `scripts/hr/craft-boss-runs.ts` crafts a run JSON per floor sitting exactly in
  the boss phase, and `scripts/hr/boss-shots.mjs` resumes each one, pauses over the phase (a parked hero would be
  eaten by the swarm) and shoots all thirteen — inspected, both the sprites and the intro cards read well.
- While checking the shots against the plan's table, the vending machine turned out to have been dropped from the
  floor plan during tuning (floors 8 and 9 were both recruiters); floor 9 is the vending machine again
  (`bossHp` 850), and the bot re-run kept the descent inside the guideline: 51/60 at level 1 over 20 seeds per
  starter, deaths on floors 4, 10, 11 and mostly 13.
- Verification: `NODE_ENV=test npm test` 244 files / 3,560 tests, `npm run typecheck`, `npm run build`, and the
  EN/RU Chromium checks on the production preview (floors-check ALL OK) all passed.

### P2 (historical plan) — see the record above for what landed and how it was verified.

### P3 — after the descent (separate, decide later)

- **Endless floors** past 13 for endgame play (stretch goal; the plan table must make it trivial to
  generate).
- A real **loot/equipment layer** on top of weapons and passives — deliberately deferred until the
  floor structure is fun on its own; itemisation would otherwise mask pacing problems.
- Floor-side unlocks in packs (boss cards, floor shortcuts), the boardroom as a fourth act, and the
  pending HR items that this refactor touches (the HR loop, weapon combinations) are re-planned against
  the floored day in `hr-roadmap.md` terms once P0–P2 land.

## Non-goals for this refactor

- No new weapons, passives or foe kinds in P0–P2 (retunes only); no itemisation before P3 is decided.
- No changes to `career.ts` semantics: same XP curve, same promotions, packs, perks, stages, interviews.
  Only the *sources* of XP within a day change.
- No new stages' art beyond the bosses above; no procedural room generation — each floor is one arena
  episode, the stage sets are the variety.
- No second game: `/hr` stays one route, one save family; nothing is forked out of `lib/hr/`.

## Guide for the next session

1. Play the tuned P0 on a real device and decide the day's length by feel (bot says 9–16 min; the horde spans are
   `FLOOR_PLAN`'s first column and the boss hps its last).
2. Then P1, one mechanic at a time (risk order: slow zones 7, lobs 7/9, burst 4, shockwaves 12, blink 11, enrage
   13), each with its telegraph and controlled sim tests; bosses on floors 3/6/9 keep their interview identity.
3. Then P2: furniture-frame bosses (2, 7, 9) via the existing cut/recolor pipeline, the shredder (4) drawn from
   shapes, recolours (10, 12), intro cards with EN/RU copy together.
4. Keep this document's Current state current: what landed, what was verified, what was deliberately not done.
