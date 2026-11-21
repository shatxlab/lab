---
name: pixel-game-builder
description: Build, debug, and refine pixel-art games in this repository, especially Software Tycoon. Use for sprites, procedural pixel art, character poses, Pixi scenes, office layout, animation, game UI, progression, economy tuning, and game saves. Provides Tycoon-specific source maps, pixel-geometry checks, browser acceptance, and seeded balance workflows; consult each game's own roadmap for HR or Kingsroad.
compatibility: This repository's Astro, React, TypeScript, PixiJS, and Vitest toolchain. Browser acceptance may need an externally available Playwright installation and Chromium.
metadata:
  inspiration: https://lobehub.com/skills/cooksaw-claude-skills-pixel-art-game-builder
---

# Pixel Game Builder — Software Tycoon first

Improve the game already here; do not scaffold a replacement. Read paths in these instructions relative to the repository root; bundled `references/` links are relative to this skill directory.

## Start every task

1. Read `AGENTS.md`, inspect `git status --short --branch`, and preserve unrelated changes. Work on `main`; commit/push only when asked.
2. Identify the game and read its authoritative roadmap. For Tycoon, start with the current handover and **Next steps** in `software-tycoon-roadmap.md`, then **Guide for the next session**. That guide contains historical mechanics: current handover and newer decisions win. Read the relevant current implementation/acceptance section before changing a subsystem.
3. State the player-visible problem and a small acceptance criterion. For art, name exactly what moves, by how many **art pixels**, and what must stay fixed. For balance, identify the symptom, its evidence, and one candidate lever.
4. Read the existing source and adjacent tests before choosing an implementation. Load [the Tycoon source map](references/software-tycoon.md) for Tycoon work and [the art acceptance guide](references/pixel-art.md) for visual work.
5. Make the smallest coherent change. Do not turn a visual fix into an economy redesign or add a new framework to implement an existing capability.

For HR or Kingsroad, read `hr-roadmap.md` or `kingsroad-roadmap.md` first and discover that game's real architecture. Before touching the shared coworker roster, follow the HR roadmap too. Do not apply Tycoon's career, economy, or sprite assumptions to another game.

## Design for this game, not the inspiration's template

- Keep the office readable, warm, and alive. Preserve the existing asset palette, character identity, furniture scale, outlines, and scene language. Do not impose a neon/space theme, a universal 12-color palette, four-color sprites, 16×16 dimensions, or fixed 4× display scale.
- Make important changes legible: an action shows its cost, effect, blocker, and resulting state in player terms. Avoid hover-only explanations, icon-only primary actions, stacked modals, and screens full of competing calls to action.
- Prefer progressive disclosure over deleting useful information. Do not enforce an arbitrary three-button limit when the workflow needs more.
- Distinguish ambient animation from simulation time. Pause, speed, background execution, and choices must follow the current game rules, not a new interval copied into a React effect.
- Software Tycoon is an operating-company simulation, not a pressure-free idle collectible. Preserve intentional costs, risk, failure, and independent floor work. Do not restore global release turns, choice timers, automatic assignments, or free chapter grants rejected by the current roadmap.
- Bot success is not human UX approval. Treat player logs and complaints as primary evidence; never invent playtest feedback.

## Keep the existing boundaries

- `src/lib/tycoon/sim/`: deterministic game rules, seeded randomness, economic calculations, blockers and action effects.
- `src/lib/tycoon/data/`: content and stable IDs; `sim/balance.ts`: shared tuning constants. Check consumers before changing a knob or ID.
- `src/lib/tycoon/render-support/`: testable geometry, poses, appearance and ambient behavior. `render/`: Pixi presentation and atlas integration.
- `src/components/tycoon/`: React UI, accessible controls, and the scene host. Use the existing store/controller and lifecycle; no parallel Zustand store, new persistence stack, or second game loop.
- Career/controller/persistence modules own live save coordination. Render frames must not change economic outcomes or perform save transactions.

Read [the source map](references/software-tycoon.md) before touching saves, founding, or balance. Never silently replace an unsupported or broken save with a fresh game. Use disposable browser profiles and synthetic fixtures for experiments, not a player's real storage.

## Pixel-art implementation rules

- Preserve nearest-neighbor texture sampling, native-resolution scene composition, and existing scale/anchor conventions. Disable Canvas smoothing when scaling procedural pixel art; use `image-rendering: pixelated` for displayed sprite images where appropriate.
- Keep source-pixel geometry distinct from CSS pixels, device pixels, and scene transforms. Existing fractional anchors can be intentional; do not round everything blindly.
- Derive hand/keyboard, feet/floor, stool/body, and facing relationships from shared geometry. Avoid independently moving layers that must remain in contact.
- Keep generated sprites and recolors deterministic and cached. Reuse atlas textures; do not allocate textures, canvases, or unbounded graphics in the frame loop.
- Check both animation frames, every affected character appearance, both facings, and scene-specific variants. A patch to café typing must not silently change garage/office typing or unrelated guest furniture.
- Preserve layering, hit targets, paths, and cleanup when resizing or rebuilding a scene. Honor existing reduced-motion behavior; add support where new motion needs it.

## Verification and handoff

1. Add or update focused regression tests for the actual failure: geometry/pixel contact, rule invariant, UI state, or save transaction. Avoid only testing a copied implementation constant.
2. Run focused tests, then **`npm test`** and **`npm run typecheck`**. Report failures and output accurately; never claim an unrun check passed.
3. For visual/UI changes, run the app and inspect desktop and phone views when browser tooling is available. Check active poses, not just an idle screenshot; verify no overflow, hidden scene, broken hit targets, or browser errors. Follow [the art acceptance guide](references/pixel-art.md). If browser verification is unavailable, explicitly mark it unverified.
4. After balance changes, follow the roadmap and bot header, compare the same seeds before/after, and run Tycoon across 12 seeds. Check failures and stalls as well as endings. HR requires its own 20–30 seeds per starter, not Tycoon's matrix.
5. Keep temporary bundles, saves, run logs and screenshots outside the repo. Player `lab-tycoon-run-*.json` files are private debugging inputs; never commit them.
6. Record material Tycoon design decisions, retunes, evidence and remaining gates in `software-tycoon-roadmap.md`; do not create a second TODO/design ledger in this skill. Leave a concise handoff: changed files, visible effect, checks run, remaining uncertainty. No commit or push unless requested.

## Provenance and intentional departures

This is an original repository-specific rewrite inspired by CookSaw's **Pixel Art Game Builder**, as published on [LobeHub](https://lobehub.com/skills/cooksaw-claude-skills-pixel-art-game-builder) (listing version 1.0.1), linked to [CookSaw/claude-skills](https://github.com/CookSaw/claude-skills). No upstream templates, scripts, or asset bundles are installed or required.

Retained ideas: deliberate pixel constraints, cached procedural art, readable feedback, mobile usability, reduced motion, and explicit architecture boundaries. Replaced: Vite scaffolding, Zustand/Immer persistence, a generic 100ms interval, cosmic palette, fixed sprite sizes, pressure-free rules, and unmeasured universal performance targets. Use this repository's implementation and measured regressions instead. The listing supplies no license value; do not infer a license for upstream files or confuse it with the separately licensed PixelOffice art pack.
