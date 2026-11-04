# Software Tycoon roadmap (`/tycoon`, merged 2026-10-12)

Carried over from the standalone repo's ROADMAP.md, and the single source of
TODOs for the game. The Calendar app is in `roadmap.md`. Nothing here is
blocking: the game builds, its tests pass and it ships.

**Current handover (2026-11-04; Stage 3 checkpoint).** The requested Stage 2 + café checkpoint
is pushed to `origin/main` as **`f0a9463`** (also includes the previously unpushed `a4ad89e`); nothing was deployed.
Read **"Stage 3 built and checked"** and **"Stage 2 built and checked"** before changing the engine. Saves are now
version **9**: profession-specific appointments, independent IC grades/management skill, automatic company
reviews and warned retention conversations. Company-level controls sit above the roster, not behind 120 approvals.
The café/garage remains founder-led. Stage 3 is included in this checkpoint on `main`. Next implementation step is **Stage 4:
ecosystem initiatives, milestone gates and research audit**, then Stage 5 workspace/navigation. **Balance remains
provisional**: four deliberately chosen comparison seeds include two IPOs and the same two struggling early studios.

**Stage 2 checkpoint (2026-11-03; pushed 2026-11-04 as `f0a9463`).** Independent floor operations replace post-hit
global turns. Version 8 migration preserves paid projects/progress on physical floors; café art keeps compact arms,
no founder cups, and founders/stools exactly 2 sprite pixels closer to the table. Stage 2 bot sample: 9/12 IPOs,
2 bankruptcies, 1 still running at 12 years. Historical "uncommitted" notes below describe their original checkpoint.

**Handover (2026-11-03; Stage 0 implemented locally, uncommitted).** The player completed the release-turn version
through IPO, sale, retirement and a fourth founding. Their latest decisions supersede the old clock-stopping loop.
Read **"Operating a company: implementation plan"** and **"Stage 0 built and checked"** first. Founder continuity,
café furniture, Studio overflow and IPO discovery are fixed. Operating/economy mechanics are unchanged: the global
release turn remains until Stage 2. No commits, pushes or deployments. Next proposed work is Stage 1, after approval.

**Handover (2026-11-01).** The hit stage was rebuilt after the player's second report: it is now a turn per release (plan, build, release card). Read "The plan: a turn per release" first; where it disagrees with anything below, it wins. Not committed yet.

**Earlier handover (2026-10-28).** The hit stage is now a release cycle (spec, choose, build, versioned release); see "Next steps" and "The release cycle".

**Earlier handover (2026-10-23, evening).** The one-product pivot is built end to end: phases 0 and A (the café and the hunt for a
hit, pushed earlier), then B (the hit is the company), C (internal tools and companion products) and D (endings, Absorb, the
journey) in this session, and a bot playthrough with a first retune (E). Saves are version 7. The work of this session is
not committed yet (see "Built: Phases B to E" below). **Start with "Next steps".**

## The plan: a turn per release (2026-11-01; built, not played by a person yet)

The player, on a phone: "impossible, overcrowded, over-explained", "research is done automatically", "feature build happens
automatically even when options are offered, I don't have enough time to choose", "too many buttons that don't explain what they
do". The causes, all confirmed in the code: 10 game days to choose (15 s at 1x, 7.5 s at 2x), then the PM picked; the dashboard had
no height limit, so it crushed the office scene to 0 px on a phone, and the notices drawn over the scene went with it; the cards
sat below it; the effects of Deep work and Strike back lived in hover tooltips, which phones do not have; "build Scale" and
"finish roadmap items" named things with no button. Fourteen buttons on one screen.

### The loop
1. **Plan.** The clock stops, with no timer, as soon as the company is free (`GameState.plan`, `awaitingChoice`; `store.running()`
   checks it). Three release cards, plus one for your own hands. Every card states its effect in numbers and its cost, on the card.
2. **Build.** The whole company works on the one release. One bar, one line saying what it will do. It ships itself at 100%.
3. **Release.** A card with what it did (`released` event, `ReleaseCardDialog`), then the next plan.

Nothing runs on a timer and nothing is chosen for the player. The analysts research only when sent: *Research more* (8 days, +15
clarity, new cards). There is no spec-writing phase any more.

### What the player decided
- **Research:** the automatic analyst/PM spec writing was the complaint. It is now the *Research more* button.
- **One hand of cards** (the player was unsure, so this was our call; easy to change after they play): deep work and Strike back are
  no longer rows of buttons but cards. Deep work takes the whole turn (no release meanwhile). Strike back is instant and leaves
  the plan open, and the slot refills with a deep work card.
- **Several floors:** one release at a time for the whole company, and builds must be harder so a second floor does not make them
  trivial. `RELEASE_MIN_DAYS` (30, up to double for big items) is a floor on any build at the company's full rate, and
  `RELEASE_FLOOR_WORK` (+75% work per extra floor) keeps extra floors only a little faster.
- **Agents are research now:** the dials, bills, incidents and `sim/agents.ts` are gone. *AI copilots* (AI wave, +10% work speed) and
  *Coding agents* (agent era, +15%) are nodes of the research tree.
- **Rival and friend stay**, as story events and cards. Their numbers moved to Studio -> Company.

### Screen
Top bar, office scene (`min-height: 24dvh`, always visible, so the notices are too), `HitPanel`: one line about the hit (tap for
Studio -> Company, the old dashboard read-only) and the plan, the build or your deep work. Side-product floors keep `ProjectPanel`.

### Two traps found by the bot (keep them fixed)
- Bugs grew with `target`, so raising targets to make builds harder gave 500 open bugs. `Project.scope` holds the real size, unpadded;
  `releaseBugs` uses it.
- The clarity reach factor went below 1 for a vague plan and compounds per release: with no analyst, reach fell from 2M to 2k.
  `clarityReach` is now a bonus only; vagueness pays in rework and bugs.

### Numbers
Bot, seeds 1 to 12, 12 years: IPO at 6.6 to 8.8 years, with seed 10 at 10.7 (5.9 to 7.7 before, seeds 1 to 4); a release every 36 to 52 days late in the run, about a
minute at 1x. The bot now plays cards (`plan` in `playthrough.ts`) but never deep work, and hires one analyst. Saves need no
migration: `plan` is optional, and an old save's `office.spec` and `agents` are ignored.

### Check after the player's run (`plan.choice` and `plan.research` are in the run log)
- Is a minute of build about right, or dull? `RELEASE_MIN_DAYS`. Do extra floors still feel worth it? `RELEASE_FLOOR_WORK`.
- Is one hand right, or do they want deep work beside a release? Do they ever pick deep work or *Research more*?
- Late game: does every plan feel like a real choice, or does the catalogue run dry into Stability?
- Dead weight to remove once this is liked: `setRoadmap`, `setWorkstream`, `Product.roadmap`, `Office.workstream` for the hit (a
  side product's floor still uses `releasePlan`), and the bot's `act2`/`planRoadmap`.

## Next steps (start here)

**Current priority (2026-11-04): follow "Operating a company: implementation plan" below.** Stage 2 is pushed;
Stage 3 is implemented and checked (see current handover); Stage 4 is in progress (ecosystem and operating-action checkpoints, plus the company-readiness checkpoint below). The player has supplied
the requested run and feedback. Items 0 and 1 below are historical handoff notes, not outstanding requests to play
again. Do not restore the global release turn, task queues, or automatic choice timers from those notes.

**0. The release cycle replaced the roadmap queue (2026-10-27, pushed as b030d4e).** Read "The release cycle" section first; it has
the design, what was built, the numbers and what is left. The roadmap dialog, the focus dropdowns and the Roadmap button are
gone from the UI; the "Guide for the next session" below still describes them and is out of date on that point (the item
catalogue, effects and `buildItem` it describes are unchanged).

**1. The player runs the changed game (waiting on them).** Nobody has seen the cycle in a browser: only render tests and the bot,
and the bot never chooses. Ask for a run log (Menu -> Export run log; `lab-tycoon-run-*.json`, untracked and gitignored: read it,
never commit it). The log has a `team.spec.choice` entry for each choice, `team.spec.discard` for each send-back and `team.spec`
when the PM chose unasked. Look at:
- *Did they use the choice?* How many specs were chosen by the player and how many by the PM after 10 days; if most were the PM's,
  the cards are not worth reading or the notices are missed (`SPEC_DECIDE_DAYS`, the notice text).
- *Is the choice real?* Did they pick the same kind of card every time (always the feature, never an item)? Do the "why"
  lines match what they saw on the dashboard? Do a game and a dev tool feel like different journeys?
- *Does clarity matter?* Did they hire analysts and a PM for a second floor, and did they notice the effect (reach +/-15%, rework, bugs)?
  If not, the numbers (`SPEC_*`, `CLARITY_*` in `balance.ts`) are too quiet, or the release card does not show it.
- *Is the payoff visible?* Do they read the "reach +12%, fit +3" toast and the Releases dialog? Reach is the immediate part
  only; users arrive over the following weeks, so a release can look like nothing.
- *Pace and fit to the stage*: how long from the move out to the IPO, and is the late game still a watched queue? The old
  questions (the hunt, Act 2 pace) are below in the first-run section.
- *Layout*: the spec cards sit in the project panel's place; check a phone, and the height of the dashboard stack.
- *Rough edges to expect*: a second floor has no analyst until hired (its panel says so); the bot's pace (5.9 to 7.7 years, seeds
  1 to 3) says nothing about how a person plays.

**2. Known gaps and rough edges**
- `scripts/tycoon/simulate.ts` (the old bots) and `scripts/tycoon/e2e.mjs` are stale. `playthrough.ts` replaces the
  first for balance; the second needs a pass (founding dialog, the café, the garage).
- The bot reads the true fit and sets an ideal roadmap, so its pace is a floor, not a forecast. Its first-floor logic is
  also crude (it rotates one floor through the streams).
- Companion products are launched from the roadmap (the Companions stream); they have no screen of their own beyond the
  dashboard's line and the Products tab. Retiring a companion frees its slot.
- A version 6 save loads with its directions mapped to workstreams, but it has no hit roadmap and may be past stages whose
  goals changed; fine for a test, not worth migrating further.
- Researches about running many products (licensing, the portfolio) were not reworked; they still exist.

## Operating a company: implementation plan (2026-11-03; Stages 0–2 built locally)

### Scope and authority

This records the latest player discussion and an inspection of the actual implementation, initially on a clean `main`.
The planning task changed only this roadmap; the subsequently authorised Stage 0 implementation is recorded below.
This section wins where earlier design records disagree. Older sections remain as implementation history.

**The target:** operate limited capacity across concurrent company responsibilities and initiatives, understand
what the work accomplishes, and build a persistent founder career. Do not replace one release choice with ten
repetitive floor choices, or five permanent assignments that reduce the game to watching income compound.

### Agreed decisions (do not reopen without a concrete implementation problem)

- One floor is one delivery team; assign the whole team, not percentages of its individual people.
- Profession leads manage their profession: a dev lead reviews/promotes developers, a design lead designers, etc.
  Coverage can initially cross the company; a local profession lead takes over their floor when appointed.
  Exact coverage/appointment rules are a design proposal to validate, not a reason to add another dropdown per employee.
- Leads operate automatically under company policy. Their management skill should matter; automation must not
  become unreliable busywork for the player. Manual employee inspection remains optional.
- Separate specialist progression (Senior -> Staff -> Principal) from leadership. Not every senior wants to manage.
  An ambitious senior blocked by an occupied lead position can eventually leave, with warning and response options.
  Extra lead posts require genuine organisational scope; do not invent empty posts as a retention exploit.
- Shared ecosystem workstreams serve the flagship and related companion products; e.g. a Data Platform plus an AI
  companion. Not a return to an unrelated product portfolio, nor a separate upkeep team for every companion.
- Standing responsibilities coexist with finite initiatives. No task queues, no automatic selection deadline,
  and no global pause while choosing the next roadmap task. Other teams and the business continue.
- Growth has visible, concrete requirements. Sustained neglect first slows growth, then can cause warned,
  recoverable deterioration and user losses. Healthy products should retain organic momentum.
- IPO still ends this company's chapter. Announce eligibility and make the achievement meaningful/discoverable.
- Continuing a successful journey preserves founders' identities/appearance; ask only for the new company name.
- Personal fortune, career standing and company operating capital are different. Choose the next investment and
  ambition together. Neither the flat $150K cap nor an automatic $100M deposit is the intended design.
- One floor uses its floor scene; two or more purchased floors use building-only presentation. Selecting a floor
  selects its operations context, not an interior scene. Remove Team "Show" and obsolete per-person desk controls.
- Prototype desktop building-left/operations-right; mobile must stay usable without squeezing that arrangement.
- Simplify Studio, fold post-hit product actions into operations, audit research, fix Industry modal scrolling,
  and give the founders a café-specific table with naturally positioned cups.

### Evidence from the supplied run

Source: the player's 2026-11-03 version-7 journal export, 1,812 entries over 5,418 days. It is an event journal,
**not an importable full save**. Do not commit the raw log or manufacture a saved state from its summary.

- Bright Interactive: 111 employee promotion actions versus 36 `plan.choice` actions; 120 people and 10 offices at
  IPO. Strong evidence that individual reviews dominate interaction at scale.
- Wren reached 11,526,076 users; IPO snapshot income was $2,412,957/day, valuation $10,639,530,505. Monthly snapshots
  miss that final peak ($2,283,649/day), so do not use the top-level `peakIncome` as definitive career peak.
- Ember Gate: sold from the garage, so do not force it through post-hit office operations just to support this redesign.
- Halcyon: two hits, Ivory and Meridian; three shipped products, one retired; ended with 12 employees. Migration
  must support existing multiple-hit/side-product states, not assume only one live product exists.
- Chapter 4 begins immediately at the export's end. Summary company stats reset while journal/tenure/world persist.
  Telemetry should label career and chapter scopes explicitly.
- The player's key complaint: income/reach grow without a clear understanding of what operating tasks change.
  This needs both causal explanations and consequential simulation, not tooltips alone.

### Code audit: retain, replace, and watch

| Area | What exists now | Implication |
|---|---|---|
| Clock and plans | `store.ts: running()` stops for **any dialog** and `awaitingChoice`; `sim/cycle.ts` owns one `state.plan` | Removing one pause check alone is not a parallel-operations implementation. Routine planning/results must be nonmodal. Keep intentional pause and deliberate blocking decisions explicit. |
| Company-wide builds | `cycle.ts` chooses one lead floor, sums helper output and scales target by extra floors and minimum days; `work.ts` borrows workers via `offices.ts: helpersOf` | Replace implicit whole-company labour and floor-count work inflation with explicit assignment accounting. An employee cannot contribute to two streams on the same day. Recalculate ETAs accordingly. |
| Older parallel engine | `teams.ts` still has per-office projects/releases/workstreams, but `teamDay` skips automatic starts on the signature product | Reuse project execution and effects, not the old ranked queue or automatic plan/spec selection. Do not simply expose the old workstream dropdown. |
| Ownership | `teams.ts: assignProduct` removes another office's ownership; `offices.ts` also separates desk `officeId` and remote `teamId` with a speed penalty in `work.ts` | Product ownership cannot represent shared ecosystem streams. Simplify physical/team membership while preserving capacity, regions, hiring and acquisition placement. Migrate remote assignments deliberately before removing desk controls. |
| Careers | `careers.ts: leadOf` picks any highest-level builder on a floor, irrespective of profession; Junior/Mid/Senior/Lead is one numeric ladder in `balance.ts`; promotions are individual actions | Profession leadership and IC levels need explicit representation, not more values appended to `LEVELS` (which would make specialists count as leads). Existing morale/readiness/departure hooks are reusable. |
| Growth | `scale.ts: growWorld` compounds healthy hits daily at `HIT_GROWTH_RATE=0.003`; built items persistently add capacity/pay/reach; `fit.ts` already models neglect | Preserve organic demand, fit, retention and constraints, but expose their causes and connect standing capacity to a bounded service level. Don't apply another unbounded growth multiplier per floor. |
| Research | `research.ts` uses a single paid calendar timer, independent of employee capacity | If research becomes a staffed stream, explicitly replace/integrate the timer; do not leave a second free path. Distinguish technology research, audience analysis and people-management skill. |
| Ecosystem | `companions.ts` supports Reach/Keep products with health and upkeep dependence, two shared side-product slots; `data/companions.ts` has six templates but no AI companion | Reuse health/relationship hooks; add type-appropriate initiatives and explicit costs. Preserve existing companions/side products rather than deleting them. |
| Growth/actions | `ProductsTab.tsx` owns grow/update/promote/localise/fix/retire/licence actions; `lifecycle.ts`, `project.ts`, `unlocks.ts` implement them | Move capabilities to operations before removing this tab. Pre-hit project hunting remains. Existing stage-based size locks aren't the new concrete operating-readiness gates. |
| Scene switching | `App.tsx` is a vertical stack; `BuildingOverlay.tsx` explicitly sets `view='floor'`; `TycoonApp.tsx` switches Pixi scenes; panels depend on selected office | Derive scene mode from actual floor count; decouple selected operations context from scene mode. Check two-region/mobile switching and scene-host ResizeObserver. |
| Studio overflow | `StudioDialog.tsx` has six tabs; `.tabs` is a non-wrapping flex row; `.modal` owns overflow and its sticky `.actions` footer shares that container | Credible cause of crowding and footer horizontal movement. Needs browser reproduction: contain table horizontal scrolling, allow children to shrink, and separate stable chrome from scrollable body. Don't just hide overflow and clip data. |
| Café art | `OfficeScene.ts: furnishDesks` still furnishes café workstations through office desk geometry and places cups at desk offsets | Give the café its own founder-table layout/anchors, preserving laptops/poses, guest routes, counter and depth ordering. Moving cup pixels alone won't fix the table. |
| Identity | `chapters.ts: carried` clones founders but assigns new IDs; `render-support/characters.ts: appearanceFor` hashes ID, consumed through `render/atlas.ts` | Persist an appearance seed/identity independent of simulation IDs; preserve existing world-ID uniqueness. FoundingDialog unconditionally shows the analyst-name input. |
| Exits/wealth | `exit.ts` has IPO blocker/valuation/ending, but eligibility action lives in `MenuDialog.tsx`; `chapters.ts` seeds 1% of worth clamped $15K-$150K | Reuse exit gates; add once-per-company eligibility announcement and persistent action. Separate valuation, liquid proceeds and new-company investment. Current legacy records are not a personal-finance ledger. |
| Persistence/testing | Save version 7 with explicit validation/upgrades in `state.ts`; substantial sim/UI tests; latest bot plays global cards | A real schema migration is required for changed semantics. Update bot/store tests, not just functions. Browser harness `scripts/tycoon/e2e.mjs` has obsolete imports and undeclared browser tooling; it isn't a working acceptance gate yet. |

### Staged implementation (each stage leaves a coherent, playable build)

**0. Low-risk fixes and baseline fixtures** — original feedback 6–9 and 11; no economy retune.
- Separate persistent founder appearance from IDs, omit personal-name editing on successful continuation, retain
  first-run naming and existing failed-chapter behaviour unless separately changed. Add multi-chapter regression tests.
- Fix Studio shrinking/table scroll containment and footer structure, with narrow-width browser reproduction.
- Announce first IPO eligibility once per company, explain valuation/ending, support "not now", and keep an obvious
  way back. Persist acknowledgement; loading an already-eligible save must not hide it or repeatedly announce it.
- Recompose café founder furniture/cups while retaining crowd and seating behaviour.
- Create deterministic café, one-floor, multi-floor/Europe, 120-person and eligible-IPO test fixtures from sim helpers.
  Preserve the supplied log as external evidence only. No product-control removals yet.

**1. Explain the business and define the operating contract** — prerequisite to capacity tuning.

**Implementation progress (2026-11-03, Stage 1 follow-up to Stage 0 `cce9283`):**
- `sim/business.ts`: pure current-state daily revenue/cost/net/runway, hit demand-pull constraints and deduplicated
  available builder capacity. `scale.worldGrowth` is shared by the display and simulation (no growth/economy retune).
- Main-screen Business today is an informational disclosure inside the same scrolling area as plans, not a separate
  flex child that can crowd plan controls off a phone. Rates are not user/revenue forecasts; capacity is not staffed work.
- Each existing cycle card has an outcome/staffing/cost disclosure: product affected, effect timing, delayed demand,
  upfront cash, extra tool upkeep, continuing costs, required build output, contributing floors and displaced work.
  Zero-output disciplines are visible blockers, enforced by `chooseCard` too. Localisation previews reuse wage-cushion
  budget validation instead of promising affordability the command would reject.
- `businessDecisions` is optional, validated, chapter-local save metadata (last 24 accepted decisions). Before snapshots
  precede costs/effects; releases complete by exact project ID, deep work at its outcome, and strikes immediately.
  Failed commands record nothing. Old v7 saves need no invented baselines; unknown historical effects are not reconstructed.
- What changed shows observed decision-to-completion deltas with an explicit non-attribution caveat. Completion
  measurements are at the action boundary, not end of day: fixes/work → team releases → rivals/nemesis → deep work/plans
  → users/fit/companions → revenue/costs → later staff/research/journey work. Integration tests pin release snapshots
  before the users/income pass. These deltas include intervening activity; do not present them as isolated treatment effects.
- `operating-contract.ts` defines a strict future one-of idle/finite initiative/standing assignment shape, validates its
  JSON shape, and defines service/provided/demand/unit/headroom/risk. Reliability/growth/research numbers are NOT tuned.
  Proposed event policy keeps random choices/offers/endings blocking and routine outcomes informational. These are
  tested Stage 2 boundaries, NOT attached to Office or wired into the legacy clock yet. Activating them requires the
  semantic save migration and full parallel slice together; do not merely remove the old pause check.
- Verification: **70 Tycoon files / 1,218 tests passed**, typecheck passed, production build passed. Full repository run:
  **184 files / 2,596 tests passed; 1 failure**: `tests/hr/run.test.ts` → `keeps foes, shots and gems under their caps`
  exceeded its 5,000 ms timeout. Isolated retry also timed out; no HR code/config was changed. Two subsequently added
  Tycoon UI tests passed in the 1,218-test run. Production Chromium: 1280/390/320px, no page errors, modal or horizontal
  overflow; reproducible fixtures/harness are `scripts/tycoon/stage1-{fixtures.ts,browser.mjs}`.
**Handoff:** Stage 1's existing-cycle explanation/snapshot slice is implemented. Review the contracts before Stage 2;
actual standing service demand/cost formulas, Office migration, reservation/conflict rules and nonblocking execution
remain Stage 2 work, not features secretly enabled here. Do not claim live parallel operations or staffed research.

- Add a shared read model for current demand/growth constraints, revenue, costs, product health and effective team
  capacity. Surface actual causes already computed by products/fit/scale/economy; do not invent retrospective attribution.
- Every initiative: intended outcome, affected product/ecosystem, team requirements, cash/upkeep and displaced work;
  separate immediate effects from delayed demand. Every standing assignment: provided service, demand, headroom and risk.
- Record snapshots/deltas at decisions and outcomes; describe associations honestly, not "this caused all growth".
- Add compact "why growing / what's limiting / what changed" information to the main operations area before deep UI work.
- Nail down minimal saved assignment types, blocking-vs-informational events, and day-order rules in tests. Concrete
  stream roster/costs/review cadence are tuning proposals, not player-approved numbers.

**2. Parallel operations vertical slice** — replaces the global release turn, with a minimal usable operations UI.
- One explicit assignment per floor: finite initiative, standing responsibility, or clearly idle. No hidden helper
  labour and no queue. Allow an explicit later reassignment; show progress/cost consequences before confirmation.
- Implement at least a finite product initiative alongside a standing reliability assignment, then expand to broad
  market growth and research responsibilities. Missing professional skills must produce a visible blocker/slowdown,
  not an unexplained infinite ETA; analyst-only work should not require engineering points.
- Idle teams do not choose initiatives automatically. An explicit standing responsibility can continue without another
  click; completion leaves its team awaiting an assignment while all others run. Warn without forcing a modal.
- Reuse project scope/quality/bug/effect functions. Remove global helper aggregation, floor-count target inflation and
  the global plan/deep-work mutex for routine company work together; preserve the earlier scope-vs-target bug fix.
- Audit same-product parallel release conflicts: reserve unique initiatives, prevent duplicate unlocks, apply additive
  changes safely, assign versions at completion, attribute release notes correctly. Standing work cannot also build.
- Manual pause still works. Routine planning, research refresh and release summaries must not pause the business through
  the generic dialog rule. Important event choices can remain explicitly blocking; no silent speed-up of those events.
- **Gate:** with two teams, choosing/waiting on team A never halts team B or charges/credits A's staff to both streams.
  Do not ship a halfway state that merely removes `awaitingChoice` while every floor still joins one release.

### Café correction: move the seats, do not stretch the arms (2026-11-03)

Player explicitly rejected extended hands/sleeves. Undid the width-specific arm extensions, restoring the compact
high-table typing patches. Moved both founders **and their stools exactly 2 sprite pixels toward the table** via the
shared `founderCafeStation` seat anchor (left 16.5 → 18.5; right 59.5 → 57.5). Table/laptops, body proportions and
absent founder cups are unchanged. Hit targets/popups use the same seating anchor. Regression tests pin the 2px
movement and compact 8px arm patches, and check keyboard contact for the two pictured founder sprites in either
facing. The preceding “every character contacts the keys” claim applied to the rejected stretched-arm proposal,
not a justification to stretch other sprites again. No commits, pushes or deployment.

### Café follow-up: no founder cups, hands on the keys (2026-11-03)

Player requested removal rather than further cup positioning. Removed founder cup drawing, colours, dimensions and
anchors entirely; guest/order/counter cups and café crowd are unchanged. The café-only typing arms now use each
character's actual width to reach over the laptop keyboard, in both mirrored seatings. Shoulders stay attached and
all five sprites retain closed outlines. A coordinate regression checks both typing frames against real laptop key
pixels for every character and facing, rather than merely asserting that the arms are raised. Idle/think/break poses
and non-café typing are unchanged. Desktop/mobile browser checks, click targets, typecheck and build passed; targeted
pose/presentation tests passed. No simulation changes, commits, pushes or deployment in this follow-up.

### Café high-table visual prototype (2026-11-03; supersedes the joined founder desk)

Player rejected the combined low slab and wide cups. The new local prototype uses **stool → pedestal table → stool**,
with the founders still facing each other. Founder and guest furniture now share `drawCafeTable`/`drawCafeStool`;
the founder top is 30px wide instead of a guest table's 18px to fit two 11px laptops with clear space between their backs.
It has the guest table's thin wooden top, single central pedestal and foot, not the old 22px-deep office-desk slab.
The stools replace office chairs and meet the seated hips. Café-only bent high-table typing arms preserve shoulders,
heads, appearance and seated legs; office/garage poses stay unchanged and atlas cache keys distinguish the variant.
Cups now have **3px lids and 2px tapered bodies** instead of 4px rectangles. Their last body row is one pixel above
the tabletop edge, with both cups in the clear space between laptop backs, not painted on the vertical trim.
All positions come from `render-support/cafe-desk.ts`; hit targets/popups retain the corresponding founder anchors.

Checks: **72 Tycoon files / 1,235 tests passed**, including closed-outline checks for high typing on all five character
sprites and explicit tabletop/laptop/cup geometry. Typecheck and production build passed. Browser checked desktop and
390px phone, both founder click targets, active client-work typing/screens/crowd and no page errors/horizontal overflow.
Harness: `scripts/tycoon/cafe-high-browser.mjs` (optional synthetic active-contract `WORKING_SAVE`). This is a local
visual proposal awaiting player review; no commits/pushes/deployment, no simulation or Stage 2 changes in this art task.

### Stage 2 built and checked (2026-11-03)

**Functional slice, not a completed balance pass.** `operations.ts` owns explicit assignment commands, previews,
confirmation, reservations and the migration; `services.ts` owns shared standing read models. `Office.assignment`
is now live. The real move-out/new-floor paths create idle assignments; idle floors never choose work. Finite
initiatives ship into idle and notify without a release-card modal. The operations panel selects a floor and product,
shows its ETA/blockers, scope, upfront/upkeep/payroll costs and standing coverage, and confirms replacement inline.

- **Capacity and day order:** active fixes → per-floor work → finite team releases/snapshots → standing service →
  rivals/founder work → users/fit/companions → income/costs → staffed research and later staff work. Operations do
  not borrow helpers or inflate targets by floor count. The existing 30-day build floor is applied to **only the
  assigned team's rate** (up to 60 days for large items). Real `scope` remains separate for bug calculations. Founder
  deep work can coexist; only the player founder is excluded, not their developer friend. Remote team reassignment
  is blocked in operations; physical same-region transfers/hiring/acquisition still work.
- **Reliability pilot:** output is min(engineering, QA)/20 bugs/day; demand is existing discovery + pending-bug
  surfacing + open backlog/60. Output removes open bugs, never invents capacity or users. Existing bug/fit/retention
  pressure supplies deterioration; warnings are informational, not a new random punishment. Payroll and rent already
  pay for service staff; no extra salary charge. Flagship reliability also supplies the existing companion reach-care
  hook. Companion freshness still needs an explicit finite release; the fuller ecosystem design is later work.
- **Growth pilot:** analyst/PM skill/50 plus design output/20 versus 1 + users/500K specialist-days/day. Shared
  coverage adds **at most +25%** to healthy organic demand-pull, not a multiplier per floor or a guaranteed user gain.
  Unstaffed healthy products retain baseline organic demand. Numbers are tuning proposals, not player-approved balance.
- **Research:** analysts/PMs contribute skill/50 specialist days/day to one paid technology/audience project. It needs
  a standing research assignment and a separately selected project; engineers are not required. `remainingWork`
  persists; taking analysts away stalls, reassigning resumes, and costs are charged once. The pre-office timer is kept
  only for the café/garage. Both Research and operations explain stalled work rather than displaying an infinite ETA.
  Insight remains a separate audience-reading resource, not a second technology-research timer.
- **Conflicts/effects:** reserve features/compliance, unique built items, localisation and polishing per product;
  companion launches reserve company-wide slots. Different initiatives can ship on the same product in a single day.
  Versions/notes are assigned at completion to the releasing floor. Feature IDs and built-item effects deduplicate;
  operating releases retain previous built-item fit modifiers instead of erasing them on a parallel completion.
  Failed reassignment commands preserve the old project/reservation/cash. Confirmed replacement discards unfinished
  progress without refund; standing replacement stops coverage immediately. Every accepted finite operation records
  its own exact-project business snapshot and journal entry; monthly floor telemetry names assignments, not old streams.
- **Clock:** routine inspection, research, planning disclosures and results do not pause an operating company. Manual
  pause still works. Event/offer decisions, IPO/founding/move-out and manual carried-project shipping remain explicit
  blocking boundaries; pending decisions cannot silently run behind an informational panel. The café/garage retains
  its old clock behaviour. Old cycle helpers remain for pre-operating/legacy tests, not the live post-hit control path.
- **v7 → v8 migration:** preserve founders, salaries, identity, regions, products/companions, project IDs/features,
  payments, actual progress, scope/quality and research already paid. Remove global plans and remote team overrides;
  recompute remaining build work against physical-floor capacity while retaining absolute progress. End legacy fixing
  pairs/on-call: bugs already fixed stay fixed; their staff return to their floor. Other floors become explicitly idle,
  not automatic reliability. New/contract projects already running remain visible as carried manual/client work in the
  same `Office.project` reservation. Existing manual product-tab updates/localisation also reserve their floor and keep
  their manual shipping path; broader post-hit product-control consolidation is still Stage 4, not secretly removed.
  Assignment shape/content/product/project references and research work numbers are validated on load.

**Verification:** final Tycoon run **72 files / 1,234 tests passed**, including simulation and mounted-UI gates:
waiting/confirming on A never stops B, no employee contributes to two streams in a day, no helper/ETA inflation,
completion-to-idle, safe cancellation, duplicate reservations, completion versions/attribution, additive fit,
analyst-only research/stall/resume, deep-work coexistence and v7 migration/v8 round-trip/malformed data.
Typecheck and production build passed. Full repository run (before the final additive-fit regression) was
**187 files passed / 1 failed; 2,613 tests passed / 1 failed**: the already-recorded unrelated
`tests/hr/run.test.ts` → `keeps foes, shots and gems under their caps` timed out at 5,000 ms. No HR files/config changed.
Production Chromium acceptance passed at **1280, 390 and 320px**: selecting teams, initiative preview, inline
reassignment/cancel/confirm, business inspection, no page errors, assignment modals or horizontal overflow. Reproduce
with `scripts/tycoon/stage2-{fixtures.ts,browser.mjs}` and the Stage 0 external Playwright/library setup.

**Bot / balance handoff:** the bot now makes explicit assignments rather than old queues/workstream auto-starts. Seeds
1–12, 12-year limit: **9 IPOs (9.2–11.1 years), 2 bankruptcies (seed 2 at 4.7 years; seed 8 at 4.0), seed 10 still running
in Europe at 12 years**. Most late-game retained releases are ~31 days apart company-wide in these runs. The bot is
optimistic, reads true fit and chooses all assignments automatically; this does not validate human decision cadence.
Seed 2's low-revenue mobile flagship/hiring/capital decisions need investigation, not a hidden subsidy or a claim that
all seeds passed. Validate one-floor affordability, standing research opportunity cost, reliability demand/headroom and
multi-floor pace before calling economy tuning complete. Do not roll back to the global paused release turn.

**3. Professional management and careers** — original feedback 1.
- Separate IC seniority, leadership appointment/coverage, and management skill. Preserve existing pay/experience on load;
  grandfather existing Leads with deterministic scope, flag conflicts rather than silently demoting or removing people.
- Shared profession coverage until a local lead exists; deterministic coverage on reassignment/departure and no duplicate
  reviewer. Review analysts/PMs too: the player must not inherit a second manual roster outside builder professions.
- Automatic periodic reviews under company policy and payroll guardrails. Aggregate reports instead of one popup per
  person. Budget pressure is an exception decision, not 120 approvals. Management affects coaching/review capability;
  weaker leads do not randomly miss an earned promotion and make the player audit everyone.
- Specialist and management ambitions; Staff/Principal contributions; genuine lead openings. Warned career conversations,
  response windows and possible departures reuse knowledge-transfer/morale systems without double departure rolls.
- **Gate:** a 120-person company can complete reviews with no employee-list scrolling; appointments, budget changes and
  retention problems still give the player meaningful choices. Founders/CEO/CTO and save-roundtrip tests remain valid.

### Stage 3 built and checked (2026-11-04; checkpoint on main)

**Entry points.** `sim/career-profile.ts` owns IC grades/management metadata and their validation. The simulation is
in `sim/people-management.ts`; `PeopleManagementPanel` is at the top of Team, before offices and the ordinary roster.
`EmployeeDialog` explains the same model without a managed-company Promote button. Store commands are
`appointProfessionLead`, `setReviewPolicy`, `respondCareerConcern`; individual promotion commands cannot bypass policy.
Café/garage hires retain their previous promotion system until moving out. A carried founder can still advance their
retained IC grade manually in the next café; old-company appointments/conversations do not carry over.

**Separate dimensions, not extra legacy levels.** `Employee.career` records Junior/Mid/Senior/Staff/Principal grade,
grade date, management skill, specialist/leadership ambition, compensation floor and an optional appointment. The old
`level` stays within 0–3 for existing PM tables; it no longer implies a lead in a managed company. Staff/Principal
increase individual output (including analyst insight and assigned research) without requiring a managerial vacancy.
The existing PM role/course/office-direction effects remain; changing analyst -> PM keeps the new specialist grade.
Management skill affects coaching and own-profession work, never a random chance to miss an earned promotion.

**Coverage and real posts.** Engineering, design, QA, and product/analysis (analysts + PMs together) have separate
coverage. A local lead takes precedence over a company lead; each person has at most one reviewer and never reviews
themself. Uncovered staff still receive the guaranteed company-policy review, without a profession coach. Company
leads can cover both buildings; moving a local lead does not silently move their appointment. Departure removes them
from coverage immediately. New posts need at least three people in the profession/scope; a local post also needs a
staffed same-profession team on another floor. Creating local coverage must not empty an existing company post.
Candidates are Senior-or-higher specialists with independent management skill, not simply the best builder on a floor.
New appointments have a guarded leadership premium; specialists need no appointment to progress.

**Reviews and treasury.** Every 30 days after activation, one aggregate review covers everyone, including analysts/PMs.
Ready candidates are processed deterministically (oldest earned review, then ID); no per-person promotion popup or
approval. One report/notice gives reviewed/promoted/deferred counts, payroll before/after, lack of coaching and reasons.
Keep at most 12 reports. Default policy: automatic promotions, two months' operating reserves, no additional payroll cap.
A discretionary raise needs sustainable daily income or the selected operating reserve; an optional company payroll
ceiling also applies. Guard/report payroll includes wage research/modifiers consistently with actual charged payroll.
The ceiling does not cut existing pay or freeze normal market repricing. Hold/reserve/cap changes
are company decisions. Budget exceptions are explained once in the company surface, not 120 manual approvals.
The 120-person acceptance fixture reviews and promotes everyone without rendering/scrolling an employee list.

**Retention, without doubled quit rolls.** A ready promotion held for 60 days, an unavailable leadership path held for
180 days, or morale below 20 can open a named conversation. The warning is aggregated; the exception list gives a
90-day response window. Discuss once for another 90 days, resolve the policy/budget/working conditions, appoint to a
genuine opening, or agree a specialist path for a leadership concern. Resolved concerns clear; founders never leave.
An unresolved deadline uses `depart` and the existing researched knowledge handover exactly once. Managed companies
skip both old random morale quits and old random long-tenure departures. These timings/management bonuses are first
implementation values, not a completed balance retune.

**Persistence.** Explicit v8 -> v9 migration activates management for operating offices; v3–v7 saves first receive the
existing operations migration. Active projects, products, paid progress, research, knowledge, identity, pay and dates
are retained. Old numeric Leads become experienced Senior ICs with their old compensation floor: oldest lead by
level date/ID gets company scope, others get deterministic physical-floor scopes, with duplicate/unsupported scopes
flagged for a player decision rather than silently losing pay or people. V8 loads must **not** rerun the old founder
marking migration (it could halve an arbitrary employee's wages); this has a regression test. V9 validates career
bounds, policy, bounded reports, complete managed staff metadata, appointment references and duplicate active posts.
Next ventures retain founder identity/IC experience/skills, not old-company appointments, conversations or policy.

**Checks.** Latest Tycoon suite: **74 files / 1,263 tests passed**, including 27 new management/120-person UI tests.
A cleanup-only follow-up passed 56 targeted tests. Typecheck and production build pass with raised Node heap. Whole
repository run: **189 files passed / 1 failed; 2,639 tests passed / 1 failed**: the same unrelated
`tests/hr/run.test.ts` -> `step > keeps foes, shots and gems under their caps` hits its existing 5,000ms timeout.
Four subsequently added management regressions also pass in the final Tycoon run; do not describe the wider repo as
green. On a 2GB runner, run full tests/typecheck/build sequentially; parallel heavy checks can be killed by memory pressure.

Real production-preview browsers at **1280, 390 and 320px** pass: 120-person aggregate review, payroll-cap rejection,
company lead appointment after releasing the cap, reachable Close, no page/policy overflow, no JS errors. Existing
parallel-operations acceptance passes at all three widths; café desktop/phone acceptance still passes (compact poses,
2px seating, hit targets, live screens/crowd). Synthetic generator and browser scripts are `stage3-fixtures.ts` and
`stage3-browser.mjs`, using the same external Playwright/library setup as Stage 2. Images are under
`/tmp/tycoon-stage3-shots`; the 390px compact summary is `people-390.png`. The current production preview
is on port 4322; pass `BASE_URL=http://127.0.0.1:4322/tycoon/` (the Stage 3 script defaults to dev port 4323).

**Bot comparison, not a new win-rate claim.** The bot no longer approves individual post-hit promotions. Its explicit
optimistic policy appoints eligible profession leads monthly and readily agrees specialist alternatives for blocked
leadership ambitions; neither is a simulation-side automatic choice. Twelve-year checks deliberately included the
known difficult seeds, rather than a random four-seed sample:
- Seed 1: IPO day 3,420 (**9.5 years**), $18.31M cash.
- Seed 2: bankrupt day 1,717 (**4.8 years**), Headquarters, ~$928k lifetime revenue.
- Seed 8: bankrupt day 1,444 (**4.0 years**), First floor, ~$988k lifetime revenue.
- Seed 10: IPO day 4,219 (**11.7 years**), $21.97M cash (Stage 2 was still running at year 12).
Late retained releases remain ~31 days apart in the IPO runs. These results do not resolve the two known early-studio
affordability failures, prove an unattended baseline, or replace the Stage 7 12-seed/human usability gate. Continue with
Stage 4 without adding a hidden subsidy, global pause, automatic initiative picker or free helper capacity.

**4. Ecosystem initiatives, milestone gates and research audit** — original feedback 10 and 13.
- Convert post-hit grow/promote/update/localise/companions/retire and relevant licensing/contract capabilities into the
  single operating entry point. No orphaned action or hidden bypass in the store/sim. Keep pre-hit project creation.
- Add suited companion initiatives (including AI around a Data Platform), their shared-service demand and measurable value.
  Review the fixed two-slot limit against the new capacity model; don't silently remove old side products to make room.
- Concrete readiness for each scale transition: show requirements and effects before committing. Use effective current
  capacity/health and actual completed capabilities, not arbitrary title checks. Avoid circular gates between research,
  next-size projects and stage advancement; preserve viable paths for all product types and a small early-sale studio.
- Audit every research ID as keep/rework/merge/retire: real effect, available UI path, stage/era gate, companion usefulness,
  saved-ID compatibility, carry-over meaning. Resolve overlaps (e.g. research CI pipeline vs built CI tool) explicitly.
- Separate persistent founder knowledge from facilities/company practices that need re-establishment. Do not silently strip
  the player's 30 completed unlocks; migrate with documented retained benefits/equivalents.
- **Gate:** a growing business eventually requires reallocation/expansion; unattended growth is not perpetual free money,
  but neglect is warned and recoverable. Product size matters for opportunities, not arbitrary user caps alone.

### Stage 4 progress: shared ecosystem care (2026-11-04; checkpoint on main)

**Scope:** the companion/shared-service vertical slice, not completion of Stage 4. The new AI data assistant is a
Keep companion suited to Data Platform. Its finite operating initiative needs the AI Product's real era, reputation
and Machine Learning unlock; existing companions retain their previous availability. Companion launches are offered
only from the flagship context. Company-wide launch reservations and the existing two slots still apply. Retained
side products are preserved; the capacity-based replacement for the two-slot limit is **not** implemented yet.

**Actual capacity, not a boolean care flag:** flagship reliability demand now includes flagship + live companion
bug generation/pending bugs/backlog and **0.25 service points/day per companion** for integration/support. One service
point can otherwise fix one bug. Each reliability team's output pays its proportional share of that overhead, then
splits its remaining fixing budget across ecosystem open bugs. More companions cannot multiply fixing capacity;
unrelated retained side products do not enter this pool. A direct reliability assignment on a companion still fixes
that product only; it does not supply shared flagship care. Team payroll/rent continue to be charged once.

**Value, costs and recovery:** in operating companies, healthy companions' existing reach/retention/pay bonuses scale
by supplied / demanded flagship reliability, capped at 100%. Zero shared coverage means zero flagship bonus. Monthly
companion reach following uses the same fraction instead of treating any token assignment as full care. Existing
freshness/bug health rules and unhealthy-companion fit pressure remain; shared care fixes bugs, **not** release age.
Select the companion context and assign an update when stale. Operating companion users now incur the existing
per-user hosting rate; nonoperating legacy states and unrelated non-hit side products keep their old hosting rules.
The 0.25 care cost is an initial tuning value, not a player-approved final balance target.

**UI and persistence:** previews spell out full-care bonuses, the slot, ongoing service/hosting demand and loss of
bonus without coverage. Operations shows shared coverage, current bonuses, slot availability and each companion's
health/recovery route. No new modal or automatic assignment. No new saved shape/version: these are content additions
and live service/economy formulas on existing v9 assignments/products. Old completed research, side products and paid
initiative progress are untouched; old saves will see the new care/hosting costs when running operations. Added
regressions cover launch gates, side-product context, reservations, slot preservation, reload/completion, shared
fixing budgets, hosting, neglect/reallocation, freshness and the nonmodal health panel. Synthetic browser entry points:
`scripts/tycoon/stage4-fixtures.ts` and `stage4-browser.mjs` (same external Playwright setup as Stage 3).

**Verification:** final Tycoon suite **75 files / 1,274 tests passed** (11 new tests). Typecheck and production build
pass. Full repository run, with the correct test environment: **190 files passed / 1 failed; 2,654 tests passed /
1 failed**. The failure is the existing `tests/hr/run.test.ts` -> `step > keeps foes, shots and gems under their caps`:
`Error: Test timed out in 5000ms.` No HR code or timeout was changed. Test shell requires `NODE_ENV=test`; the gateway
shell defaults to production, where React `act` is absent. On Node 26 also use `NODE_OPTIONS=--no-experimental-webstorage`
(and `--max-old-space-size=1024` for memory-heavy checks). Initial runs without those environment overrides are not
valid regression evidence. Run full suite/typecheck/build sequentially on this 2GB host.

Production-preview Chromium passes at **1280, 390 and 320px**: discover AI initiative and its cost/value preview,
assign shared care and observe coverage/bonus recovery, show reassignment consequences/cancel without a modal, no
page/operations/preview horizontal overflow and no JS errors. Screenshots: `/tmp/tycoon-stage4-shots`. Example harness:
`LD_LIBRARY_PATH=/tmp/lab-browser-libs/root/usr/lib/x86_64-linux-gnu PLAYWRIGHT_MODULE=/tmp/lab-browser-tools/node_modules/playwright/index.mjs BASE_URL=http://127.0.0.1:4322/tycoon/ node scripts/tycoon/stage4-browser.mjs`.

Four deliberate 12-year comparison seeds (same optimistic bot, **not** a win-rate estimate): seed 1 IPO day **3,428**
(9.5 years), $111.70M operating cash; seed 2 bankrupt day **1,717**; seed 8 bankrupt day **1,444**; seed 10 still
running at day **4,320**, Europe, $775.06M cash / $1.02B lifetime revenue. Seed 10 previously IPO'd day 4,219 in Stage 3:
this comparison is **not regression-free**, and the strong cash variation needs investigation with the scale-readiness
and bot-policy work rather than a hidden subsidy/auto-picker. Late retained releases remain ~31 days apart. Existing
early-studio failures are unchanged. These checks do not establish good balance or satisfy Stage 7's 12-seed/human gate.

**Superseded handoff:** the following operating-action slice implements the main product/commercial entry points.
The research audit, company-practice carry-over, capacity-based slot review and company-scale milestones are still open.

### Stage 4 progress: operating actions and paid scope expansion (2026-11-04; checkpoint on main)

**One operating entry point:** finite feature/polish/compliance/localisation/companion releases are joined by explicit
Grow-to-next-size and retained-product Pivot-to-audience initiatives. They preview one floor's required discipline
output, duration, cash/reserves and outcome before assignment; replacing paid work warns that progress and upfront
costs are lost. There is no task queue, global planning pause or automatic selection. Scope/audience changes reserve
the product exclusively; other independent products/standing work continue. Conflicts are enforced in both the
operations command and low-level project execution. Unknown/stale sizes or audiences fail without releasing the old
assignment or spending cash. Proposal metadata is normalised before saving, so a preview's `why` cannot poison a save.

**Growth readiness, first boundary only:** the product must be old enough (existing 240-day maturity), fresh enough
not to be fading, below the existing noticeable-bug-density threshold, funded with the existing wage reserve, and
backed by actual design/engineering/QA output on the chosen floor. Only the next size is allowed. Managed growth no
longer waits for an arbitrary journey title; this avoids the enterprise-size / next-stage circularity. Pre-hit project
size/title rules remain unchanged. Growth reuses the real growth target, budget, reach/size/freshness effects, automatic
release/versioning and decision/outcome snapshots. Growing scope **does not** add server capacity or promise users.
At this checkpoint, company-scale milestone/capability requirements remained unfinished; the later local readiness slice addresses the chapter gates.

**Commercial controls:** the selected product has a nonmodal disclosure for paid promotion (recovery, cost, delivery
window and conditional gross payback), researched automatic-promotion policy, licensing/ending a licence, and a
confirmed product sale/retirement with proceeds, morale/reputation consequences and a clear distinction from a company
exit. These are cash/policy decisions, not fictitious delivery-team assignments. The post-hit Products tab is now a
read-only catalogue/history summary with a return to operations; it is **not** removed yet (Stage 5). Direct legacy
new-product/update/grow/localisation/pivot commands reject managed offices; pre-hit creation/hunting remain available.
The old next-project shortcut is hidden for carried post-hit releases. A legacy no-audience product can pivot to any
real audience, rather than incorrectly treating the first listed audience as already selected.

**Client work:** the same inline board exposes ordinary and context-relevant enterprise offers, team-only ETAs,
deadlines and deposits. Taking work requires an idle floor; missing operating skills, expired offers and enterprise
product conflicts are explained and enforced by the command. A contract's project reserves that floor (its assignment
stays idle underneath); it cannot also run a standing service or another initiative. Delivery settles automatically,
leaves the floor idle and picks nothing next. Reassigning an active contract is blocked even with the generic
confirmation: use explicit abandonment, which previews and charges the deposit refund/reputation loss. This closes
an actual deposit-erasure loophole. Taking a job while manually paused now **preserves pause** in operating companies;
pre-hit convenience behaviour is unchanged. Selling/retiring a product immediately idles directly assigned standing
teams and removes its outstanding enterprise offers, so an immediate reload cannot retain dangling references.

**Save v10:** grow/pivot reservations are distinct from maintenance. V9 paid work retains exact target/progress,
project ID, cash and staff/management policy; old mislabeled growth/pivot metadata is translated before validation.
An idle-labeled old pivot/growth becomes an explicit team initiative without restarting its paid progress. Other
carried projects retain their existing handling. V3–v8 still follow the established earlier migration steps; no
second founder-pay or people-management migration is run for v9. New saves reject unknown/mismatched scope/audience
reservations and projects claiming both grow and pivot. Repeated reload is idempotent. No research IDs or founder
knowledge benefits are removed in this slice.

**Checks for the operating-action follow-up:** final Tycoon regression suite **76 files / 1,292 tests passed**,
18 more tests than the ecosystem checkpoint. The full repository run during this slice passed **191 files / 2,670
tests**, with the same single unrelated HR failure: `tests/hr/run.test.ts` -> `step > keeps foes, shots and gems under
their caps`, `Error: Test timed out in 5000ms.` Two subsequent UI/low-level-guard regressions are included in the final
Tycoon count; do not describe the entire repository as green. The updated selected-office store test now exercises
client work after transfer instead of expecting an unrelated post-hit new product to start; it still checks the
selected office receives the project. This slice is committed as the Stage 4 ecosystem/operating-actions checkpoint on main.

The default optimistic bot policy is retained for comparison: seeds **1/2/8/10** reproduce the ecosystem checkpoint
exactly (IPO day 3,428 / bankrupt 1,717 / bankrupt 1,444 / still running 4,320). Optional `OPERATING_GROWTH=1` prioritises
a currently available next-size initiative after server/Europe work, preserving six months of operating costs; it
is a bot choice, not simulation automation. Separate 12-year runs: seed 1 IPO **3,525** (9.8 years), $227.14M cash;
seed 10 still running **4,320**, Europe, $771.44M cash / $1.01B lifetime revenue. Neither resolves seed 10 or the cash
variation; do not tune a subsidy around these two optional-policy samples or call them a win-rate estimate. Late
retained releases remain ~31 days apart. Growth readiness in this slice is not the final company-scale balance model.

Final typecheck and production build pass. Real production-preview Chromium passes both the new product-action
acceptance and the earlier ecosystem acceptance at **1280, 390 and 320px**. Screenshots:
`/tmp/tycoon-stage4-actions-shots`. Browser fixture/harness: `stage4-fixtures.ts`, `stage4-actions-browser.mjs` (same
local preview/external Playwright environment as above). It covers growth preview/assignment, warned progress loss, taking client work while paused,
cancel/confirm contract abandonment, paid promotion/policy, licensing blocker, product-sale/retirement confirmation
and cancel, no blocking modal/JS errors or horizontal overflow. Phone commercial disclosures have a dedicated
vertical body so licensing blockers and the retirement heading cannot run into one another.

### Stage 4 progress: concrete company readiness and rivalry diagnosis (2026-11-04; checkpoint on main)

The previous ecosystem/operating-action checkpoint was committed and pushed as **`f46a06c`**. This continuation
changes the chapter gates, not their economic milestones or the IPO exit contract. **Stage 4 is still incomplete.**

**Shared requirement source:** `sim/stages.ts:stageProgress` combines the retained business goals with
`sim/scale-readiness.ts:scaleRequirements`. Simulation advancement, Journey, the new inline Company operations
readiness disclosure, chapter announcements and bot diagnostics use that same current-state read model. Do not read
`data/STAGES.goals` directly for managed intermediate chapters: its old headcount goals remain only for the legacy /
pre-operating path. IPO's final global-company goals are deliberately unchanged.

- **First floor → HQ:** retain 200K users and a completed Scale capability; replace “12 people” with one output-capable
  floor and a complete, genuinely effective delivery team. Maintenance delivery must fit the product-size freshness
  window, using actual team rates (training, roles, fixing, management and knowledge included), maximum clarity rework
  and the actual 30-day release minimum. No implicit helper floors or cross-floor stitching of incomplete skills.
- **HQ → Europe:** retain 1M users / $30K daily income; require two output-capable floors, capacity for the current
  1M-user milestone, a separate available/working flagship delivery team, live shared reliability coverage, fit ≥50,
  freshness ≥60% and bug density <10. Empty buildings, full desks and senior titles are not sufficient/necessary.
- **Europe → Global:** retain the European building, completed localisation, 3M users and rivalry victory; require three
  output-capable floors including effective local European capacity, current 3M-user server provision, delivery,
  health and shared-care requirements. An empty EU shell no longer substitutes for a regional team.
- An idle team may demonstrate *capability*, but it does not perform work or produce free service. A standing service
  cannot also supply delivery readiness. A floor building another product / doing client work / growing or pivoting
  the hit is not a simultaneously available maintenance team. Standing care uses actual live service output/demand.
- The first iteration tried provisioning the *next* chapter's 1M/3M/10M server target and requiring health before HQ.
  The seed checks exposed a fragile first-floor expansion/care bootstrap; this was rejected. Final gates use current
  business milestones, and health/shared-care requirements begin only after HQ can open a separate care floor.
- Earned chapters are never revoked. A v10 already-global save remains IPO-eligible under its original contract even
  if it currently lacks these new intermediate capabilities. No save shape changed, no unlocks were removed, and no
  migration/version bump, RNG consumption, automatic assignment, extra worker capacity or hidden subsidy was added.
  Small early-sale studios retain their existing sale/retirement paths.

**Visible previews:** Company operations has a collapsible “Next scale step” checklist with actual progress,
recovery instructions and next-chapter effects. Journey and chapter announcements show the same requirements.
The rivalry decision now explains the rival ratio, 90-day lead progress, paid campaign's exact upfront cost, immediate
bounded ratio change, cooldown and blocker. It explicitly says that this is a cash decision, not a floor build, and
not an instant victory. Preview and command share the same ratio-change function.

**Seed 10 diagnosis, not an alleged permanent softlock:** exporting the original day-4320 bot state showed every
Europe goal met except rivalry: Halcyon ratio **2.20**, lead progress **0/90**, 10 floors / 120 people, 29.93M flagship
users, fit ~92 and reliability 3.84 provided / 1.37 demanded. The bank balance alone does not lower the rival's ratio.
The parallel bot had no paid-response call, unlike its old global-plan policy. It could still buy the rival later:
replaying that exact synthetic save with the default policy reaches IPO **4373** after absorbing Halcyon on day
4372. Explicit `RIVAL_RESPONSE=1` spends **$15.08M** on day 4320 (ratio 2.20 → 2.00), makes the acquisition affordable
on day 4321, and reaches IPO **4322**. Thus the original 12-year result was a horizon/policy limitation, not proof of
an unwinnable game. This is a replay of a late state, not a new full-game victory or a win-rate measurement.

**Bot comparability:** default parallel policy remains unchanged. `RIVAL_RESPONSE=1` is an explicit optional paid
campaign policy, using authoritative command blockers, the old four-campaign-cost requirement and six months of
burn left afterward. It never lives in the simulation. An unguarded/default-on trial regressed early affordability;
even with the reserve, optional seed 10 bankrupted at day **2262**. Keep that caveat: a useful late decision is not a
universally good early strategy. `DIAGNOSTICS=1` prints unmet goals/live constraints; `FINAL_SAVE=<path>` exports a
synthetic final save, and `BOT_RESUME=<path>` resumes it for an explicitly additional number of years. Never use or
commit the player's journals as fixtures.

**Final default-policy comparisons (12-year limit, not a win-rate estimate):** seed 1 IPO **3362** ($294.96M
cash / ~$1B lifetime); seed 2 bankrupt **1717**; seed 8 bankrupt **1444**; seed 10 still Europe **4320**
($682.12M cash / $878.53M lifetime). Seed 10 meets every new live readiness requirement but still lacks rivalry
victory; the default bot intentionally does not automatically spend on a campaign. These results are not identical
timelines to the checkpoint because the intermediate chapter gates changed. Existing affordability failures and the
late income/rivalry policy horizon remain open; no revenue/cost coefficients were retuned to hide them.

**Verification:** all **79 Tycoon files / 1,312 tests** pass. The final full repository run reports **194 files /
2,692 tests passing**, with the one previously known unrelated failure:
`tests/hr/run.test.ts > step > keeps foes, shots and gems under their caps` — `Test timed out in 5000ms.`
Do not change HR or its timeout as part of this task. Final typecheck and production build pass.
Logs: `/tmp/stage4-readiness-full.log`, `-done-types.log`, `-done-build.log`, `-baseline-bots.log`, `-final-replay.log`
(all prefixed `/tmp/stage4-readiness`).
The focused new coverage is **20 tests** (13 readiness, 5 preview/bot-policy, 2 UI), including compact teams, incomplete
split teams, training/empty floors, no double staffing, meaningful delivery cadence, live care recovery, regional
capacity, save round trips, grandfathered IPO eligibility, pure previews and paid/cooldown enforcement. Production
Chromium scale-readiness acceptance passes at **1280, 390 and 320px**, including deliberate spending, preserved pause,
no modal, JavaScript errors or horizontal overflow. Harness: `stage4-scale-fixtures.ts`, `stage4-scale-browser.mjs`;
screenshots `/tmp/tycoon-stage4-scale-shots`. The prior product-action and ecosystem Chromium harnesses also pass at all three widths.

**Still next in Stage 4:** review the two-slot limit using effective shared capacity; audit **every** research ID
(effect, UI path, gates, overlaps, compatibility and carry-over), then implement persistent founder knowledge vs
company-practice semantics with an explicit migration. Validate the new readiness gates across more families / human
choices; these four-seed checks do not close Stage 7's unattended-growth, affordability, 12-seed or human acceptance
gates. Do not call Stage 4 complete or remove the post-hit catalogue based on these slices.

**5. Finish the stable workspace and navigation** — original feedback 2–5 and 8.
- Desktop prototype: building left, operations right, stable scene dimensions. Mobile: compact building/team overview
  above operations, no alternating full scenes. Two floors total triggers building mode, including one in each region.
- Floor selection highlights the assignment/context without opening an interior. Keep individual inspection possible
  through People, not scene navigation. Remove "Show", floor-back navigation, obsolete office tabs/view persistence.
- One team per floor also removes the old desk-vs-remote-team split: migrate assignments before retiring the per-person
  desk/remote controls and penalty. Keep deliberate team staffing transfers, regional limits and free-capacity rules.
- Proposed Studio grouping: Company (summary + metrics), Industry (markets + competitors), Journey (chapters +
  milestones). Keep People and Research accessible through their management surfaces. This is a prototype to validate,
  not a decree to cram three old tabs inside one large modal. Update direct-link dialog types/defaults and empty states.
- Remove the post-hit Products tab and generic Start project entry only after feature parity in operations. Preserve
  ecosystem overview, history and pre-hit product discovery; audit keyboard/touch paths as well as visible buttons.
- **Gate:** phone-sized width, large fonts and long names never move the Close control sideways, hide operations, crush
  the canvas or require interior jumps. Confirm with real browser geometry, not only jsdom render tests.

**6. Career fortune and next-venture setup** — original feedback 11–12.
- Add personal wealth/career standing independently of company cash and legacy valuations. Each exit yields an explicit,
  explained liquid/non-liquid outcome; do not count IPO market cap as cash or credit an exit twice after reload.
- Offer investment + ambition presets with an affordable range and previews of starting team/footprint, commitments,
  scope/readiness goals and runway. Modest studio remains possible; ambitious starts skip obsolete café busywork rather
  than simply gifting enough cash to trivialise the same progression.
- Choose exact exit ownership/liquidity assumptions and preset amounts during this stage; no invented final percentages
  in this plan. Avoid a tax/dilution simulator unless it creates useful choices.
- Carry identity, skills, world time and relationships deliberately. Migrate existing `legacy` into labelled historical
  records; do not claim old valuations are exact reconstructable founder proceeds. Preserve bankrupt/ousted branches.
- **Gate:** multi-chapter test of IPO -> venture -> sale -> venture -> retirement, reload at each transition, finite
  affordable investments, no negative/double-spent fortune, stable sprites and one company-name field.

**7. Balance, usability and acceptance** — before calling the iteration complete.
- Update the bot for allocations, leadership, milestones and founding choices; remove dependencies on hidden true-fit
  information in at least one policy. Keep an optimistic policy as a lower-bound benchmark, not the only balance test.
- Run several seeds during each economy change, then at least 12 seeds for final pace checks; compare intentional
  operation, unattended baseline, neglect/recovery and diverse venture starts. Don't tune only to the fastest IPO.
- Measure decision frequency and effects, per-team utilisation, bottlenecks, assignment changes, promotion workload,
  departures, costs, companion contribution, time to milestones and chapter outcomes. Log elapsed game days, not wall
  time inflated by the removed pauses. Keep career peak/tenure separate from current-company metrics.
- Run full test/typecheck/build and repaired browser smoke suite: café, garage, single floor, two buildings, 120 employees,
  long Industry tables, IPO and continuing chapters. Player verification follows; bot success is not UX approval.

### Persistence and test strategy

- Plan an explicit v7 -> new-version upgrade for semantic changes, with validation for assignments, appointments,
  appearance, career and one-time milestones. Increment when the first semantic schema change lands; keep each later
  incremental schema readable and tested. Do not rely on optional fields to pretend the old global plan still makes sense.
- Preserve active projects/progress and completed research/item IDs. Translate a global release into one explicit team
  assignment with a clearly explained remaining estimate (no surprise restart or free completed build); other teams
  await assignment. Translate an unchosen global plan into nonblocking opportunities. Deterministically resolve old
  remote memberships/capacity conflicts without deleting people or changing regions behind the player's back.
- Main existing tests to extend: `cycle`, `work`, `teams`, `workstreams`, `careers`, `staff`, `people`, `knowledge`,
  `companions`, `scale`, `pressure`, `economy`, `research-mechanisms`, `sizes`, `endings`, `exit`, `chapters`, `founders`,
  `characters`, `cafe`, `layout`, `store`, `save`, `state`, `journal`, `ui-smoke` (all in `tests/tycoon/`). Add focused
  operations/coverage/attribution fixtures rather than rewriting tests to accept any new output.
- Restore a usable browser harness: existing `e2e.mjs` imports nonexistent `render/characters.ts`/`render/layout.ts`,
  references the old start-money constant and uses `puppeteer-core`/`pngjs` not declared here. Fix the harness/tooling
  before treating screenshot/layout results as evidence; no production testing/deployment without approval.

### Initial inspection/check status (before dependency setup)

- Inspected roadmap/guide, state/store/tick, cycle/work/teams/offices, growth/fit/economy connections, careers, research,
  companions, chapter/exit paths, React dialogs/workspace, Pixi identity/café layout, CSS and related tests/bot.
- This checkout has no installed project dependencies. Attempted `npm test`: `sh: 1: vitest: not found`.
  Attempted `npm run typecheck`: `sh: 1: astro: not found`. Neither check passed; no browser verification or build was
  performed. These are environment blockers, not demonstrated application regressions. Dependency setup and baseline
  verification are the first engineering step, using the lockfile, before implementing stage 0.
- The player approved dependency setup and Stage 0 after this inspection. See the built/check record below.
  No extra broad questionnaire is needed. Resolve exact numbers and scope trade-offs with concrete prototypes/tests.
- Never commit raw run logs. Follow `AGENTS.md`: stay on `main`, no commit/push/deploy until requested.

## Stage 0 built and checked (2026-11-03; local, uncommitted)

Authorised: "Begin dependency setup and Stage 0". No economy retune, operations redesign, commits, pushes or deployment.

### What changed

- **Founder continuity:** `Employee.appearanceSeed` separates appearance from per-chapter world IDs. Existing saves
  fall back to the current employee ID, preserving their current look; carrying a founder fixes that seed for future
  chapters. Both Pixi renderers use the same helper. New IDs remain unique; no rewriting world references to preserve
  a sprite. Already-lost historical appearances cannot be reconstructed from a journal and are not guessed.
- **Company-only naming after success:** `companyOnlyFounding` preserves the analyst's name in both the dialog and sim
  command, even after a successful ending without the friend present. Failed/bankrupt/ousted restarts and first-run
  naming retain the old flow. Founding logs use the actual preserved name.
- **Café furniture (final, after several player-rejected experiments):** reverted to the original arrangement: the
  founders sit at the two generic office desks, facing each other. Only three visual changes were kept: desk tops are
  white (`atlas.whiteDesk`, recolouring the pack's yellow `#ffcd75` while keeping outlines; the freestanding desk trim is
  light grey), the founders' cups are brown (`drawDeskCup`; guests' cups are unchanged), and each cup stands on the desk's
  clear strip directly below its laptop, centred (`render-support/cafe-desk.ts`). A friend/analyst joining a third seat
  uses the same code. The experiment with a freestanding table, window-ledge seating and rear-view sprites was removed.
- **Modal overflow and tab crowding:** Modal now has a shrinkable scroll body and optional stable footer. Studio Close
  is outside that scroll body. Tabs wrap rather than crowd; wide Industry tables own horizontal scrolling. A real
  browser exposed an additional grid auto-minimum-width issue; `.tab-panel` uses `minmax(0, 1fr)` to fix the root cause.
  Other dialogs retain actions inside their body with corrected margins; their title no longer scrolls away.
- **IPO discovery:** a dedicated eligibility celebration with valuation explanation, optional postponement and explicit
  two-step ending confirmation. First eligible live day announces it; eligible saved games announce it on load, queued
  behind pending decisions when necessary. Dismissal is saved per company in `exit.ipoAcknowledged`. Top-bar IPO action
  remains visible while eligible, and Menu links to the same confirmation. IPO still ends the chapter; no wealth changes.
- **Compatibility:** both new save fields are optional and validated. Version remains 7: no existing operation meaning
  changed, and old saves retain defaults. The semantic assignment/career migration planned for later stages is still
  required. Tests cover malformed new fields and round-trips; the normalizer preserves IPO acknowledgement.

### Player refinement history: café presentation

- Latest: founder pair now shares one continuous brown tabletop without centre outlines/gap/inner legs; both
  seats, chairs, laptops and cups shift inward two scene pixels. Both guest tables use the same brown top and trim.
  Cup palette/positions relative to laptops unchanged. Odd extra founder seat retains its own table. Chromium
  screenshot inspected; typecheck and all 1,202 Tycoon tests passed (`NODE_ENV=development`).

- Superseding visual request: reverted founder cups to the prior dark-lid/orange-body/white-band palette, and changed
  founder desk tops to brown (`atlas.brownDesk`, `#99633f`) with darker brown trim. Layout/anchors and guest cups unchanged.
  Chromium screenshot inspected using local browser libraries. Typecheck passed; all 1,202 Tycoon tests passed with
  `NODE_ENV=development` (the earlier `act is not a function` failures were from the production environment).

- Latest request: keep white desks, make founder cups entirely brown. Removed the white cup band and used brown
  tones for lid, body and shading in `OfficeScene.ts`; guest cups are unchanged. Typecheck passed with a 1 GB heap.
  Tycoon tests: 1,175 passed / 27 failed (`TypeError: act is not a function`). Full suite timed out after 200 seconds.
  Browser verification blocked by missing Chromium library `libatk-1.0.so.0`; no updated screenshot verified.

- The first small-table, margin, outlined-cup and window-seating/rear-sprite experiments were rejected, then reverted.
  Their code, tests and art are gone. The final design is only the white-desk, brown-cup, below-laptop adjustment above.
- Check: **67 Tycoon files / 1,202 tests passed** and typecheck passed; Chromium desktop/phone render of the café was
  inspected. The full non-Tycoon suite and production build were not rerun after this revert (before it, the build passed).

### Tests and tooling

- Installed locked dependencies using `npm ci --include=dev`; the inherited `NODE_ENV=production` otherwise omitted the
  test tools. No manifest/lockfile changes. Audit reported 7 dependency issues including dev dependencies (3 moderate,
  3 high, 1 critical); no automatic updates or `npm audit fix` performed.
- Baseline: original Tycoon tests **66 files / 1,185 tests passed** with `NODE_ENV=test`. Initial full-suite run inherited
  production React and produced `act is not a function`; do not diagnose those as app regressions. Default TypeScript
  heap exhausted around 512 MB; a scoped 1,200 MB heap passed baseline and final checks without changing service settings.
- Added **17 regressions** in `tests/tycoon/stage0.test.tsx`: multiple chapter transitions, saved appearance/names,
  successful solo continuation, first/failed founding behaviour, fixture/save validity, IPO eligibility/load/queue/
  acknowledgement/confirmation and invalidation, modal footer structure, café geometry.
- Full-suite final command: `NODE_ENV=test NODE_OPTIONS=--max-old-space-size=1024 npm test -- --maxWorkers=2`.
  **182 files passed, 1 failed; 2,582 tests passed, 1 failed. All 67 Tycoon files / 1,202 tests passed.**
  The failure was already present in the pre-change baseline:
  `tests/hr/run.test.ts:59 > step > keeps foes, shots and gems under their caps`
  `Error: Test timed out in 5000ms.` It fails in isolation at the same default timeout; retry with
  `--testTimeout=15000` passes all 25 HR run tests (the slow case took ~5.8 seconds). HR code/tests were not changed.
- Final `NODE_ENV=development NODE_OPTIONS=--max-old-space-size=1200 npm run typecheck`: **passed**.
- Final `NODE_ENV=production NODE_OPTIONS=--max-old-space-size=1200 npm run build`: **passed**, 11 static pages.
- Added six deterministic synthetic saves in `tests/tycoon/stage0-fixtures.ts`, generated with
  `scripts/tycoon/stage0-fixtures.ts`: café, one floor, Europe/two floors, 120 people/ten floors, eligible IPO, continued
  chapter. They are not a reconstructed player save. Generator usage is in its header; generated JSON stays in `/tmp`.
- Added `scripts/tycoon/stage0-browser.mjs`, a separate working Playwright smoke harness rather than silently treating
  the old `e2e.mjs` as repaired. Start local dev/preview, generate fixtures, supply Playwright as described in the header.
  Browser tooling was installed under `/tmp/lab-browser-tools`, Chromium in the user cache; missing shared libraries
  were downloaded/extracted under `/tmp/lab-browser-libs`, not installed system-wide. Here, supply
  `LD_LIBRARY_PATH=/tmp/lab-browser-libs/root/usr/lib/x86_64-linux-gnu` along with `PLAYWRIGHT_MODULE`.
- Chromium checks passed on both dev and the **local production build**, without bypassing its CSP: 1280x900,
  390x844 and 320x740, enlarged text, Industry horizontal scrolling with an unmoved visible Close, non-overlapping
  tabs, café/one-floor/Europe/continued scenes, only company naming after continuation, persisted IPO dismissal,
  rediscovery and two-step ending. No uncaught browser errors. Inspected café and mobile modal screenshots.
  Production-preview screenshots: `/tmp/lab-stage0-production-shots/` (temporary, not versioned).
- `git diff --check`: passed. Stay on `main`; no commit/push/deploy until asked.

**Next:** player review of this slice, then Stage 1's business explanations and operating contract. Do not claim
parallel streams, automatic employee reviews, menu consolidation or founder fortune have been implemented yet.

## First player run, and the Spore direction (2026-10-25; design only, nothing built)

The player's first run log (`lab-tycoon-run-2026-10-25.json`, 7.4 years, ended unfinished on "First floor") and what they said.

### What the log shows
- Café 1,210 days, garage 1,100 days, the hit (a fintech app, after a second survey) on day 2317. Three products shipped, two
  dev tools retired at about $100 a day. Cash in the garage got down to one day left.
- After the hit: income $45k a day against a burn of $1.3k, cash $5.4M unspent, one 12-person floor, no second office, no
  companions (both slots free), 84k users after 350 days on "First floor" (goal 100k+). Load stayed at 14%.
- The roadmap was left with Advertising and Analytics pipeline while the floor stood on *Features*: `nextItem` only looks at
  items of the floor's own stream, so they would never be built. 20 workstream changes, 5 on day 2608 alone.

### What the player said
- **Café: keep.** Low bills let them buy research, and growing into a senior before making a hit feels right. It is the best
  part: solo with a friend, both growing, dreaming about the future.
- **Garage: fine, with shaping.** It makes you dream about the hit. Needs more *interaction* in research and building: picking
  survey tags and then building "the same way as before" is not new insight.
- **After the hit: the bottleneck.** "You don't dream any more. You reached the hit, you felt it." Nothing makes you want more.
  The roadmap is a to-do list: pick everything, then sit and watch ("a pixel movie"). The roadmap/team-mode UX is confusing
  (which feature goes where, why enable a team mode to build what I want). They stopped playing around day 2600.
- **Scaling is a burden.** In real life a hit means dull day-to-day operations and a high risk of failing; the game should
  feel hard but fun and give what real life does not. They prefer to stay a maker, and chose **deep work on the hit**.
- **Spore as the model.** Each stage has its own main action, lasts exactly as long as that idea stays fresh, and is full.

### Design direction (agreed in conversation, not scheduled)
1. **A different verb per stage**, and each stage ends while it is still fresh. Draft:

| Stage | Verb | What you do | Target length |
|---|---|---|---|
| Café | Craft | Contracts, research, growing yourself and a friend | as now (the player likes it) |
| Garage | Discover | Find what a market wants through real choices (survey, shape, test with users), not tag-picking | shorter than 1,100 days |
| First floor | Build the team | Hire and lead people; the people become characters | medium |
| Headquarters | Deep work | The founder works on the hit's flagship pieces; leads run operations | medium |
| Europe | Expand | Open a place, localise, new rules and rivals | medium |
| Global company | Steer | Few big decisions: acquisitions, the IPO or a sale, the change of guard | short, with the ending |

2. **Every stage needs a dream, not only a goal.** Café and garage have one (a hit; a dev tool people pay for). From the move
   out there is none. The dream after the hit is the missing piece: open question below.
3. **Operations should run themselves once set up**: leads with standing policies, only exceptions reach the player. The
   roadmap stops being a watched queue. The one-list roadmap (no workstream modes; floors take the first buildable item;
   queued features and Europe steps as rows; each row shows its effect and who builds it; optional per-floor focus; saves
   v8) is the likely first step, and still stands as the UI base.
4. **Patterns that remain candidates**: a funnel view of where users leak (read-only for the player), items with costs and
   exclusive paths (so you cannot build everything), events that interrupt (rivals, regulators, spikes, poaching), and money
   with somewhere to go (the hit funds making something new; Absorb already exists).

### Open questions (ask before building)
- **The dream after the hit (player's pick, 2026-10-25): a named rival to beat and a person with an arc**, plus **AI agents
  on the team** so the game feels like 2026. Not chosen: a bigger vision, a product made by hand. To design: the rival (one
  competitor with a face and a history that reacts to the player's moves; `sim/rivals.ts` has anonymous rivals today), the
  person (the friend/lead, a hope and a story across stages, tied to the stage goals), and agents (cheap, tireless workers
  the player configures and supervises: roles, autonomy, a cost per run, and failure modes such as a wrong fix or a runaway
  bill; they are also how "operations run themselves" becomes play and something fun to watch).
- Which stage to design in detail first. The player said the garage is not the biggest pain and only needs shaping; the
  office stage is the bottleneck.
- How the bot plays each new verb; its pace is a floor, not a forecast.
- Do not retune numbers in `balance.ts` until the loop changes: the log's numbers are not the problem.

### Build plan for this direction (agreed 2026-10-25: "develop it fully, then try a new run")
Phases, each playable and tested before the next. Phase 1 is built (uncommitted).
1. **Chapters (built).** `sim/chapters.ts`: a run is a career. A good ending (sold, IPO, retired) offers *Start something
   new*: you and your friend, the research you finished, 60% of your reputation and a little money (1% of the worth, between
   $15k and $150k) go back to a café; the rival world carries on (day, rivals, market, journal). Bankruptcy offers *Start
   again, alone*: no friend, no team, half the research, 25% of the reputation, $5,000. `Legacy` lists the past companies. The
   new chapter is saved and the page reloads into it (`browser.ts: startNextChapter`); `freshChapter` opens the naming dialog.
   More ways to fail (the friend leaves, the hit dies, a hostile takeover) come with phase 3.
2. **One roadmap list (built, funnel view not yet).** `sim/roadmap.ts: nextStep`: a floor takes the first row, in the player's
   order, that is on offer and that no floor is building. Rows are items plus three steps (`features`, `compliance`, `localise`).
   `Office.workstream` is now an optional *focus*: 'features' (the default, shown as "Anything") takes any row; any other value
   takes only rows of that stream, as before, so saves need no migration. A new floor is on Anything (Europe's on Europe).
   The roadmap dialog shows each row's effect in numbers, who is building it and who is next. The bot (12 years, seeds 1 to 6)
   still reaches the IPO in 6.0 to 8.0 years. Not browser-checked, only the render tests. Still to do: the funnel view
   (where users leak) on the hit's dashboard.
3. **The friend's arc and a named nemesis rival**: the dream after the hit. Stage goals reference them.
   - *3a, the nemesis (built).* `sim/nemesis.ts`, `data/nemesis.ts`: 60 days after the hit a funded newcomer (a named founder, a
     story) comes for it. Its income is `Rival.ratio` times yours (starts at 1.15, so it is ahead). Monthly it gains
     (+0.03 ambition, up to +0.1 where the hit's fit is under 90) and falls back for releases you ship (-0.015 each, cap
     -0.06), roadmap items you finish (-0.04 each, cap -0.12) and a hit at fit 95+ (-0.02). Every 100 to 160 days it moves: a
     lookalike product (crowds the hit's market and lifts it by 0.1), a poaching offer (an event; letting them go lifts it by
     0.08) or an ad blitz (revenue x0.92 for 40 days). You can *Strike back* (25 days of income, sets them back 0.2, every 60
     days): the first thing money buys late. Beaten when ratio <= 0.8 for 90 days in a row, or absorbed; the next comes 240
     days later. The Europe stage asks for it ("Overtake your rival"). Seeds 1 to 6: the bot's IPO moved from 6.0 to 8.0
     years to 6.8 to 8.8. Scripted events (`SCRIPTED_EVENTS`) are never rolled at random.
   - *3b, the friend's arc (built).* `sim/friend.ts`, four scripted events in `data/events.ts`. `friendArc` has a bond (0 to
     100, starts 60, +2 or -2 a month with the team's mood). 120 days after the hit they tell you about their own idea (back
     it, weekends, or not now). The nemesis may court them (15% of its moves): talk, match (12 months' pay) or their call;
     they stay with a chance of bond/100 plus 0.1, 0.5 or -0.1. If they go, the rival gains 0.25 and the team loses morale;
     once another rival falls they write, and you can take them back as CTO.
   - *3c, losing the company (built).* `sim/crisis.ts`: team morale under 45 and the rival at 1.4 or more, three months in a
     row, puts a vote of no confidence to you. Rally once (25% of the cash, +20 morale, rival -0.2) or step down: the new
     ending `ousted`, which restarts you alone like bankruptcy. Bankruptcy alone could not end a rich company.
   - Bot, seeds 1 to 6: the IPO at 6.0 to 9.1 years. Not played by a person yet; the numbers in `balance.ts` under "The
     friend" and "Losing the company" are a first guess.
4. **AI agents (built).** The player chose *tool*, not hire. `sim/agents.ts`, `data/agents.ts`, Studio → Agents. Four kinds, each
   with a dial: Off, Suggests, Acts-you-review, Unattended (power 0.4, 0.8, 1.4; cost x1, 2.2, 4; incident risk 0, 6%,
   22% a month). Code copilot (every team faster) and Research analyst (insight) from the AI wave, Bug triager (faster fixes)
   from the next era, Support agent (fewer of the hit's users leave) from the agent era, when all of them are 25% sharper.
   Their effects add to `toolEffects` and their bill to `toolUpkeep` (grows with the team). An incident (`agent_incident`)
   is cut by monitoring, test automation and resilience work on the hit (up to 60%): roll back (12 days of the bill), let it
   ride (bugs, quality, insight or fit; a quarter also run the bill x3 for 20 days) or pull the plug. Bot seeds 1 to 6: the
   IPO at 6.0 to 9.0 years, unchanged. Numbers are a first guess; no person has played this.
5. **A verb per stage (partly built).**
   - *Garage, Discover (built, small):* a small new product that is half built gets the `first_users` checkpoint: a handful of
     users have tried it and say one feature they keep asking for (the audience's most loved one it lacks; a poor eye for
     users can mistake the second) and one they shrug at. Add it (the target grows, the work done stays), drop it, or stay
     the course (`reshapeProject`, `usersSay`). Medium and bigger products still get the alpha checkpoint.
   - *Headquarters, Deep work (built):* `sim/deepwork.ts`, `data/deepwork.ts`, on the hit's dashboard. Four pieces of work by
     your own hands (signature feature, rewrite the core, study your rival, tell the story; 30 to 60 days). You gather no
     insight meanwhile. Halfway you steer: stay, go bold, bring in a contractor (8 days of income) or ask your friend to pair
     (bond 50+). At the end a roll (0.5 + skill/250, +0.15 help, -0.2 bold) decides; either way the skill you used grows
     (+3, or +1.5). Rewards in the work's `reward` text.
   - *First floor, Build the team (not built).* Idea: people as characters with a one-to-one each month. Skipped: the nemesis,
     the friend and the agents cover the stage for now. Ask the player after they have played.
   - Bot over 12 seeds: IPO in 6.0 to 9.0 years (the bot uses neither deep work nor the checkpoint beyond the first choice).

## The release cycle: the hit stage as the café's craft loop (2026-10-27; first slice built, uncommitted)

The player rejected "seasons" (it would make the game something else) and a layout-only fix. The problem is the *gameplay* of
the hit stage: it is a to-do list you watch. It should feel like the café and the garage: people you know, a thing being made,
bars filling, a result you can see. The stage's verb is **Improve the product you keep**, through the team's own cycle.

### The loop (per floor)
Each floor is a small product team with a **product manager** (lead) and **at least one analyst**. It runs a cycle, and the
cycle ends in a named release ("Russia 1.1", "Payments 1.2") that is the payoff.
1. **Discovery** (PM + analysts). Analysts turn the product's data (the funnel's leaks, user feedback, rival moves,
   complaints) into findings; the PM turns findings into a **spec**: a short written document with a few requirements
   (e.g. "Russian localisation", "fewer drop-offs at sign-up", "faster checkout"). The spec's **clarity** (0 to 100) comes from
   analyst skill, insight spent and the PM's skill. The player sees the spec being written as text, and may steer it: choose
   among 2 or 3 proposed requirements, cut scope, or send it back for more research.
2. **Build** (design, developers, QA: the existing bars). The spec's requirements set the bars' targets. A clear spec means
   less rework; a vague one means features built wrong (bugs, lost days, mid-cycle "the spec changed" events).
3. **Release** ("Russia 1.1"). A release card shows what it did: new users, fit change, quality, bugs and income per day,
   each against what the spec promised. Good discovery plus good build brings new users; a clear spec that was built badly
   disappoints in a different way than a vague one built well. The card is the thing the player wants to see.
4. The next cycle starts, with what the last release taught.

### What the player does (few actions, each with a visible effect)
- Hires and grows the people: the PM and analyst matter here, as the garage's builders did (careers already make a senior
  analyst a PM: `sim/careers.ts`).
- At discovery: reads the findings and picks the bet (one decision per cycle, not a queue).
- Mid-build: the existing checkpoints (alpha, first users) as choices; crunch or not.
- At release: ships, and reads the card.
- Everything else (which row, which floor, which focus) goes. No roadmap queue, no workstream selector, no per-row ordering.

### What changes in the code (sketch; to be checked before building)
- A floor needs a PM and an analyst to run a cycle; without them it can only do maintenance (a worse, slower cycle).
- New `Spec` on the office (requirements, clarity, written text) produced during a Discovery phase of a few days to weeks.
- `Project` gets its requirements from the spec instead of from `nextStep`/`roadmap`. Workstream items stay as the *catalogue* of
  requirements the PM can propose (their effects are unchanged), so the balance work in `data/workstreams.ts` is kept.
- `HitDashboard` shrinks to: product vitals, each floor's cycle (discovery, build, release with its version name), the
  rival line. The roadmap dialog becomes the spec/release history. Floor focus selectors, `setWorkstream` and the roadmap order
  go away (saves v9: the roadmap becomes the PM's backlog).
- Operations that run themselves (servers, fixes, companions) become requirements the PM proposes when the data calls for
  them ("servers 92% full: scale"), instead of rows the player queues.

### Decided with the player (2026-10-27)
- The player *chooses* among proposed requirements; they come from the product, so a game and a dev tool get different journeys.
- On the first floor the player is the PM (the founder analyst becomes the PM when the hit lands, as before).
- Semantic versions, and each release also carries its requirement's name ("Atlas 1.2.0: Multiplayer"). Minor releases exist as
  patches: upkeep and polishing.

### Built (first slice, 2026-10-27; saves unchanged, all fields optional)
- `sim/cycle.ts`: a floor with an analyst or PM (not a CEO) runs a cycle; one without only keeps the product fresh (the old
  `releasePlan`, which no longer has a UI). After `TEAM_IDLE_DAYS` idle the floor *writes a spec* for `specDays(clarity)` days
  (4 to 12), then puts `SPEC_PROPOSALS` (3) requirements to the player (`Office.spec`). If they do not choose in
  `SPEC_DECIDE_DAYS` (10) the PM builds the first. "Send back" re-reads for a few more days.
- *Clarity* (0 to 100, `clarityOf`): 25 + 0.4 x best analysis + a PM (10 + 0.2 x their analysis) + 6 per extra reader (up to 2);
  capped at 70 with no PM. It sets the spec's writing time, how well the proposals match the product's numbers (noise on the
  weights), the rework (up to +60% on the targets) and the bugs (up to +80%) of the build, and the reach of the release
  (+/-15%, neutral at 50). The constants are in `balance.ts` under "The release cycle".
- *Proposals* (`propose`, `candidates`): the best feature always gets a place (features are per product type: Multiplayer
  for games, CLI for dev tools, weighted by what users expect and what the audience loves), then roadmap items weighted by
  the numbers (servers 92% full -> scale first; open bugs -> quality; fit 70+ -> growth), the polish release, and Europe's two
  steps. All the old `WORK_ITEMS` and their effects are kept as the catalogue.
- *Versions and notes* (`sim/releases.ts`): `Product.version` (starts 1.0.0) and `Product.releases` (last 30): reach, fit and
  quality before and after, and the bugs shipped. A feature or item is a minor, a big item (work 3+), a companion or Europe
  is a major, upkeep and polish a patch. A team release's notice reads "Atlas 1.2.0 "Multiplayer": reach +12%, fit +3".
- UI: `SpecPanel` (writing bar; the three requirement cards), `ReleasesDialog` (replaces the roadmap dialog, kind `releases`),
  the dashboard shows the last release and each floor's state (`floorCycle`) instead of the focus selectors; the products tab
  lost Focus and Roadmap. Tests: `tests/tycoon/cycle.test.ts`.
- Bot, seeds 1 to 3: the IPO at 5.9 to 7.7 years (the bot never chooses, so the PM picks; its roadmap and focus are ignored).

### Still to do
- Look at it in the browser (the build had no browser driver; only render tests). Check the bottom stack on a phone: the spec
  cards sit in the project panel's place, so they scroll inside its 34dvh cap.
- Dead weight: `setRoadmap`, `setWorkstream`, `Product.roadmap`, `Office.workstream` and the bot's use of them (only the no-analyst
  fallback reads them). Remove with a save bump once the cycle is liked.
- Make the discovery richer: spend insight to dig deeper (more clarity or a fourth proposal), findings text, mid-build "the spec
  changed" events when clarity is low, a release card that shows up after the users arrive (reach is the immediate part).
- The dashboard is still tall (rival, deep work, friend, companions rows): collapse once the loop is settled.
- The bot should choose by the same rules a player would, and hire analysts per floor.
- A hiring nudge: a second floor has no analyst until the player hires one; say so where they hire.

## Guide for the next session (written 2026-10-23, before the player's first playthrough of phases B to E)

Read this first if you are picking the game up after the player has played. It says what to read in a run log, which knob
answers which complaint, how the new systems work and why they are shaped this way.

### 1. What to do when the player comes back

1. Ask for the run log (Menu → Export run log, `lab-tycoon-run-*.json`; untracked and gitignored: read it, never commit it)
   and what they felt: where they got stuck, bored or confused, where they skipped time.
2. Read the log (section 2), place each complaint in the playbook (section 5), change one knob at a time, and check it with
   the bot over 12 seeds (`playthrough.ts`) so a fix for one end does not break the other.
3. Only then think about content or features. The player's order of priority so far has been: feel the arc first,
   features later. The roadmap's "Next steps" lists the open questions (hunt length, Act 2 pace, a dry roadmap, clarity).
4. Commit only when asked, to `main`, `type(scope): summary`, staging only the task's files (see `AGENTS.md`).

### 2. Reading a run log

Each entry is `{ day, kind, text, cash, data? }`. Kinds that matter now:
- `month` (every 30 days): `income`, `incomeAverage`, `burn` (a day), `reputation`, `stage`, `employees`, `offices`, `users`,
  `lifetimeRevenue`, `productList` (each product with users, income, quality and its role), and, once there is a hit, the
  **hit fields**: `hitName`, `hitUsers`, `hitEuUsers`, `hitFit` and `hitPeakFit` (the fit its last release earned),
  `hitRetention` (% of users kept at that fit), `hitReach`, `hitWorld` (its pull on the world, a multiplier on reach),
  `hitCapacity`, `hitLoadPercent` (users over capacity), `hitIncome`, `hitPayFactor` (what Monetisation raised pay to),
  `hitBugs`, `hitPressure` (what presses on the fit, in points a day, by cause), `hitBuilt` and `hitRoadmap` (item ids),
  `floors` (each floor and its workstream, and what it is building), `hosting` and `toolUpkeep` (a day), `profitDays`,
  `secondSlotsFree`.
- `stage`, `hit` (a launch took off), `office.toGarage`, `office.moveOut` (`kept`: the side products), `team.workstream`
  (a floor changed stream), `product.roadmap` (the roadmap was edited), `team.release` (a floor shipped), `notice` (outages
  read "went down: the servers were full", items "is live on", companions "is out", Absorb "You absorbed", the change
  of guard "is the CEO now"), `exit.offer`/`exit.declined`, `end.ipo`/`end.sold`/`end.retired`/`end.bankrupt`.
- Quick checks: users and income per month against the targets (first floor 100k to 500k users, headquarters 5M to 10M,
  both buildings 20M+, $1M a day late, $1B lifetime); `hitLoadPercent` pinned at 90 to 100 for months means the player
  never built Scale (or did not find out how); `hitFit` far under `hitPeakFit` means pressure (read `hitPressure`);
  `floors` all `features` means the player never found the workstream selectors; `hitRoadmap` empty with floors idle means
  the roadmap ran dry or was never filled; `secondSlotsFree: 0` with no companion means the slots stayed taken by side products.

### 3. How the new systems work (reference)

Files: `sim/teams.ts` (floors and workstreams), `sim/roadmap.ts` (the ranked list, `nextItem`), `data/workstreams.ts` (all
items, `itemEffects`), `sim/scale.ts` (capacity, outages, hosting, the hit's pull on the world), `sim/fit.ts` (takeoff,
pressure, retention), `sim/companions.ts` and `data/companions.ts`, `sim/tools.ts`, `sim/exit.ts` (selling, the IPO),
`sim/rivals.ts` (`acquire`), `sim/founding.ts` (`changeOfGuard`), `sim/offices.ts` (`moveOut`, `openOffice`), `data/stages.ts`,
UI: `HitDashboard.tsx`, `RoadmapDialog.tsx`, `TeamControls.tsx` (per-product team and workstream), `TeamDialog.tsx` (the
move out picker), `MenuDialog.tsx` (IPO), `AbsorbDialog.tsx`.

**A floor and its workstream.** `Office.productId` is the product it looks after (the hit, for every floor that opens or
moves out) and `Office.workstream` what it works on. `teamDay` runs each day: ships a finished team release, and for an idle
floor asks `releasePlan` what is next. The plan by stream: *features*: the queued features (`Product.nextFeatures`), else
a maintenance release timed near the end of the fresh period; *quality*: a quality item, else a polishing release; *scale,
growth, monetisation, tools*: the highest roadmap item for that stream that is on offer, else the floor idles (the panel
says "Nothing on the roadmap for ..."; `nextReleaseDay` is `Number.MAX_SAFE_INTEGER`: UI code must check it); *europe*:
compliance, then localising, then its items; *companions*: a companion item, else look after the stalest companion.
An item is a normal update project (`Project.itemId`) whose work is the maintenance target times `item.work`.
Floors' releases run side by side: `productInWork(state, id, byTeam)` ignores other floors' team releases, while manual
updates and fixes still exclude each other. Items already being built are skipped by `nextItem`.

**Items** (`WORK_ITEMS` plus one launch item per companion, `ALL_ITEMS`). `minUsers` gates when an item is on offer.
When one ships, `buildItem` (in `sim/project.ts`) applies what is immediate (reach multiplier, fit and peak fit, bugs, quality),
adds it to `Product.built` and removes it from the roadmap; everything else is read live from `itemEffects(product)`:
`capacity` (scale), `pay` (monetisation), `churn` (retention), and the tool effects `fixes`, `insight`, `speed`, `morale`,
`upkeep` (read through `toolEffects(state)` from the *hit's* built items: tools go with the hit). Saves store item ids: if
you rename or delete an id, `getWorkItem` returns undefined and the effect silently disappears.

**The hit's users** (`targetUsersIn` in `sim/products.ts`): `saturate(reach x world x interest x bugFactor x retention x
expectation, cap) / (1 + crowding) + regulars`, per region, where cap is audience x regionScale x `MARKET_CAP` (5) x
`HIT_MARKET_SCALE` (300), so the market is rarely what stops a hit. Users move toward it (`nextUsers`). Then `loadDay`:
users over `capacityOf` (`BASE_CAPACITY` 300k plus Scale items) are cut to it; from `OUTAGE_LOAD` (92%) of capacity an outage
strikes with `OUTAGE_CHANCE` (2%) a day, costing `OUTAGE_USER_LOSS` of users, reputation and bugs. `growWorld`: while users are
under capacity, `world` grows by `HIT_GROWTH_RATE` x health x room x (1 + the items' reach + 0.4 per healthy Reach companion)
a day; health is (fit - 50) / 50 clamped to -1..1, room is 1 - users / market cap; a fit under 50 shrinks `world` back toward 1.
Revenue: `productRevenue` (users x price x audience pay / 30, Europe's pay factor) x `payFactor` (1 + the items' pay), and the
hit also earns x (1 + 0.15 per healthy Keep companion) through `productIncome`. Costs: `HOSTING_PER_USER_DAY` (0.002) a hit user,
plus tool upkeep, on top of salaries and rent.

**Fit pressure** (`sim/fit.ts`, `sagFit`, once a day for hits): pressure in points a day = 0.25 x (1 - interest) + 0.3 x
(1 - bugFactor) + 0.08 x min(3, crowding by others) + 0.06 x features the era expects and it lacks + 0.1 per unhealthy
companion. Above 0.02 the fit falls by it; otherwise it recovers 0.15 a day; it never exceeds `peakFit`, the fit the last
release earned (a release resets both). `retention`: 0.4 + 0.6 x min(1, fit / 75), plus (1 - that) x (the items' churn + 0.1
per healthy Keep companion), multiplies the hit's users.

**Second-product slots** (`COMPANION_SLOTS` 2): side products (kept at move out) and companions share them. A companion
launches when its item ships, with 12% of the hit's users; it has no floor of its own: a floor on the Companions stream
keeps its reach at 12% of the hit's users and updates the stalest one. Healthy means interest of at least 0.6 and fewer than
10 bugs per unit of work. To free a slot, retire a product in Studio → Products.

**Absorb** (`acquire`): needs stage 4, a hit and a rival with a product of the hit's type; costs `acquisitionPrice`. Half the
users of its competing products join the hit; its best people (by skill) fill the empty desks of real offices in its region
and nobody comes if there are none; kept products become side products; its other business adds to `acquiredIncome`. The
name is recorded in `absorbedNames` so `rivalsArrive` does not bring it back.

**Journey and endings.** Stages 0 to 6 (see "Things to know"). Opening the first European floor calls `changeOfGuard`.
The IPO is open at stage 6 when its three goals hold (10M users, $1B lifetime, `profitDays` of 360) and values the company at
cash plus `IPO_MULTIPLE` (9) years of trailing income; selling uses `EXIT_BASE_MULTIPLE` (2 years of income) and the old offer rules.

### 4. Why it is shaped this way (decisions, and what was rejected)

- *A hit is earned, and the company is built around it.* The player's own words in "The pivot". The roadmap, workstreams and
  capacity exist to give Act 2 decisions that are not money: which floor builds what, in what order, and what the hit's
  servers and fit can bear.
- *Workstreams with a ranked roadmap* (the player agreed): you rank items, floors take the top one for their stream. Rejected:
  picking an item per floor (more clicks, same choice).
- *Tools and companions reuse the roadmap machinery* (items of two more streams) instead of being separate 2 to 4 person
  projects as the plan said. A floor on Tools or Companions is the "team off the hit". Cheaper to build and test; if the
  player wants small teams inside a floor, that is a new feature.
- *Side products earn only* until they are retired or replaced (the player's call). They hold slots that companions need,
  which is deliberate: the choice of which to keep at move out has a price later. The bot retires them as soon as a hit is
  300k users; check whether the player notices the slot message.
- *The hit's growth is a "pull on the world" (`world`), not a bigger reach per release.* Per-release reach gains are small
  (a feature gives about 10%) and could never reach millions; `world` compounds with fit, so a hit that holds its fit snowballs
  until its servers or its market stop it, and one that sags shrinks. It is the single biggest pacing lever.
- *Capacity is the main wall.* Past it users are turned away rather than angry, and near it outages hurt: the player has to put
  a floor on Scale in time. A hit left alone stalls at its servers (seen in the bot runs: 4.1M users for 12 years).
- *Hosting per user, not a share of revenue*, so cheap-per-user products feel it more. Money is still plentiful (see Next steps).
- *Stage gates use things the player does* (200k users and a Scale item to leave the first floor), not reputation, which a
  bot reached years late and a person may find arbitrary.
- *Floors work in parallel on the hit.* Without it one floor on Quality blocked every other floor for good (found by the bot).
- *The IPO and selling are separate endings*: selling stays the early exit (one floor, a hit that earns), the IPO the late one.

### 5. Retune playbook (symptom, then knob, in `sim/balance.ts` unless noted)

- Garage too poor or the hunt too long: `CONTRACT_PAY_PER_POINT`, `UNDISCOVERED_REACH`, `CAFE_*`, `GARAGE_READY_MONEY`, `FIT_BASE`,
  `FIT_TAKEOFF`, `TAKEOFF_MAX_CROWDING`.
- Act 2 too fast or too slow: `HIT_GROWTH_RATE` first; then the capacity and `minUsers` of the Scale items and `BASE_CAPACITY`
  (`data/workstreams.ts`); the stage goals (`data/stages.ts`); `HIT_REACH` for the hit's starting size.
- Money does not matter: `HOSTING_PER_USER_DAY`, item `upkeep`, `NEW_OFFICE_COST`, `EU_OFFICE_COST`, salaries, or new sinks (the roadmap
  has no costs per item today: an item could cost money, not only work).
- Outages too harsh or too rare: `OUTAGE_LOAD`, `OUTAGE_CHANCE`, `OUTAGE_USER_LOSS`, `OUTAGE_REPUTATION`.
- The fit sags too fast or never: `FIT_*_PRESSURE`, `FIT_RECOVERY`, `HIT_RETENTION_FLOOR`.
- Companions pointless or mandatory: `COMPANION_REACH_BOOST`, `COMPANION_KEEP_*`, `COMPANION_SHARE`, `COMPANION_CARE_FIT`.
- Late game empty: add items (per era or repeatable ones) in `data/workstreams.ts`, more companions in `data/companions.ts`.
- IPO too early or late: `IPO_USERS`, `IPO_REVENUE`, `IPO_PROFIT_DAYS`, `IPO_MULTIPLE`.
- After any change run the bot (`playthrough.ts`) over 12 seeds, then `npm test` and `npm run typecheck`.

### 6. Pitfalls

- `sim/products.ts`, `fit.ts`, `companions.ts`, `scale.ts` and `economy.ts` import each other (functions only, no top-level use);
  keep it that way (no constants computed from another module at import time) or an import cycle will bite.
- `STAGES.length - 1` is the IPO stage; adding or removing stages shifts the stage numbers in `balance.ts`/`data` and needs a save
  upgrade (see "Things to know").
- `moveOut(state)` without `keepIds` keeps nothing and sells everything else; the store passes the picker's choice.
- `nextReleaseDay` may be `MAX_SAFE_INTEGER` (idle floor); `changeOfGuard` runs once, on the first European floor, and does nothing
  if the founders are gone.
- The tests that pin balance numbers are few; most numeric checks live in `tests/tycoon/scale.test.ts`, `pressure.test.ts`,
  `workstreams.test.ts`, `companions.test.ts`, `moveout.test.ts`, `endings.test.ts`, `competition.test.ts` (Absorb),
  `journal.test.ts` (the log's hit fields) and `ui-smoke.test.tsx` (the new screens).
- Bot-based numbers are optimistic (true fit, ideal roadmap). Do not tune late-game pace to the bot alone.

**Things to know before changing code.**
- Verify with `npm test` and `npm run typecheck`; for UI, run `npm run dev -- --port 4321` (base path `/lab/tycoon/`)
  and look. Dev shortcuts use a throwaway game: `?garage` (skip the café), `?offices=N`, `?money=`, `?rep=`, `?stage=`,
  `?clock=`. To look at a prepared state, write it into `localStorage['lab:tycoon:save']` before the page loads
  (puppeteer-core and a headless Chrome were used for screenshots; neither is in `package.json`).
- Stage numbers are indices into `STAGES` (`data/stages.ts`) and are used as numbers (`MOVE_OUT_STAGE`,
  `NEW_OFFICE_STAGE`, `ACQUISITION_STAGE`, `LEADER_STAGE`, `PROJECT_SIZES[...].stage`, research `stage`). Inserting a
  stage shifts them all, plus a save upgrade, as the café did (`upgradeFromV5`).
- `inGarage` is true at the café too; `inCafe` is the café alone. `makeState` in `tests/tycoon/helpers.ts` puts the
  studio in its garage at the Garage startup stage; tests about the café start from `createInitialState`.
- Balance checks: bundle a script with `npx esbuild <file>.ts --bundle --platform=node --format=esm --alias:@=./src
  --outfile=<out>.mjs` and run it with node. `scripts/tycoon/simulate.ts` predates the pivot (its bots still play
  the old game); `scripts/tycoon/e2e.mjs` is stale (it imports moved files and assumes the old start).
- `npx esbuild scripts/tycoon/playthrough.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/playthrough.mjs`
  then `node /tmp/playthrough.mjs [seed] [years] [quiet]` plays the whole game with a bot (see its header; `SAVE_DIR=<dir>`
  writes a save per stage). Use it for pacing checks after balance changes, run over many seeds, and remember it is an
  optimistic player. The stages now are 0 café, 1 garage, 2 indie (`MOVE_OUT_STAGE`), 3 first floor, 4 headquarters
  (`NEW_OFFICE_STAGE`, `ACQUISITION_STAGE`), 5 Europe (`LEADER_STAGE`), 6 global company (the IPO).
- Dev server for screenshots: Playwright's Chromium is cached under `~/.cache/ms-playwright` and `@playwright/cli` has
  `playwright-core` globally; point `createRequire` at it and `executablePath` at the cached chrome.
- Commit straight to `main` as `type(scope): summary`, only when asked; stage only the task's files.

**Earlier handover (2026-10-22, evening).** The player played the building build. The visual fixes from that are built (see
"Fourth feedback: the building, routines, and one product" below); the bigger pivot it proposes (a long garage hunt
for a hard hit, then a company built around that one product) has its direction agreed (2026-10-23) and a build plan
in phases 0 to E in that section: go through the plan and its open questions with the player before building.

**Earlier handover (2026-10-22).** The third logged run was analysed and Phase 1 of its fixes is built (see "Third
logged run, and the building pivot" below); the next big piece is the two-building pivot, to be planned with
the player first.

**Earlier handover (2026-10-20).** Everything agreed with the player is built and pushed (commits
`82ac407` to `ee37b24`; the "Built: the roadmap pass" and "Built: regions, Europe and Absorb"
sections below say what and where). The player is playtesting it for a day and will bring a
fresh run log (`lab-tycoon-run-*.json`, untracked and gitignored: read it, never commit it) or
concerns. **Next work is retuning from that log, not new features.** The first-guess numbers to
tune are in `sim/balance.ts` (`BUDGET_PER_POINT`, `START_MONEY`, `KNOWLEDGE_*`, `PM_*`,
`ENTERPRISE_*`, `LICENSE_*`, `EU_*`, `RIVAL_ABROAD`, `ERA_WAGE_*`, `ABSORB_*`) and
`data/regions.ts`. Not yet looked at in a real browser or on a phone: the Team, Products, Industry,
Absorb, New project, Employee and Research dialogs (only `tests/tycoon/ui-smoke.test.tsx` renders
them). The bots (`scripts/tycoon/simulate.ts`) overexpand late and never localise or absorb well,
so do not retune from them. Agreed and dropped: Subsidiary, non-contract garage income.

**Where things stand (as of 2026-10-20: older than the sections above; where they differ, "Built: Phases B to E" and the handover win. Saves are now version 7, the journey has seven stages, floors work on workstreams, not directions).** The studio has a real arc: garage (4 desks) → office →
more offices; client contracts; users and bugs on every product; breakout hits;
six journey stages; ten rival studios, split between the US and Europe (and a newcomer at each of nine eras, to year 17) and an
industry ranking; eras that shift demand and expectations; careers from Junior to
Lead; bug fixing by a developer and tester pair; retiring and selling products;
a two-act shape (sell from the garage, or earn a hit and move out), a 5-product
portfolio that products grow through, audiences, and an exportable run log.
Saves are version 5 (`STATE_VERSION` in `src/lib/tycoon/sim/state.ts`); bump it
and say so in the commit whenever the save shape changes. The 2026-10-20 additions (regions,
knowledge, insight, roles, licensing...) are all optional or defaulted on load, so they did not. Version 3 and 4 saves are
upgraded on load (`upgradeFromV3`, `upgradeFromV4`). Optional fields (such as
`audienceId`) need no bump.

Tools: `scripts/tycoon/simulate.ts [years] [seeds] [policy]` (bot players; with a
policy name it also prints the year each stage was reached). It cannot run as
`node scripts/tycoon/simulate.ts` because the sources import `@/...`; bundle it
first: `npx esbuild scripts/tycoon/simulate.ts --bundle --platform=node
--format=esm --alias:@=./src --outfile=/tmp/sim.mjs && node /tmp/sim.mjs 14 8`.
Also `node scripts/tycoon/e2e.mjs` after `npm run build` (real Chrome; needs
`puppeteer-core`, which is not in `package.json`; `CHROME_PATH`, `E2E_SHOTS=dir`,
`--only <scenario>`), and dev URL shortcuts that use a throwaway game:
`?offices=2&stage=3&money=1000000&rep=60` (dev server only). Art sources
(`.aseprite`, large preview, CC0 licence) live in `art/pixeloffice/`, outside
`assets/` so they are not published or precached.

## Fourth feedback: the building, routines, and one product (2026-10-22)

From playing the building build, no run log. What the player said:

- The building from outside looked clunky and unfinished; the team sat in one row, unlike the floor up close; the
  laptops sat at the far end of the desks, so people typed on the bare desk.
- Stand-ups and coffee breaks are culture, not switches. A stand-up lasted one game day, gone in a blink at 2x;
  up close nobody went to the breaks or the stand-up. Gather everyone at a physical Scrum board, in both views,
  instead of a meeting room.
- Directions (Grow, Polish, Keep it running, Expand) are unclear and counterintuitive.
- Analysts and PMs seemed missing. They are not: they are only offered once *User research* is done (one candidate
  per pool), and look like developers at their desks.
- The pivot, below.

**Built (2026-10-22).**
- **The building** (`render-support/building.ts`, `render/BuildingScene.ts`): always all five floors, the ones not
  rented dark with their lights off (`BuildingBox.vacant`, "+ Rent floor N" on the next one); rooftop unit and aerial,
  a ledge at every floor, an awning and planters at the lobby, trees and clouds. A floor is laid out as up close: two
  partitions to a row, three rows (`floorPartitionAt`), computers at the near edge of the desk under the hands
  (`render/furniture.ts` is shared with `OfficeScene`), and both views share one `SeatMap` per office, so everyone has
  the same desk in both. `FLOOR_H` is 128, so the building is drawn at 0.75 on a phone (eighth steps now).
- **Routines are culture**: `Office.standup`/`breaks`, `setRoutine`, the toggles and `STANDUP_*`/`BREAKS_*` are gone.
  They only show, on a clock of running time, not game days (`render-support/routines.ts`: every 90 s a 16 s stand-up
  and a 24 s coffee break, offset per floor), so they read the same at any speed. Up close (`OfficeScene`, options
  `standup`, `breaks`, `boardProgress`, `seatMaps`) everyone walks to the Scrum board on the wall and stands round it,
  and coffee breaks use the Focus office's outings; on the street the team huddles at the board at the floor's right
  end and takes turns at the coffee corner. The board's notes move from to do to done with the project.
- Dev shortcut `?clock=ms` starts the routines' clock there.

**The pivot (direction agreed 2026-10-23; the build plan below is to go through with the player first).** The
player's words: "Garage is to play one mode of the game: try to make a hit, grow as a small team, live this life for a
while, then make a hit (finally!) and rent the office floor (look ma I made it!) with a 12-desk team, work on the hit
to make it better (the whole focus on this second part) in order to grow to a whole building, and then expand to
Europe, perhaps build a couple of internal tools or products that accompany the main hit." Companies with buildings
maintain and grow one big product; they do not ship a new one every month.

Decided with the player (2026-10-23):
- **A hit is earned, not rolled** (option B). Every product has a product–market fit that only releases move: features
  its audience loves raise it, ones they shrug at add nothing, and a crowded or cold market holds it back. Past a
  threshold, with room in the market, it takes off. Bad products stall; you kill them and try again.
- **You are the analyst.** A new game asks your name; you start as the analyst, with a developer friend. You read the
  market in the garage, become the hit's PM when it takes off (the key role in Act 2), and become CEO when the company
  opens in Europe, with your developer friend as CTO and one of your analysts as the hit's PM.
- **A café before the garage**: just the two of you working from a café, short and entertaining, earning enough to
  hire two more and move into the garage. A new scene with a barista and customers.
- **After the garage the hit is the company**: internal tools, plus one or two companion products at most, to
  millions of users and billions in revenue. Internal tools help the main product (earning from them later, maybe).
- **Moving out**: keep up to 2 garage products, sell the rest. What a second product is for needs a clear role (below).
- **Absorb** a rival: its best people take your empty desks, and only those.
- **Endings**: sell (with a confirmation that the game ends), an IPO, bankruptcy, and retiring (kept: it does no harm).
- Capacity and outages are a good Act 2 pressure, alongside rivals.

### Build plan (the design record: all phases are now built, see "Built: Phases B to E" for what changed from it)

Each phase is playable on its own and ends with a playtest. Numbers are first guesses for the retune.

**Phase 0: you, a friend, and a café.**
1. *A proper start.* The new game asks your name and the studio's, each with a dice button on the right of the input
   to make one up. You are a founder analyst with your name, and
   your friend a founder developer (the start's designer goes). Founders cannot be fired or quit, and draw a small
   salary. You gather insight from day one; PM needs no research for you.
2. *The café* (a new office kind before `garage`, 2 seats at a window table, no rent but coffee money, about $10 a
   day). Only easy work: small client gigs (a landing page, a bug fix, a plugin) and small dev tools. Goal: save
   enough to hire two people and pay the garage's deposit; then you pick the two and move. Aim for 5–10 minutes at
   1×. Café happenings to keep it lively: the barista passes on a lead (a client job), the Wi-Fi drops (a slow day),
   coffee over a laptop (a cost), a regular asks what you are building (a first user interview: insight).
3. *The café scene*: a counter with an espresso machine and a barista who works it, tables, the two of you at the
   window with laptops and cups, and customers who come in now and then, queue, order, wait and leave with a cup to
   go (some sit down a while). Same pixel style; anything the PixelOffice pack lacks is drawn by hand like the Scrum
   board.

**Built: Phases B to E (2026-10-23).** Decided with the player: a ranked roadmap, side products for income only until
Phase C, and defaults for the numbers (recorded here, to retune from a real log).
- *B1 Moving out with the hit* (`moveOut(state, keepIds)` in `sim/offices.ts`, the picker in `TeamDialog.tsx`): the hit
  stays, up to `SIDE_PRODUCT_LIMIT` (2) other products come along as side products (`Product.role: 'side'`), the rest are
  sold to rivals without the usual reputation and morale cost (`sunsetProduct(..., { planned: true })`). The floor that
  was the garage works on the hit.
- *B2 Workstreams* (`data/workstreams.ts`, `sim/teams.ts`, `sim/roadmap.ts`; `Direction` is gone, saves are version 7 with
  `upgradeFromV6`): a floor works on one of Features (the queued features, else upkeep), Quality (the roadmap's quality
  items, else polishing), Scale, Growth, Monetisation, Europe (compliance, then localising, then its items), Internal
  tools or Companions. The hit's roadmap (`Product.roadmap`, `setRoadmap`, `RoadmapDialog.tsx`) is a ranked list of items;
  a floor takes the highest one for its stream that is on offer (`minUsers`, localised for Europe, a free slot for a
  companion), builds it as a release (`Project.itemId`, work scaled by the item's `work`) and it joins `Product.built`.
  Floors work on the hit side by side: a floor's own release (`byTeam`) does not block another's (`productInWork(..., true)`).
  New floors take the hit and the first free stream (Europe's on the European building).
- *B3 Scale to millions* (`sim/scale.ts`): a hit holds `BASE_CAPACITY` (300k) users plus its Scale items (up to 60M more);
  past it users are turned away, near it (`OUTAGE_LOAD`) outages strike (users, reputation, bugs). Its market cap is
  `HIT_MARKET_SCALE` (300) times a normal one, so what stops it is capacity and its pull on the world: `Product.world`
  multiplies its reach and grows `HIT_GROWTH_RATE` a day while it fits (`hitHealth`) and has room, faster with Growth work.
  Servers cost `HOSTING_PER_USER_DAY` a user; Monetisation items raise what a user pays (`payFactor`, up to 4.8 times).
  `formatMoney` and `formatCount` write billions.
- *B4 Pressure* (`sim/fit.ts`): a hit's fit sags each day by what presses on it (staleness, open bugs, rivals in its market,
  features the era expects, an unlooked-after companion; `fitPressure`) down from the fit its last release earned
  (`Product.peakFit`), and recovers when nothing presses. Churn follows fit (`retention`), softened by Quality items.
- *B5 The hit's dashboard* (`HitDashboard.tsx`, under the scene once out of the garage): users (and Europe's), income and
  what a user pays, servers' load and capacity, the fit meter with what presses on it, a selector of each floor's
  workstream, the companions, and the roadmap button.
- *C Tools and companions* (`sim/tools.ts`, `sim/companions.ts`, `data/companions.ts`): internal tools are roadmap items of
  the Tools stream with upkeep (admin panel: bugs fixed faster; analytics pipeline: insight; deploy pipeline: faster
  teams; people portal: morale). Companions (six, each Reach or Keep, each suiting some kinds of hit) are launched from
  the Companions stream, share `COMPANION_SLOTS` (2) with side products, start with a slice of the hit's users and need
  a floor on Companions to look after them: healthy, a Reach one speeds the hit's growth, a Keep one keeps users and
  lifts pay; neglected, one presses on the hit's fit. That floor is the price: people off the hit.
- *D Endings, Absorb, the journey*: selling asks "Sure? This ends the run" in the offer dialog. The IPO (`ipoBlocker`,
  `goPublic`, Menu) needs the Global stage's goals (10M users, $1B lifetime, a year in profit, `profitDays`) and ends the
  run at `IPO_MULTIPLE` years of income. Absorb (`acquire`) now needs a hit and a rival that competes with it; half its
  competing users move to the hit (`ABSORB_USERS_SHARE`), its best people take your empty desks in its region and only
  those, products can be kept as second products; no office is opened. Absorbed studios no longer return when their
  year comes (`absorbedNames`). The journey is Café, Garage, Indie, First floor (200k users, a Scale item, 12 people),
  Headquarters (1M users, 2 floors, $30k a day), Europe (a building there, localised, 3M users, 3 floors) and Global
  company (the IPO gates). Opening the European building makes you CEO and your friend CTO (`changeOfGuard`); the best
  analyst becomes the hit's product manager; the CEO gathers no insight.
- *E The playthrough* (`scripts/tycoon/playthrough.ts`, run it as its header says; `SAVE_DIR=<dir>` writes a save at each
  stage, to load into the real UI by writing it to `localStorage['lab:tycoon:save']`): over 12 seeds the bot reaches the
  IPO in 6.0 to 8.5 years, with its first hit after 250 to 570 days. What it found and fixed: one floor on one stream
  could not build anything else (so a floor can now work next to another); a hit stalled for years at its servers' limit
  when no floor was on Scale (the dashboard says "outages likely: build Scale"; the player has to act); absorbed studios
  came back; the stage gates passed in days because one of them was reputation, now replaced by building servers; a bot
  that keeps launching into a crowded market never finds a hit (it now reads the takeoff blocker and moves on).
  `HIT_GROWTH_RATE` went 0.011, 0.008, 0.004 and ended at 0.003.
- Screenshots were taken with the cached Playwright Chromium against `npm run dev -- --port 4321` (no page errors at
  any stage from the café to the Global company, on desktop and a 390px phone).

**Built: Phase 0 (2026-10-23).**
- *The start* (`sim/founding.ts`, `components/tycoon/FoundingDialog.tsx`): a new run opens "A new studio" with your
  name and the studio's, each with dice (`rollPersonName`, `rollStudioName`, which use their own randomness, not the
  run's). `state.studioName` (optional) names you in the ranking. The founders are an analyst (you, `you(state)`) and
  a developer; a founder analyst becomes a PM without the research (`pmBlocker`).
- *The café* (office kind `cafe`, 2 desks, $300 a month of coffee, `OFFICE_KINDS.cafe`): founders draw no pay there
  (`monthlySalaries`), there are no outings, only Small products (`sizeLock`), and the panel and the new-project
  dialog lead with client work ("Find a job"). It is the first journey stage, "Two friends at a café": deliver
  `CAFE_JOBS` (3) jobs, then save `GARAGE_READY_MONEY` ($6,000) and move (`moveToGarage`, a $1,000 deposit; the
  Team dialog's button). `inGarage` is true in the café too; `inCafe` is the café alone. The run starts with
  `CAFE_START_MONEY` ($2,500); `START_MONEY` is gone. A bot that takes the best-paying job moved out after about
  75 days (45 to 200 by seed), two minutes or so at 1x.
- *Café events* (`CAFE_EVENTS` in `data/events.ts`, drawn only at the café, from day 6, 15 days apart, 12% a day):
  Rosa the barista passes on a better-paid lead (`offerJob`), the Wi-Fi goes down, coffee on your friend's laptop,
  a curious regular (insight, or a lead).
- *The café scene* (`OfficeScene.buildCafe`, `buildCounter`; the crowd in `render-support/cafe.ts`): a green wall
  over panelling, a glass door, a shop window onto the street, a chalkboard menu and cup shelf, lamps, a checked
  floor, two tables. Rosa works the till and the espresso machine behind the counter; guests come in at the door,
  queue, order (a speech bubble with a cup), wait while she brews it and carries it back, take the
  cup she sets down at the end of the counter (with a heart), and leave with it by a lane nearer the front, or sit
  at a free table for a while, the cup on the table only while they sit there. The
  crowd runs on game running time, deterministic, and stands still while paused. The founders have mugs on their
  desks; there is a cat but no dog.
- *Stages moved up one*: `MOVE_OUT_STAGE` 2, `NEW_OFFICE_STAGE` and `ACQUISITION_STAGE` 4, `LEADER_STAGE` 5, the
  Flagship size 3, every research `stage` +1. Version 5 saves are upgraded with `stage + 1` (`upgradeFromV5`). The
  garage's client-job goal counts the café's: 5 now. `makeState` in the tests puts the studio in its garage at the
  Garage startup stage.
- Dev shortcut `?garage` skips the café.
- Not done: `scripts/tycoon/e2e.mjs` was already stale before this (it imports `render/characters.ts` and
  `render/layout.ts`, which moved to `render-support/`) and now also assumes the old start (no founding dialog, the
  garage, `START_MONEY`): it needs a pass before it can run again.

**Built: Phase A (2026-10-23).**
- *Fit* (`sim/fit.ts`): `Product.fit` (0–100, optional) is set by every release: the share of everything the audience
  loves that the studio can build now (`bestLove`, by value × how much more than 1 they like it), less
  `FIT_SHRUG_PENALTY` per feature they shrug at, from a `FIT_BASE` floor, times what quality allows
  (`qualityAllowance`: all of it from 90). `fitOf` takes off what the era expects and the product lacks. A product
  manager raises a release's fit (`pmFitFactor`, `PM_FIT_BONUS`; `PM_HIT_BONUS` is gone). A product for no audience
  has no fit.
- *Takeoff* (`takeoffBlocker`, `takeOff`, `fitDay` every day and at every release): fit ≥ `FIT_TAKEOFF` (75), market
  not cold, crowding by others (`crowdingAround`) under `TAKEOFF_MAX_CROWDING` (1.2), and fresh. It becomes a hit and
  the signature, its reach is given back and multiplied by `HIT_REACH`, and the users follow over the weeks. On the
  first hit the founder analyst becomes its PM. Until then a product reaches only `undiscovered(fit)` of its reach
  (`UNDISCOVERED_REACH` 0.7, more the better it fits); a launch campaign reaches everyone (`estimateReach(..., false)`).
  A hit can hold `HIT_MARKET_SCALE` (4) times the market (`saturate(..., hit)`). The roll is gone:
  `hitBreakdown`, `hitChance`, `launchesSinceHit`, `HIT_BASE_CHANCE` and the rest; rivals keep their own roll.
- *Reading it* (`fitRange`, `components/tycoon/FitMeter.tsx`): the fit shows as a range as wide as the studio's eye
  for users is poor (`FIT_BAND_MAX` 40 to `FIT_BAND_MIN` 4, by `readingSkill`, the best analyst's or PM's analysis),
  sitting differently round the true value for each release. On the product card with why it has not taken off, in
  the ship dialog with the market's demand and room. Feedback (loved, shrugged, wished for) now comes in sooner the
  sharper the analyst (`feedbackFor`), and all at once for a surveyed audience.
- *No market scan*: the Industry tab already shows each market's demand and crowding, so it was left out; insight
  goes on surveys.
- *Pivot* (`startPivot`, `pivotBlocker`, the "Pivot…" picker on the product card with the fit each audience would
  give): an update's work without new features; when it ships the product is for the new audience, keeps
  `PIVOT_KEEP` (a fifth) of its users, starts again as a launch, and cannot pivot again. Not for a hit.
- *Garage limit*: `GARAGE_PRODUCT_LIMIT` (3) live products in the café and the garage, counting one being made.
- *Journey*: the garage asks for 3 products shipped and a product that takes off; Indie studio only for the move;
  the breakout stage's "3 lasting products" became "grow your hit to 50,000 users".
- *Money*: client work pays `CONTRACT_PAY_PER_POINT` 18 (was 12), so a hire on client work about pays for themselves;
  the café asks `GARAGE_READY_MONEY` $8,000 (was 6,000) to keep it about as long.
- What a bot found (`hunt.ts` in the session scratchpad, not kept): a garage of four that launches guesses, adds what
  the audience wishes for and takes client work when short found its hit after 240 to 970 days, and 4 of 10 found
  none in four years, mostly by staying in the crowded web market; hits earned $300–770 a day after six months
  against $200–250 of costs. Products that do not take off earn little ($5–40 a day in a crowded market): the first
  thing to retune from a real run if the garage feels too poor.

**Phase A: the hunt (garage).**
4. *Fit, not a roll.* `Product.fit` 0–100, set at launch and moved by every update: `audienceFit` (what the audience
   loves, by value), quality, expected features present, market demand, and crowding (`marketCrowding`). The breakout
   roll goes: `hitBreakdown`, `HIT_BASE_CHANCE`, `HIT_CHANCE_PER_MISS`, `launchesSinceHit`, the PM hit bonus. Rivals
   keep their simple roll.
5. *Takeoff.* Past the line (about 75), with room in the market, the product takes off over the next weeks: word of
   mouth climbs, the toast and journal say so, it becomes the signature, and you become its PM. Fit can still sag
   afterwards (stale, rivals, bugs), which is what Act 2 is about.
6. *Reading the market is your job.* Fit shows as a meter whose precision is your analysis skill: a wide band at
   first ("somewhere between lukewarm and warm"), narrowing to a number as you grow and as feedback comes in, with
   what moved it. Beside the audience survey, a *market scan* (insight) ranks product type × audience pairs by room
   and demand. More analysts can be hired later; PMs stay behind research for anyone but you.
7. *Non-hit money.* A good product that is not a hit earns the garage's costs and a bit more (about 1.2× a 4-person
   garage's burn); a weak one 0.8–1×. Contracts stay the safety net.
8. *Kill and pivot.* The garage holds at most 3 live products; killing one is quick and costs no reputation.
   *Pivot*: point a live product at another audience of its type, keeping its code.
   - Gets you: every feature already built counts at once (no work to rebuild them), fit is worked out afresh for the
     new audience, and it costs about an update's work instead of a launch's. Right when what you built is good but
     for someone else (the feedback says *shrugged* where another audience *loves*).
   - Costs you: most of the users leave (about a fifth stay), the product restarts as a launch (word of mouth from the
     bottom), its bugs and its quality stay, fit can come out lower, and a product pivots once.
   - Against killing it and starting over: pivot when the features are right for someone else, start over when the
     features are wrong.
9. *Garage goals* (`data/stages.ts`): find the hit, then save up and move out. The breakout stage's "3 products earning
   $300 a day" goes.

**Phase B: the hit is the company.**
10. *Moving out* needs the hit. Keep up to 2 garage products as side products (they earn what they earn and take a
    second-product slot, below) and sell the rest to rivals for cash towards the office.
11. *Workstreams instead of directions.* Every floor works on the hit, on one workstream with concrete items to queue:
    **Features**, **Quality** (bugs, performance), **Scale** (capacity: the users the servers hold; past it come
    outages and churn), **Growth** (onboarding and marketing), **Monetisation** (plans, a business tier, ads: what a
    user pays), **Europe** (data rules, localising, European growth). As the hit's PM you set the order of the
    roadmap; your level speeds how much fit each release wins. Grow, Polish, Keep it running and Expand go, with
    `setDirection` and `queueFeatures`.
12. *Scale to millions.* A hit's market is no longer capped at five times its type's audience: its ceiling is set by
    capacity, features, regions and the era. Rough targets: first floor 100k–500k users, full headquarters 5–10M, both
    buildings 20M+, daily income $1M+ late on, $1B+ lifetime. Server costs grow with users. `formatMoney` and
    `formatCount` learn billions.
13. *Pressure on the hit.* Rivals launch into its market, eras bring features users start to expect, fit sags without
    releases, and outages when users outrun capacity: churn is the Act 2 enemy. A dashboard for the hit (users by
    region, fit, capacity, revenue per user, churn) is the main screen once you have moved out.

**Phase C: internal tools and second products.**
14. *Internal tools*: small projects for a 2–4 person team that help the hit, with upkeep, and earn nothing: admin
    panel (bugs fixed faster), analytics dashboard (insight, and fit in detail), CI/deploy pipeline (faster releases,
    fewer bugs), HR tool (hiring and morale), landing pages (Growth). Later idea: spin one out as a product (as Slack
    came out of an internal tool).
15. *Second products: two slots, each with a job.* A second product exists to make the hit bigger, in one of two ways:
    - **Reach**: brings new people to the hit, such as a mobile app for a web hit, a free tier, a creator tool for a
      game. It raises the hit's ceiling and growth.
    - **Keep**: makes the hit's users stay and pay more, such as a pro add-on, an integrations marketplace, an
      analytics add-on. It lowers churn and raises what each user pays.
    It is offered from a short list that suits the hit's type, starts with a slice of the hit's users (cross-sell, no
    hunt), earns some money of its own, and needs a team, which is people off the hit: that is the trade. A buggy or
    stale one costs the hit a little fit. A garage product kept at move-out fills a slot as a side product (its
    income only) until you switch it off to make room for a real one.

**Phase D: endings, Absorb, the journey.**
16. *Selling*: an offer comes when the hit takes off: "sell the hit to Big Co, or go big". Accepting asks for
    confirmation that the game ends there, with the final score. Turned down, it comes back larger while you have one
    floor; renting the second ends the offers.
17. *IPO*: the other ending. Once the company is big enough (to set: about 10M users, $1B lifetime, a year in profit)
    you can take it public: a bell-ringing moment, a valuation at a higher multiple, the run's final screen. Endings
    are then sell, IPO, retire or bankruptcy.
18. *Absorb*: buy a rival that competes with the hit. Its best people, by skill, take your empty desks and only
    those (no free desks, nobody comes); a share of its users move to the hit, and its product shuts down (or, with a
    free slot, is kept as a second product).
19. *The journey*: Café → Garage (find the hit) → First floor → Headquarters (1M users, a full building) → Europe →
    Global (10M users, $1B lifetime) → the IPO. You become CEO, and your friend CTO, at Europe. Research items about
    running many products (licensing, the portfolio) are reworked or dropped.

**Phase E: retune** from a run log, as before. Saves become version 6 (the founder, the café, a `fit` per product,
workstreams, capacity, second-product and tool slots); old saves are upgraded with the signature as the hit, a
founder analyst added, and the rest kept as side products or switched off.

**Why hire analysts when you are one** (proposed to the player, 2026-10-23):
- *Your time runs out.* In the garage you study users full time. As the hit's PM you spend half the day steering (as
  PMs do now, `PM_INSIGHT_SHARE`); as CEO or CTO none of it.
- *Act 2 needs far more insight than the garage.* Spending it is what makes the hit's releases count: user research
  on the hit shows which roadmap items its users want most and how much fit each would win; churn analysis shows why
  people leave, so you know which workstream to put a floor on; A/B tests make Growth and Monetisation items pay more;
  a survey of each European audience before localising; a market scan for each second product. Without enough
  insight the roadmap is a guess.
- *Analysts are where PMs come from.* Each second product needs a PM to run it, and the hit needs a new one when you
  move up. Analyst, senior analyst, PM is the only way to grow one, so hiring analysts early is planning ahead.
- In the garage a second analyst is possible but rarely worth one of four desks: that seat is better as a builder.

**Moving up** (decided 2026-10-23): when the company opens in Europe you become CEO and your developer friend CTO;
one of your analysts becomes the hit's new PM.

## Third logged run, and the building pivot (2026-10-21)

**The run** (`lab-tycoon-run-2026-10-21 (1).json`, about 4 hours): 19.4 years, retired as Tech giant with
$39M cash and a worth of $59M. Garage for 4.4 years (contracts until day 611; the save started on the old
$25k), Zebu hit on the third launch, one $740k offer turned down, moved out 70 days later. Europe at 9.3,
offices 3 and 4 on the same day at 10.1, Industry leader 10.1, Tech giant 18.6. 15 products, 5 hits.

What it showed, and what the player said about it:

- **Promotion was the economy**: $99.8M of $170M revenue. A promotion brought users by the product's raw
  reach (Zebu: ~2.8M) while the market only held ~90k for it, so every push was a 4-6x sawtooth in users,
  income and rank.
- **Tech giant could only be bought.** `daysAtTop` reset on any day off #1, the rank swung with the sawtooth,
  so the player held Industry leader 8.5 years and then spent ~$27M in a year on promotions at 25-30%
  effect to stay #1. "There's no way to reach Tech giant if I don't try the manual promotion."
- **Absorb was never used**: the player forgot how it worked and opened offices 3 and 4 once money stopped
  mattering, which closed it; later wondered why the button was disabled.
- **Sold good products for slots** (Dawn, Nebula, a hit) to make more flagships for the climb. Knows small,
  then grow, is better ("cheaper features too") but flagships were simpler; "shrugged" feedback made adding
  every feature feel wrong.
- **People were a number**: 39 left after 6+ years unnoticed; the player refilled headcount.
- **Europe felt the same as the US.** Moving people between regions was never understood, and hiring
  failed silently ("22/24 and can't hire": the US office was selected).
- **Analysts and PMs did nothing visible.** Study results never showed in the New project list on a phone
  (all `.feature .tag` were hidden under 520px), and the list ignored them.
- **Validation messages** sat at the bottom of long modals, out of sight.
- Most fun: nourishing 3-5 products.

### Built from it (2026-10-22)

- **Trailing income.** `trailingIncome` (an average over `INCOME_AVERAGE_DAYS`, `GameState.incomeAverage`)
  drives the ranking, the income goals, the buyout price and worth. A day off #1 costs `TOP_SLIP_DAYS`
  of `daysAtTop` instead of all of them.
- **Promotions sized by the market.** A promotion (and a launch campaign) speaks to its reach but at most
  `PROMO_AUDIENCE` times the users the market holds for the product (`promotionAudience`,
  `campaignAudience`), and is priced from that. `PROMO_KEEP` of the users it brings stay on as regulars
  (`Product.loyalUsers`, part of the target, fading over `PROMO_LOYAL_DAYS` and with staleness). The
  Promote buttons show the expected payback (`promotionReturn`, about 1.5x rested, under 1 soon after the
  last one) and the log records it. Costs (`PROMOTIONS`, `CAMPAIGNS`) were retuned to that.
- **Building more never hurts.** `audienceFit` only rises with features the audience loves; ones they barely
  notice add nothing (`AUDIENCE_FIT_VALUE`; `HIT_AUDIENCE_MIN` is gone). Feedback says "Barely noticed".
- **Studies you can see.** Taste tags show on phones; once studied, the feature list leads with what the
  audience loves and says so. Product managers' effect is spelled out (`pmEffectText`) on the person, the
  office row and the New project summary.
- **Hiring by region**: a US/Europe switch with free desks, defaulting to where there is room; the Team
  dialog explains desks versus *Works on*; other-region desks are marked; a row's controls get their own line
  with several offices (they overflowed on desktop).
- **Messages next to the button**: errors live in the sticky action bar (`.action-note`) or the row.
- **Smaller**: the first buyout offer waits `EXIT_FIRST_OFFER_DAYS` after the hit; demand news at most once
  per `MARKET_NEWS_GAP_DAYS` per type (Web App made the news 111 times); names are never reused in a run
  (`GameState.usedNames`); the monthly log has the average income, Europe users and regulars.

Not retuned yet: late-game income without the pump is much lower, so whether #1 and Tech giant are reachable
needs the next run (bots do not promote, so they cannot tell). Saves stay version 5 (all new fields optional).

### Next: two buildings instead of four offices (agreed direction, needs planning)

The player's pivot: four offices ruin the focus and add nothing. Instead **one US and one European
location, each growing into a building** of up to **5 floors**, seen from outside like Fallout Shelter
(the existing office scene, one 12-desk floor each, turned into a cutaway), **all on one screen without
scrolling**. Decided so far:

- Selling the studio stays open past the garage, until the building: renting one office floor is still the
  early days. The first offer comes some time after the hit, not the day of it (done).
- Teams can be reassigned between products; the design must keep the player acting, not watching
  ("explore options so you are not just an observer").
- Releases stay something the player does, in some form (to explore with the above).
- ~~Stand-ups and coffee breaks affect the team, not only the look~~ (2026-10-22: they are culture, always on, look only).
- A floor holds several things: the team's desks, ~~a meeting room on the right~~ a Scrum board on the right
  (2026-10-22), and coffee and snack machines and coolers along the wall, as in the Focus office, but drawn in the
  cutaway view.
- Europe differs by stricter data rules, its own tastes, and a slightly but noticeably European interior.
- Garage desks are in two rows of two with the pets below (built: the garage always uses the `tall`
  arrangement, cropped like the office so the whole garage stays in view).

- Europe's stricter data rules mean all of: a product needs a compliance feature before it launches there,
  and bugs and breaches cost more there.
- An absorbed rival arrives as a new floor in your building in its region; stage goals that ask for 3 or 4
  offices are replaced (floors, teams, products per team).
- Monthly loop (agreed 2026-10-22): a team owns a product and works on it non-stop under a
  *direction* (Grow, Polish, Keep it running, Expand to Europe) and ships a release on its own every 2-3
  months; the player picks the features of the next release, when to grow, moves teams, picks new products
  and runs the floor (stand-ups, breaks, meeting room). Fewer teams than wanted, and Europe's rules pulling
  Expand against Grow, make the trade-offs.
- Screen size (mockups, 2026-10-22): on a phone, 5 floors fit one screen at about 390x120 px each for one
  building, or 190x120 for both side by side. At a readable size a floor shows about 4-6 desks, not 12, so the
  agreed shape (2026-10-22) is a building overview on one screen (floors with status at a glance), tapping a floor to zoom
  into today's detailed office view, and on phones one building at a time with a US/Europe switch.

Built 2026-10-22 (commits f3b9250 to cb90e79): offices are floors (`REGION_OFFICE_LIMIT` 5 per building, `MAX_OFFICES` 10; selling
stays open until a second floor, `canBeSold`/`closeSale`); `sim/teams.ts` (a floor looks after a product under a direction, ships its own
releases, queued features, stand-up and coffee-break routines); Europe's rules (Privacy compliance before localising, `EU_*` in
`data/regions.ts`, fines on breaches); `render/BuildingScene.ts` + `render-support/building.ts` + `BuildingOverlay` for the street view
(tap a floor to go in, one building at a time on phones). Not done: meeting room, coffee corner and EU interior inside the zoomed-in
floor, watching stand-ups and breaks play out, retuning the first-guess numbers, a phone check of the new dialogs.

## Redesign: two acts (2026-10-18)

From a year-20 playthrough (4 offices, Tech giant, ~80k/day, 75M lifetime, 5 promoted
products, 3 rivals bought). The late game was grinding: promote five products, no
reason to build or keep anything, rival purchases gave nothing, extra offices were
redundant, client work stopped mattering at ~20k/day, and the player never fired
anyone. Hits felt random, and feature choice was "pick the 3-star ones".
Saves are not migrated for this work (one player); old saves load with defaults.

**Shape.** Act 1 is the startup: build products until one clicks. At the garage the
studio can sell (**the fork**); moving out closes that for good. Act 2 is a company
with a few products it cares about, teams that own them, and a long run.

### Built

- **Names.** 247 product words; `freshProductName` (`sim/naming.ts`) avoids every
  name in play, retired or on a rival's list, and falls back to two-word names.
- **Offices.** The offer for a fifth office is hidden at the cap of 4.
- **Hit chance** is explained in the launch dialog (`hitBreakdown`): streak,
  quality, market, buzz, audience fit, and whether it hit the cap.
- **Run log.** `GameState.journal` records every player decision with the cash and
  numbers at the time (`sim/decisions.ts`, written from the store), the sim's own
  events (stage, era, hit, event offered, notices) and a monthly snapshot
  (`sim/journal.ts`). Export it from the Menu or the end screen ("Export run log").
  Capped at `JOURNAL_LIMIT`.
- **Lifecycle.** Decay is about twice as slow (`FRESH_DAYS` 120, `STALE_DAYS` 180)
  and slower again per update (`MATURITY_PER_UPDATE`, up to 4). An update with no
  features is a cheaper **maintenance release** (`MAINTENANCE_TARGET_SHARE`).
  Products show a phase (Launch, Growing, Established, Fading). **Marketing
  automation** (Business research) lets a product promote itself at a chosen tier,
  never below `AUTO_PROMOTE_RESERVE_DAYS` of burn (`autoPromoteDay`).
- **Garage buyout.** Once the garage has a hit earning `EXIT_MIN_INCOME`, a rival
  offers 2 years of income (times a little for reputation); "Not yet" brings a
  slightly better one (+0.2 years, up to 6 times) 90 days later, but buyers lose
  interest `EXIT_WINDOW_DAYS` (540) after the first offer (`sim/exit.ts`, `EXIT_*`).
  Selling ends the run (`GameState.ending`). Moving out clears and closes it (the
  button asks twice). First run's log: the first version (3 years, +0.6 per "no", no
  end date) made waiting in the garage free money (offers $12M to $39M, 89% of the
  final worth), so the player never moved out; hence the flatter multiple and the window.
- **Legacy.** Menu, "Retire and see your legacy" ends the run at any time. Every
  ending (sold, retired, bankrupt) shows the same numbers and a *worth*: cash plus what
  a buyer would pay at the base multiple (`studioWorth`), so runs compare.
- **Promotions wear off** (`promotionEffect`): right after one ends the next brings
  25% of its users, recovering to full over 180 days (`PROMO_*`); a launch campaign
  counts as a promotion. Auto-promotion waits for 80% (`AUTO_PROMOTE_MIN_EFFECT`), so
  about once per product every five months. Bot check: a bot that promotes only when
  it pays reaches ~4.3k/day at year 20, against ~11k when it promoted every time it
  could, so about 60% of that bot's income was promotion spam.
- **Log** also records income per product per month, and logs a launch's breakout.
- **Portfolio.** Outside the garage: 5 live products including ones being made
  (`PORTFOLIO_LIMIT`), one new product per `NEW_PRODUCT_GAP_DAYS` once there are 3.
  Updates and growth are not limited. **Growing** a product (Small, Medium, Large,
  Flagship, in order, at least `GROW_MIN_AGE_DAYS` old, not fading) costs the
  difference between sizes and scales its reach (`growBlocker`, `growTarget`,
  `Project.grows`).
- **Hit gate and growth rolls.** Moving out needs a breakout hit (`moveOutBlocker`:
  `signatureId`), so the garage, which has no new-product limit, is where the hit is
  hunted. Every grow gets its own breakout roll (`shipUpdate`, same `hitChance` as a
  launch, no campaign; a hit multiplies reach by `HIT_REACH` of the new size and
  skips products that already hit). A good grow that misses counts toward the streak.
  The launch dialog shows the chance for grows too. Why: the second logged run
  (office, 7 years) had 8 new-product shots at 2.4% to 29% and no hit (about a 1 in 4
  streak), and a single shot a year felt like too few; growing is the act of caring for
  a product, so it should be a chance for it to take off.

Balance note: with these caps the best bot reaches ~11k/day at year 20 (was ~26k) and
stalls at Industry leader. The bots are cruder than a person (they do not auto-promote
or tune), so retune from a human run and its log, not from the bots.

- **Audiences and feature fit** (`data/audiences.ts`). Each product type has 2-3
  audiences, picked when a product is started and kept for its life. A wide audience
  reaches more people and pays less, a narrow one the reverse. Each values features
  differently (`likes`, default 1): that moves reach (`featureScore`), revenue per user,
  and a new `audience` factor in the hit chance (`HIT_AUDIENCE_MIN/MAX`). The picker
  shows only a hint; after launch the product card says what they loved, shrugged at
  and wished for (`audienceFeedback`). Open: analysts revealing the weights before
  launch, feedback over time, and audience-specific research.

### From the first logged run (sold from the garage at year 11)

Two and a half years of contracts only before the first product; 500 days between
products in years 4 to 7; cash with nothing to buy (875k at year 8, 4.8M at the sale,
all 16 research done by year 10.8); 115 auto-promotions at Large cost $5.97M, half of
the $12.0M lifetime revenue, and the player calls Marketing automation a cheat code
that made income grow exponentially. The player did not know which features affect hit
chance (audiences, below). Nothing in the log says whether a promotion paid back, so
the monthly snapshot now has income per product. Since then: promotions wear off, the
garage sale is flatter with an end date, and products sell by income (all in Built
above). Still open: whether that tamed auto-promotion enough (check against a new log;
otherwise diminishing returns, a cap, or a cost that grows), a garage that has
something to buy (the budget now covers that). The contract-only start stays as it is.

### Built: the roadmap pass (2026-10-20)

Saves stay version 5: every new field is optional or defaulted on load (`dropRemovedContent`).

- **Garage hustle.** Starting a new product, or growing one, costs a *budget*:
  `BUDGET_PER_POINT` (15) per point of work (`projectBudget`), and the bank must keep
  `BUDGET_RESERVE_DAYS` of wages after paying (`budgetBlocker`). `START_MONEY` is 8k, so the
  first product with a few features costs more than the garage starts with and contracts are
  the way in. Updates are free. Bot check: contract-taking bots end up where they were; bots that
  never take client work now go bankrupt in the garage, by design.
- **Knowledge** (`sim/knowledge.ts`). Working days on a product type and on a product make a
  person faster on them (`KNOWLEDGE_*`, up to +12% and +15%); shown on the person's page. A
  *Knowledge base* (research) lets a team keep 40% of a leaver's knowledge (`depart`).
- **Teams.** `Employee.teamId` puts a builder on another office's project (`assignTeam`), at
  `REMOTE_SPEED` (0.9); the Team dialog has a "Works on" select. Desks stay with the office.
- **Analyst and Product Manager.** Roles `analyst` and `pm` (`Employee.analysis`), laptop on the
  desk, no project work. Analysts need the *User research* research and gather insight
  (`sim/insight.ts`): spend `SURVEY_COST` to study an audience, which then shows loved/fine/shrug
  tags in the feature list. Without an analyst, launch feedback arrives over 20/60/120 days
  (`feedbackFor`). A Senior analyst becomes a PM (*Product management* research, `becomePm`, one
  per office, Mid to Lead): hit chance and launch/growth reach go up with their level
  (`sim/direction.ts`).
- **Research as mechanisms.** `stage` gates on nodes; *Audience study* (repeatable, money for an
  audience reveal), *Knowledge base*, *Enterprise sales*, *Licensing programme*, and second and third
  steps of the speed lines (CI pipeline II/III...). `ERA_WAGE_*`: wages rise 12% per early era, 4%
  per late one.
- **Act 2 income.** With *Enterprise sales*, a big client asks for a Large/Flagship product to be
  customised (`ContractOffer.productId`, `sim/contracts.ts`); delivery pays by what the product
  earns and counts as a release of it. With *Licensing programme*, a Flagship can be licensed:
  `LICENSE_SHARE` of its income on top while it stays fresh and clean (`sim/licensing.ts`).
- **Content.** Four more eras (trust years, agent era, spatial years, sovereign cloud; to year 17),
  five product types (Marketplace, Creative Suite, Fintech App, Data Platform, XR Experience),
  fourteen features with audiences, milestones reworked for a portfolio (team of 4, shelf of 5,
  past products count), and "Tech giant" legacy goals that never gate. Newcomer studios are
  generated (`generatedNewcomer`) for eras with no hand-written one.
- **Tests** for the ranking, buyouts, eras, crowding and `settledUsers` (`competition.test.ts`).

Open from the first pass: the audience-weights reveal could also come from a PM automatically; bots
still overexpand late (they hire up to the bank, never fire), so retune from a human run.

### Built: regions, Europe and Absorb (2026-10-20)

- **Two regions** (`Region`, `data/regions.ts`). Offices, rivals and employees have one; the
  garage and first office are US. Each region is a market with **room of its own**: crowding,
  saturation and market weight are per (type, region) (`marketKey`, `marketWeights`), Europe's market
  for a type is `EU_TYPE_SIZE` of the US one, and users pay `EU_PAY` as much. A rival weighs in full
  in its home market and `RIVAL_ABROAD` in the other.
- **Subscribers per region.** `Product.users` stays the total; `euShare` (of reach) and `euUsers`
  say how much of it is in Europe (`usersIn`, `reachIn`, `targetUsersIn`). Europe also has its own
  tastes (`EU_LIKES` on top of an audience's).
- **Localising** (`startLocalisation`, `Project.localises`): a maintenance-sized update per product,
  needs an office in Europe and costs its budget; on shipping the product gains
  `euGain` of reach there and a launch's first users. Products start US-only.
- **Offices.** The second office is Europe (`EU_OFFICE_COST`); the third and fourth are one more in
  each region (`REGION_OFFICE_LIMIT`, `openableRegions`). Hiring pools per region (candidates carry
  a region; European pay is `EU_WAGE`); people only transfer within a region but can work on another
  region's team.
- **Absorb** (`acquire(state, rivalId, keepIds)`, `AbsorbDialog`): from Established company, needs
  the European office first and a place for the rival's region; price is its income times
  `ACQUISITION_DAYS` times its growth; its office opens as yours with 5 to 8 builders who know what it
  made; you keep the products you choose (they take portfolio places); the rest leave with it.
- **Decided against:** a *Subsidiary* option for absorbed studios, and a non-contract way into
  the garage (grants, pre-orders, sponsorship): contracts stay the garage's income.
- **Not built:** regional freshness (a release refreshes both markets) and EU-only rivals'
  products competing outside their region beyond the `RIVAL_ABROAD` weight. Rivals' growth is unchanged (they still reach the cap
  late); the player can buy early, from Established.

## First real playthrough (2026-10-15)

The first human feedback, from two runs on a phone. Run 1 (about 30 minutes)
never left the garage; run 2 reached two offices and 24 people in game year 12,
with 7–8 products, after roughly 1.5–2 hours of play spread over a day (mostly
2× speed, paused often). Run 2 is still saved. **Decision: no journey log or
"expert mode".** Both runs predate any logging and the player does not want to
replay; the feedback below is the data.

### What the player reported

- **Garage start is scary.** A 2–4 person garage team burns about $250/day, so
  the player was afraid to start a project and spent run 1 watching money fall.
  Run 2 worked because contracts were rushed first to build a cash pile before the
  first medium product.
- **Contracts feel forced, and that is fine in the garage.** Later they are a
  side job. A weaker second office cannot take them because contracts finish
  faster than its team can.
- **Never secure, always firefighting.** Even with 24 people and 8 products,
  money felt on the edge: fix bugs, push updates, promote, repeat. There is no
  stretch of "this product earns, I have time". The biggest promotion (about
  $150k) rarely paid off. Pace per day is fine, but the *demands per day* are too
  many: slower pace and fewer demands are both wanted.
- **Bugs never stop.** Wanted: pick which employees fix bugs, or an auto-fix
  mode.
- **Products die with nothing to do.** A hit was updated with everything
  possible, after which only promoting and fixing were left, while users drifted
  away. It did not feel like a living product. Flops (medium, large, flagship)
  stay in the list and take attention. The player wants to **sunset** a product,
  and the 12th-year list still shows a product with one user.
- **Products feel random.** Beyond the three-star features, it was not clear
  what makes a good product, and the first hit felt random, not earned.
- **People leave before they matter.** The player wants to care about employees
  (skills growing, a senior from the garage still there at the end) but
  there is no time to, and the only story is a "retired after nine years"
  notice. Wanted: the office as a home, with physical things like servers.
- **Rivals and eras have no weight.** Rivals are a scoreboard; eras did not
  change any decision. Reactions from rivals would help.
- **The journey is the point.** (Superseded 2026-10-18: selling the studio from
  the garage is an ending, and the long game gets a legacy summary; see the
  redesign above.) Near the end of the
  content after about 2 hours (research nearly done, a third office is the only
  step left), so late content is needed.
- **Unnoticed:** the 12% wage rise per era (higher pay was read as "more
  experienced"), and that an office of more than 4 is 10% slower without a Lead
  (the UI only says it needs one). A Senior was promoted to Lead in time.
- **Charts** look nice but mean little. **Sound:** unsure; maybe reuse the lo-fi
  from the Focus app.

### Done from this feedback

- "Job offer" no longer always picks the best-skilled person. The target is
  weighted by salary and low morale, and anyone kept by a counter-offer is left
  alone for 540 days (`keptDay` on the employee; optional, so old saves load and
  `STATE_VERSION` is unchanged).
- The squashed-bug animation on fix sprints is gone. Only the bug icon with the
  red number stays. Removed `DayWork.bugs` and the squash popup.
- Team dialog on phones: when a row has several buttons (Promote, office
  select, Details, Fire) they wrap onto their own row instead of widening the
  dialog into a horizontal scroll. **Not yet checked on a device.**
- The popup number is the sum of design, engineering and QA points, tinted by the
  largest. QA does grow in the background while the number is blue. Left as is.

### Built: garage rework (second session)
Second-session feedback: contracts only covered the burn, nothing felt doable,
hardware events fired three times in 15 minutes, "merge quickly" had no cost.
- **Founders.** The two starting people can't be fired, poached, quit or retire;
  they draw half of market pay (`FOUNDER_PAY_SHARE`), which still rises with eras.
  Shown in the Team dialog. Saves are v5; old saves' day-0 hires become founders.
- **Contracts.** Half the pay up front (`CONTRACT_DEPOSIT`); a rolling board (a
  job every 7–13 days, max 4, expires after 35 days); pay per point 12.
- **Events.** Rarer, no repeats within a window, hardware only once in a real
  office, "merge quickly" adds bugs.
- **Rivals.** Only the original five at the start; the other five move in later.
- **Garage goals.** Ship 3 products (was 2).
- **Not done:** odd jobs (small always-available gigs), a bot that stays in the
  garage to tune its length, and a phone check of the new UI. Needs a play session.

### Built: pair bug fixing, bug model, sunset, more rivals (2026-10-16)

Save version 4. A bot check (14 years, 8 seeds) left the stage years about where
they were: *Tech giant* by the best bot around year 7.7 (7.8 before). No human has
played it yet; the numbers below are first guesses.

**Pair bug fixing**
- A fix is a developer plus a tester (by `Employee.role`), from any office. The
  developer adds engineering and the tester QA; design counts for nothing
  (`FIX_SPLIT`). The rest of each office keeps its project. The pair gains skill
  while fixing. A studio with no tester cannot fix. State: `GameState.fixes`;
  `workersOf` leaves fixers out of their office's work.
- One pair per product, any number of products at once. Stopping keeps progress.
- **Incident management** (Quality branch, needs Test automation, $30k, 40 days)
  lets the player put a developer and a tester on call (`GameState.onCall`). Each
  day the pair starts a fix on the buggiest product above `AUTO_FIX_DENSITY`
  (10 bugs per unit of size), and works on its office's project otherwise. If one
  of them leaves, the arrangement ends with a notice.
- UI: *Fix bugs…* on a product opens a developer and tester picker with an
  estimate in days; running jobs show in a strip above the project panel; the
  on-call picker is at the top of the Products tab once researched.

**Bug model**
- An update's new bugs are hidden (`Product.pendingBugs`) and surface over about
  20 days (`BUG_SURFACE_RATE`), so a release no longer adds dozens in a day.
- Those bugs and the ones users find day to day scale with how bug-prone the
  product is: `bugProneness(quality)` = (100 − quality) / 40, between 0.25 and
  1.5, so a polished product stays calm. Launch bugs are unchanged.

**Sunset**
- Under `SALE_MIN_INCOME` ($500 a day; it was 100,000 users, which ignored what a user pays) a product is *retired*: removed, free. At or
  above it, a rival buys it: price = 12 months of its income now (×1.25 for a hit,
  less while buggy), the product joins that rival with its users, everyone's
  morale −5 and reputation −3 (−6 for a hit). Blocked while an update is being
  built; a fix on it is cancelled. With no rival left the sale still pays.
- Past products are listed in Studio → Stats; the Journey still names a sold
  signature hit. The morale hit goes to the whole team, because the game does not
  record who built a product.

**Rivals**
- Ten studios in all (five new ones in `data/rivals.ts`; since the garage rework only the original five start, the rest move in over years 2–6), and a newcomer
  appears at each new era (`NEWCOMERS`). Version 3 saves get the five new studios
  with one product each. Rival launches now toast only for a hit or a product
  type you also make.

### Directions, not yet ranked or scheduled

To discuss and order. Themes: *attachment* (people, products, the office as home)
and *cause and effect* (why a product worked, rivals and eras that matter).

- **Living products.** (Partly built: slower decay, maintenance releases, phases and
  growing a product into the next size.) A longer life per product: a roadmap of updates that keep
  opening content, slower and more visible decline, a reason to care after the
  last update.
- **People you care about.** Visible skill growth, tenure and promotion stories,
  retirement with a farewell, fewer pointless leavers.
- **Why it worked.** (Partly built: the product card says what the audience loved,
  shrugged at and wished for, and the launch dialog explains the hit chance.) Still
  missing: a post-launch report on what drove quality and users (era fit, crowding),
  and eras that change what sells.
- **Breathing room.** Slower pace and fewer demands per day (see "Play it, then
  retune"). A garage that is less frightening in the first two months.
- **Late-game content.** More product types and research, server bills and
  outages with physical servers in the office, an HQ scene, staff retirement.
- **Lo-fi sound** from the Focus app. (A hit, an era and a deal now have their
  own sounds; they are short synthesised notes and untested by ear on a phone.)

## Play it, then retune (most important)

Balance so far comes mostly from bots, plus the one human run above.

- **Real-time pacing.** A game day is 1.5 s (`MS_PER_DAY`): a year is 9 min at
  1×, 4.5 at 2×. The best bot reaches *Tech giant* around year 7. The human run
  reached year 12 in about 1.5–2 hours at mostly 2×, which the player found
  about right per day. The ask is for more room per day, not more speed: see
  *Breathing room*.
- **The garage is tight.** Start money $25k, daily burn about $250 for a small
  team (about 100 days of runway), projects take 2.5× the work (`WORK_SCALE`).
  Bots that never take client work go bankrupt early; a human who is afraid to
  start a project does not progress either. One client job is a stage goal.
- **Money is tight all game for a human** (the opposite of the bots' millions by
  year 10–12). Rival buyouts, the late sink, were not reached. Re-check the
  bots' late money against real play before adding sinks.
- **Hits** (now legible: the launch dialog shows the streak, quality, market, buzz and
  audience factors, and grows roll too; still to retune from a new log):
  `HIT_BASE_CHANCE`, `HIT_CHANCE_PER_MISS`, `HIT_MAX_CHANCE` put the
  first hit at about year 3 for the best bot (range 1.4–8). The human's second
  product hit but "felt random". Decide whether to keep it luck-based or make it
  legible.
- **Rivals** earn from "other business" outside the shared markets, growing
  yearly up to a cap (without it the player passed them all by year 4). Works,
  but abstract, and they do not react to what you do.
- **Wages** grow 12% per era (`ERA_WAGE_GROWTH`); a fixing pair uses only
  engineering and QA (60 / 40). Both were judgement calls. The wage rise is now
  stated in the Team and Era dialogs, but is not retuned.
- **Leads:** an office of more than 4 people works 10% slower without a Lead; a
  Lead needs 80 skill in their discipline; hires start at Senior at most (65).
  A Lead appeared in the human run. The Team dialog now states the slowdown (and
  the 5% a Lead adds).

## Test and check gaps

- **Rivals and eras are thinly tested.** `tests/tycoon/rivals.test.ts` covers the
  roster, newcomers, arrival years and launch announcements. Still only exercised by
  the bot runs: ranking (`standings`, `rankingDay`), business growth, `acquire`,
  `data/eras.ts`, crowding, expected-feature penalties and `settledUsers`. Add tests,
  including a save round trip with rivals and an acquisition (do this before building
  Absorb).
- **Browser checks do not cover** the breakout, era and stage dialogs, the
  buyout button, promoting a person, the Lead warning, or opening a second
  office from the Team dialog.
- **Phones:** the scene, top bar, project panel and New project dialog were
  checked on a Pixel 9 (installed app) and in emulation. The first human runs
  were on a phone and worked, apart from the Team dialog overflow fixed above.
  Still not checked: the Journey and Industry tabs (wide tables), office tabs,
  the client-work list.
- **Tall tablets** (768×1024) keep rows of four desks and show spare floor at
  the bottom. Accepted: Tycoon always lays desks out in rows of four, on every
  screen (the automatic one-column switch, `arrange`, was removed); only the
  Focus office uses the one column, on touch screens.
- Not tested on iOS Safari.
- `scripts/tycoon/e2e.mjs` imports `puppeteer-core` and `pngjs`; the former is
  not in `package.json`, so the script does not run from a clean install.

## Content that runs out

- ~~The last era starts in year 9~~ Built: eras to year 17.
- **Tech giant has no goals.** The long game stays a journey; the redesign above
  adds a legacy summary and no IPO-style reset. Options still open: an endless mode
  with growing rivals; a legacy / new-studio start.
- Research (16 items) is finished early (by year 10.8 in the first logged run); repeatable research (CI II, III…) is
  not built.
- Only 7 product types and 24 features; era "expected features" stop at the
  platform age. More product types are wanted.
- Milestones were not reworked into the journey: "Fill all 12 desks" and "A real
  team" (5 people) assume the old single office.
- Contracts do not scale into the late game (see the redesign: enterprise contracts).

## From the original plan, not done

- Upkeep on live products beyond bugs and staleness (server bills, support load,
  churn from outages). Wanted by the player, with physical servers in the office.
- Per-market reputation instead of one number.
- Scenario starts (a downturn, starting in debt).
- Rivals that act on you: really hiring staff away (today only the "Job offer"
  event names a rival), reacting to your hits, going bankrupt.
- A big HQ scene as a late visual reward.
- Staff retirement as more than a notice (people only "move on" after six
  years; the player wants to know who has been there and to say goodbye).

## Rough edges

- Stats charts show money and income only; no users, ranking history or
  per-product charts, and the player did not find them meaningful.
- `ProductsTab` sends updates and fixes to the office currently shown; a
  product another office is working on is blocked with "Another team is working
  on it". A picker would be clearer with several offices.
- The product page recomputes market weights for every product on every render;
  revisit if the catalogue grows.
- Office floors have four colour themes (`OFFICE_THEMES` in `lib/tycoon/theme.ts`);
  the garage is the only room with its own art.
- Installed-app layout: the game root is pinned with `position: fixed` +
  `100dvh` because the page's flex chain resolved ~56px too tall in an installed
  Android app. Keep that if the page layout changes.
