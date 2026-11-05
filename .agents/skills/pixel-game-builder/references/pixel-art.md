# Pixel geometry and visual acceptance

## Match the existing art

Tycoon's source art is in `art/pixeloffice/` (including Aseprite sources); runtime PNGs and pack notes are in `assets/pixeloffice/`. The pack is by 2dPig, with CC0 terms in `assets/pixeloffice/README.txt` and `art/pixeloffice/LICENSE.txt`. Preserve these files and provenance. The art's license is separate from any third-party skill's license.

Use the current scene/atlas palettes and dimensions. `OfficeScene.ts` composes native-resolution artwork; `atlas.ts` crops pack frames and caches generated character/workstation textures. Existing sprites are not uniformly 16×16. New pixels should match neighboring silhouettes, outlines, light direction, material shading and contrast rather than introducing a new rendering style.

Procedural art belongs in a small, deterministic, testable pixel/geometry function where possible, then in the existing atlas/render integration. Recolor using existing appearance rules; do not change a character's identity between animation frames.

## Make changes in art pixels

Before patching, write a tiny change contract, for example:

> Lower the founder and stool by 2 art pixels. Keep the tabletop, laptop, horizontal seat position, shoulders and guest furniture unchanged. Reconnect the café-only typing forearms without changing garage poses.

That is an example of a contract, not a request to move the currently approved art again.

1. Find the shared anchors and transforms before changing coordinates. Trace source frame → padded pose → facing/mirror → seat anchor → room scale → CSS/device pixels.
2. Specify preserved relationships: hand-to-key contact, closed outlines, feet/stool placement, body scale, left/right reach, table depth and occlusion.
3. Keep geometry in `render-support/` when it must be shared by art, interaction and tests. Avoid a renderer-only magic offset that leaves hit testing or paths behind.
4. Preserve intentional half-pixel centers and mirrored anchor behavior. Integer source pixels do not imply every placement anchor must be an integer.
5. Draw objects in the established layer order. Check hands against keyboards, bodies against desks/stools, and foreground furniture against walking figures.
6. Preserve `scaleMode = 'nearest'` on atlas/generated textures and the native-resolution render target. Disable `imageSmoothingEnabled` on Canvas scaling paths. Do not apply global rounding or a CSS transform as a substitute for fixing source geometry.

## Test the relationships, not just offsets

- Check all affected looks, both facings, both typing frames, blink and applicable standing/walking variants. Verify that scene-specific patches stay scene-specific.
- For contact bugs, compare actual opaque/skin/outline pixels in the composed coordinate system with keyboard/table geometry. An assertion that an offset equals `2` alone does not prove contact.
- For silhouette bugs, check outline continuity and preserved shoulder/palm shape against a known-good reference where possible.
- Include an unaffected variant regression: office/garage versus café, founder versus guest, occupied versus vacant furniture.
- Keep fixtures small and deterministic. Use current tests in `tests/tycoon/poses.test.ts`, `characters.test.ts`, `workstations.test.ts`, `layout.test.ts`, `cafe.test.ts`, and `seats.test.ts` as appropriate.

## Inspect the real composite

1. Inspect the selected `scripts/tycoon/*-browser.mjs` and its fixture generator before execution. Use the matching synthetic fixture in a disposable browser context. Do not reuse personal saves.
2. Start `npm run dev -- --port 4321`. Check `astro.config.mjs` and server output for the actual base URL; do not assume `/tycoon/` and `/lab/tycoon/` are interchangeable. Pass the browser script's `BASE_URL` override where supported.
3. Playwright and Chromium are not project dependencies. Discover available tooling and use the script's documented environment overrides; do not install packages or hardcode a developer's cache path just to run screenshots. If unavailable, report the missing browser check.
4. Capture a desktop view (for example 1280×900) and a phone view (390×844). For layout changes, also check the narrowest supported width. Keep screenshots under `/tmp` or another untracked output directory.
5. Inspect an active work/typing state and enough animation phases to see the changed frames. For art-only comparison use the same appearance, state, camera, viewport and scale before/after. Zoom with nearest-neighbor scaling to inspect pixels, then judge readability at actual display size.
6. Verify scene visibility, no document overflow, selection/hit targets after movement, touch access to explanations, keyboard dialog interaction, and no page errors. Check reduced-motion behavior if adding animation.
7. Describe what you actually saw. Saving a screenshot without examining it is not visual approval. Do not report a browser run as proof of human UX/balance acceptance.

## Performance and interaction

- Cache generated textures by bounded appearance/pose parameters. Do not regenerate sprites or rebuild static furniture every frame.
- Preserve scene teardown, ticker/listener cleanup, resize handling and texture ownership. Destroy scene-owned render targets without destroying a shared atlas used elsewhere.
- Profile the affected scene before setting performance budgets. Watch allocations, texture count, frame time and dense-office behavior; do not claim generic bundle/FPS/memory targets were measured.
- Prefer restrained ambient motion; keep it independent of simulation outcomes. Avoid rapid flashes, unnecessary motion, or mandatory animation for essential information.
- Use readable DOM controls and labels for game actions. Aim for touch targets of at least 44 CSS pixels where feasible without enlarging the art itself; small canvas figures can have generous hit areas and a list/dialog navigation alternative.
