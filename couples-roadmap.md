# Couples roadmap

The shared review backlog is `game-design-improvements.md` (§8 consent/temporary skipping and §11 English editorial pilot). This file records Couples-specific behavior and follow-up scope.

## Status

Temporary skipping is implemented for all three games (`norm`, `either`, `who`), both modes, and EN/RU. The user has authorized committing and pushing this batch to `main`. Deployment status is separate from push success.

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

## Next steps — separate authorization/scope

1. English authored-content editorial pilot: choose a small theme sample and compare tone, specificity, naturalness, and usefulness for discussion before broader expansion. Do not generate or rewrite the English catalog as part of the consent batch.
2. No extra persistence, answer-sharing, analytics, new modes, or deck/balance changes are part of temporary skipping.

## Guide for the next session

Read this file and the relevant sections of `game-design-improvements.md` first. Work on `main`, and commit/push only on explicit request. Preserve the private two-pass contract: no first answer may survive into a declined result, no skipped card may enter a scored denominator or answer tally, and no temporary decline may become a permanent hidden-card preference. Test both languages, both modes, and empty/mixed sessions when changing play or results.
