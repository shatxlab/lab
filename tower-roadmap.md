# Lone Tower roadmap and persistence notes

This is Lone Tower's implementation/handoff record. Agreed cross-game scope and priorities live in
`game-design-improvements.md`, section 3. No combat or progression retune is included in the persistence batch.

## Status

- Active-run persistence is implemented for combat, head-start choices, and between-wave upgrade choices.
- Continue Run identifies the wave and unbanked gold. Restore opens paused with no wall-clock catch-up. Aim and
  simulation state are kept, but held fire and pointer/double-tap input are released; the player must hold again to shoot.
- Pause is available in combat and during an upgrade choice. Save & menu suspends without surrendering or banking.
- New/replacement runs and Discard require confirmation when a saved run exists. The confirmation explicitly explains
  that unbanked gold is forfeited and permanent gold/perks are retained. An unreadable run is not silently overwritten:
  a warning, Retry, and explicit confirmation protect the unknown slot.
- Perks bought while a run is suspended apply to new runs only. The run's perk snapshot is not retroactively changed.
- EN/RU warnings and Retry controls cover failed saves. A pending terminal reward blocks new runs and perk purchases
  until it is persisted, rather than allowing a new checkpoint to overwrite an unbanked result.

## Storage and settlement design

- Permanent key remains `lab:tower:v1`. `TowerSave` adds `settledRunIds: string[]`; old gold, best, runs, and perk levels
  normalize as before, with empty receipts when this field is absent. Keep receipts through purchases and future
  migrations. Never prune them casually: an old result must not become payable again after later runs.
- Active key is `lab:tower:run:v1`, with `{ version: 1, id, run }`. The unique ID is independent of the simulation seed.
  Bump the envelope version if run fields/semantics become incompatible; consider terminal-reward migration before
  deliberately invalidating old envelopes. Ordinary site backups include both keys through the existing `lab:` prefix.
- `src/lib/tower/snapshot.ts` validates all required nested fields, levels, enemy kinds, ordered spawns, actor IDs and
  hit references, choice offers, phase consistency, and array/allocation limits before the renderer/sim uses saved data.
  Corrupt/incompatible checkpoints are removed without touching permanent progress. Failed reads are not corruption
  and must not delete the unknown slot.
- A five-second wall-clock timer saves foreground runs, including pickers. Significant actions and wave/picker
  transitions save immediately; pause, visibility changes, pagehide, and Save & menu also checkpoint. Cleanup only
  removes listeners/timers; it does not write a potentially stale run.
- `settleRun` is the only persistence entry point for finished rewards. `bankRun` is merely the pure calculation.
  Settlement journals a terminal checkpoint, then writes gold + best + run count + receipt together in one atomic
  localStorage meta write, then clears only the matching checkpoint. Retry after a crash before the meta write pays
  once; retry after that write sees the receipt and never pays again.
- If terminal journaling fails but the meta write succeeds, the receipt still proves payment. Startup suppresses an
  already-paid active checkpoint as well as recovering terminal journals. Delayed paid results neither rewrite the
  journal nor erase a newer run. Death and voluntary retreat share this path, including retreat during choices.
- `readSaveState` distinguishes fresh/absent meta from inaccessible/malformed data or unknown receipts. Settlement
  and perk purchases never overwrite unreadable meta as if it were a new account. Failed purchases do not change
  displayed/applied progress. Purchase handlers reread current meta so they preserve existing receipts and rewards.

## Limits and non-goals

- One active checkpoint per browser profile; no cross-tab transaction lock or cloud sync was added. Avoid concurrent
  editing from multiple tabs or older app versions. Atomic receipt/reward writes handle ordinary interruption and
  repeated callbacks, not arbitrary manual edits, storage deletion, or rolling the entire profile back to an old backup.
- Mobile process termination need not emit pagehide. Five-second foreground saves reduce potential loss, but suspended
  timers, unavailable storage, and failed writes prevent a universal lossless or maximum-five-second guarantee.
- Receipts grow with completed runs. They are small IDs, but future compaction needs an equivalent durable
  idempotency mechanism, not truncation to the most recent receipt.
- Combat, RNG algorithms, wave definitions, upgrade/perk numbers, reward values, and aiming rules were not changed.

## Verification

- `NODE_ENV=test npm test`: **222 files / 3,239 tests passed**.
- `npm run typecheck` and `npm run build`: passed.
- Lone Tower targeted suite: **7 files / 120 tests**. New regression coverage includes rich-state round trips,
  deterministic continuation across four seeds, head-start/between-wave choices, nested malformed payloads,
  unavailable/full storage, cleanup fallbacks, unreadable-data preservation, confirmation flows, lifecycle/periodic
  saves, natural death/retreat, both settlement crash boundaries, repeated callbacks, stale paid snapshots, delayed
  results, failed purchases, and legacy progress/receipt preservation.
- Chromium EN/RU at 360px and 390px passed on both dev and production build via Astro preview: exact paused live-state
  reload, no offline advancement/ghost fire, resume, Save & menu, offer/pick preservation, confirmations, perk isolation,
  natural death/retreat, terminal recovery before/after payment, paid-active suppression, and incompatible snapshots.
- Extra browser checks covered real five-second saving, phone touch volleys, selective meta quota failure, all writes
  blocked, new-run/perk blocking while a result is pending, and successful retry without duplicate rewards.
- Screenshots were inspected. No real-device playtest or balance retune was performed. The user authorized committing and pushing this batch to `main`; deployment status must be checked separately.

## Next session

- Continue working on `main`; commit/push subsequent batches only when explicitly authorized.
- After deployment, try a longer real-phone run, reload during combat and choices, then retreat and verify banked
  gold/run count once. Test installed-app background/foreground behavior if available.
- Continue the agreed cross-game backlog rather than adding balance features to this batch. Next suggested work is
  KingsRoad upcoming-wave composition/counter explanations; strategy benchmarking remains separate from retuning.
