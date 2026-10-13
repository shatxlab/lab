# Roadmap

The single source of TODOs. Only the Software Tycoon list is left; behaviour of
everything else is documented in `README.md`.

## Software Tycoon follow-ups (`/tycoon`, merged 2026-10-12)

Carried over from the standalone repo's ROADMAP.md. Nothing here is blocking:
the game builds, its tests pass and it ships. Ordered by how much it matters.

**Where things stand.** The studio has a real arc: garage (4 desks) → office →
more offices; client contracts; users and bugs on every product; breakout hits;
six journey stages; five rival studios and an industry ranking; eras that shift
demand and expectations; careers from Junior to Lead. Saves are version 3
(`STATE_VERSION` in `src/lib/tycoon/sim/state.ts`); bump it and say so in the
commit whenever the save shape changes.

Tools: `node scripts/tycoon/simulate.ts [years] [seeds] [policy]` (bot players;
with a policy name it also prints the year each stage was reached — the only
balance evidence so far), `node scripts/tycoon/e2e.mjs` after `npm run build`
(real Chrome; `CHROME_PATH`, `E2E_SHOTS=dir`, `--only <scenario>`), and dev URL
shortcuts that use a throwaway game: `?offices=2&stage=3&money=1000000&rep=60`
(dev server only). Art sources (`.aseprite`, large preview, CC0 licence) live in
`art/pixeloffice/`, outside `assets/` so they are not published or precached.

### Play it, then retune (most important)

Balance so far comes only from bots; nobody has played the long journey.

- **Real-time pacing is unmeasured.** A game day is 1.5 s (`MS_PER_DAY`): a year
  is 9 min at 1×, 4.5 at 2×. The best bot reaches *Tech giant* around year 7,
  about an hour at 1× without a pause. Measure hours per stage in real play,
  then adjust stage goals, speeds or `MS_PER_DAY`.
- **The garage is tight.** Start money $25k, projects take 2.5× the work
  (`WORK_SCALE`). Bots that never take client work go bankrupt early, and bots
  that skip contracts never leave the garage (one client job is a stage goal).
  Check the first two months by hand.
- **Money piles up late** (millions by year 10–12); rival buyouts are the only
  big sink. Candidates: pricier offices, upkeep on big products, more to buy.
- **Hits:** `HIT_BASE_CHANCE`, `HIT_CHANCE_PER_MISS`, `HIT_MAX_CHANCE` put the
  first hit at about year 3 for the best bot (range 1.4–8). Decide if that suits
  the Angry Birds story.
- **Rivals** earn from "other business" outside the shared markets, growing
  yearly up to a cap (without it the player passed them all by year 4). Works,
  but abstract, and they do not react to what you do.
- **Wages** grow 12% per era (`ERA_WAGE_GROWTH`); bug-fix sprints leave designers
  idle (split design 10 / engineering 55 / QA 35). Both were judgement calls.
- **Leads are unverified.** An office of more than 4 people works 10% slower
  without a Lead; a Lead needs 80 skill in their discipline; hires start at
  Senior at most (65). Confirm a Lead appears in time, or every big office is
  permanently penalised.

### Test and check gaps

- **No unit tests for rivals or eras:** `sim/rivals.ts` (launches, ranking,
  buyouts, business growth), `data/eras.ts`, crowding, `saturate`,
  expected-feature penalties and `settledUsers` are only exercised by the bot
  runs. Add tests, including a save round trip with rivals and an acquisition.
- **Browser checks do not cover** the breakout, era and stage dialogs, the
  buyout button, promoting a person, the Lead warning, or opening a second
  office from the Team dialog.
- **Phones:** the scene, top bar, project panel and New project dialog were
  checked on a Pixel 9 (installed app) and in emulation. Not checked on a
  phone: the Journey and Industry tabs (wide tables), office tabs, the Team
  dialog's office rows and selects, the client-work list.
- **Tall tablets** (768×1024) keep rows of four desks and show spare floor at
  the bottom; switching to the one-column arrangement sooner (`arrange` in
  `render-support/layout.ts`) would fix it at the cost of smaller people.
- Not tested on iOS Safari.

### Content that runs out

- **The last era starts in year 9** and nothing changes after it: add eras or
  make them cycle.
- **Tech giant has no goals.** Options discussed, not chosen: an endless mode
  with growing rivals; a legacy / new-studio start. The agreed direction is a
  long journey, not an IPO-style ending, so anything here should extend the
  journey rather than reset it.
- Research (14 items) is finished early; repeatable research (CI II, III…) is
  not built.
- Only 7 product types and 24 features; era "expected features" stop at the
  platform age.
- Milestones were not reworked into the journey: "Fill all 12 desks" and "A real
  team" (5 people) assume the old single office.
- Contracts do not scale into the late game.

### From the original plan, not done

- Upkeep on live products beyond bugs and staleness (server bills, support load,
  churn from outages).
- Per-market reputation instead of one number.
- Scenario starts (a downturn, starting in debt).
- Rivals that act on you: really hiring staff away (today only the "Job offer"
  event names a rival), reacting to your hits, going bankrupt.
- A big HQ scene as a late visual reward.
- Staff retirement (people only "move on" after six years).

### Rough edges

- Every rival launch posts a toast; with five rivals that may be noisy. Notify
  only for hits or your own markets.
- Research era-gating reads "Not until the ai wave" (lowercased era name).
- Only two sounds serve all the new events (`ship`, `milestone`); none for a
  hit, an era or buying a rival.
- Stats charts show money and income only; no users, ranking history or
  per-product charts.
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
