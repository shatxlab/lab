# Roadmap

TODOs for the planned Calendar app. The Software Tycoon follow-ups live in
`software-tycoon-roadmap.md`. Behaviour of everything else is documented in
`README.md`.

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
  of `lib/board/storage.ts`), `backup-file.ts` (handle in IndexedDB, restore,
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
