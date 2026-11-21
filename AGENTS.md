# Agent instructions

## Workflow

- Always work on `main`. Do not create feature branches, worktrees, or side branches unless the user explicitly asks for one in that message.
- Commit directly to `main` and push to `origin/main` when the user asks you to commit or push. Do not open pull requests for routine changes.
- Only commit or push when the user asks. Never force-push `main`.
- Before committing, check `git status` and stage only the files you changed for the task. Do not sweep in unrelated working-tree changes.
- Commit messages follow the existing style: `type(scope): summary`, e.g. `feat(focus): ...`, `fix(ocr): ...`, `docs(roadmap): ...`.
- Do not delete branches unless the user asks.

## Project

- Astro site with React islands, TypeScript, and Vitest. Source in `src/`, tests in `tests/` (mirroring `src/`).
- Install: `npm install`. Dev server: `npm run dev`. Build: `npm run build`.
- Verify changes before reporting them done:
  - `npm test` (Vitest)
  - `npm run typecheck`
  - For UI changes, run the app and check the page when you can.
- Report test or typecheck failures with their output. Do not claim success on a check you did not run.

## Software Tycoon

- The game's single source of TODOs, design record and retune playbook is `software-tycoon-roadmap.md`: start with its
  "Next steps" and "Guide for the next session" before changing anything in `src/lib/tycoon/`.
- `scripts/tycoon/playthrough.ts` plays the whole game with a bot (usage in its header): run it over several seeds after balance changes.

## HR Department

- The game at `/hr` (an office survivors-style hero run) and the shared coworker roster: its single source of TODOs,
  design record, retune playbook and handoff notes is `hr-roadmap.md`. Start with its "Status", "Next steps" and
  "Guide for the next session" before changing anything in `src/lib/hr/`, `src/lib/roster/` or `src/components/hr/`.
- `scripts/hr/playthrough.ts` plays hero runs with a bot for each starter (usage in its header): run it over 20 to 30
  seeds per starter after balance changes.
- Its copy lives in `src/lib/hr/i18n.ts`, English and Russian together.
- The meta layer (career, packs, interviews, stages, perks) is `src/lib/hr/career.ts` plus the numbers in `src/lib/hr/sim/balance.ts`; the bot takes a career level, rarity, interview boss and stage (see the roadmap's "Running and checking"). Keep tests short: simulate minutes of play by jumping `run.time`, not by playing it, or CI times out.

## Copy

- The Focus app's user-facing strings live in `src/lib/focus/i18n.ts`, with English and Russian in the same object. Update both languages together.
