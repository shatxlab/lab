# Local Lab

A local-first toolbox of free browser tools, shipped as **one application**.
Every tool runs entirely in your browser tab — files are parsed and rendered
locally, your files stay on your device, and no accounts or telemetry are involved.

## Tools

| Route | Tool | What it does |
|---|---|---|
| `/tools` | Workbench | One page for every file. Drop or paste files; one file is selected at a time and its actions appear as tabs, with the best one already open. Actions over several files (merge, compare, image batch) appear when the selected file is part of a matching set. **Open** (PDF, Word, spreadsheets, JSON/YAML/TOML, Markdown, HTML, text): Preview with *Save as* (CSV/JSON/XLSX, HTML/Markdown/text, JSON ⇄ YAML ⇄ TOML) and *Print*, or Edit (source, JSON, sheet grid, Word rich text) and save a copy. **EPUB:** read with chapter navigation, in-book search, bookmarks, themes and remembered position. **PDF:** merge, split and sign. **Images:** convert, resize, compress, strip EXIF/GPS, one or many at once. **Compare** two files by content (JSON pretty-printed, sheets as CSV, Word as text). **Without a file:** compare two texts, create a QR code. Anything a one-line terminal command does (hashes, Base64, UUIDs, regex, word count, case conversion, QR scanning) is deliberately left out. |
| `/flash` | Flashcards · Карточки | Spaced-repetition study decks, built for a few minutes a day. FSRS scheduling with four grades (the answer buttons show the next interval), a daily new-card allowance, a no-schedule cram mode and a streak. Import from a pasted list (`term — definition`), CSV or TSV (`front, back, tags`); export a deck as TSV; Markdown on both sides; EN/RU. |
| `/alias` | Alias word game | Bilingual (English/Русский) party word-guessing game: ten themed decks of 1000+ words each, team scoring, timer, keyboard shortcuts, synthesised sound feedback, and a results list where any word can be re-marked as guessed or skipped. Reaching the target score ends the game only after the whole round is played, so the highest score wins. |
| `/crossword` | Кроссворд · Crossword | 50 crosswords in each of Russian and English, played with the phone's own keyboard: a tap-friendly grid, a clue card above the board, locking of solved words, hints, mistake checking and progress saved locally. |
| `/wordle` | Wordle · Вордли | Five-letter word game in English and Russian (~1000 answers each; guesses must be real words — about 12,500 English and 4,800 Russian are accepted). On-screen and physical keyboard, hard mode, high-contrast colours, statistics and shareable results. |
| `/couples` | Игры для пар | Couples games in Russian and English — «Норм или стрём» / "Fine or Cringe", «ИлиТо» / "This or That" and «Кто из нас» / "Who of Us". 3 000 prompts per game per language across ten themes, secret two-player voting with an agreement score, or a shared-answer discussion mode. |
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
                     (operations/: open, compare, QR, PDF, image, DOCX editor, reader)
  components/tools/  Shared tool UI (ToolPage, FilePicker, tabs, menus, diff view)
  components/viewer/ Document renderers used by the workbench (PDF, image, sheet, JSON, …)
  components/wordle/ Wordle island
  components/flash/  Flashcards island (deck list, deck editor/import, study session)
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
  lib/wordle/        scoring, hard mode, storage, keyboard layouts, word lists
  lib/send/          "Send to phone" payload codec (size-capped, defensive) + fragment hook
  lib/flash/         FSRS scheduler, deck model + queues, import parsers, store ops, i18n, sound, storage
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
                     + wordle.css + tycoon.css (the game's own dark palette,
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
  convert/ qr/ image/ pdf/ wordle/ flash/ send/  logic tests per tool (flash/ also has the jsdom flow tests)
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

Rather than committing 9 000 literal strings, `lib/couples/questions.ts`
expands a compact seed vocabulary (`vocab.ts`) at load time into **3 000
prompts per game, 300 per theme** — 9 000 in total. `norm` and `who` are built
from *coherent scenario frames*: a sentence pattern whose verb fits every
object in its slots, crossed to produce concrete situations («Есть {a} с {b}»
× блюда × добавки). Both games share a theme's object lists, so one seed feeds
«Есть пиццу с ананасами» and «Кто из нас скорее съест пиццу с ананасами?».
`either` pairs two options from the same dilemma axis. A seeded PRNG makes the
expansion byte-for-byte deterministic, so the browser and the tests always see
the same deck; cards carry their seed object as a `group` so a deal never
repeats the same object with a different tail.
`tests/couples/questions.test.ts` enforces the per-game and per-theme counts
and global prompt uniqueness.

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

### Flashcards

`lib/flash/fsrs.ts` is the FSRS-4.5 memory model with its published default
weights and no learning steps: each card carries a stability and a difficulty,
and every review updates both. `lib/flash/model.ts` is the day-based deck
model (`localDay()` gives the local calendar day, so "tomorrow" follows the
user's midnight), the study queue (overdue cards first, then the daily
new-card allowance), cram, streaks and `recordReview`. A card answered
*Again* returns a few cards later in the same session but is scheduled only
once; cram never touches the schedule.

Everything is stored under `lab:flash:v1`, so the settings backup covers it;
`storage.ts` re-validates the whole shape on read (limits: 100 decks, 5 000
cards per deck, 4 000 characters per side). Cards are rendered with the
viewer's sanitising Markdown renderer, loaded on first use. Imports are
detected, not chosen (`parse.ts`): tab-separated rows, CSV with an optional
`front,back,tags` header (comma or semicolon), or one `term — definition` per
line; `toTsv` writes a deck back out in a form `parseImport` reads. Logic tests
are in `tests/flash/` (golden FSRS intervals, parsers, queues, storage) with a
jsdom flow test of the whole island.

### Send to phone

Small data moves from a computer to a phone without a server: a **Send to
phone** action (a deck in Flashcards; a text file or text output in the
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