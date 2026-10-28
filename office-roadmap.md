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
- **Route is `/office`** (`src/pages/office.astro`). "HR Department" stays a working title.

## Shared core: the roster (`src/lib/roster/`, pure, seeded)

One module every game here can use. Tycoon's `appearanceFor(id)` already gives a person a stable face from an id; the
roster builds on the same idea.

- A coworker: `id`, name, look (from the id), department, 1 or 2 quirks, rarity, stats, level, state (`active`,
  `burned out until day N`, `quit`).
- Departments (Engineering, Finance, Legal, Sales, IT, Facilities, ...). Used for signature weapons now and for
  synergies in the auto-battler later.
- Quirks have an upside and often a downside ("Caffeinated": faster, takes more damage; "Steals lunches": gold
  bonus, morale penalty to neighbours). A codex records every quirk and coworker the player has ever seen.
- Rarity: common, uncommon, rare, legend. Legends are the reason to keep interviewing.
- Save: `lab:roster:v1`, with a tolerant `normalizeSave` like the other games.

## Game 1: the hero run (`/office`)

- **Controls:** drag or virtual stick to move. The hero attacks on its own. A single optional active button (a
  "panic button" on cooldown) at most.
- **A run:** 8 to 12 minutes in escalating waves of office hordes, a mini-boss midway, a boss at the end. Level-ups
  offer 3 picks (new weapon, upgrade, passive), as in Slay the Spire / Vampire Survivors.
- **Signature weapons** by department: the accountant throws spreadsheets (arc, piercing), the intern spams sticky
  notes (fast, weak, homing), the sysadmin drops server racks (area), HR itself waves a policy binder (close
  knockback). Weapons level and combine within a run.
- **Enemies:** Reply-All Storm (swarm), Monday Blob (slow tank), Meeting Invite (summons more), Printer Jam (turret
  that blocks lanes), the Auditor (boss). Each needs a `FOES` entry, a roster rule per wave, a drawing, and a way the
  bot can see it.
- **Between runs:** gold and "performance review" XP raise the coworker's permanent stats and unlock a skill tree.
- **Sim shape** (as in Tower and KingsRoad): `sim/` pure and seeded, `render/` on a plain canvas, a bot in
  `scripts/office/playthrough.ts` that plays whole runs over many seeds so balance is tuned before it is dressed up.
  Hundreds of entities on canvas is the main perf risk: use a spatial grid for collisions from the start.

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

1. Build `src/lib/roster/` (types, generator, quirks, rarity, save) with tests in `tests/roster/`.
2. Build the hero run's sim (`src/lib/office/sim/`): movement, auto-attack, enemy waves, level-up picks, one boss.
   Write `scripts/office/playthrough.ts` and tune the bot's win rate before any art.
3. Placeholder renderer with the existing coworker sprites, then check the run is readable and fun on a phone.
4. Add the HR loop and the quit stakes; tune the quit chance with the bot.
5. English and Russian copy together in an `i18n.ts`, as in Focus.
6. Revisit the auto-battler, then the hospital.
