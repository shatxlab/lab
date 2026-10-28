# HR Department roadmap (working title)

The single source of TODOs and design record for the office-coworker games. Nothing is built yet: this file records what
we decided in the brainstorm so the next session can start without redoing it.

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
  "HR Department" stays a working title.
- **The solutions below to sprites, ids, the sim and bot, run length and starters** were proposed and accepted.

## Shared core: the roster (`src/lib/roster/`, pure, seeded)

One module every game here can use. Tycoon's `appearanceFor(id: number)` already gives a person a stable face from an
id; the roster builds on the same idea.

- A coworker: `id`, name, look (from the id), department, 1 or 2 quirks, rarity, stats, level, state (`active`,
  `burned out until day N`, `quit`).
- **Ids are numbers**, taken from a `nextId` counter in the save, like Tycoon's `Employee.id`, so `appearanceFor(id)`
  works unchanged. Candidates are generated from the save's seeded rng, so ids and faces replay.
- **Departments (built):** Engineering (rubber duck), Finance (spreadsheet), Legal (contract), Sales (business card),
  IT (server rack), HR (policy binder), Interns (sticky notes). Seven, one per Tycoon shirt ramp, so the shirt
  tells the department; Facilities waits for an eighth ramp. Each favours one stat. Used for signature weapons now and
  for synergies in the auto-battler later.
- **Stats (built):** grit (health), output (damage), hustle (move speed), focus (attack rate), luck (gold, better
  picks). Small integers around 10; the hero sim turns them into its own numbers.
- Quirks have an upside and often a downside, in percent ("Caffeinated": hustle +20, damage taken +15; "Steals
  lunches": gold +20, colleagues' quit chance +5; 13 in `data.ts`). Names and lines go in `src/lib/hr/i18n.ts`, not
  the data. A codex records every quirk and coworker the player has ever seen.
- Rarity: common, uncommon, rare, legend (weights 60 / 27 / 10 / 3; more bonus stat points and 2 quirks for rare and
  up). Legends are the reason to keep interviewing.
- Save: `lab:roster:v1`, with a tolerant `normalizeSave` like the other games. It carries a `stakes` flag: off until
  the HR loop exists (see "Starters").

## Game 1: the hero run (`/hr`)

- **Controls:** drag or virtual stick to move. The hero attacks on its own. A single optional active button (a
  "panic button" on cooldown) at most.
- **A run:** about **6 minutes** on normal, so it fits a phone: waves to 2:30, a mini-boss at 3:00, waves to 5:30,
  the boss at about 6:00. Level-ups offer 3 picks (new weapon, upgrade, passive), as in Slay the Spire / Vampire
  Survivors. A longer "Overtime" difficulty (about 10 minutes) can come later for desktop.
- **Signature weapons** by department: the accountant throws spreadsheets (arc, piercing), the intern spams sticky
  notes (fast, weak, homing), the sysadmin drops server racks (area), HR itself waves a policy binder (close
  knockback). Weapons level and combine within a run.
- **Enemies:** Reply-All Storm (swarm), Monday Blob (slow tank), Meeting Invite (summons more), Printer Jam (turret
  that blocks lanes), the Auditor (boss). Each needs a `FOES` entry, a roster rule per wave, a drawing, and a way the
  bot can see it.
- **Between runs:** gold and "performance review" XP raise the coworker's permanent stats and unlock a skill tree.
- **Suspend and resume:** the run state is plain JSON. Save it to `lab:hr:run:v1` on `visibilitychange` / `pagehide`
  and at every level-up, and resume it on load. Closing the tab just before dying therefore does not dodge the quit
  chance: reopening resumes the same moment. **Abandon** counts as falling.

### Starters

The hero run ships before the HR loop, with **3 fixed starters** made by the real roster generator from fixed seeds:
the Intern (sticky notes, easy), the Accountant (spreadsheets, piercing), the Sysadmin (server rack, area).
Performance reviews and the skill tree work from day one; **burnout is on, quitting is off** (`stakes: false`) until
the HR loop lands. The starters are ordinary coworkers in the save, so the HR loop needs no save migration.

### Sim and bot

As in Tower and KingsRoad: `src/lib/hr/sim/` pure and seeded, `src/lib/hr/render/` on a plain canvas.

- **API**, on a fixed timestep like KingsRoad's `STEP`: `step(run, input: { dx, dy })` with the stick normalised,
  and `choose(run, pick)` while `run.pendingPicks` is set (`step` is a no-op until then).
- **Arena:** a walled office floor about 3×3 screens with a camera that follows the hero; not endless, so the camera
  and the bot stay simple. No desks to path around in v1; the Printer Jam is the only blocker.
- **Spatial grid:** 64-unit cells rebuilt every step, for projectile-vs-foe, foe-vs-hero and foe separation.
- **Caps:** 300 foes alive, 200 projectiles; above 150 XP gems, gems merge into bigger ones.
- **Bot** (`scripts/hr/playthrough.ts`, usage in its header like KingsRoad's): steers by a potential field: each foe
  in range pushes away, weighted 1/d²; the nearest gem pulls only when the way to it is clear; a weak pull to the
  centre keeps it out of corners. Picks follow a fixed priority list per starter weapon, like KingsRoad's `PLAN`.
  Prints per seed: survival time, level, cause of death, damage by weapon, and the win rate.
- **Target:** the bot wins about 50–60% on normal. It is sensible but unhurried; a human should do better.

### Sprites

`src/lib/tycoon/render-support/` is pure pixel code (no Pixi): `characters.ts` recolours, and `poses.ts` already has a
walk cycle (`walkA`–`walkD`, `stepA`–`stepD`) for all five characters. `src/lib/hr/render/heroes.ts` bakes each
coworker once at load:

- Load `PixelOfficeAssets.png` as an image, read its pixels, crop the character's `CHARACTER_FRAMES` rect, `recolor`
  it, then `poseFrame` a standing frame and the 4 walk frames, each into an offscreen canvas.
- **Facing left:** draw mirrored (`ctx.scale(-1, 1)`). **Hit:** a baked white silhouette shown for about 80 ms.
  **Falling:** tip over 90° and fade.
- **Scale ×2** (about 30×46 px): readable on a phone with room for the horde.
- **Department at a glance:** `rosterAppearance(id, department)` (built, in `src/lib/roster/appearance.ts`) calls
  `appearanceFor(id)` and replaces the shirt with the department's colour; the sprite and hair stay from the id.
- Foes start as procedural shapes (envelopes, blobs, a printer) until the run is proven fun.

## Game 2: the HR loop (wraps game 1)

- **Daily pool** of candidates. Each shows a CV with some stats visible and quirks hidden.
- **Interview:** spend an action to reveal one hidden quirk. Limited actions per day force choices.
- **Hire, pass, or hold:** hiring costs a signing fee and a daily salary; passing is final for that candidate.
- **Desks:** a cap on the roster. A new hire means someone leaves or the office expands (the budget sink).
- **The risk that makes it fun:** a great CV can hide a bad quirk, a weak CV can hide a legend.
- **Codex and collection:** every coworker and quirk found is recorded; the user chases rarities.

## Stakes ("make hiring matter")

- A coworker who falls in a run is **burned out** for a number of days (cannot be sent out), and has a chance to
  **quit for good**, rising with the run's difficulty and falling with their loyalty / level.
- Quitting is permanent and visible: a goodbye line and a gap on the desk. Legends are worth the risk.
- **Paying to keep someone (decided):** the player can spend gold to cut the quit chance (a raise, a day off), and it
  is expensive: costly enough to compete with hiring and upgrades, so it is a choice made for a legend or a favourite,
  not a routine fee. It gives gold a second sink and makes losing a legend partly the player's call, not only luck.
  Tune the price with the bot so a normal player loses a coworker every few runs and not every run.

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

## Next steps

1. ~~Build `src/lib/roster/` (types, numeric ids, generator, quirks, rarity, the 3 starters, save) with tests in
   `tests/roster/`.~~ Done: `types.ts`, `data.ts`, `generate.ts`, `appearance.ts` (`rosterAppearance`), `save.ts`.
   The starters are Kenji Dubois (Interns, steals lunches), Noor Kowalski (Finance, clock-watcher) and Casey Okafor
   (IT, networker).
2. Build the hero run's sim (`src/lib/hr/sim/`): movement, spatial grid, auto-attack, enemy waves, level-up picks, one
   boss, run snapshot. Write `scripts/hr/playthrough.ts` and tune the bot to the 6-minute run and 50–60% win rate
   before any art.
3. `src/lib/hr/render/heroes.ts` and a placeholder renderer at `/hr`, then check the run is readable and fun on a
   phone.
4. Add the HR loop, turn `stakes` on, and tune the quit chance and the price of keeping someone with the bot.
5. English and Russian copy together in `src/lib/hr/i18n.ts`, as in Focus.
6. Revisit the auto-battler, then the hospital.
