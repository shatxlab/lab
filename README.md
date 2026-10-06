# Local Lab

A local-first toolbox of free browser tools, shipped as **one application**.
Every tool runs entirely in your browser tab — files are parsed and rendered
locally, nothing is uploaded, and no accounts or telemetry are involved.

## Tools

| Route | Tool | What it does |
|---|---|---|
| `/reader` | EPUB reader | Unzip + parse EPUB, chapter navigation, in-book search, bookmarks, themeable UI, reading position persisted in localStorage. |
| `/viewer` | Document viewer | PDF (PDF.js, selectable text, password prompt), Word (`.docx`), spreadsheets (`.xlsx`/`.ods`/`.csv`/…, editable and saveable), JSON, Markdown, HTML (sanitized preview + source), images and plain text — all rendered locally. **Export** sheets to CSV/JSON/XLSX, JSON to CSV, Word/Markdown/HTML to HTML/Markdown/text, PDF to text; **print / save as PDF** any rendered document; **compare** two files (text, JSON, sheets, Word, PDF) side by side or unified. |
| `/pdf` | PDF tools | Merge PDFs (per-file page ranges), split (extract / every page / every N / custom parts, zipped), and reorder, rotate or delete pages with thumbnails and drag-and-drop. Reads password-protected files. |
| `/image` | Image tools | Convert (PNG/JPEG/WebP/AVIF where the browser can write it), resize, compress, batch + zip, and strip EXIF/GPS — losslessly for JPEG and PNG. Shows what metadata the original contained. |
| `/qr` | QR code | Generate QR codes for text, links, Wi-Fi, email, phone, SMS, vCard contacts and locations (PNG/SVG); scan with the camera or from an image. |
| `/text` | Text tools | Diff (side by side / unified, word-level highlights), word and character counter, case converter (incl. camel/snake/kebab), regex tester (runs in a Worker with a timeout). |
| `/convert` | Data converter | JSON ⇄ YAML ⇄ TOML, Base64 / URL / hex, MD5 and SHA hashes (plus HMAC) for text or files, UUID v4/v7 generator and inspector. |
| `/alias` | Alias word game | Bilingual (English/Русский) party word-guessing game: ten themed decks of 1000+ words each, team scoring, timer, keyboard shortcuts and synthesised sound feedback. |
| `/crossword` | Кроссворд · Crossword | 50 crosswords in each of Russian and English, played with the phone's own keyboard: a tap-friendly grid, a clue card above the board, locking of solved words, hints, mistake checking and progress saved locally. |
| `/wordle` | Wordle · Вордли | Five-letter word game in English and Russian (~1000 answers each; guesses must be real words — about 12,500 English and 4,800 Russian are accepted). On-screen and physical keyboard, hard mode, high-contrast colours, statistics and shareable results. |
| `/couples` | Игры для пар | Couples games in Russian and English — «Норм или стрём» / "Fine or Cringe", «ИлиТо» / "This or That" and «Кто из нас» / "Who of Us". 3 000 prompts per game per language across ten themes, secret two-player voting with an agreement score, or a shared-answer discussion mode. |

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
translate that file into the platform's header configuration. (It allows the
camera for the same origin — the QR scanner needs it.)

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
  components/tools/  Text, converter, QR, image and PDF tool islands + shared UI
                     (FilePicker, tabs, menus, diff view)
  components/viewer/ Document viewer islands (PDF, image, sheet, JSON, …)
  components/wordle/ Wordle island
  components/alias/  Alias game island (setup, round, results screens)
  components/crossword/ Crossword island (picker, board, grid, clues, completion)
  components/couples/ Couples game island (menu, setup, play, summary)
  lib/apps/          EPUB parsing + shared app logic: tool registry (tools.ts),
                     theme/lang, file open, settings backup, command-palette search
  lib/viewer/        Document parsing/rendering/export logic (+ PDF.js loader)
  lib/text/          diff engine, text statistics, case conversion, regex runner
  lib/convert/       data formats, encoders, hashes (incl. MD5), UUIDs
  lib/qr/            payload builders/parsers, QR matrix + SVG, scanner
  lib/image/         EXIF reading and lossless stripping, resize plan, canvas pipeline
  lib/pdf/           page-range parsing and pdf-lib operations
  lib/wordle/        scoring, hard mode, storage, keyboard layouts, word lists
  lib/alias/         Game engine: words, deck, scoring, i18n, sound, storage
  lib/crossword/     Generated puzzles + word bank, grid builder, reducer, i18n, sound, storage
  lib/couples/       Seed vocabulary + prompt builder, deck, i18n, sound, storage
  lib/limits.ts      raw-file + ZIP decompression caps for untrusted input
  layouts/           ToolsLayout (shared header, theme, CSP-tied prepaint)
  pages/             one .astro per route + manifest.webmanifest.ts
  styles/            apps.css (design tokens, header, a11y base) + viewer.css
                     + tools.css + alias.css + couples.css + crossword.css
                     + wordle.css
scripts/             crossword generator, PDF.js asset copy, pwa/ (service worker
                     generator, Astro integration)
assets/              static files served at / (favicon, icons, _headers)
tests/
  apps/              theme + EPUB unit tests
  viewer/            document viewer unit tests
  alias/             deck, scoring, storage, sound and render tests
  couples/           prompt counts/uniqueness, deck, storage, sound, layout and flow tests
  text/ convert/ qr/ image/ pdf/ wordle/  logic + UI tests per tool (jsdom)
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

Parse/render locally in the browser — no file uploads, no accounts.

## License

MIT — see [LICENSE](LICENSE).