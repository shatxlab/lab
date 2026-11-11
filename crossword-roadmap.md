# Crosswords — larger puzzles / native keyboard

## Status

Implemented on `main`; user authorized committing and pushing this batch. No custom
keyboard. Deployment must be verified separately. This file records the expanded-grid follow-up; durable assistance rules in
`game-design-improvements.md` §5 remain unchanged. No human fun/physical-device playtest.

## Shipped catalog

- **50 EN + 50 RU** new puzzles. Exact target at index i: `10 + round(i * 40 / 49)`.
  Nondecreasing **10→50 words**; 1,500 entries/language across all boards.
- Per language: 7 easy (10–15 words), 19 medium (16–30), 24 hard (31–50).
  Easy uses an explicit familiar-answer shortlist, including longer everyday words;
  it excludes short specialist vocabulary rather than equating easy with small.
  Medium/hard use the general-knowledge banks. Clue difficulty remains editorial,
  not a human-calibrated measurement; size chiefly controls the medium/hard split.
- Deterministic bounded placement, exact target or fail before writing output,
  connected perpendicular crossings, no same-axis overlap or unclued touching runs,
  no duplicate answers/boards, tight bounds and >40% fill. `buildPuzzle` derives numbering.
- Reproduce: `npm run gen:crosswords` (~2.13s for both languages). Generator logs each
  board's target, size, density and attempts. Two final runs byte-identical; generator
  report has checksums and all 100 metrics: `reports/crossword/generation-report.md`.
- Largest area: 24×23 (552 cells, 49 words, 271 filled). Last boards: EN 24×19,
  RU 22×23, both 50 words. One common RU bank addition: УЗОР; no runtime content service.

## Board and input

- Default **44px cells**, explicit +/− zoom (28–68px) and fit-whole-grid overview.
  Overview scales gaps too so it fits short viewports. Tiny overviews are for orientation;
  `100%` restores readable size. Tap a cell or navigate/type to leave overview.
- Native touch/trackpad scrolling plus mouse-drag panning. Buttons change board zoom;
  browser pinch remains native, not a bespoke board pinch recognizer. No custom keyboard.
- One permanent invisible input; its DOM node/focus survives zoom, selection, typing,
  scrolling and keyboard/viewport resize. EN/RU `lang` and accessible labels match puzzles.
  Keyboard toolbar activation does not steal focus or summon a dismissed keyboard.
- Auto-follow only on cursor/edit/zoom/viewport changes, using nearest-edge scrolling
  **within the board**. Manual pan is not undone by timer rerenders. No document-level
  `scrollIntoView`. Mouse drag on black cells also retains existing native input focus.
- Explicit hide-keyboard button. With an open keyboard in short/landscape windows,
  compact mode keeps the active clue, zoom/dismiss and grid; header/tools return on close.
- Native input parsing, Backspace coalescing, arrows, Tab/Shift+Tab, direction switching,
  solved-cell locking, hints/check/clear/completion and durable assistance are retained.
- Contrast fixes from scoped axe checks: dark word highlights, numbered cells and clue
  badges now meet checked contrast requirements; clue arrows/zoom controls are 44px targets.

## Saves and previous edition

- New IDs: `[en-]cw-v2-NN-<12-char SHA256 layout hash>`. Hash canonicalizes placements,
  directions and answers. Changed topology cannot inherit old letters/completion.
- Storage key stays **`lab:crossword:v1`**; no deletion/remapping of old data.
- `legacy-puzzles.ts` freezes all 100 original v1 layouts from pre-change `HEAD`.
  Only legacy puzzles with real stored progress appear, marked **Previous edition**;
  they can still resume/finish and save under their original ID.
- Next from legacy → first new puzzle. New-catalog progression never enters legacy.
  Empty legacy snapshots remain stored but hidden. Partial-letter progress gets an
  in-progress badge even before a whole word is solved.
- Save validation cap increased from 400 to 4096 letters/markers. Assistance history
  remains independent of markers; clear preserves it/time, replay resets the attempt.
  More details: `reports/crossword/storage-continuity.md`.

## Verification

- `NODE_ENV=test npm test`: **241 files / 3,505 tests passed**.
- `npm run typecheck`: passed. Production `npm run build`: passed.
- Browser harness: `PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node
  scripts/crossword/expanded-browser.mjs` against local production preview, port 4322
  (override with `PORT`). Start preview after building.
- EN/RU × 360×640 and 390×780 light, 1280×800 and 640×360 dark/reduced motion.
  Each exercises 10- and 50-word boards, readable sizing, fit, actual touch taps/swipes
  (CDP) or mouse drag, selection/navigation, stable input/focus, simulated OS keyboard
  visualViewport resizing, compact landscape and keyboard dismissal, nearest-cell
  visibility, manual-pan retention over timer ticks, native typing/Backspace, hints,
  clear/durable counts, reload, v1 resume and new-save isolation.
- Both languages also complete a 50-word board from a nearly-complete save, verify all
  values + durable hint count + completion persisted, and replay clears the attempt.
- **10 browser scenarios / 16 scoped axe WCAG A/AA audits**, no violations or page errors.
  Evidence: `reports/crossword/expanded-browser-check.json` and screenshots (inspected).
- These are desktop/emulated-browser checks. Headless Chromium does not open a real
  iOS/Android keyboard; visualViewport resize is simulated, while touch pan is an actual
  browser gesture. A real phone check remains necessary before claiming OS-keyboard QA.

## Next session / remaining scope

1. Real iOS Safari and Android Chrome: keyboard stays open during touch zoom/pan, IME
   insertion/deletion, browser bars/orientation, compact mode and dismissal.
2. Human solve: 10/25/50-word hit rate, clue fairness, repeated answers across the catalog,
   navigation effort and whether the 44px default/overview balance feels right.
3. Regenerate with the script, never hand-edit generated puzzles/word bank. Preserve
   legacy layouts and ID hash semantics. Keep tests deterministic and assistance durable.
4. Commit/push only on explicit user request; deployment status is separate.
