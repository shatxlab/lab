# Roadmap

Status: everything planned has shipped (Flashcards, Focus office, Send to phone,
Charts, the Whiteboard, the CV builder and OCR, with their follow-ups).
**What is left is the Software Tycoon list in §8, and a few optional ideas
noted under each tool.** **This file is the single source of TODOs.** Behaviour
is documented in `README.md`; the entries here keep only the decisions made
along the way and what is still open.

Owner decisions that still apply:

- **New runtime deps are allowed** — keep them small and lazy-loaded. The
  workbench's own dependency freeze stays.
- **The terminal one-liner rule is scoped to the workbench.** Standalone tools
  may do things a terminal can trivially do (timers, generators) when the
  audience is a phone user on the landing page.
- **Everything local-first stays non-negotiable.** No servers: devices share data
  through Send to phone (a QR link), export/import files, or the settings backup.
- **Removed for good (2026-10-13), not to be built:** the Device bridge (Send to
  phone and file export cover the real need: PC to phone), the Photo studio,
  dictation / speech-to-text, and the old parking lot of loose ideas.
- **OCR languages stay English and Russian**, no more.

---

## Shipped, and what is still open

Done outside this list (2026-10-12): **Software Tycoon** was merged in from the
standalone `software-tycoon` repo as `/tycoon` (docs in README.md, open work in §8).

### Workbench

Follow-ups shipped: the "Edit image" label and a skeleton loading state,
set-membership badges in the tray, thumbnails and kind glyphs, the unsaved-changes
`ConfirmSheet`, the beforeunload guard, shared `useSeedAssets`, outputs-tray
thumbnails with `Download all`, diff patch/HTML-report export, **Send to
Flashcards** and **Open in Whiteboard** actions on files, and **Recognize text**.
Dropped by the owner: paste opening Compare, drafts surviving tab switches, and
a separate output stage. Still optional, only if wanted:

- **Session restore** — refresh wipes the tray; a tiny opt-in "restore last
  tray" (names and bytes in memory only) would soften the hard reset.
- **Image print** — page-like kinds print; a photo print is a plausible ask.

### Send to phone (QR link)

Folded into `README.md`. The cap is 2 200 characters at QR error-correction level
**M**, because jsQR fails on every version-23 code at L while M decoded at every
size. Shared pieces: `lib/send/`, `components/tools/SendToPhone.tsx` and
`ReceiveDialog.tsx`. To add Send to another tool: supply a `kind`, a `getData` and
a receive handler. The other direction needs no feature: export a file and move it
however you like. For larger things between tabs on one device there is the
handoff helper (`lib/apps/handoff.ts`), used by Send to Flashcards and Open in
Whiteboard.

### Flashcards (`/flash`)

- **Scheduler:** FSRS-4.5 with the published default weights and no learning steps;
  golden intervals are in `tests/flash/fsrs.test.ts`. *Again* requeues the card a
  few cards later in the same session but schedules it once; cram never changes it.
- **Imports:** paste, or a CSV, TSV, JSON or text file, on the deck list (a new deck)
  or inside a deck; **Send to Flashcards** from the workbench adds the text to a new
  or an existing deck. Decks export as TSV or JSON. Deck moves between devices use
  Send to phone, file export, or the settings backup.
- **Not built:** images, audio, `{{cloze}}`, deck-level tags and filters in study,
  per-deck new-card limits. Never: cloud sync, accounts, plugins.

### Focus office (`/focus`)

Reworked 2026-10-13: it always opens as a full-screen office with generated lo-fi
music and nothing to set up or save (no plan, history or streaks). Start runs the
25 / 5 / 15 flow; giving a Pomodoro up (or the page really going away) sends one of
six people out of the door; with nobody left you hire a new team. The music is
synthesised in the browser: a live stream would break the local-first, offline and
CSP rules. Nothing is open here.

### Charts (workbench capability)

Line, bar, grouped, stacked, histogram and scatter; a pivot ("one series for each
value of" a text column) that is also suggested for long data; settings remembered
per file under `lab:charts:v1`; SVG and PNG export; the validated reference palette
for both modes. Not built: secondary axes (deliberately never), pivoting into a
sheet, and a "Send chart to phone" action (an SVG is far over the QR cap).

### Whiteboard (`/board`)

Rectangle, ellipse, arrow, text and pen; select, move, resize, marquee; undo and
redo; pan and zoom; several boards; SVG, PNG and JSON export. Added 2026-10-13:
arrows that attach to shapes and follow them, snap to grid, bring to front and send
to back, copy / cut / paste across boards (its own clipboard, never the system one),
and **Open in Whiteboard** from the workbench. Never: shape libraries, images,
collaboration.

### CV builder (`/cv`)

Four ATS-safe single-column templates over one schema, printing to a PDF with
selectable text, Word, plain text and a reopenable CV file. Added 2026-10-13: custom
sections (certifications, languages, any heading), real hyperlinks in the Word file,
drag-to-reorder, and import from pasted text (an old CV or a LinkedIn profile, in
English or Russian). No photo field, on purpose. Not built: importing a Word or PDF
file directly (paste its text instead).

### OCR (workbench capability)

`ocr.recognize` on images and scanned PDFs, English and Russian only, with the
engine and language data self-hosted and downloaded on request (`lib/apps/heavy-assets.ts`).
Preprocessing, straightening of tilted pages, columns, tables rebuilt into a `.csv`
spreadsheet, and the words the engine was unsure of boxed on the page. No CSP change
was needed. Not done, on purpose: handwriting, and any other language.

---

## 8. Software Tycoon follow-ups (`/tycoon`, merged 2026-10-12)

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

### 8a. Play it, then retune (most important)

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

### 8b. Test and check gaps

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

### 8c. Content that runs out

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

### 8d. From the original plan, not done

- Upkeep on live products beyond bugs and staleness (server bills, support load,
  churn from outages).
- Per-market reputation instead of one number.
- Scenario starts (a downturn, starting in debt).
- Rivals that act on you: really hiring staff away (today only the "Job offer"
  event names a rival), reacting to your hits, going bankrupt.
- A big HQ scene as a late visual reward.
- Staff retirement (people only "move on" after six years).

### 8e. Rough edges

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

---

---

## Pending decisions

(none)

---

## Cross-cutting prerequisites (build once, reuse everywhere)

1. **CSP / headers:** no change was needed for OCR or the lo-fi music. Screen
   recording, if ever built, would need a `display-capture` permission in
   `assets/_headers`.
2. **Lazy heavy-asset pattern** — built: `src/lib/apps/heavy-assets.ts`. The
   service worker never precaches such files (`EXCLUDE` in `scripts/pwa/integration.mjs`);
   a tool lists its files with sizes, downloads them on request with progress into
   its own cache and offers removal. OCR is its only consumer so far.
3. **Settings backup coverage:** every tool persists under its `lab:<tool>:v1`
   key (flash, board, cv and charts do; focus no longer saves anything) so
   backup/restore carries state across devices. Handoffs and the whiteboard
   clipboard use non-`lab:` keys on purpose: they are transient.
4. **Registry plumbing per tool:** standalone pages follow the README's
   "Adding a new tool" steps (island, page, TOOLS entry with `seo`, i18n,
   tests with `axeViolations()`); a workbench capability follows the workbench
   steps (capabilities.ts + operations/ + operations.ts). Standalone tools of the
   study/productivity kind go in the `productivity` category.
5. **Keep this file current** when something lands: record decisions made during
   the build and fold the shipped behaviour into `README.md`.
