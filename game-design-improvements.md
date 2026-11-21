# Game-design improvements

Open decisions and follow-ups from the cross-game design review. Game roadmaps own implementation details; completed review checklists and verification logs are in git history. The review relied on source inspection and headless simulations, not hands-on phone testing. Its small HR sample does not justify class-balance changes.

## Shipped review work

- **Alias:** at the end of a complete round, a unique leader at or above target wins. Tied leaders play another full round with scores carried over; no teams are eliminated and no mid-round wins are declared. Score corrections can create or undo a win.
- **KingsRoad:** active-run persistence and upcoming-wave clarity are recorded in [the KingsRoad roadmap](kingsroad-roadmap.md).
- **Lone Tower:** one-time reward settlement, active-run persistence, and the Catapult/Frost Field redesign are recorded in [the Tower roadmap](tower-roadmap.md), including remaining playtest work.
- **HR:** Intern-first onboarding, promotion tradeoffs, exact pack odds, inactive traits and duck contact feedback are recorded in [the HR roadmap](hr-roadmap.md). A rare-or-better guarantee/pity system and duck knockback remain separate, unapproved design decisions. Do not add resignation rolls or a blanket duck buff to fix copy or feedback.
- **Crosswords:** successful reveals are counted separately from markers, survive edits and clears, and reset on a new attempt. Old saves infer a lower bound from surviving markers. See the [README](README.md#crosswords) for expanded grids and legacy-save behavior.
- **Couples:** temporary skipping and the private two-pass consent rules are recorded in [the Couples roadmap](couples-roadmap.md).

## KingsRoad — strategy balance and pacing

The user completed all 20 maps and reported infrequent losses and dominant Ballista spam. Mage slowing has a clear role; Archer rarely feels preferable, even with Lune/Fire branches. The goal is harder, more interesting play through situational tower roles, not a blanket HP increase, a mandatory gold sink, or an arbitrary loss rate on teaching maps.

- **Archer:** efficient rapid single-target damage against scattered, fast targets.
- **Ballista:** heavy directional damage against armor and favorable firing lines, not the universal answer.
- **Mage:** crowd control and support with a meaningful branch choice.
- **Catapult:** dense ground-group damage.

The [baseline study](kingsroad-balance-study.md), diagnostics in the [KingsRoad roadmap](kingsroad-roadmap.md), and [reproduction tooling](scripts/kingsroad/study/README.md) hold the evidence. The three-hit cap, range reduction, cadence, smarter Archer policy, and roster distribution were tested; the roadmap records the outcomes and the per-map Shieldbearer that shipped. Final Ballista balance is still open; ask before another prototype or retune. Do not combine rejected changes or treat bot outcomes as proof of human balance.

**Next:** phone playtest early teaching maps and mixed threats (isolated runners, armor, air, and dense lines), including Shieldbearer readability and fun on Harvest and Kings. After an approved balance direction, repeat sufficient-defense, ability-use, and reallocation probes before deciding on any late-wave compression. Measure remaining meaningful decisions, not just time since the last purchase: unspent gold alone does not prove a solved wave. See [baseline study §5](kingsroad-balance-study.md#5-pacing-last-purchase-is-not-last-useful-purchase) for definitions and data.

## KingsRoad — maps 21–30

The next ten maps are planned. A new canvas and Mage tier-3 branches are proposed; theme, mechanics, and numbers need approval and playtesting. Branches would replace the third upgrade, not add a fourth tier.

- **Deep Freeze:** stronger control, lower damage; brief freezes with per-enemy recovery protection against permanent lock.
- **Brittle:** weaker slow, but enemies temporarily take more damage from subsequent hits. Differentiate it from Lune or choose another branch. Neither branch is committed.

Proposed progression: introduce the fork on forgiving maps 21–22; teach rapid-target and firing-line challenges on 23–24; combine split lanes, armor, crowds, and support on 25–27; test multiple mixed defenses on 28–29; combine taught rules without a surprise mechanic on 30.

- [ ] Playtest the current Ballista/Archer tradeoffs and agree whether another adjustment is needed.
- [ ] Decide, implement, and test the Mage fork and campaign unlock rules.
- [ ] Build maps 21–22 as a playable vertical slice; verify clarity, balance, performance, and phone layout with human playtests.
- [ ] Build maps 23–30 under the approved chapter rules; run regression simulations and human acceptance playtests.
- [ ] Record decisions and measured results in the KingsRoad roadmap.

## Software Tycoon — deferred

The user is testing the latest iteration. No improvement work now. For later reconsideration only: a compact “current assignment → next result → bottleneck → consequence” summary with detailed rates underneath, using existing data. Test phone comprehension before replacing the current presentation. Start future work in the [Software Tycoon roadmap](software-tycoon-roadmap.md) and incorporate the user's feedback.

## Couples English — authored-content editorial pilot

The proposal was explained; a full rollout is not approved. Replace weak template-generated prompts with deliberately written cards and useful follow-ups. Reuse strong Russian ideas where appropriate, but adapt them naturally rather than translating mechanically. Aim for comparable quality, not identical counts.

- [ ] Select one bounded English theme.
- [ ] Give both answer options credible appeal. Write distinct, concrete situations rather than paraphrases or an obvious “good partner” answer.
- [ ] Write follow-ups that invite stories, negotiation, or reflection rather than a generic “Why?”
- [ ] Check for duplicates, missing fields, theme/game fit, and consistency with existing curated-content handling.
- [ ] Review with the user and fluent speakers before expanding. Automated checks cannot certify conversation quality.

Illustrative card: “You have one free evening together: make a plan, or leave it open?” Follow-up: “When does planning feel caring to you, and when does it feel restrictive?”

## Crosswords — real-device and human-solve follow-up

The expanded-grid and native-keyboard batch shipped. Headless EN/RU checks at phone, desktop, and landscape sizes do not replace these open checks:

1. **Real iOS Safari and Android Chrome:** verify the keyboard stays open during touch zoom/pan, IME insertion/deletion, browser bars/orientation, compact mode, and dismissal.
2. **Human solve:** check 10/25/50-word hit rate, clue fairness, repeated answers, navigation effort, and whether the 44px default/overview balance feels right.
3. **Standing rules:** regenerate with the script, never hand-edit generated puzzles/word bank; preserve legacy layouts and ID hash semantics; keep tests deterministic and assistance durable.

## Verification requirements

- Run targeted tests, the full suite in the required test environment, and typecheck. Update EN/RU copy together.
- Check changed UI flows in the browser and at narrow phone widths when possible. Report headless and human/device checks separately.
- For persistence, test round trips, corrupt/incompatible saves, storage failures, reload/lifecycle behavior, terminal cleanup, and duplicate rewards.
- For balance changes, follow each game's simulation guidance and compare strategies across several seeds.
