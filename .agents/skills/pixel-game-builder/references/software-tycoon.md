# Software Tycoon source map and safe workflows

Repository paths below are starting points, not frozen architectural promises. Verify the current code and roadmap before editing. Do not copy historical roadmap snippets over newer live behavior.

## Source map

| Work | Start here |
| --- | --- |
| Current design, player feedback, acceptance gates | `software-tycoon-roadmap.md`: current handover, Next steps, Guide for the next session, then the relevant newer section |
| React boot, scene lifecycle, controls | `src/components/tycoon/TycoonApp.tsx`, `App.tsx`, `src/lib/tycoon/browser.ts`, `store.ts` |
| Office/café/garage rendering | `src/lib/tycoon/render/OfficeScene.ts`, `BuildingScene.ts`, `furniture.ts` |
| Atlas frames, generated textures and recolors | `src/lib/tycoon/render/atlas.ts`, `src/lib/tycoon/theme.ts` |
| Appearance and poses | `src/lib/tycoon/render-support/characters.ts`, `poses.ts`, `workstations.ts` |
| Seats, furniture contact and navigation | `src/lib/tycoon/render-support/cafe-desk.ts`, `layout.ts`, `seats.ts`, `vacancy.ts`, `walkout.ts` |
| Ambient café, breaks and routines | `src/lib/tycoon/render-support/cafe.ts`, `activity.ts`, `breaks.ts`, `routines.ts` |
| Economy, pacing and progression | `src/lib/tycoon/sim/balance.ts`, `tick.ts`, `economy.ts`, `products.ts`, `fit.ts`, `scale.ts`, `teams.ts`, `operations.ts`, `services.ts`; content in `src/lib/tycoon/data/` |
| Career and live save ownership | `src/lib/tycoon/career-controller.ts`, `career-bootstrap.ts`, `career-autosave.ts`, `career-persistence.ts`, `career-save.ts`, `career-transactions.ts`, `save.ts` |
| Founder finance and recovery | `src/lib/tycoon/paid-founding.ts`, `consulting.ts`, relevant career modules; roadmap's live v12 acceptance section |
| Tests and fixtures | `tests/tycoon/`, `scripts/tycoon/stage*-fixtures.ts` |
| Browser acceptance | Relevant `scripts/tycoon/*-browser.mjs`; inspect its header and fixture requirements first |
| Balance bots | `scripts/tycoon/playthrough.ts`, `operating-policy.ts`; integrated careers in `stage7-acceptance.ts` and related adapters |

## Rules and saves

- Express action availability and effects in the existing simulation APIs, then have UI previews/blockers use those APIs. A button label must not promise an effect the engine does not implement.
- Seed gameplay randomness through the existing simulation; ambient appearance may be deterministic by ID/time without consuming gameplay randomness. Do not make economic outcomes depend on FPS, wall-clock rendering, or component remounts.
- Follow existing simulation time handling; do not add a second `setInterval` game loop. Test minutes/years of state using existing helpers rather than waiting in real time.
- IDs for research, products, stages and work items can be persisted references. Renames/deletions/reordering may need explicit migration and compatibility tests.
- Preserve version guards, visible recovery, backups, import/export validation, and multi-tab/write-failure handling. Do not bypass the career controller with direct storage writes in production code.
- Keep founder personal cash, company cash and paper value separate. Never reconstruct a legacy valuation as spendable money, double-settle an exit, or grant a free chapter because a generic prestige template does so.
- Use synthetic fixture storage only in an isolated test profile. Legacy fixture writers may deliberately exercise old save formats; follow their paired script rather than assuming a storage key is the live persistence API.

## Focused verification examples

```bash
# Pose/contact/layout changes (select the files relevant to the patch).
npm test -- tests/tycoon/poses.test.ts tests/tycoon/characters.test.ts \
  tests/tycoon/workstations.test.ts tests/tycoon/layout.test.ts \
  tests/tycoon/cafe.test.ts

# Mandatory final checks.
npm test
npm run typecheck
```

Select save/controller, economy, operations, or UI tests from `tests/tycoon/` for those tasks. A pure geometry test does not establish that Pixi draws the final composite correctly; a screenshot does not establish save safety.

## Balance workflow

1. Read the latest roadmap retune notes and the header of `scripts/tycoon/playthrough.ts`. Form a hypothesis from a player report, run log, or acceptance failure. Preserve a baseline before changing numbers.
2. Change one lever or one tightly coupled correction; keep seed, years, bot policy, and environment flags identical for the comparison.
3. Bundle outside the repository and run the matrix:

```bash
npx esbuild scripts/tycoon/playthrough.ts --bundle --platform=node --format=esm \
  --alias:@=./src --outfile=/tmp/tycoon-playthrough.mjs
for seed in $(seq 1 12); do
  node /tmp/tycoon-playthrough.mjs "$seed" 12 quiet
done
```

4. Record distributions, not just one winning seed: bankruptcies, stalls, time to milestones/endings, income/burn, capacity, fit, and any acceptance-specific metric. For decisions based on player-visible information, compare `BOT_POLICY=observed` too. The default optimistic bot is a lower-bound pacing benchmark, not a forecast of human play.
5. For career/founding changes, use the current integrated acceptance tools and reproduce the roadmap's relevant checks; a single-company bot cannot prove multi-company settlement safety.
6. Re-run tests/typecheck and write the evidence and remaining human-verification gate into the roadmap.

`scripts/tycoon/simulate.ts` and `e2e.mjs` are marked stale in the roadmap; do not use them as the default acceptance path. Inspect current browser scripts before running them, because Playwright/Chromium setup is external and URL/fixture defaults differ.
