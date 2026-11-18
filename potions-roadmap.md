# Potion panic / Переполох в котле

## Status

Bots-first, local-only React game at `/potions`, registered on the homepage,
command palette, sitemap and generated offline precache. Original SVG potion art;
no licensed names or artwork in the game. Shared EN/RU site-language setting.
Not multiplayer; no persistence (refresh discards the run).

## Rules reference

Hobby Games' official Russian rulebook, v1.0 (2023), Nikita Sorokin:
https://hobbygames.ru/download/rules/gp-oborotnoe-zele-rules.pdf
Product page: https://hobbygames.ru/garri-potter-oborotnoe-zele

The pure engine implements 108 ingredients (12 of each 1–9), two recipes,
two ladles; remove ladles with two players. Deal equally, reveal in turn,
call a triple, simultaneous single-card claims, automatic face-down banking,
optional trigger-value banking, then all-or-nothing modulo-ten scoring.
False calls return one bank card face down. First-player token advances after
every brew. Empty decks skip revealing; last reveal starts a mandatory final
brew. Count banked cards, with shared wins on ties.

## Explicit browser adaptations

- Recipe mirrors the action-button row instead of switching physical hands.
- Impossible actions (wrong-turn reveal, claiming a locked special, double claim)
  are disabled/rejected, rather than offering a way to incur those physical errors.
- Player starts with the token, rather than asking who last mixed something.
- All matching trigger-value cards can be banked; there are normally exactly
  three when brewing starts. If humans delay calling past a fourth match, the
  same-value eligibility extends to that card too.
- Quick deck: 4 of each ingredient + specials (40; 38 with one bot). Full deck
  available. Quick is the default so prototype runs are short.
- No artificial brewing deadline. Human presses Done; each bot passes when it
  sees no useful available card. Once all pass, human selects the bonus split
  and explicitly confirms settlement. No auto-banking player's choice.
- Bots use public table plus their own held cards only: take guaranteed cards,
  then maximum-card subset-sum DP modulo ten, allowing trigger-card splits.
  Targets are recomputed after each grab, so opponents can disrupt a plan.
  Apprentice: reveal 1350ms, call 1900ms, grab 1100ms + stagger.
  Alchemist: reveal 800ms, call 900ms, grab 650ms + stagger.
- Claims are atomic and throttled to one per 160ms for the human. Empty slots
  stay in place during brewing to prevent accidental taps as cards disappear.
- Pause, rules and tab hiding stop bot timers. Resume restarts full reaction
  delays; this is a casual prototype, not a competitive anti-cheat system.

## Files

- `src/lib/potions/game.ts`: pure immutable transitions, scoring, bot policy.
- `src/lib/potions/i18n.ts`: English and Russian copy.
- `src/components/potions/PotionsGame.tsx`: timer orchestration and table UI.
- `src/styles/potions.css`: scoped responsive laboratory theme.
- `tests/potions/`: rules examples, transitions, conservation, seeded complete
  playthroughs (48 games, 1–6 bots, quick + full), React UI and timer/pausing tests.

## Verify / environment note

The host exports `NODE_ENV=production`. React's `act` is absent in production;
run tests with `NODE_ENV=test npm test`. No project-config workaround needed.
`npm run typecheck`; `npm run build`.

Local Playwright checks: production build, desktop/mobile, complete game,
Russian language, console errors, layout overflow and axe including contrast.
No live STT services involved.

## Next steps

- Playtest pace and bot generosity on a real touchscreen.
- Add sound/haptics and richer reveal/claim animations (respect reduced motion).
- Optional persisted settings/run recovery, with schema version + validation.
- Multiplayer only after choosing a server-authoritative claim protocol.
