# Crossword saved-progress continuity

Implemented on `main`; no commits/push. Only owned files changed.

## Files
- `src/lib/crossword/legacy-puzzles.ts` (new): all 100 original shipped v1 puzzles, sourced exclusively from `git show HEAD:src/lib/crossword/puzzles.ts`. IDs, dimensions, placements unchanged. Export `LEGACY_CROSSWORD_PUZZLES`; removed old lookup helpers to avoid export collisions. Uses existing `WORD_BANKS`.
- `src/lib/crossword/storage.ts`: sanitization limit raised from 400 to 4096 valid letters/markers. Durable assistance count unchanged. Added `hasSavedProgress` covering values, reveals, historical assistance, elapsed time, completed flag.
- `src/components/crossword/CrosswordGame.tsx`: all new puzzles plus only saved legacy puzzles in picker. Legacy boards resolve/play/save under original ID. Next from legacy opens first new puzzle; new progression cycles only through new catalog. Store key remains `lab:crossword:v1`; no migration/deletion/remapping.
- `src/components/crossword/PuzzlePicker.tsx`: optional `PickerItem.legacy`, previous-edition badge, edition notice from main-agent i18n keys, `data-puzzle-id` and `data-words` on cards.
- `tests/crossword/storage.test.ts`: >400 roundtrip, 4096 bound, durable assistance, saved-progress predicates.
- `tests/crossword/legacy.test.tsx` (new): both-language catalog ID separation, old layout anchors/buildability, resume and new-grid isolation, saved-only visibility, old-ID persistence, legacy-next and complete new-catalog cycling.

## Verification
Passed twice:
```
NODE_ENV=test npx vitest run tests/crossword/storage.test.ts tests/crossword/legacy.test.tsx
Test Files 2 passed; Tests 16 passed
```
Owned tracked-file `git diff --check` clean.
Verified frozen file against HEAD programmatically: identical catalog except export rename/comment and omitted lookup functions.

## Decisions / integration / limits
- Empty legacy snapshots hidden but retained in storage. Any real signal, including assistance after markers were cleared, makes legacy puzzle accessible.
- Storage remains ID-keyed: generated v2/hash IDs cannot inherit v1 letters/completion. Tests confirm 100 unique new IDs disjoint from all 100 legacy IDs using current generated catalog.
- Consumes `stringsFor(lang).legacyEdition` and `.editionNotice`; translations owned by main agent.
- Component tests use real game/catalog/picker/storage with Board/sound/language hooks mocked, avoiding coupling to concurrent Board changes. Real state restoration also tested directly.
- No full suite, typecheck, build, or live/browser UI verification; main agent handles integration checks.
- Generator, wordbank, i18n, Board/Grid/CSS and other agents' tests untouched.
