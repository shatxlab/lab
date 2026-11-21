# Never Have I Ever — bilingual editorial review

Read all 72 cards in each language completely. Reviewed as independent English and Russian decks, not translations. Edited only the two deck JSONs; this report is the only additional file written for the task. No commit.

## Changes

- **English: 18 cards touched** (light 1, stories 3, closer 14); 14 prompts and 18 follow-ups changed. Replaced narrow cake-carrying/backyard-camping/class-on-holiday cards with mistaken recognition, a wrong-day arrival, and a menu surprise. Rebalanced closer toward outfit indecision, failed winking, missed romantic hints, deleted flirty texts, clumsy greetings, dating laughter, and asking for a second date. Kept strong quiet-intimacy cards rather than removing warmth altogether.
- **Russian: 37 cards touched** (light 3, stories 19, closer 15); 32 prompts and 29 follow-ups changed. Most substantial changes address the requested stories problem: hobby checklists became incidents with a turn—losing to beginners after teaching the rules, an improvised dessert rescue, a closed favourite café, an unplayed concert song, duplicate gifts, and an accidental photo pose. Retained distinctive good cards such as the library note and improvised costume.
- Russian closer now includes invitation nerves, strategic seating, playful hand-size comparison, re-recorded voice messages, messy date food, a mistyped compliment, a lingering goodbye, and clarifying whether a meeting is a date. Simplified awkward reflexive/gender shorthand by rephrasing; retained readable `(а)` forms. Follow-ups are less dominated by prescribed either/or answers.
- Kept prompts concrete and autobiographical. Follow-ups can be answered without affirming the prompt; none request names or proof. No explicit sex, infidelity, trauma, medical material, illegal/dangerous exploits, or jealousy tests introduced.

## Verification

- JSON parses; **72 cards per language**, **24 each light/stories/closer**.
- IDs, order, categories, and field sets unchanged against pre-edit snapshots; every card retains nonempty `prompt` and `followUp`.
- Required prompt prefixes retained. All prompts <180 characters; all follow-ups <200 and end in `?`.
- No duplicate prompts or duplicate follow-ups within either deck (case-insensitive, trimmed comparison); editorial pass also checked repeated concepts.
- `npm test -- tests/couples/never.test.ts`: **10/10 passed**.
- `npm run typecheck`: **passed**.
- Full `npm test`: **52 files failed / 186 passed; 454 tests failed / 3029 passed**. Representative output: `TypeError: act is not a function`, including `tests/tycoon/ui-smoke.test.tsx:65` and accessibility tests. Never flow tests also failed. No pre-edit full-suite baseline was run, so this is not a proven baseline classification; no code/dependency fixes attempted. Full output: `/tmp/never-editorial-tests.log`.

## Remaining human-playtest limitations

No live couples playtest or browser check performed by this reviewer. Humour, romantic comfort, and affirmative-answer frequency remain unmeasured. Test with both newer and established couples: watch for rare scenarios producing repeated double negatives, flirting cards feeling too rehearsed, and follow-ups sounding like interview questions. Travel, concerts, and cafés still imply some leisure access; retain variety if these cluster in real rounds. Read Russian gender shorthand aloud to check pacing. No expectation of matching concept counts or identical experiences across languages.

## Main-agent verification after review

The inherited shell has `NODE_ENV=production`; plain `npm test` loads React's production entry point, hence `TypeError: act is not a function`. Final verification explicitly ran `NODE_ENV=test npm test` **after the final deck edits**: **238 files / 3,483 tests passed**. `npm run typecheck` and production build passed. Production Chromium app checks (both languages, phone/landscape, light/dark, reduced motion) and 32 scoped axe audits passed with no violations/page errors; see `never-browser-check.json`. These browser checks were performed by the main agent, not the editorial reviewer. This does not substitute for a human couples playtest.
