# Couples roadmap

The shared review backlog is `game-design-improvements.md` (§8 consent/temporary skipping and §11 English editorial pilot). This file records Couples-specific behavior and follow-up scope.

## Status

Two deck-free games are implemented: **Secret Pattern / Тайный узор** and **Split or Steal / Делить или забрать**. The menu now has five games; the new games do not change question-game stats or history. The user has explicitly authorized committing and pushing this implementation to `main`. Deployment status must be verified separately from push success.

Temporary skipping is implemented for all three question games (`norm`, `either`, `who`), both modes, and EN/RU. The user authorized committing and pushing the earlier temporary-skipping batch to `main` (not the new deck-free games). Deployment status is separate from push success.

## Temporary skipping and consent — complete

- [x] Separate **Skip this time / Пропустить сейчас** from **Hide forever / Скрыть навсегда**.
- [x] Either partner can decline without an answer or an agreement/mismatch penalty.
- [x] A first-partner skip declines that card for the whole session; the second pass does not ask it again. If nothing remains for partner B, finish directly without a pointless handoff.
- [x] If partner B declines, immediately clear the withheld A answer in private state, retain later A answers, and emit an anonymous skipped result with an empty picks array. Neither answer, the declined prompt, nor who declined appears in the recap; only the aggregate skipped count appears.
- [x] Match percentages, mismatches, discussion prompts, and lifetime agreement denominators use mutual answers only. Together mode recaps/tallies answered cards only; it continues not to contribute to lifetime agreement statistics.
- [x] All-skipped sessions end on neutral results, without `0%`, `0 / 0`, a verdict, a disagreement invitation, or an empty tally. A menu with no lifetime scored answers says so instead of displaying a fabricated percentage. A completed all-skipped session still counts as a game played.
- [x] Temporary skips do not replace or delete dealt cards, or alter persistent hidden IDs. Normal seen-history ranking still applies: a skipped card remains available in future games, not necessarily the very next deal.
- [x] Replaying and returning after reload clear session-only declines. No answers, decline identities, or session results are persisted. Existing setup/stats/history storage schemas are unchanged.
- [x] Both decline actions have at least 44px touch targets and remain outside the independently scrolling prompt card. Safe vertical alignment keeps the beginning of long prompts reachable. Native button keyboard activation works; answer shortcuts do not act behind the exit dialog.

### Permanent hiding remains a separate existing behavior

Before either partner has answered the current card (`voteA` or Together), permanent hiding deals a fresh replacement if available, otherwise removes that card from the run. During partner B's pass it hides the card for future games without changing the current private answer mapping. **Skip this time remains available** on that already-hidden card; explicit EN/RU copy explains that skipping now discards both answers without scoring. Temporary skipping alone never adds a hidden ID. Setup can still restore permanently hidden cards.

### Implementation map

- `src/lib/couples/session.ts`: explicit nullable private answers, non-truncating slot updates, mutual-answer validation, answer-free skipped results. Missing/invalid answers are never coerced to option zero.
- `src/lib/couples/types.ts`: answered/skipped result union; a skipped result has `picks: []` and cannot be a match.
- `src/components/couples/CouplesGame.tsx`: whole-session declines, eligible second-pass traversal, withheld-answer erasure, handoff/all-skipped completion, scored-only lifetime updates, exhausted permanent-hide interaction.
- `PlayScreen.tsx`, `SummaryScreen.tsx`, `MenuScreen.tsx`, `src/lib/couples/i18n.ts`, `src/styles/couples.css`: distinct actions and explanatory copy, count-only declined recap, truthful empty states and phone layout.

### Verification

- 28 added tests: 6 pure session/privacy cases and 22 integration cases. Includes EN/RU × all three games × both modes, A and B declines, interleaved agreement/mismatch/skip scoring, preserved later private answers, all-skipped completion, next-session availability after remount/replay, unchanged persistent hidden history and old stats, permanent-hide exhaustion and B hide-then-skip, and exit-dialog keyboard isolation. Existing Couples regressions remain passing.
- `NODE_ENV=test npm test`: **227 files / 3,331 tests passed** (Couples: 11 files / 103 tests).
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Development and production Chromium checks at **360×640 and 390×780**, both EN/RU: all three games and both modes, declines in both passes, mutual-only score/tally and persisted stats, all-skipped A/B/Together, replay/reload eligibility, permanent hide then skip, long curated prompt/follow-up scrolling, native Enter activation, visible 44px actions, no horizontal overflow or page errors. Representative development and production screenshots were inspected. These are browser-emulated phone checks, not a physical-device playtest.

## Deck-free games — implementation record

The user explicitly requested building both games. No new question decks, content generation service, account system, analytics, or remote multiplayer were added.

### Secret Pattern / Тайный узор

- Five cooperative rounds on a 3×3 grid; density grows from 3 to 5 occupied cells. Shapes and colours are redundant cues: circle / triangle / square.
- Alternating describer and builder. Every study/build/peek transition has a neutral, explicit handoff cover. The target is not mounted in the builder DOM; the draft is not mounted during study/peek/handoffs.
- Tap a palette tile, then a cell; eraser clears cells. Unlimited peeks preserve the draft and selected tool, with no timer or penalty. A separate together-ready screen precedes the reveal.
- Compare both grids; incorrectly rebuilt cells use a dashed error border. Score counts correctly placed **occupied** tiles only; extra placements are counted separately and prevent a perfect result. Empty-cell matches never inflate the score. Summary shows a shared total and perfect-pattern count, not an individual rating.

### Split or Steal / Делить или забрать

- Eight rounds, alternating first chooser. Negotiate → first private handoff/choice → second private handoff/choice → both-locked cover → deliberate shared reveal.
- Payoffs: split/split = 3/3, steal/split = 5/0, split/steal = 0/5, steal/steal = 0/0. Pending choices are cleared at reveal. Guarded reducers ignore duplicate/out-of-phase actions and cannot pay a round twice.
- Personal totals, combined haul, round history, tie/winner outcomes. Fictional coins only; no trustworthiness labels, real stakes, or penalties.

### Integration, privacy and lifecycle

- Separate `MiniGameId`, pure rules/generation (`mini-games.ts`), guarded session reducers (`mini-session.ts`), and dedicated components. Existing `GameId`, decks and persisted setup/stat/history schemas remain unchanged.
- Both new cards live in the existing Couples menu; the site catalogue, search keywords and EN/RU descriptions reflect five games. Lifetime statistics are explicitly labelled as question-game statistics.
- Shared names are the only new-game setup values reused/persisted. Patterns, drafts, choices, round results and coin totals are memory-only; replay starts fresh, exit discards the run, and reload returns to the menu. Completing these games does **not** increment question-game counts or agreement denominators.
- EN/RU rules/UI, shared language changes without resetting a run, scrollable phone layouts, 44px controls, native keyboard buttons, phase-heading focus, trapped exit-confirmation focus with Escape/cancel restoration, reduced-motion support.

### Verification

- 36 added tests: 19 pure rules/generation/reducer/localization tests and 17 integration tests. Existing menu tests updated for five games. Covers EN/RU full games, all payoff combinations, reversed player order, private DOM covers, unlimited-peek restoration, erasing, empty drafts, extra placements, zero/tied/winner outcomes, replay/remount/exit, language changes, blocked writes, unchanged persisted stats/history and no private state in storage.
- `NODE_ENV=test npm test`: **236 files / 3,481 tests passed** (Couples: **13 files / 139 tests**). Typecheck and production build passed. Full-suite focus-outline regression found during implementation was corrected and the suite rerun successfully.
- Real Chromium development + production-preview checks at **360×640 and 390×780**, EN/RU: full sessions, private covers, draft restoration, score attribution, replay/reload, keyboard activation, exit focus, touch-target sizes and no horizontal overflow/page errors. Additional production checks at **1280×800 and 640×360** in dark theme with reduced motion. Eight scoped axe WCAG A/AA audits reported no violations; representative screenshots were inspected. These are emulated-browser checks, **not physical-device or two-person fun playtests**.
- Reproducible browser harness: `scripts/couples/mini-games-browser.mjs` (`PLAYWRIGHT_MODULE` can point to an external Playwright installation). Evidence: `reports/couples/`.

## Next steps — separate authorization/scope

1. Two-person playtest the new games: communication/peek friction on one phone, difficulty of five patterns, and whether eight fixed-payoff bluffing rounds stay interesting. No claim of human-tested fun yet.
2. English authored-content editorial pilot: choose a small theme sample and compare tone, specificity, naturalness, and usefulness for discussion before broader expansion. Do not generate or rewrite the English catalog as part of the consent batch.
3. No extra persistence, answer-sharing, analytics, new modes, or deck/balance changes are part of temporary skipping. New deck-free games are a separate authorized implementation, not a change to the question-game consent contract.

## Guide for the next session

Read this file and the relevant sections of `game-design-improvements.md` first. Work on `main`, and commit/push only on explicit request. Preserve the private two-pass contract: no first answer may survive into a declined result, no skipped card may enter a scored denominator or answer tally, and no temporary decline may become a permanent hidden-card preference. Test both languages, both modes, and empty/mixed sessions when changing play or results.

For the deck-free games, preserve explicit private covers and memory-only outcomes. Keep them out of the existing question-game stats/history, test alternating player attribution and duplicate reveal guards, and rerun the browser harness after UI changes. The user authorized committing and pushing this deck-free-games batch; future changes still require explicit commit/push authorization.
