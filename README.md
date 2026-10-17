# Local Lab

A local-first toolbox of free browser tools, shipped as **one application**.
Every tool runs entirely in your browser tab — files are parsed and rendered
locally, your files stay on your device, and no accounts or telemetry are involved.

## Tools

| Route | Tool | What it does |
|---|---|---|
| `/tools` | Workbench | One page for every file. Drop or paste files; one file is selected at a time and its actions appear as tabs, with the best one already open. Actions over several files (merge, compare, image batch) appear when the selected file is part of a matching set. **Open** (PDF, Word, spreadsheets, JSON/YAML/TOML, Markdown, HTML, text): Preview with *Save as* (CSV/JSON/XLSX, HTML/Markdown/text, JSON ⇄ YAML ⇄ TOML) and *Print*, or Edit (source, JSON, sheet grid, Word rich text) and save a copy. **EPUB:** read with chapter navigation, in-book search, bookmarks, themes and remembered position. **PDF:** merge, split and sign. **Images:** convert, resize, compress, strip EXIF/GPS, one or many at once. **Recognize text** (OCR) reads a picture or the pages of a scanned PDF, in English and Russian, on the device. **Charts:** a spreadsheet becomes a line, bar (grouped for several series), histogram or scatter chart, guessed from the data and adjustable, with a data table, SVG and PNG export. **Compare** two files by content (JSON pretty-printed, sheets as CSV, Word as text). **Without a file:** compare two texts, create a QR code. Anything a one-line terminal command does (hashes, Base64, UUIDs, regex, word count, case conversion, QR scanning) is deliberately left out. |
| `/focus` | Focus office · Офис фокуса | A Pomodoro timer with stakes and lo-fi music, always open in a full-screen pixel office. Press Start and follow the 25/5/15 flow (a break after every Pomodoro, a long one after every fourth); during a break people go for coffee, water, a sit on the sofa, a book or a snack; give a Pomodoro up and one of the six people packs a box and walks out the door, and when the office is empty you hire a new team. Music is generated in the browser. Pause, skip breaks, mute, the countdown in the tab title. Nothing is saved. |
| `/board` | Whiteboard · Доска | A deliberately small whiteboard: rectangles, arrows and text in white chalk on a dark board, one line weight, undo and redo, one button that clears the board and one that downloads a PNG. Dragging an element moves it, dragging the empty canvas moves the board; two fingers or Ctrl and the wheel zoom. One board, saved in the browser. |
| `/alias` | Alias word game | Bilingual (English/Русский) party word-guessing game: ten themed decks of 1000+ words each, team scoring, timer, keyboard shortcuts, synthesised sound feedback, and a results list where any word can be re-marked as guessed or skipped. Reaching the target score ends the game only after the whole round is played, so the highest score wins. |
| `/crossword` | Кроссворд · Crossword | 50 crosswords in each of Russian and English, played with the phone's own keyboard: a tap-friendly grid, a clue card above the board, locking of solved words, hints, mistake checking and progress saved locally. |
| `/couples` | Игры для пар | Couples games in Russian and English — «Норм или стрём» / "Normal or Nah", «ИлиТо» / "This or That" and «Кто из нас» / "Who of Us". Thousands of prompts across ten themes, secret two-player voting with an agreement score, or a shared-answer discussion mode with a conversation-starter line on each hand-written card. |
| `/tycoon` | Software Tycoon · Империя софта | A management sim about running a small software studio: hire a team, pick a product and its features, watch Design / Engineering / QA fill up, ship, and grow from a garage through offices to a company while rivals and events push back. The PixiJS office scene animates your staff; the whole simulation is pure TypeScript with an autosave to local storage. |

`/` is the landing page listing the tools, grouped by category.

### Site-wide features

- **Command palette** — `Ctrl/⌘+K` on any page: fuzzy search over every tool
  (EN/RU titles and keywords) plus actions (toggle theme, switch language,
  export/import settings).
- **Settings backup** — the header database button exports everything lab
  keeps in `localStorage` (keys starting with `lab:`, plus the reader's
  `epub-reader:`) as one JSON file, and imports it again with a choice of
  *merge* (imported values win) or *replace*.
- **Installable and offline** — a manifest and a service worker precache every
  page and script, so the whole site works offline after the first visit.
  Updates are downloaded in the background and applied when you accept the
  "new version" prompt.
- **Accessible** — skip link, visible focus rings, `prefers-reduced-motion`,
  labelled controls and live regions; AA colour contrast is checked in the
  light and dark themes.

## Run

```sh
npm install
npm run dev      # http://127.0.0.1:4321
npm run build    # static output in dist/
npm start        # preview the built site (astro preview)
npm test         # unit tests (vitest)
npm run typecheck # tsc over .ts/.tsx
npm run check    # astro check (adds .astro templates)

# `dev` and `build` first copy PDF.js's fonts/CMaps/WASM into assets/pdfjs
# (scripts/copy-pdfjs-assets.mjs). That folder is generated and git-ignored.
```

## Deploy

The build is **static**: no server, no database, no session state. `npm run
build` writes `dist/`, which can be served by any static host or CDN.

This repo is set up for **GitHub Pages**. `astro.config.mjs` sets `site` and
`base` for the project page at **https://shatxlab.github.io/lab/**, and
`.github/workflows/deploy.yml` builds and publishes `dist/` on every push to
`main`. Enable it once under **Settings → Pages → Build and deployment →
Source: GitHub Actions**.

A strict Content-Security-Policy is emitted as a `<meta>` tag at build time
(Astro hashes its own inline scripts), so it stays in sync automatically.
`assets/_headers` carries the headers a `<meta>` tag cannot express
(`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `nosniff`,
HSTS, immutable caching for `/_astro/*`) for hosts that understand the
`_headers` convention (Netlify, Cloudflare Pages). GitHub Pages ignores
`_headers`, so those extra response headers are absent there — the CSP
`<meta>` policy still applies. On a host without `_headers` support,
translate that file into the platform's header configuration.

### Offline support on GitHub Pages

The service worker is generated at build time (`scripts/pwa/`) and served from
`/lab/sw.js`, so its scope is the project page only. GitHub Pages sends
`Cache-Control: max-age=600`, which means a new deploy can take up to ten
minutes to be noticed by returning visitors — that is why updates are announced
with a prompt rather than applied silently. `localStorage` is shared by every
project under `shatxlab.github.io`; all lab keys are prefixed (`lab:`) to avoid
clashes.

## Structure

Single Astro + React islands app (Node ≥ 22.12). Static output; every tool is
an interactive island, everything else is pre-rendered HTML.

```
src/
  components/apps/   EPUB reader, header controls (command palette, settings
                     backup, language/theme), PWA registration, tools grid
  components/workbench/ The /tools workbench shell + one operation per capability
                     (operations/: open, compare, QR, PDF, image, charts, OCR, DOCX editor, reader)
  components/tools/  Shared tool UI (ToolPage, FilePicker, tabs, menus, diff view)
  components/viewer/ Document renderers used by the workbench (PDF, image, sheet, JSON, …)
  components/board/  Whiteboard island (shell and the Workspace canvas with its toolbar)
  components/focus/  Focus island (the room, flow panel; FocusScene hosts Tycoon's Pixi office)
  components/alias/  Alias game island (setup, round, results screens)
  components/crossword/ Crossword island (picker, board, grid, clues, completion)
  components/couples/ Couples game island (menu, setup, play, summary)
  components/tycoon/  Tycoon game island (React port of the Preact UI; TycoonApp
                      is the bootstrap that mounts the store, autosave and Pixi scene)
  lib/apps/          EPUB parsing + shared app logic: tool registry (tools.ts),
                     theme/lang, file open, settings backup, command-palette search
  lib/viewer/        Document parsing/rendering/export logic (+ PDF.js loader)
  lib/text/          diff engine
  lib/convert/       JSON / YAML / TOML parsing and conversion
  lib/qr/            payload builders, QR matrix + SVG
  lib/image/         EXIF reading and lossless stripping, resize plan, canvas pipeline
  lib/pdf/           page-range parsing and pdf-lib operations
  lib/workbench/     asset model, capability registry, operation registry, i18n
  lib/charts/        sheet → typed columns, chart spec + shape detection, scale/tick math, SVG builder, palette, export, i18n
  lib/send/          "Send to phone" payload codec (size-capped, defensive) + fragment hook
  lib/board/         element model, geometry/hit-testing, history, viewport, gestures, SVG output, storage, i18n
  lib/focus/         timestamp-based flow state machine, seeded office, lo-fi score and Web Audio player, cues, i18n
  lib/alias/         Game engine: words, deck, scoring, i18n, sound, storage
  lib/crossword/     Generated puzzles + word bank, grid builder, reducer, i18n, sound, storage
  lib/couples/       Seed vocabulary + prompt builder, deck, i18n, sound, storage
  lib/tycoon/        The whole game as pure TypeScript: sim/ rules (all tunables in
                     sim/balance.ts), data/ content tables, save.ts (versioned save/load
                     + one-time migration from the standalone app's software-tycoon:* keys),
                     store.ts (game loop, speed, dialogs), audio.ts (synthesized sound),
                     render/ + render-support/ (PixiJS office scene), signals.ts (a tiny
                     stand-in for @preact/signals so the engine keeps its semantics)
  lib/limits.ts      raw-file + ZIP decompression caps for untrusted input
  layouts/           ToolsLayout (shared header, theme, CSP-tied prepaint)
  pages/             one .astro per route + manifest.webmanifest.ts
  styles/            apps.css (design tokens, header, a11y base) + viewer.css
                     + tools.css + alias.css + couples.css + crossword.css
                     + tycoon.css (the game's own dark palette,
                     scoped to .tycoon-root)
scripts/             crossword generator, PDF.js asset copy, pwa/ (service worker
                     generator, Astro integration), tycoon/ (headless balance
                     simulator, Chrome smoke test)
assets/              static files served at / (favicon, icons, _headers)
tests/
  apps/              theme + EPUB unit tests
  viewer/            document viewer unit tests
  alias/             deck, scoring, storage, sound and render tests
  couples/           prompt counts/uniqueness, deck, storage, sound, layout and flow tests
  workbench/         capability registry, shell and per-operation UI tests (jsdom)
  convert/ qr/ image/ pdf/ focus/ send/ charts/ board/  logic tests per tool
  a11y/              axe-core checks of every tool's first screen + CSS foundations
  pwa/               service-worker behaviour, manifest, registration prompt
  helpers/           shared mount/click/type/axe helpers
```

### Alias word data

Each theme is a shared core vocabulary plus its own theme-specific list, so
all ten English and all ten Russian decks clear the 1000-word target without
duplicating data. `tests/alias/words.test.ts` enforces the minimum count, clean
single-token words and a repeat-free pool per language. Word lists are plain
template strings in `src/lib/alias/words/{en,ru}.ts`.

Within a game, a shuffled session deck plus a used-word set means a word is
never shown twice until the entire pool is consumed. Skipped words are dropped
for the session rather than re-queued.

The target score does not end the game mid-round: every team plays the same
number of turns, and once a full round is complete the highest score above the
target wins. This stops the team that happens to play first from winning just
by crossing the target first.

### Couples games

The three games (`Норм или стрём`, `ИлиТо`, `Кто из нас`) share one loop: a
card is shown, the first partner answers, the phone is passed under a cover,
the second partner answers, and the reveal shows whether they agreed. In the
`Вместе` mode there is no handoff — the couple discusses and casts one shared
answer, and the summary recaps their joint picks.

Prompts come from two sources, chosen per theme by `lib/couples/questions.ts`.

**Hand-written cards** (`lib/couples/cards/<lang>/<theme>.ts`) are whole
sentences written natively for each language, each with a `followUp` line that
the `Вместе` mode shows as a conversation starter. A card is worth keeping when
couples would honestly answer it differently, it describes a concrete scene,
it reveals something about the two of them, and it carries one idea. The
`conflict` theme is migrated; register a theme in `cards/index.ts` to switch it
over. `tests/couples/cards.test.ts` lints them (length, duplicates, repeated
openings).

**Generated cards** serve every theme not migrated yet. Rather than committing
literal strings, `questions.ts` expands a compact seed vocabulary (`vocab/`) at
load time into **300 prompts per game per theme**. `norm` and `who` are built
from *coherent scenario frames*: a sentence pattern whose verb fits every
object in its slots, crossed to produce concrete situations («Есть {a} с {b}»
× блюда × добавки). Both games share a theme's object lists, so one seed feeds
«Есть пиццу с ананасами» and «Кто из нас скорее съест пиццу с ананасами?».
`either` pairs two options from the same dilemma axis. A seeded PRNG makes the
expansion byte-for-byte deterministic, so the browser and the tests always see
the same deck; cards carry their seed object as a `group` so a deal never
repeats the same object with a different tail.
`tests/couples/questions.test.ts` enforces the per-theme counts and global prompt
uniqueness. A mixed «все темы» deal takes turns between themes, so a small
hand-written theme is not drowned out by a large generated one.

### Crosswords

The 50 boards and their clues are generated from a harder Russian word bank
(`src/lib/crossword/wordbank.ts`) by `scripts/generate-crosswords.mjs`
(`npm run gen:crosswords`), which writes `wordbank.ts` and `puzzles.ts`. The
generator uses a crossing-first greedy search and rejects grids with fewer than
eight words or a fill below 40%. `buildPuzzle` derives the grid, the crossings
and the classic numbering, and throws if two answers ever disagree on a letter.
`tests/crossword/` rebuilds every puzzle, exercises the reducer (typing,
backspace, navigation, hints, solved detection, locking) and checks the
localStorage round-trip. The board types with the phone's stock keyboard by
parking one invisible `<input>` on the active cell, so no custom on-screen
keyboard is needed.

### Software Tycoon

The game came in as a separate Preact/Vite PWA
(https://github.com/shatxlab/software-tycoon) and was rebuilt as an island:
the engine and UI were ported to React 19 (`lib/tycoon/` +
`components/tycoon/`), `@preact/signals` was replaced by a tiny stand-in
(`lib/tycoon/signals.ts`) so the engine keeps its semantics, and the PixiJS 8
office scene is loaded lazily in the island's second effect so pixi never
enters the initial chunk. The page mounts `client:only` because the game
touches `window`/`localStorage` and pixi must not SSR.

The art is the **Pixel Office** pack by [2dPig](https://2dpig.itch.io/pixel-office),
CC0, included unmodified in `assets/pixeloffice/` (`PixelOffice.png` room art
and `PixelOfficeAssets.png` sprites), loaded via `withBase('/pixeloffice/')`.
The `.aseprite` sources, the large preview and the CC0 licence text are in
`art/pixeloffice/`, outside `assets/` (the public dir) so they are not published
or precached.

Autosaves and the mute flag live under the `lab:tycoon:*` keys, and on first
run `save.ts` migrates a save left behind by the standalone app from its
`software-tycoon:*` keys. The CSP needs `worker-src 'self' blob:` because
pixi decodes textures in blob: workers. Two scripts ship with it:
`node scripts/tycoon/simulate.ts [years] [seeds] [only]` plays bot strategies
against the sim as a headless balance check, and
`node scripts/tycoon/e2e.mjs` (after `npm run build`) drives real Chrome
through the game's scenarios; its PWA scenario from the standalone app is not
ported because the lab's own service worker covers it.

### Whiteboard

One board, no options. A board is a list of elements (rectangle, arrow, text) in
drawing order, drawn in white at a single line weight (7) and text size (36) on a
dark surface that stays dark in both site themes (`lib/board/model.ts`).
Rendering is SVG nodes, not canvas: `lib/board/svg.ts` describes each element
once as a node tree, which the page turns into React elements and PNG export
serialises into a standalone SVG (drawn through a canvas), so the picture is the
board. Pointer handling is pure functions in `lib/board/gesture.ts`: with a tool
picked, a drag draws one rectangle or arrow and the tool lets go again; with no
tool, a drag on an element moves it and a drag on empty canvas moves the
canvas. A click on text edits it, and the text tool places new text. Two fingers
or Ctrl and the wheel zoom (no zoom buttons or readout); the plain wheel pans.

Undo and redo are snapshots (`history.ts`). The trash button clears the board as
one undoable step. The board autosaves (debounced, and on page hide) under
`lab:board:v2`; `storage.ts` re-validates everything on read and drops anything
malformed, so the settings backup can carry it safely. Logic tests are in
`tests/board/logic.test.ts`, with jsdom flow tests of the island beside them.

### Charts

`chart.make` is a workbench capability on spreadsheets (CSV/XLSX via the
existing sheet parser). `lib/charts/data.ts` turns cells into typed columns:
numbers as people write them (`1 234,5`, `$1,200`, `12%`, `(300)`), dates (ISO,
`13.10.2026`, day-first when the language is Russian) and text, with the first
row detected as a header. `spec.ts` guesses the chart from the shape of the data
— a date column first is a line, labels and numbers are bars (grouped when there
are several series), two numbers are a scatter, one number is a histogram, labels
alone are counted — and `normalizeSpec` keeps any hand-made choice drawable.
There are five types in all, and never more than six series (three on a scatter).

**Pivot and stack.** *One series for each value of* a text column turns long
data (`Month, Region, Sales`) into a line or bar series per region: rows that
share a label and a group are added up, averaged or counted, a group keeps the
colour of the place it first appears in, and with more groups than fit (six) the
biggest are shown and the rest are named in a note. Data of that shape is split
automatically when a second text column separates the rows of a repeated label
into up to six groups. Bar charts with several series (or a split) can be
**stacked**: one bar per label, positives building up from zero and negatives
down, a 2px gap between segments, only the open end rounded, the stack's total
printed on top and as a Total row when hovering.

**Remembered per file.** What you changed (type, columns, split, stacking, title,
header choice, and the open sheet) is saved under `lab:charts:v1`, keyed by file
name and size and kept for the 40 most recent files, so reopening the file
brings the chart back; the settings backup carries it. Only changes are saved
(the suggestion is worked out afresh), looking at a file leaves no trace, and
*Back to the suggested chart* clears it.

`build.ts` draws the chart as an SVG string and describes what the pointer can
land on; the string shown on the page is the string exported, drawn at the width
it is shown at (so type stays readable on a phone) and at a fixed width for
export. Colours are the validated reference palette (`palette.ts`: eight hues in
a fixed order, dark steps selected for the dark surface; the validator passes in
both modes and its light-mode contrast warning is covered by an always-present
legend and the table view). A column always wears the colour of its place among
the numeric columns, so hiding a series never repaints the others. Marks follow
fixed specs: 2px lines, bars of at most 24px with a rounded data end and a 2px
gap, 8px dots with a surface ring, hairline solid grid, text in ink tokens never
in a series colour, and an opt-in hatch (45°/135°) for colour-blind readers and
print. The hover layer (`components/charts/ChartView.tsx`) is a crosshair on
lines, a band on bars and histograms, and the nearest dot within 24px on a
scatter; arrow keys show the same details, and a table of the plotted data is one
button away. Export adds an SVG or a canvas-drawn PNG to the Outputs tray, on a
light or dark background whatever the page theme is.

### Recognize text (OCR)

`ocr.recognize` is a workbench capability on images and PDFs. The engine is
tesseract.js in a web worker; its files (worker, WebAssembly engine, language
data) are about 9 MB for English plus Russian and are copied into `assets/ocr/`
at build time by `scripts/copy-ocr-assets.mjs` (git-ignored, with a
`manifest.json` of real sizes). They come from this site, never a CDN, are never
precached, and are downloaded on request with a progress bar into the Cache
Storage entry `lab-ocr-v1` (`lib/apps/heavy-assets.ts`); the tool shows what is
missing and its size, and can remove it all. The service worker answers the
worker's requests from that cache, so recognition then works offline. The worker
is started from its own URL (not a blob), so the page's CSP needed no change.

Before recognising, `lib/ocr/preprocess.ts` makes the image grey, stretches
the contrast, optionally flattens it to black and white (Otsu) and enlarges
small pictures (below 1600 px, up to 3×; above 4000 px it is scaled down;
transparent areas become white). PDF pages are drawn at about 200 dpi, up to
50 per run, chosen by a page range. Progress covers engine start-up and every
page, and Stop terminates the worker. The text is shown with the mean confidence
and added to the Outputs tray as `<name>.txt`, where Edit, Compare or the QR
generator can take it on. The tool says plainly that handwriting and tiny or
blurred text read poorly.

Pages can be prepared and read in four ways (`lib/ocr/layout.ts` holds the maths,
all of it on plain arrays so it is tested without a browser). **Straighten tilted
pages** (on by default) estimates the tilt of a page by projecting its ink onto
the vertical axis at trial angles within ±10° and taking the angle at which the
text lines are sharpest, then turns the page if the tilt is at least 0.4° and
clearly real. **Columns** finds the gutters between columns of text (runs of
ink-free columns at least 1.5% of the width with a tenth of the ink on each
side), cuts the page there and reads each strip in turn, left to right, so the
columns are not interleaved line by line; a heading across the columns can hide
the gutter, and then the page is read as one. **One block** is the engine's
single-block mode. **Table** reads the page as one block with spacing preserved,
then rebuilds the table from the word boxes: each line is cut into cells where
the gap is wider than a space, and cells line up into columns by the horizontal
bands they cover, so empty cells and right-aligned numbers stay in their columns.
The result opens in the workbench as a `.csv` spreadsheet. After any read, the
words the engine was unsure of (below 75% confidence, red below 50%) are listed
and boxed on the page as it was read, so a person knows where to look first. To add a language, put its
`.traineddata.gz` where the copy script looks and name it in `LANGUAGES` there
(and in `LANGUAGE_NAMES` in `lib/ocr/assets.ts`).

### Focus office

The page opens straight into the office, full screen, with nothing to set up and
nothing saved (a leftover `lab:focus:v1` from the first version is deleted on
load). Lo-fi starts, the scene appears, and **Start** begins the flow:
25 minutes of focus, a 5 minute break, and so on, with a 15 minute break after
every fourth Pomodoro; a break ends by itself and the next Pomodoro begins
without a click. Giving a Pomodoro up (a confirm dialog names who would leave)
sends one of the six people out of the door and leaves the timer waiting for
Start; when the last one has gone the office is empty until you hire a new
team. Leaving the page mid-Pomodoro asks the browser first (`beforeunload`); if
the page really goes (`pagehide` with `persisted === false`) the Pomodoro is
given up. Switching tabs is allowed.

`lib/focus/flow.ts` is a pure state machine over `now`: *ready → focus → break →
focus …*, or *empty*. It measures against `endsAt`, never in ticks, so a
throttled background tab only delays the display, and a long absence is caught
up segment by segment from when each should have ended. The tab title carries
the countdown. Pause, skip break, mute and volume are the only controls.

**The music** is generated in the browser, so there is no stream, download or
licence (a third-party stream would also break the local-first, offline and CSP
rules). `lib/focus/lofi.ts` is the score: for a bar number and a seed it returns
the notes of a four-bar phrase, deterministically — jazzy seventh and ninth
chords in one of four loops, a soft strum, a root-note bass, swung hats with a
kick and snare at 74 BPM, and a sparse pentatonic lead. `lofi-audio.ts` plays it
with oscillators and filtered noise (an electric-piano pad, sine bass, noise
snare and hats, a decaying-noise reverb, a vinyl-crackle bed, a dark low-pass
and a gentle compressor), scheduling three bars ahead of the audio clock so a
throttled timer cannot cause a gap; `renderOffline` runs the same code in an
`OfflineAudioContext` for checking. Browsers only allow audio after the user has
touched the page, so the player tries to start at once, and if it is refused
shows "Tap anywhere to start the music" and begins on the first tap, click or key
press (Start counts). Muting silences the music and the short cues
(`sound.ts`) together.

The office is Software Tycoon's scene, reused: `lib/focus/office.ts` builds a
synthetic Tycoon `GameState` (one office, six people) from a random key, so a
key always gives the same names, faces (a hash of the id), room colours and order
of leaving. `components/focus/FocusScene.tsx` mounts `OfficeScene` the way
`TycoonApp` does (Pixi and the `unsafe-eval` build load on demand; if WebGL is
missing, a plain list of the team stands in). `OfficeScene` gained two optional
hooks that leave Tycoon unchanged: `options.label` (the plate over the doors
shows the countdown) and `options.working`, plus `leave(id)`, which sends a
person out with a cardboard box before they are removed from the state. The route
(`render-support/walkout.ts`, tested for every desk in both arrangements) keeps
to free floor: out the chair's side, along the aisle or the margin, then the lane
under the windows to the doors, never across a desk.

**Breaks.** While the flow is in a break, `options.breaks` is true and people get
up in their own time (`render-support/breaks.ts`: everything is seeded from the
person's id, the number of the break and the round, so a break always plays out
the same way). Each goes out to a free spot, does the thing and walks back, then
sits a while and goes again: coffee at the machine, a drink at either water
cooler, a seat on the sofa, a book from the bookshelf (drawn for the occasion in
`render-support/bookshelf.ts`; the pack has none) or a snack from the vending
machine or the snack cabinet. They take a different errand from the last one, two
people never stand on top of each other, and spots in the cropped-off margins of
a narrow screen are not used. They walk by the same free floor as a leaver
(`routePath`), and when the break ends (or is skipped) whoever is out turns back
at once. Someone who gives up a Pomodoro while still out carries on to the doors
from where they are (`pathToDoors`). Tycoon does not pass the option, so its
office has no outings and no bookshelf.

### Send to phone

Small data moves from a computer to a phone without a server: a **Send to
phone** action (a text file or text output in the
workbench) shows a QR code, the phone's own camera app opens the link, and the
tool previews what arrived and imports it only on confirmation. The data lives
in the URL fragment (`#send=1.<kind>.<payload>`: JSON → deflate → base64url),
which browsers never send to a server. `lib/send/codec.ts` caps the fragment at
2 200 characters and the decoded size at 256 KB (decoding is a bounded inflate,
and every failure is `null`); anything bigger is told to use Export instead.
The code is drawn at error-correction level **M**: jsQR fails on every
version-23 code at L but decoded every size at M (`tests/send/scannable.test.ts`
rasterises real codes and reads them back). `useIncomingSend(kind)` picks the
data up on load, ignores fragments for other tools, clears unreadable ones, and
leaves the fragment in place until the user imports or dismisses. The other
direction needs no feature: export a file and move it however you like.

### Branding and link previews

The name, tagline and descriptions live in `src/lib/brand.ts`; each tool's
search/preview title and description live next to it in the registry
(`seo` in `src/lib/apps/tools.ts`). `ToolsLayout` turns those into the
`<title>`, description, canonical URL, Open Graph / Twitter card and
schema.org JSON-LD, and the build emits `sitemap.xml`. The logo is
`assets/favicon.svg` (mirrored by `components/apps/Logo.astro`); the PWA icons
and the 1200×630 social card are generated from it by
`scripts/generate-brand-assets.mjs` and committed.

### Adding a new tool

Anything that works on a file belongs in the workbench, not on its own page:
add a capability to `src/lib/workbench/capabilities.ts` (label, group, weight,
`match`), its component under `src/components/workbench/operations/`, and one
line in `src/lib/workbench/operations.ts`. For a standalone page (games):

1. Add the tool's island under `src/components/<tool>/` and its logic under
   `src/lib/<tool>/` — reuse the shared helpers in `src/components/tools/ui.tsx`
   (`ToolPage`, `FilePicker`, `Tabs`, `CopyButton`, …), `src/lib/apps/` (theme,
   language via `useAppLang`, `createTranslator` for EN/RU copy, file open/save).
2. Create `src/pages/<route>.astro` mounting the island inside `ToolsLayout`.
3. Add one entry to `TOOLS` in `src/lib/apps/tools.ts` (including its `seo`
   title and description) — the landing grid, the command palette, the PWA
   shortcuts, the page metadata and the sitemap all read from it. Pass
   `tool="<id>"` to `ToolsLayout` in the page.
4. Add tests (including an `axeViolations()` check) next to the others.
5. Persist anything under a `lab:<tool>:v1` key so the settings backup covers it.

Parse/render locally in the browser — your files stay on your device, and no accounts.

## License

MIT — see [LICENSE](LICENSE).