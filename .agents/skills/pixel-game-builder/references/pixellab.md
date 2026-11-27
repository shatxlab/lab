# Generated boss sprites with PixelLab (MCP)

The HR Department bosses can wear their own generated sprites instead of the sheet-baked pack figures. The workflow below originally produced the auditor (floor 20) and the middle manager (floor 1); those two were later re-authored in the pack's own style by hand (see `scripts/hr/bake-boss-sprites.mjs` and the HR roadmap's "Boss sprites" note), so PixelLab is now the option for multi-direction or photographic sets, at the cost of style drift. Consult `hr-roadmap.md` for which bosses are figure bosses, and [the art acceptance guide](pixel-art.md) for the general rules.

## Setup

- Server config lives in the project file `.pi/mcp.json` (`pixellab` → `https://api.pixellab.ai/mcp`, bearer token in the `Authorization` header). Verify with `pi mcp list` — expect `connected, ~141 tools`. The file holds the API token, so it stays gitignored (`.pi/`).
- MCP tools load at session start; after editing the config, `/reload` in a new session. Inside a running session, use the equivalent REST v2 API with the same token — same backend, same results:
  - Endpoint list: `https://www.pixellab.ai/llms.txt`; machine schema: `https://api.pixellab.ai/v2/openapi.json`.
  - The API rejects unknown JSON fields outright ("extra_forbidden"), so read the schema before guessing parameter names (`size` is not accepted where `width`/`height` are not).
- The account's plan runs **1 concurrent generation**; parallel jobs (one per direction) are refused. Queue one direction, wait, queue the next.

## Pipeline

1. **Create** — `POST /v2/create-character-v3` with `{description, name}`; the canvas defaults to 64×64, south-facing, 8 rotations. The reply returns `character_id` at once; poll `GET /v2/characters/{id}` until `status: "completed"` (~2–5 min), then read `rotation_urls.south`. Write descriptions that match the boss's kit (weapon, charge pose, palette already used in `SUIT_HEX`), so the sprite needs no accessory drawn over it.
2. **Animate** — `POST /v2/animate-character` with `{character_id, template_animation_id, directions: ["south"]}`. Template IDs are listed in the tool description and in the API's error for an invalid one; `walking` (6 frames) and `breathing-idle` (4 frames) are the pair in use. Queue idle only after the walk job finishes (plan concurrency). Poll `GET /v2/background-jobs/{job_id}`; the finished job's `last_response.storage_urls.frames` holds the PNG URLs. Use idle frame 0 as `stand.png` so the stand matches the walk cycle's look.
3. **Ship** — download the PNGs (they 403 without a browser-like `User-Agent`) into `assets/hr/<kind-kebab-case>/` as `stand.png` + `walk-0.png … walk-5.png`. `assets/` is the Astro `publicDir`; URLs resolve through `withBase`. 64×64 with a 6-frame cycle is the convention `boss-sprites.ts` expects.
4. **Wire** — add the kind to `BOSS_SPRITE_DIRS` and its scale to `BOSS_SPRITE_PIXEL` in `src/lib/hr/render/boss-sprites.ts` (`1.5` makes a 64px canvas read as tall as the sheet figures drawn at ~3 on ~28px art). `loadBossSprites()` bakes every kind that loads into `HeroFrames`; the renderer's `scene.sprites` branch draws them feet-anchored, centre-flipped toward the hero, with the flash silhouette and enrage ring applied. Sheet figures stay as the automatic fallback, and the tuned `drawBossAccessory` overlays are skipped for sprite bosses (the art has its own props).
5. **Ground** — generations may leave transparent rows under the feet, which reads as floating above the shadow. `trimToArt()` crops all frames to the art's union bounding box at bake time, so feet reach the canvas's bottom edge the renderer anchors on. It is pure and tested; do not fix this by hand-editing PNGs.
6. **Verify** — focused tests for the pure pixel functions (`tests/hr/render.test.ts`), then `npm test`, `npm run typecheck`, `npm run build`. For the browser check, craft a boss-phase run and shoot it:
   - `npx esbuild scripts/hr/craft-boss-runs.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/hr-boss.mjs && node /tmp/hr-boss.mjs /tmp/hr-boss-runs.json`
   - Start the dev server, then `scripts/hr/boss-shots.mjs` (needs `npm install --no-save puppeteer-core` and `CHROME_PATH`; the default is a Linux Edge path). For a single boss, a small ad-hoc puppeteer script against one floor's run JSON is enough.
   - Acceptance: no 4xx in the network log (a `//hr/...` protocol-relative URL means a `BASE_URL` concatenation bug — paths must go through `withBase`), the boss reads at boss scale next to the hero, and its feet sit on the shadow. The white flash overlay is expected while weapons keep hitting the boss; take a burst and pick a clean frame.

Characters land in the account's Character Creator and are reused by `character_id`; keep IDs of shipped bosses in the HR roadmap's handoff notes if they matter for future edits (states, more directions, other animations).
