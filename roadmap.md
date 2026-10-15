# Roadmap

The single source of TODOs: the planned Calendar app and the Software Tycoon
follow-ups. Behaviour of everything else is documented in `README.md`.

## Calendar app (`/calendar`, planned, not started)

Goal: replace Google Calendar for a narrow use: birthdays, one-off appointments
and trips, and the Liverpool fixture list. Google's problems to fix: the whole
month is not visible at a glance, tasks and events are split for no reason, and
the week does not start on Monday by default.

**The hard constraint.** The site is static (GitHub Pages, CSP
`connect-src 'self'`, no backend) and browser data is cleared every week or two.
Events in localStorage alone would be lost, so the backup design is the core of
the feature, not an add-on.

### Product decisions

- **One kind of thing: an entry.** Title, start date, optional end date (a
  multi-day trip), optional time range, optional place and note, a colour tag.
  No task/event split, no checkboxes.
- **Monday first, hard-coded.** No setting.
- **Repeat: none or yearly only** (birthdays), with age shown from the start
  year. Feb 29 falls on Feb 28 in non-leap years. No monthly, weekly or RRULE.
- **Floating local dates** (`YYYY-MM-DD`, `HH:MM`), no timezone model. Imported
  UTC kickoffs are converted to local time at import.
- **Views:** Month (home, the whole month on screen) and an Upcoming list (about
  60 days). Prev / next / Today, keys `←` `→` `T` `N` `Esc`. Multi-day entries
  are bars spanning the week row. Clicking a day opens a panel with its entries
  and a quick-add field. On phones, cells show dots and the day's list sits
  under the grid. ISO week numbers in a slim left column.
- **Liverpool fixtures:** import an `.ics` file. Entries carry
  `source: { id, uid }`, and re-importing replaces only that source's entries by
  UID. **Pasting a feed URL does not work**: the CSP blocks cross-origin fetch
  and most club feeds send no CORS headers. A later option is a scheduled GitHub
  Action that fetches the feed server-side and commits a same-origin file the
  app reads (needs a feed URL).
- **Languages:** English and Russian together in `src/lib/calendar/i18n.ts`.
  Month and weekday names via `Intl.DateTimeFormat`.

### Protection against losing the calendar

1. **Live backup file (desktop Chromium only).** The user picks `calendar.json`
   once with `showSaveFilePicker`; the handle is kept in IndexedDB and every
   change rewrites the file (debounced, about 1 s). Putting the file in iCloud
   Drive, Dropbox or Google Drive syncs it between desktops for free.
   - **Wipe recovery:** clearing site data also deletes the handle, but the file
     survives. The empty state shows a big "Restore from backup file" button
     (`showOpenFilePicker`, readwrite) that loads the data and re-links the same
     file as the live backup. A wipe costs one click and one file choice.
   - **Permission:** after a browser restart Chrome may ask again. The status
     chip turns amber and one click calls `requestPermission`.
   - **Divergence:** the file carries `updatedAt` / `revision`. If it is newer
     than local state, ask: load the file, keep local, or export both. Whole
     file last-write-wins; no tombstone merge.
2. **Always-visible status chip:** green "Backed up · just now", amber
   "Reconnect backup", red "No backup — data lives only in this browser".
3. **Fallback without the API (Android, Safari, Firefox):** manual Export JSON
   and Export .ics, Import, and a nag banner after N days or M unsaved changes.
   On Android, export through `navigator.share({files})` where available.
4. **`navigator.storage.persist()`** on first use. It guards against eviction
   under storage pressure, **not** against clearing data by hand.
5. **Rolling local copy and undo:** a second key `lab:calendar:v1:backup` with the
   last few states (like tycoon's `save-backup`) plus an Undo toast on delete.
   Covers bugs and mis-deletes, not wipes.
6. **Site-wide backup already covers it:** `lab:calendar:v1` matches
   `KEY_PATTERN` in `src/lib/apps/backup.ts` and `groupForKey` gives the group
   `calendar`, so Settings export/import includes it with no change.

**Android is unconfirmed.** I could not find a current statement that Chrome for
Android ships the save/directory pickers (a web.dev page said it was in
progress), and Safari and Firefox do not have them. Feature-detect
(`'showSaveFilePicker' in window`) and fall back to layer 3; check on a real
device before promising anything.

Not doing: cloud sync or a backend, full RRULE, tombstone merge.

### Files

- New: `src/pages/calendar.astro` (shape of `focus.astro`);
  `src/components/calendar/` (`CalendarApp.tsx`, `MonthGrid`, `DayPanel`,
  `Upcoming`, `EntryDialog` on top of `components/apps/Modal.tsx`,
  `BackupStatus`, `RestoreCard`, `useCalendar`);
  `src/lib/calendar/` with `dates.ts` (Monday-first grid, ISO week; may reuse
  `localDay` from `lib/apps/local-day.ts`), `model.ts` (entries, yearly
  expansion, multi-day bar layout), `storage.ts` (key `lab:calendar:v1`, pattern
  of `lib/flash/storage.ts`), `backup-file.ts` (handle in IndexedDB, restore,
  debounced writer, all APIs injectable), `ics.ts` (parse and build), `i18n.ts`;
  `tests/calendar/` mirroring them.
- Changed: `src/lib/apps/tools.ts` (a `TOOLS` entry, unique title and
  description, category `productivity`); `src/types/file-system-access.d.ts`
  (`showSaveFilePicker`, `createWritable`, permissions); `tests/a11y/islands.test.tsx`
  (add `CalendarApp`, en and ru); `README.md` (table row and tree).

### Build order

1. `dates.ts`, `model.ts`, `storage.ts` with tests.
2. Month grid, day panel, entry dialog, upcoming list, i18n: usable on
   localStorage alone.
3. Manual export / import, status chip, persist request.
4. Live backup file and the restore card.
5. `.ics` import and export; Liverpool re-import by UID.
6. Registry entry, page, README, a11y test.

### Verification

- `npm test` and `npm run typecheck`.
- Unit tests: month grids starting on every weekday and 4/5/6-week months; ISO
  week at year boundaries; yearly Feb 29; multi-day bars across week breaks;
  corrupt-JSON fallback; backup-file logic with fake handles (debounce,
  permission denied, newer-file divergence); `.ics` fixtures (folded lines,
  all-day, UTC, malformed) and re-import by UID.
- `npm run dev` at `/lab/calendar`: month fits on screen at desktop and phone
  widths, light and dark, en and ru; add / edit / delete / undo; shortcuts.
- Real-Chrome check (jsdom has no pickers): link a file, edit, see the file
  change, clear site data, reload, restore from file, confirm the live backup is
  re-linked. Then a browser without the API for the fallback banner.

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
  the bottom. Accepted: Tycoon always lays desks out in rows of four, on every
  screen (the automatic one-column switch, `arrange`, was removed); only the
  Focus office uses the one column, on touch screens.
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
