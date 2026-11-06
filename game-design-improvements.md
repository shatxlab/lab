# Game-design improvements

Planning backlog based on the seven-game design review and the user's follow-up decisions. This document records agreed implementation scope, proposed experiments, acceptance criteria, and deferred work. It is not a claim that the tasks have been implemented or verified.

For HR and KingsRoad implementation, also consult their existing game roadmaps. Keep those roadmaps in sync with decisions and completed work rather than creating conflicting design records. Software Tycoon's existing roadmap remains its source of truth.

## Evidence and limits

- The original review reported 350 passing tests across Alias, Couples, Crosswords, Tower, and KingsRoad with explicit test-mode configuration; 59 completed KingsRoad simulations; and 15 HR simulations. These results were reported by the reviewer, not rerun for this plan.
- The review was source inspection and headless simulation, not hands-on phone testing. The referenced detailed report was not included in this conversation.
- The user has played all 20 KingsRoad maps and reports infrequent losses and a dominant Ballista-spam strategy. This supersedes the older KingsRoad roadmap's statement that maps 11–20 were unplayed by a human.
- The HR sample does not justify class-balance changes.
- Source spot-checks confirmed Alias's earlier-team tie resolution, Crosswords' removable reveal markers, and the absence of active-run restoration in KingsRoad and Lone Tower.
- The game-design skill was consulted for the KingsRoad discussion. Its relevant principles are meaningful choices, readable consequences, teaching before combining threats, and prototype/playtest iteration. Design proposals below are not validated balance conclusions.

## Status and sequencing

Implemented in the first scoped batch: section 1 (Alias), sections 4A/4B (HR promotion disclosure and Intern onboarding), section 5 (Crosswords), and section 7A (HR pack odds). Remaining tasks are pending unless explicitly deferred. Fixed-scope work can proceed independently of approval of balance experiments.

### First-batch implementation record

- Alias resolves a completed round only for a unique eligible leader. Ties continue full rounds with scores carried forward; EN/RU rules and tie messaging are updated. Score corrections can create or undo a win.
- New HR careers establish Intern automatically. Existing focus/cards/savings/roster are preserved; legacy suspended runs without a career retain their character. Explicit career restart also establishes Intern.
- Promotion choices show approximate relative enemy-health and spawn-rate increases for the selected accessible stage and for interviews, calculated from the unchanged difficulty functions. Values are rounded for display, not added as new balance modifiers. Long disclosures wrap on phone screens.
- Pack odds are derived from the same rarity weights as the draw: common 60%, uncommon 27%, rare 10%, legend 3%. EN/RU copy explicitly states independent draws and no rare-or-better guarantee. Draw behavior is unchanged.
- Crosswords stores `assistanceCount` separately from highlight markers. Clear preserves assistance and elapsed time; Play Again resets the attempt. Old saves migrate from unique surviving markers as a lower bound. Already-correct/locked cells do not consume a no-op hint.
- Verification: `NODE_ENV=test npm test` passed 219 files / 3,086 tests; `npm run typecheck` passed. Chromium phone-sized checks passed in EN/RU at 360px for HR onboarding, odds, promotion disclosure/wrapping, existing focus/resume, and Crosswords assisted completion/replay; Alias at 390px passed a 32–32 tie followed by a full 33–34 round. No real-device playtest or balance simulation was performed for this batch; combat balance was not changed.
- User subsequently authorized committing and pushing this batch to `main`. Deployment status must be checked separately from push success.

Suggested sequence:

1. Alias full-round tiebreak resolution.
2. HR promotion disclosure and Intern-first onboarding.
3. KingsRoad active-run persistence.
4. Lone Tower persistence and safe reward settlement.
5. Crosswords durable assistance history.
6. KingsRoad wave clarity, HR odds/mechanics clarity, and Couples skipping.
7. KingsRoad strategy benchmarks, balance prototypes, and pacing investigation.
8. Mage branch decision and maps 21–22 vertical slice, then maps 23–30.
9. Couples English editorial pilot.

No calendar delivery dates are committed. Software Tycoon improvements are deferred while the user tests the latest changes.

## 1. Alias — full-round tiebreaks, no shared winners

**Priority:** P0. **Scope:** small. **Decision:** agreed; replaces the original proposal for joint winners.

### Rules

- Reaching the target does not end the game until every team has completed its turn in the round.
- At round end, a unique highest-scoring team wins only if its score is at or above the target.
- If the highest score is tied at or above the target, play another complete round. Scores carry forward.
- Repeat full rounds until there is a unique eligible leader. There is no mid-round sudden-death victory and no shared victory.
- For more than two teams, everyone continues to play in each additional round; do not silently eliminate teams.
- If no team is at or above the target, continue normally.

### User's acceptance example

Target 30; first team ends its turn with 32. The second team still plays:

- 33 or more: second team wins at round end.
- 31 or less, including 30 or 31: first team wins at round end.
- 32: another full round, then compare again.

### Tasks and acceptance

- [x] Replace earlier-team tie resolution with unique-leader resolution at completed-round boundaries.
- [x] Show an EN/RU message such as “Scores tied—another round!” rather than a final results screen.
- [x] Preserve normal single-winner behavior and equal-turn rules.
- [x] Test the user's example, multi-way ties, repeated tied rounds, team-order independence, and below-target rounds.

## 2. KingsRoad — save and continue active runs

**Priority:** P0. **Scope:** medium–large. **Decision:** agreed.

Use HR suspend/resume as a reference, not a blind copy. Late-map runs in the review took roughly 25–32 simulated minutes at normal speed, making lost progress particularly costly.

- [ ] Add a versioned, validated active-run snapshot separate from campaign/meta progress.
- [ ] Save periodically, on important state changes, and when hidden; do not rely exclusively on unload events.
- [ ] Offer Continue Run and an explicit discard/new-run flow so starting a new run does not silently erase the suspended one.
- [ ] Restore paused, without offline simulation advancement.
- [ ] Preserve map, enemies, towers and branches, resources, wave progress, timers, projectiles/effects needed for simulation continuity, and RNG state.
- [ ] Clear terminal runs and handle malformed/incompatible saves and unavailable/full storage safely.
- [ ] Ensure continuing or reloading cannot duplicate campaign rewards.

**Acceptance:** a reload mid-wave preserves the simulation state; equivalent subsequent inputs produce equivalent results. Test round-trip snapshots, invalid versions/data, lifecycle saves, no offline time jump, terminal cleanup, and reward duplication protection.

**Limit:** mobile process termination cannot guarantee a final save; periodic checkpoints bound potential loss. Do not promise lossless persistence under every browser shutdown condition.

## 3. Lone Tower — save active runs and settle rewards once

**Priority:** P0. **Scope:** medium–large. **Decision:** agreed.

Separate from KingsRoad because death/retreat banks run rewards into meta progression.

- [ ] Add versioned, validated snapshots and Continue/Discard controls.
- [ ] Preserve upgrades, combat state, resources, timers, and RNG.
- [ ] Save periodically, on important state changes, and when hidden; resume paused without offline advancement.
- [ ] Make death/retreat settlement safe against reloads and repeated completion callbacks.
- [ ] Clear terminal snapshots and handle invalid saves/storage failures safely.

**Acceptance:** equivalent continuation inputs yield equivalent simulation results. A completed or retreated run banks rewards exactly once, including after reload. Test crash/reload boundaries around settlement, not only a normal finish callback.

## 4. HR — disclose promotion tradeoffs and start with Intern

### 4A. Promotion tradeoffs

**Priority:** P0. **Scope:** small–medium. **Decision:** agreed; no immediate rebalance.

- [x] Show each selectable perk's benefit and actual difficulty contribution before selection.
- [x] Derive displayed values from the configuration/calculation used by the simulation.
- [x] Explain affected encounters accurately, including any difference between normal runs and interviews.
- [x] Do not describe an internal difficulty coefficient as an identical percentage increase to every enemy stat.
- [x] Update EN/RU copy without changing combat balance.

**Acceptance:** every offered perk exposes its tradeoff; copy matches the calculation; simulation numbers are unchanged.

### 4B. Intern-first onboarding

**Priority:** P0. **Scope:** small–medium. **Decision:** user requested.

- [x] Remove the initial choice among three starting characters.
- [x] Automatically establish Intern as the initial career character for a new player.
- [x] Preserve existing careers, unlocked characters, roster progress, and suspended runs.
- [x] Keep later character/roster choices intact; this is an onboarding simplification, not a roster reset.

**Acceptance:** a fresh player does not encounter the three-character choice and starts with Intern. Existing players retain their selected career and progress. Test new and existing save paths and suspended-run restoration.

## 5. Crosswords — durable assistance accounting

**Priority:** P1. **Scope:** small–medium. **Decision:** agreed.

- [x] Track successful reveal usage separately from visual cell markers.
- [x] Preserve usage through typing, deletion, clearing the grid, saving, and reloading.
- [x] Reset assistance history only when explicitly starting a new attempt, not when merely clearing cells.
- [x] Do not count a reveal action that has no effect.
- [x] Show the durable count at completion.
- [x] Migrate old saves using surviving reveal markers as a lower bound. Previously erased history cannot be reconstructed; do not pretend migration recovers it.

**Acceptance:** reveal → edit/clear → finish still reports assistance; reload preserves the count. Explicit new-attempt reset clears it. Highlighting remains independent of accounting.

## 6. KingsRoad — wave clarity, meaningful difficulty, and maps 21–30

### 6A. Upcoming-wave composition and enemy counters

**Priority:** P1. **Scope:** medium. **Decision:** agreed.

- [ ] Show upcoming enemy types and counts before the player commits to a wave.
- [ ] Generate composition from actual wave definitions, not separately maintained copy.
- [ ] Explain fire immunity, armor, healing, flying, and relevant attack/targeting interactions.
- [ ] Keep explanations accessible on a narrow phone screen and without hover.
- [ ] Update EN/RU copy.

**Acceptance:** preview matches actual spawned composition; descriptions match damage and targeting rules; threats can be understood before a costly loss.

### 6B. Strategy balance — investigate Ballista dominance

**Priority:** high design investigation. **Decision:** user requested harder, more interesting play rather than simply increasing enemy health. Specific mechanics remain proposals to prototype.

#### Player feedback

The user completed all 20 maps, rarely loses, and finds that placing Ballistas everywhere wins. Mage slowing has an understandable role, but Arrow towers do not feel clearly preferable to Ballistas, even with Lune/Fire branches.

#### Source observations, not a balance verdict

Ballista combines long range, high per-hit damage, air targeting, and piercing bolts. At maximum base level before armor, misses, support effects, and piercing:

- Archer: 16 damage per 0.5 seconds = 32 nominal damage/second; range 110; total purchase/upgrade cost 230.
- Ballista: 95 damage per 2 seconds = 47.5 nominal damage/second; range 165; total purchase/upgrade cost 400.

Price matters, but piercing and coverage may make Ballista's breadth too strong. Paper DPS alone cannot establish this.

#### Desired tower identities

- **Archer:** efficient rapid single-target damage; useful against scattered, fast targets.
- **Ballista:** heavy directional damage, strong against armor and along favorable firing lines, but not the universal answer.
- **Mage:** crowd control and support with a meaningful branch choice.
- **Catapult:** dense ground-group damage.

#### Benchmark before retuning

- [ ] Compare Ballista-heavy, Archer-heavy, and mixed strategies across the existing campaign with comparable budgets and several seeds.
- [ ] Record wins, lives lost, spending, damage, overkill, missed shots, enemies hit per bolt, and useful coverage where practical.
- [ ] Separate bot behavior from tower strength; test strategies that actually use each tower's intended strengths.
- [ ] Include hands-on playtests, especially on a phone, before claiming improved balance or fun.

#### Candidate experiments

1. **Piercing budget:** diminishing damage per enemy pierced or a limited penetration count. Preserve satisfying line-clearing without full damage through an entire procession.
2. **Cadence pressure:** spaced fast enemies and staggered approaches that expose slow, expensive shots and give rapid arrows a natural role.
3. **Placement and mixed defenses:** branching routes, dense groups, armored anchors, and support enemies. Teach threats before combining them; avoid surprise hard counters and arbitrary Ballista immunity.
4. **Targeting/damage-waste audit:** distinguish theoretical damage from useful damage before changing costs or stats.

**Recommended first prototype:** piercing budget plus cadence pressure, not a simultaneous overhaul of every tower or a global health increase. This is a recommendation, not an approved final rule.

**Success criteria:** mixed defenses and situational tower choices become meaningful. Ballista-heavy play can remain viable, but should not be the easiest answer almost everywhere. Do not target an arbitrary failure rate or make early teaching maps punitive.

### 6C. Maps 21–30 — third campaign chapter

**Decision:** schedule development of the next ten maps. A new visual theme and Mage tier-3 branches are proposed; exact theme, branch mechanics, and numbers need approval/playtesting.

Follow the existing structure: a new canvas/theme and a meaningful gameplay addition per ten-map chapter. Mage branches should replace the third upgrade, analogous to Archer branches, rather than add a mandatory fourth tier.

#### Candidate Mage branches

- **Deep Freeze:** stronger control, lower damage; brief freezes with per-enemy recovery protection to prevent permanent lock from stacked towers.
- **Brittle:** weaker slow, but enemies temporarily take more damage from subsequent hits. This overlaps Lune's damage mark and must be differentiated before approval; choose another branch if the distinction is not meaningful.

These are brainstorming candidates, not committed mechanics.

#### Proposed teaching progression

- **21–22:** introduce Mage branches in forgiving situations.
- **23–24:** teach rapid-target and firing-line challenges.
- **25–27:** combine split lanes, armor, crowds, and support enemies.
- **28–29:** harder mixed-defense tests with multiple viable builds.
- **30:** finale combining previously taught rules, not a surprise mechanic.

#### Milestone schedule

- [ ] Establish strategy benchmarks on maps 1–20.
- [ ] Prototype and playtest the Ballista/Archer adjustment.
- [ ] Decide, implement, and test the Mage fork and campaign unlock rules.
- [ ] Build maps 21–22 as a playable vertical slice with the new visual theme.
- [ ] Validate clarity, balance, performance, and phone layout through human play.
- [ ] Build maps 23–30 using the approved chapter rules, then run regression simulations and human acceptance playtests.
- [ ] Update `kingsroad-roadmap.md` with the user's completed 20-map playthrough, final design decisions, and measured results.

## 7. HR — pack odds and mechanics clarity

### 7A. Exact pack odds

**Priority:** P1. **Scope:** small. **Decision:** agreed.

- [x] Display exact rarity probabilities derived from the actual draw configuration.
- [x] Explain whether a guarantee exists; do not imply one if it does not.
- [x] Test that displayed probabilities match draw rules and sum correctly.

A visible rare-or-better guarantee/pity system is a separate progression decision, not approved by agreeing to show odds. The review estimated roughly one in four players could open ten packs without a rare or legendary at the current odds; verify the underlying configuration before using that figure in product copy.

### 7B. “Chance to quit” and inactive trait effects

**Decision:** investigate and clarify the user's confusion about “chance to quit.”

The phrase appears to refer to an employee resigning, not dodging an attack or abandoning an action. Shared roster data contains personal and team quit-chance modifiers. The inspected combat code explicitly excludes quit-chance and salary modifiers from run stats; the spot-check did not establish a functioning resignation probability. A full trace is needed before claiming how this mechanic works.

- [ ] Trace quit-related modifiers end-to-end, including whether and when any resignation roll occurs.
- [ ] Audit other displayed trait effects for applicability in HR.
- [ ] Hide or clearly label inactive effects instead of presenting them as current gameplay benefits/costs.
- [ ] For active effects, explain what changes, when it is evaluated, and what the displayed number means. Distinguish modifiers from absolute probabilities.
- [ ] Update EN/RU descriptions and add regression tests for the actual behavior.

Do not invent a base resignation chance or add a resignation system merely to make existing labels true.

### 7C. Rubber ducks — verify contact damage and make it readable

**Decision:** investigate the user's report that flying/orbiting ducks appear never to hit or damage enemies.

Source observations:

- Damage is intended at the ducks' orbit positions, not throughout the circle around the hero.
- Base configuration specifies 8 contact damage and a 0.4-second per-enemy duck-hit cooldown.
- The inspected duck attack path applies damage but no knockback, despite copy saying ducks “bump” enemies.
- These observations do not prove collision works in actual play.

Tasks:

- [ ] Reproduce contact in a controlled combat scene and verify rendered positions match collision positions.
- [ ] Test contact damage, per-enemy cooldowns, multiple orbiters, upgrades, and non-contact cases.
- [ ] Distinguish collision failure, weak effective damage, and insufficient hit feedback.
- [ ] Add readable contact feedback where missing.
- [ ] Correct misleading copy, or separately decide whether knockback belongs in the weapon's role.

Do not apply a blanket damage buff before establishing the cause. Any approved balance change requires broader HR simulations under the existing roadmap guidance.

## 8. Couples — temporary skipping and partner consent

**Priority:** P1. **Scope:** medium. **Decision:** agreed.

- [ ] Add Skip this time without adding the card to persistent hidden content.
- [ ] Keep Hide forever as a distinct action.
- [ ] Allow either partner to decline, including the second partner after the first has answered.
- [ ] Do not expose the first partner's answer when the second declines.
- [ ] Exclude declined cards from agreement scoring and show skipped counts separately.
- [ ] Handle all-skipped sessions without an invalid or misleading agreement score.
- [ ] Cover both together and match modes and EN/RU UI.

**Acceptance:** no forced answer, no mismatch penalty for declining, and no permanent hiding caused by a temporary skip.

## 9. KingsRoad pacing — shaped investigation, not automatic shortening

**Decision:** investigate alongside strategy balance before choosing a remedy.

**Question:** after a player has effectively finished building a defense, does the remaining map still require meaningful decisions?

The original review found some late victories with 4,000–7,000 unspent gold. This is a signal to investigate, not proof of excessive length: the bot may hoard or fail to use available options, and Ballista dominance may end meaningful purchasing early.

- [ ] Measure last useful purchase, not merely the last purchase a bot happens to make.
- [ ] Measure time from that point to victory, remaining spending options, threats/leaks, and ability use.
- [ ] Compare maps, seeds, and several strategies; inspect whether Ballista spam causes the apparent early finish.
- [ ] Deliver a recommendation for a bounded experiment rather than immediately changing the whole campaign.

Possible outcomes:

- Dominant strategy: address balance first, then reassess pacing.
- Repetitive solved waves: shorten or make that section more distinctive.
- Useful choices exist but go unused: improve clarity or bot decision-making.

Do not add another mandatory upgrade tier solely to absorb excess gold. Avoid conflating higher enemy health with better pacing or challenge.

## 10. Software Tycoon — deferred

**Status:** explicitly deferred by the user, who is testing the latest iteration. No improvement work now.

Retain the review idea for later reconsideration only: a compact “current assignment → next result → bottleneck → consequence” summary, with detailed rates underneath, using existing data and no new subsystem. Hands-on phone comprehension testing should precede replacing the current presentation.

Any future task must begin with `software-tycoon-roadmap.md` and incorporate the user's results from the current testing. This document does not authorize a parallel Tycoon redesign.

## 11. Couples English — authored-content editorial pilot

**Status:** explained proposal; a full rollout is not yet approved. The user asked whether this means the same authored-content approach used for Russian.

Yes: replace weak template-generated English prompts with deliberately written cards and useful follow-ups, not simply a higher generated prompt count. Reuse strong Russian ideas where appropriate, but adapt English naturally rather than translating mechanically. Aim for comparable quality, not necessarily identical language counts.

### Pilot

- [ ] Select one bounded theme for an English editorial sample.
- [ ] Write distinct ideas rather than many paraphrases.
- [ ] Give both answer options credible appeal; avoid an obvious “good partner” answer.
- [ ] Use natural, concrete English situations.
- [ ] Write follow-ups that invite stories, negotiation, or reflection rather than a generic “Why?”
- [ ] Check duplicates, missing fields, theme/game fit, and consistency with existing curated-content handling.
- [ ] Review with the user and fluent speakers before expanding to other themes.

Illustrative example, not a committed card:

> **Card:** You have one free evening together: make a plan, or leave it open?
>
> **Follow-up:** When does planning feel caring to you, and when does it feel restrictive?

Automated checks can verify structure and catch duplicates; they cannot certify conversation quality. Do not expand counts before validating the editorial standard.

## Verification requirements

For implementation tasks:

- Run targeted regression tests, the full test suite, and typecheck with the project's required test configuration. Record the configuration used.
- Update EN/RU user-facing copy together where applicable.
- Check changed UI flows in the browser and on a narrow phone layout when possible; report when a hands-on check was not performed.
- For persistence, test round-trip state, corrupt/incompatible saves, storage failures, reload/lifecycle behavior, terminal cleanup, and duplicate-reward boundaries.
- For balance changes, follow each game's roadmap simulation guidance; compare strategies and multiple seeds, not just a single successful bot run.
- Keep human playtesting separate from headless verification. Do not claim either occurred unless it actually did.
- Do not infer HR class-balance changes from the review's small sample.

## Decisions intentionally left open

- Final Ballista balance mechanism and numbers, after benchmarks/prototypes.
- Final Mage tier-3 branches, especially how the second branch differs from Lune.
- Third chapter visual theme and detailed map designs.
- Pack guarantee/pity rules, if any; exact odds disclosure is already agreed.
- Whether duck knockback is desirable versus correcting the description.
- English editorial pilot theme and approval of expansion after review.
- Any Tycoon change while the user's current test is ongoing.
