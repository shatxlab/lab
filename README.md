# lab

A local-first toolbox of free browser tools, shipped as **one application**.
Every tool runs entirely in your browser tab — files are parsed and rendered
locally, nothing is uploaded, and no accounts or telemetry are involved.

## Tools

| Route | Tool | What it does |
|---|---|---|
| `/reader` | EPUB reader | Unzip + parse EPUB, chapter navigation, themeable UI, reading position persisted in localStorage. |
| `/viewer` | Document viewer | Word (`.docx`), spreadsheets (`.xlsx`/`.ods`/`.csv`/…), JSON, Markdown, plain text — rendered locally, spreadsheets editable and saveable. |
| `/alias` | Alias word game | Bilingual (English/Русский) party word-guessing game: ten themed decks of 1000+ words each, team scoring, timer, keyboard shortcuts and synthesised sound feedback. |
| `/crossword` | Кроссворд | 50 Russian crosswords played with the phone's own keyboard: a tap-friendly grid, a clue card above the board, locking of solved words, hints, mistake checking and progress saved locally. |
| `/couples` | Игры для пар | Russian couples games — «Норм или стрём», «ИлиТо» and «Кто из нас». 3 000 prompts per game across ten themes, secret two-player voting with an agreement score, or a shared-answer discussion mode. |

`/` is the landing page listing the tools.

## Run

```sh
npm install
npm run dev      # http://127.0.0.1:4321
npm run build    # static output in dist/
npm start        # preview the built site (astro preview)
npm test         # unit tests (vitest)
npm run typecheck # tsc over .ts/.tsx
npm run check    # astro check (adds .astro templates)
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

## Structure

Single Astro + React islands app (Node ≥ 22.12). Static output; every tool is
an interactive island, everything else is pre-rendered HTML.

```
src/
  components/apps/   EPUB reader island + shared theme UI
  components/viewer/ Document viewer islands
  components/alias/  Alias game island (setup, round, results screens)
  components/crossword/ Crossword island (picker, board, grid, clues, completion)
  components/couples/ Couples game island (menu, setup, play, summary)
  lib/apps/          EPUB parsing + shared app logic (theme, file open)
  lib/viewer/        Document parsing/rendering logic
  lib/alias/         Game engine: words, deck, scoring, i18n, sound, storage
  lib/crossword/     Generated puzzles + word bank, grid builder, reducer, i18n, sound, storage
  lib/couples/       Seed vocabulary + prompt builder, deck, i18n, sound, storage
  lib/limits.ts      raw-file + ZIP decompression caps for untrusted input
  layouts/           ToolsLayout (shared header, theme, CSP-tied prepaint)
  pages/             index (landing) · reader · viewer · alias
  styles/            apps.css (design tokens) + viewer.css + alias.css
                     + couples.css + crossword.css
assets/              static files served at / (favicon, _headers)
tests/
  apps/              theme + EPUB unit tests
  viewer/            document viewer unit tests
  alias/             deck, scoring, storage, sound and render tests
  couples/           prompt counts/uniqueness, deck, storage, sound, layout and flow tests
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

### Adding a new tool

1. Add the tool's island under `src/components/<tool>/` and its logic under
   `src/lib/<tool>/` — reuse the shared theme and file-open helpers in
   `src/lib/apps/`.
2. Create `src/pages/<route>.astro` mounting the island inside `ToolsLayout`.
3. Add a row to the tools table above.

Parse/render locally in the browser — no file uploads, no accounts.

## License

MIT — see [LICENSE](LICENSE).