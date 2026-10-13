# Roadmap — approved tools

Status: **planning** — nothing in §1–§7 is implemented yet. **This file is the
single source of TODOs**: `handoff.md`, `workbench-review.md` and
`workbench-ux-plan.md` were deleted (2026-10-11) after the workbench was
declared complete at scope, and their still-open items were folded into §0. A
tool moves out of §1–§7 only when its work is merged and its entry is folded
into `README.md`.

Owner decisions 2026-10-11 (they supersede the workbench's older locked
scope: workbench itself stays dep-free and terminal-rule-scoped):

- **New runtime deps are allowed again** — the "no new packages" rule was a
  workbench-consolidation decision, not a permanent policy. Each tool below
  lists its deps; keep them small and lazy-loaded. The workbench's own
  dependency freeze stays.
- **The terminal one-liner rule is scoped to the workbench.** Standalone tools
  may do things a terminal can trivially do (timers, generators) when the
  audience is a phone user on the landing page.
- **Photo studio is a parked idea**, not scheduled (see Parking lot).
- **Everything local-first stays non-negotiable.** If two devices must
  cooperate, the answer is the device bridge or export/import — never a server.

---

## Build order

| # | Tool | Page vs workbench | New deps | Why this order |
|---|---|---|---|---|
| 1 | ~~Device bridge~~ **parked 2026-10-13** | standalone `/bridge` | none | Not needed yet; spec and feasibility notes kept in §1 |
| 2 | ~~Flashcards~~ **shipped 2026-10-13** | standalone `/flash` | none | Proved the standalone pattern; see §2 |
| 3 | Focus office | standalone `/focus` | none new (reuses the Tycoon Pixi scene) | Mood piece, perfect offline PWA shortcut |
| 3b | Send to phone (QR link) | helper + per-tool actions | none | Replaces the bridge's main use case; see §1a. Small, after Focus |
| 4 | Whiteboard | standalone `/board` | none | SVG architecture, ~25 KB target |
| 5 | CV builder | standalone `/cv` | none (reuses `lib/docx`) | Print-to-PDF engine keeps it cheap |
| 6 | Charts | workbench capability | none | Approved 2026-10-11; cheap, high delight |
| 7 | OCR | workbench capability | tesseract.js | Last: approved 2026-10-11, see §7 |

Ordering note: **OCR (the only tool needing lazy heavy-asset infrastructure)**
can start its prerequisite work (CSP, cache helper) at any point; everything
before it is dep-free. Dictation was **cut** on 2026-10-11 — see Parking lot.
§0 is small, dep-free carry-over work — fine to do before or alongside #1.

Done outside this build order (2026-10-12): **Software Tycoon** was merged in
from the standalone `software-tycoon` repo as `/tycoon` — the engine ported to
React under `lib/tycoon/`, the PixiJS office scene lazy-loaded, CSP gained
`worker-src 'self' blob:` for pixi's blob: texture workers, and saves moved to
`lab:tycoon:*` keys with a one-time migration from `software-tycoon:*`. Its
deps: `pixi.js` (lazy) + dev-only `@types/pngjs`. Docs live in README.md
(see "Software Tycoon"); the §1–§7 build order is unaffected. Its open
work list is §8.

---

## 0. Workbench UX follow-ups (carry-over from the deleted ux-plan)

The workbench is complete at its locked scope (§2 decisions of the former
handoff); what remains is polish, in this order. Shipped already: beforeunload
guard, shared `useSeedAssets`, the no-"asset" i18n sweep, outputs-tray
thumbnails + `Download all`, diff patch/HTML-report export. **Shipped 2026-10-13: 0a, 0b, 0d, 0e tier A**
(their sections below are the spec they were built from). Dropped (owner, 2026-10-13): 0c, 0f, 0e
tier B — the tray, `Download all` and the unsaved dialog are enough. If results
get missed on phones, try scrolling the outputs tray into view on the first
output before building anything bigger. Open: 0g (optional).

### 0a. Verbs and a quiet loading state
- `src/lib/workbench/capabilities.ts`: rename `image.edit` label "Image" →
  **"Edit image"** (ru: «Обработать изображения»; keep the hint reading
  "add one more file to unlock Edit image"). Other labels are already verbs.
  Update legacy image tool tests that assert the old label.
- `OperationHost` loading (`WorkbenchApp.tsx:263`): replace the plain
  `<p>Loading</p>` with a skeleton row (two rounded bars, subtle pulse,
  `aria-busy="true"`, the `loading` i18n string moved to an `sr-only` span).
  Reserve roughly a toolbar's height — no layout shift.

### 0b. Set membership badges
- `WorkbenchApp` derives `setMembers: ReadonlySet<string>` from
  `current.assets` when `current?.capability.set`, passes it + `activeId` to
  `AssetTray`.
- Badges left of the name: `text.diff` → `A`/`B` in tray order (the order the
  Compare panes use); `pdf.merge` → `1..n` (matches merge ordering);
  `image.edit` → one `inBatch` chip. Non-members show nothing.
- i18n: one key `inBatch` ("in batch" / «в пакетной обработке»); A/B/numbers
  are plain text.
- Tests (`workbench-app.test.tsx`): two texts → A/B rows; an unrelated image
  added → still A/B on the two texts (a third *text* removes Compare entirely); mixed pdf+text on the Compare tab → pdf row no badge.

### 0c. Paste lands where the intent is
> **Dropped 2026-10-13 (owner: option B).** Pasted text keeps opening in Open:
> Compare is offered only for exactly two files, so a lone `paste.txt` can't
> land in it without changing that rule. The spec below is kept for reference
> only; do not build it.

- `WorkbenchApp.addText`: on an empty, clean screen pasted text opens the
  `text.diff` starter (`if (empty && !dirtyRef.current) setActiveId("text.diff")`,
  guarded by a check that `text.diff` is in `STARTERS`). Non-empty case is
  already correct (exactly-2 weight 1000 beats `doc.open`).
- Tests: empty + paste → active tab is `text.diff`, side A seeded from
  `paste.txt`; paste while dirty → tab stays pinned.

### 0d. Asset tray thumbs and kind icons
- New `src/components/workbench/AssetThumb.tsx`, used by `AssetTray` rows
  (outputs got thumbnails in c5354c2; assets still don't):
  image kind → 40×40 rounded `<img>` from a Blob object URL (revoked on
  unmount/change, `alt=""`); every other kind → a lucide glyph chip:
  `FileText` (pdf/docx/text/md/html), `Table` (sheet), `Braces`
  (json/yaml/toml), `BookOpen` (epub), `FileQuestion` (binary).
- Tests: jsdom can't decode images, but the `blob:` `<img>` is assertable;
  glyph branch asserts the icon renders.

### 0e. Unsaved work: forgive, then confirm (two tiers)
- **Tier A now** — replace `window.confirm` with a `ConfirmSheet`
  (`src/components/workbench/ConfirmSheet.tsx`): shell keeps
  `pending: { run } | null`; `confirmLeave()` becomes `requestLeave(run)` —
  clean → `run()`, dirty → `setPending`. Dialog (`role="dialog"` +
  `aria-modal`, ESC/backdrop cancel, focus on first button):
  `unsavedTitle` ("Unsaved changes in {capability label}"), `unsavedBody`
  ("Your edits are kept only in this browser tab."), buttons **`keepEditing`**
  (primary) · **`discardAndContinue`** (danger). Note the inversion vs
  `window.confirm`: keep is primary, destructive is secondary. `beforeunload`
  stays as is. Drop the `discardChanges` key (copy moves into the new keys).
  Tests: dirty + tab switch → sheet, no `window.confirm`; cancel keeps tab and
  dirty; discard switches; ESC cancels; `beforeunload` still registered.
- **Tier B later, optional** — drafts survive tab switches: key `EditSession`s
  by `operationKey` in shell state (a `Map` passed down as `initialSession`).
  Leaving a tab then never asks; the sheet is only needed for remove/clear.
  Do not attempt in the same pass as tier A.

### 0f. The output stage (results take the stage) — DROPPED 2026-10-13
- New `src/components/workbench/ResultStage.tsx`, rendered under the tab
  panel: shell state `produced: OutputEntry | null`; `handleProduce` sets it
  (and still appends to the outputs list). Persists across file/tab switches
  until acted on or replaced.
- Layout: produced name as headline (`text-lg`), kind + size subline,
  `OutputThumb`, one primary `Download`, secondary `Open`, × remove (removes
  the tray entry too).
- **Batch runs**: tag entries with a `runId` (increment a ref in
  `handleProduce` when `outputs` was empty or the active capability changed).
  Stage shows the first result + an `andMore` chip ("+{count} more"), actions:
  `Download` (first) and `Download all` (zip via `fflate` `zipSync`, archive
  named `<capability>-<timestamp>.zip`). "Open" opens the first.
- Tray below shrinks to an audit list: name · size · thumb · one icon button
  per row, plus `Download all` in its header when >1. No repeated text
  buttons.
- i18n: `andMore`, `result`; `openAsFile` already exists; `downloadAll`
  already exists.
- Tests: stage appears with name + primary Download; second produce replaces
  it; batch → `+N more` chip and `Download all`; remove from stage clears it.

### 0g. Optional, only if wanted
- **Session restore** — refresh wipes the tray; a tiny opt-in "restore last
  tray" (names + bytes in memory only) would soften the hard reset.
- **Image print** — page-like kinds print; a photo print is a plausible ask
  if print exists for images.

Suggested commit split, each green before the next: 0a, 0b, 0c, 0d, 0e tier A,
0f. Verify with `npx tsc --noEmit`, `npx vitest run tests/workbench`,
`npm test`, `npm run build`.

---

## 1. Device bridge (`/bridge`) — PARKED 2026-10-13

> **Reframed 2026-10-13: the real need is one-way PC → phone, and §1a covers
> it with no WebRTC at all.** Everything below stays parked.
>
> **Owner's call: not needed at the moment.** Nothing below is scheduled. Other
> tools must not depend on it: where they say "moves via the bridge", read
> "export/import file" until the bridge exists. Small desktop→phone text can
> already go through the workbench's Create QR code capability (a "Send to
> phone" shortcut on text outputs is a cheap future add). Spec and feasibility
> findings are kept for when this is revisited.

Local file/text transfer between phone and desktop over WebRTC, signaled by QR
code. No server, no accounts, no pairing code to type.

**Flow.** Desktop: "Show code" → renders an offer QR containing the WebRTC
offer (compressed SDP, fits a QR with STUN-only config). Phone: scans → answers
→ data channel opens P2P. Roles are symmetric — either side can show or scan.
Once connected: send text (clipboard-style) or files in either direction;
progress per transfer; nothing is stored — the channel is live only while both
tabs are open.

**Scope guards.** STUN only (no TURN — state that some corporate/symmetric-NAT
networks won't connect). Files streamed in chunks over the data channel with a
size cap consistent with `lib/limits.ts` philosophy. No multi-device mesh: one
peer per session. The QR scan reuses the workbench QR scanner logic.

**Handoffs into the rest of lab.** "Send to other device" actions on workbench
outputs (text, images, boards) and on flashcards decks — this is how settings,
decks and drafts move between phone and desktop without a server.

**Feasibility check (2026-10-13) — corrections to the plan above.**
- **There is no QR scanner to reuse.** `jsqr` is a devDependency used only by
  `tests/qr/qr-libs.test.ts`; nothing in `src/` decodes a QR or opens a camera.
- **The phone needs no in-page scanner.** The offer QR encodes a URL
  (`/bridge#o=<codec>`; the fragment never reaches a server), so the phone's
  native camera app scans it and opens the page. The return leg (answer) is
  the catch: the other device must read the phone's screen, and a desktop can
  only do that with a webcam. So one in-page scanner is still required, on the
  desktop side: `getUserMedia` + `jsqr` (promote it to a lazy-loaded runtime
  dep; `BarcodeDetector` as an optional fast path, absent on iOS Safari). "Zero
  new deps" becomes "one small lazy dep". Fallback for desktops without a
  webcam: show/copy the ~150-byte answer as text, or move it via the OS share
  sheet.
- **`Permissions-Policy` blocks the camera.** `assets/_headers` sets
  `camera=()`; it must become `camera=(self)` (microphone etc. stay off) or the
  desktop can never scan the answer.
- **`connect-src` is probably not an issue** — CSP `connect-src` does not govern
  RTCPeerConnection/STUN traffic, so the "must allow `stun:`" note in the
  prerequisites is likely unnecessary. Unverified: confirm in a real browser.
- **QR size.** A synthetic Chrome data-channel offer (1–4 candidates, 600–1000 B
  of SDP) compressed with `fflate` deflate + base64 comes out at 580–690 chars →
  QR version 16–18 (85–89 modules) at ECC L: scannable but dense. Do not ship
  raw-SDP deflate. A custom binary codec (ice-ufrag, ice-pwd, the 32-byte
  fingerprint, candidate ip/port list) should land near 100–150 bytes, QR
  version ~6–8. Build the codec that way; the SDP is rebuilt from a template.
  (Estimate from a hand-made SDP, not a real capture — re-measure once the
  codec exists.)

**Implementation.** `src/components/bridge/` (PeerCard, QRPanel, TransferList)
+ `src/lib/bridge/` (signaling codec: compress SDP with `fflate` → QR; chunked
transfer protocol; peer connection lifecycle). Zero new deps.

**Tests.** Codec round-trip, SDP compression size bounds, chunk
reassemble/integrity, i18n. Two-tab e2e is manual (jsdom has no RTC).

---

## 1a. Send to phone (QR link) — replaces the bridge's main use case

Owner's framing (2026-10-13): what people actually want from the bridge is to
**get what is on the PC/laptop onto the phone**. The other direction needs no
feature: on the phone, *export/download* the data (TSV, JSON, the settings
backup) and move it however you like.

**Flow.** A "Send to phone" action shows a QR code; the phone's *built-in camera
app* scans it and opens a link to the same tool with the data in the URL
**fragment** (`/flash/#send=<kind>.<payload>`; fragments never reach a server).
The tool reads the fragment on load, shows a preview ("12 cards — Spanish
basics"), and imports only after the user confirms; then it clears the fragment.
No scanner in the app, no camera permission, no handshake, no new dependency
(`qrcode` is already a runtime dep for the workbench).

**Payload.** JSON → `fflate` deflate → base64url, with a short version prefix.
Hard cap around 2.5 KB of encoded payload (QR level L tops out near 2.9 KB, and
dense codes scan badly): over the cap the dialog says so and points to Export.
Rough fit: a flashcard deck of ~60–100 short cards; text snippets; small
settings. Not files, not photos, not whole backups.

**Safety.** The fragment is untrusted input: decode with size limits, run it
through the same readers/sanitisers as a file import (e.g. `parseImport`,
`readFlashStore`'s cleaning), never import without the preview step, and ignore
a malformed or unknown `kind` silently. The QR is on a screen and the URL can
land in browser history, so the dialog says what is being shared.

**Implementation.** `src/lib/send/` (payload codec + size cap, fragment
read/clear) + `src/components/tools/SendToPhone.tsx` (dialog with the QR via
`lib/qr`, the byte count, and a "Copy link" fallback). First consumers:
Flashcards (send a deck; receive on `/flash`) and the workbench text outputs
(send text). Each tool supplies `kind`, `encode()` and `preview/import()`.

**Tests.** Codec round-trip and cap, malformed/oversized/foreign-kind fragments,
fragment cleared after import, preview-before-import, axe, i18n.

---

## 2. Flashcards (`/flash`) — SHIPPED 2026-10-13

Folded into `README.md` ("Flashcards" and the tool table). Decisions made
during the build, and what is still open:

- **Scheduler:** FSRS-4.5 with the published default weights and no learning
  steps (not a hand-rolled "lite"); golden intervals are in
  `tests/flash/fsrs.test.ts`. *Again* requeues the card a few cards later in
  the same session but schedules it once; cram never changes the schedule.
- **"Learned"** on the stats row means graded at least once.
- **New category:** the tool lives under a new `productivity` category
  ("Study & focus" / «Учёба и фокус») in `lib/apps/tools.ts`, meant to also
  hold Focus, Whiteboard and CV.
- **Imports** are in-page only (paste, or a `.csv/.tsv/.txt` file). Not built:
  the workbench "Send to Flashcards" action on text assets — worth adding as a
  small workbench follow-up, no bridge needed. Deck moves between devices use
  TSV export/import or the settings backup (the bridge is parked).
- **Still v2/never:** images, audio, `{{cloze}}`; never cloud sync, accounts,
  plugins. Also open: deck-level tags/filters in study, per-deck new-card limits.
- `ActionButton` now accepts `ref` (typed as `ComponentProps<"button">`).

---

## 3. Focus office (`/focus`)

Pomodoro with a scene that makes the stakes visible. You run a small office;
each 25-minute Pomodoro is your team's workday. Meet the quota you set and the
office hums; miss it and an employee packs their box and walks out, head down —
and stays gone in the office history. (Everyone is fictional, drawn locally;
no real-world anything.)

**Scene mechanics.**
- You plan the day: hours per day, chunked into 25/5 (focus/short) with a long
  break every 4th — classic Pomodoro math, lengths customizable.
- Employees are procedurally generated from a seeded PRNG (house pattern from
  `lib/couples/questions.ts`): seed + day → faces, desk positions, idle
  animations (typing, coffee sip, chair spin). Completed Pomodoros keep them
  employed; each missed one fires one — they exit with a box, that exit is
  recorded.
- Day end: quota met → office stays staffed (small payoff animation);
  shortfall → the walkouts, visible in the day's record.
- History: a scrollable log of past days (staffed vs fired, minutes focused,
  streak), like a garden diary. The dead-tree memory of Forest, in office form.
- Optional **merciful mode** toggle: missed Pomodoros send people *home early*
  instead of firing them, for users who find the firing theme harsh. Default:
  as designed above.

**Scene: reuse Software Tycoon's** (decided 2026-10-13). The Pixi `OfficeScene`
(lazy-loaded; art in `assets/pixeloffice/`, CC0) already draws the room, desks,
chairs, the cat and dog, and recolours characters from a plain id
(`appearanceFor(id)`), so *seed + day → employee ids → faces* is free. The
scene reads everything through a `getState()` callback, so Focus feeds it a
synthetic `GameState` (one office, N employees; `office.project` non-null while a
Pomodoro runs makes people type; low `morale` shows the red "!" marker). Small
additions to `OfficeScene`, to be done without changing Tycoon's behaviour:
 an optional label for the clock chip (shows the countdown instead of the game
 date), and a `leave(employeeId, mode)` animation (the person stands up with a
 box and exits toward the door; `mode: 'home'` for merciful mode). Pixi is
 already a lazy dependency, so Focus adds no new package; the CSP
`worker-src blob:` is already in place. Tap a person for a small reaction.

**(superseded) Interactivity, cheap.** Canvas 2D, ~500 lines, zero deps, zero image assets.
Sway/reactions on pointer move; tap a desk for a small animation. WebAudio
ambient (keyboard murmurs, AC hum) + a completion chime, synthesized like the
alias game's sound.

**Timer honesty.** A website can't force you to stay. Leaving mid-session
asks once ("people will lose their jobs") and then applies the consequence —
advisory, never blocking. Full-screen focus mode with a minimal clock.

**PWA.** Ideal offline tool; add `focus` to the manifest shortcuts.

**Implementation.** `src/components/focus/` (Office host for the Tycoon scene,
TimerBar, DaySetup, History) + `src/lib/focus/` (timer reducer, poms math,
synthetic-state adapter, seeded office, sound, i18n, storage).

**Tests.** Timer reducer (pause/complete/abandon), Pomodoro chunking math,
prng determinism (same seed → same office), storage round-trip, i18n, axe on
the setup + history screens.

---

## 4. Whiteboard (`/board`)

Mini-Excalidraw: the 10% of features 90% of users draw. Target size ≤ ~30 KB
gzipped total; success = never needing a shape library.

**v1 scope.** Rectangle, ellipse, arrow, text, freehand pen · select/move/
resize · undo/redo · pan/zoom (two-finger, wheel) · grid · export PNG/SVG ·
native `.json` board files.

**v2.** Arrows attaching to shapes, grid snap, inline text editing.
**Never:** shape libraries, images, collaboration, plugins.

**Architecture.**
- **SVG DOM rendering, not canvas** — each element a node: free hit-testing,
  a11y, theme tokens, free SVG export. Canvas only wins at 10k+ objects,
  which nobody hand-draws.
- Pointer Events + capture: one path for mouse/touch/stylus; single finger
  draws, two fingers pan/pinch.
- Undo/redo: immutable element array + snapshot stack (copy-on-write).
- **Boards are workbench assets**: the `.json` document can be dropped in the
  tray, saved as copies, even JSON-compared with another board.
- Autosave boards to `lab:board:v1`; multiple boards with a switcher.

**Implementation.** `src/components/board/` (Canvas surface, Toolbar,
Inspector) + `src/lib/board/` (element model, geometry, hit-test, history,
svg-export, png-export via canvas, i18n, storage). Zero new deps.

**Tests.** Geometry (resize handles, arrow math), history undo/redo, export
SVG serialization, JSON round-trip, pointer reducer, axe.

---

## 5. CV builder (`/cv`)

Form-driven résumé builder whose templates are **ATS-safe by construction**.
Export paths: print-to-PDF (selectable text), real `.docx` (via the hand-rolled
OOXML writer in `lib/docx`), JSON (re-edit/backup), plain text.

**ATS facts baked into the design.** Single-column templates only; standard
section headings (Experience, Education, Skills); no tables, no text boxes,
no icons-as-contact-info; real text everywhere; a "remove photo/decorations"
toggle per template.

**Templates (v1, four).** Classic (serif), Modern (sans), Minimal, ATS-strict
(plain). Templates are pure renderers over one shared schema — a template is a
React component mapping `CVSchema` to HTML/CSS.

**Data model.** One JSON schema: profile, experiences[], education[], skills[],
links[]. Form editor with localStorage draft (`lab:cv:v1`), multiple CVs
switchable.

**Print engine.** Browser print-to-PDF with a print stylesheet + `@page`
margins — zero layout code, pixel-perfect, selectable text. A "Print / Save as
PDF" button; templates are print-tested.

**Bonus later.** "Paste your old CV / LinkedIn text" → heuristic local parser
into the schema.

**Implementation.** `src/components/cv/` (Form sections, TemplatePreview,
template components) + `src/lib/cv/` (schema, docx export reusing `lib/docx`,
plain-text export, i18n, storage).

**Tests.** Schema form reducer, docx export validity (open with the existing
DOCX pipeline), plain-text export, print stylesheet snapshot, axe.

---

## 6. Charts — workbench capability (approved 2026-10-11)

New `chart` capability on the **sheet** kind (CSV/XLSX via the existing
`lib/viewer/sheet.ts`), reusing the workbench's set/selection model. Maximum
**five chart types**: line/area, bar, grouped bar, histogram, scatter —
auto-detected from the data's shape (time-ish first column → line; few text
rows + numbers → bar; …) with manual column pickers to override.

**Rendering.** Hand-rolled SVG (~300 lines total, no chart library): axes with
sensible ticks, legends, tooltip on hover/tap, theme-token colours (light/dark
for free). Export **SVG** (into the Outputs tray, where it joins the asset
loop) and **PNG** via canvas. No interactivity beyond tooltips — this is a
"make the chart, take it away" tool, not a dashboard.

**Implementation.** `src/components/workbench/operations/ChartOperations.tsx`
+ `src/lib/charts/` (shape detection, scale/tick math, SVG builder, i18n).

**Tests.** Scale/tick math (golden cases), shape detection table, SVG output
snapshot, tray round-trip, axe.

---

## 7. OCR — workbench capability

New `ocr` capability on the **image** kind and on **PDF** (pages rasterized
with the already-bundled pdf.js). Tesseract via `tesseract.js` in a Web
Worker: WASM core ≈ 2–4 MB + per-language `traineddata.gz` ≈ 2 MB ("fast"
models; EN + RU first, ~40 more selectable). Output lands in the **Outputs
tray as a text asset** — recognized text then flows into Edit, Compare,
Convert, QR seed.

**Preprocessing wins accuracy:** reuse the `lib/image` canvas pipeline —
grayscale → contrast/threshold → upscale small images → optional deskew.
UI states honest limits: printed text good, handwriting poor, multi-column
approximate. Progress bar (tesseract reports natively).

**Assets never precached:** WASM + language data lazy-load on first use into a
runtime cache (same infra as dictation). CSP needs `'wasm-unsafe-eval'`.

---

## 8. Software Tycoon follow-ups (`/tycoon`, merged 2026-10-12)

Carried over from the standalone repo's ROADMAP.md. Nothing here is blocking:
the game builds, its tests pass and it ships. Ordered by how much it matters.

**Where things stand.** The studio has a real arc: garage (4 desks) → office →
more offices; client contracts; users and bugs on every product; breakout hits;
six journey stages; five rival studios and an industry ranking; eras that shift
demand and expectations; careers from Junior to Lead. Saves are version 3
(`STATE_VERSION` in `src/lib/tycoon/sim/state.ts`); bump it and say so in the
commit whenever the save shape changes.

Tools: `node scripts/tycoon/simulate.ts [years] [seeds] [policy]` (bot players;
with a policy name it also prints the year each stage was reached — the only
balance evidence so far), `node scripts/tycoon/e2e.mjs` after `npm run build`
(real Chrome; `CHROME_PATH`, `E2E_SHOTS=dir`, `--only <scenario>`), and dev URL
shortcuts that use a throwaway game: `?offices=2&stage=3&money=1000000&rep=60`
(dev server only). Art sources (`.aseprite`, large preview, CC0 licence) live in
`art/pixeloffice/`, outside `assets/` so they are not published or precached.

### 8a. Play it, then retune (most important)

Balance so far comes only from bots; nobody has played the long journey.

- **Real-time pacing is unmeasured.** A game day is 1.5 s (`MS_PER_DAY`): a year
  is 9 min at 1×, 4.5 at 2×. The best bot reaches *Tech giant* around year 7,
  about an hour at 1× without a pause. Measure hours per stage in real play,
  then adjust stage goals, speeds or `MS_PER_DAY`.
- **The garage is tight.** Start money $25k, projects take 2.5× the work
  (`WORK_SCALE`). Bots that never take client work go bankrupt early, and bots
  that skip contracts never leave the garage (one client job is a stage goal).
  Check the first two months by hand.
- **Money piles up late** (millions by year 10–12); rival buyouts are the only
  big sink. Candidates: pricier offices, upkeep on big products, more to buy.
- **Hits:** `HIT_BASE_CHANCE`, `HIT_CHANCE_PER_MISS`, `HIT_MAX_CHANCE` put the
  first hit at about year 3 for the best bot (range 1.4–8). Decide if that suits
  the Angry Birds story.
- **Rivals** earn from "other business" outside the shared markets, growing
  yearly up to a cap (without it the player passed them all by year 4). Works,
  but abstract, and they do not react to what you do.
- **Wages** grow 12% per era (`ERA_WAGE_GROWTH`); bug-fix sprints leave designers
  idle (split design 10 / engineering 55 / QA 35). Both were judgement calls.
- **Leads are unverified.** An office of more than 4 people works 10% slower
  without a Lead; a Lead needs 80 skill in their discipline; hires start at
  Senior at most (65). Confirm a Lead appears in time, or every big office is
  permanently penalised.

### 8b. Test and check gaps

- **No unit tests for rivals or eras:** `sim/rivals.ts` (launches, ranking,
  buyouts, business growth), `data/eras.ts`, crowding, `saturate`,
  expected-feature penalties and `settledUsers` are only exercised by the bot
  runs. Add tests, including a save round trip with rivals and an acquisition.
- **Browser checks do not cover** the breakout, era and stage dialogs, the
  buyout button, promoting a person, the Lead warning, or opening a second
  office from the Team dialog.
- **Phones:** the scene, top bar, project panel and New project dialog were
  checked on a Pixel 9 (installed app) and in emulation. Not checked on a
  phone: the Journey and Industry tabs (wide tables), office tabs, the Team
  dialog's office rows and selects, the client-work list.
- **Tall tablets** (768×1024) keep rows of four desks and show spare floor at
  the bottom; switching to the one-column arrangement sooner (`arrange` in
  `render-support/layout.ts`) would fix it at the cost of smaller people.
- Not tested on iOS Safari.

### 8c. Content that runs out

- **The last era starts in year 9** and nothing changes after it: add eras or
  make them cycle.
- **Tech giant has no goals.** Options discussed, not chosen: an endless mode
  with growing rivals; a legacy / new-studio start. The agreed direction is a
  long journey, not an IPO-style ending, so anything here should extend the
  journey rather than reset it.
- Research (14 items) is finished early; repeatable research (CI II, III…) is
  not built.
- Only 7 product types and 24 features; era "expected features" stop at the
  platform age.
- Milestones were not reworked into the journey: "Fill all 12 desks" and "A real
  team" (5 people) assume the old single office.
- Contracts do not scale into the late game.

### 8d. From the original plan, not done

- Upkeep on live products beyond bugs and staleness (server bills, support load,
  churn from outages).
- Per-market reputation instead of one number.
- Scenario starts (a downturn, starting in debt).
- Rivals that act on you: really hiring staff away (today only the "Job offer"
  event names a rival), reacting to your hits, going bankrupt.
- A big HQ scene as a late visual reward.
- Staff retirement (people only "move on" after six years).

### 8e. Rough edges

- Every rival launch posts a toast; with five rivals that may be noisy. Notify
  only for hits or your own markets.
- Research era-gating reads "Not until the ai wave" (lowercased era name).
- Only two sounds serve all the new events (`ship`, `milestone`); none for a
  hit, an era or buying a rival.
- Stats charts show money and income only; no users, ranking history or
  per-product charts.
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

---

## Pending decisions

(none — all pitches are approved or parked; new ideas go straight to the
parking lot)

---

## Parking lot (ideas, not scheduled)

- **Dictation / speech-to-text** — **cut 2026-10-11, owner's call.** Reasoning:
  speech-to-text users are already inside a destination (a CLI piping to an
  LLM, a chat app); a separate web page adds a device/app hop and friction to
  a flow that OS keyboards (Gboard, iOS dictation) already serve for free.
  If a real use case appears later (e.g. transcripts for the subtitles tool),
  revisit as a workbench capability on audio files, not a standalone page.
- **Device bridge** — parked 2026-10-13, full spec and feasibility notes in §1.
- **Photo studio** — crop/rotate/flip/filters/watermark/collage on the existing
  `lib/image` pipeline. Owner wants this thought through later, not now.
- **Subtitles editor** — SRT/VTT shift/renumber/merge/convert; shares the
  transcript model with dictation.
- **PDF round 2** — page organize/rotate/delete, watermark, compress (qpdf-wasm)
  as an opt-in "Advanced" group; the current simple scope stays default.
- **Notes / scratchpad**, **audio recorder + trimmer**, **screen recorder**
  (`getDisplayMedia`), **invoice generator** (form → pdf-lib), **metronome /
  tuner / dB meter**, **sleep sounds** (synthesized noise), **password
  generator**, **habit tracker**, **EPUB writer** (Markdown/HTML → EPUB).

---

## Cross-cutting prerequisites (build once, reuse everywhere)

1. **CSP updates** in `astro.config.mjs`: add `'wasm-unsafe-eval'` for script
   (OCR, dictation, any future WASM tool). For the bridge: `connect-src` must
   allow `stun:`; check `Permissions-Policy` in `assets/_headers` doesn't block
   WebRTC; screen recording would need a `display-capture` permission addition.
2. **Lazy heavy-asset pattern** for the service worker: precache never includes
   WASM cores or language data (>1 MB rule); runtime Cache Storage with
   explicit download/progress/delete UI and honest size labeling. Shared
   helper in `src/lib/apps/` — used by OCR, the only consumer after dictation
   was cut.
3. **Settings backup / bridge coverage:** every new tool persists under its
   `lab:<tool>:v1` key (flash, focus, board, cv) so backup/restore and the
   device bridge carry state across devices.
4. **Registry plumbing per tool:** standalone pages follow the README's
   "Adding a new tool" steps (island, page, TOOLS entry with `seo`, i18n,
   tests with `axeViolations()`); the OCR capability follows the workbench
   steps (capabilities.ts + operations/ + operations.ts).
5. **Keep this file current** when each tool lands: strike its §1–§7 entry,
   record decisions made during the build, and fold the shipped behaviour
   into `README.md`.
