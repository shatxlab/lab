# Roadmap

Status: Flashcards, Focus office, Send to phone, Charts and the Whiteboard
have shipped, along with the workbench follow-ups in §0. **Still to build:
CV builder and OCR (§6–§7).** **This file is the single source of
TODOs.** A tool moves out of the build order only when its work is merged and its
entry is folded into `README.md`; shipped entries stay as short notes of the
decisions made along the way.

Owner decisions (2026-10-11) that still apply:

- **New runtime deps are allowed** — keep them small and lazy-loaded; each tool
  below lists its deps. The workbench's own dependency freeze stays.
- **The terminal one-liner rule is scoped to the workbench.** Standalone tools
  may do things a terminal can trivially do (timers, generators) when the
  audience is a phone user on the landing page.
- **Everything local-first stays non-negotiable.** No servers: devices share data
  through Send to phone (a QR link), export/import files, or the settings backup.

---

## Build order

| # | Tool | Page vs workbench | New deps | Status |
|---|---|---|---|---|
| 1 | Device bridge | standalone `/bridge` | none | **parked** 2026-10-13 (§1) |
| 1a | Send to phone (QR link) | helper + per-tool actions | none | **shipped** 2026-10-13 (§1a) |
| 2 | Flashcards | standalone `/flash` | none | **shipped** 2026-10-13 (§2) |
| 3 | Focus office | standalone `/focus` | none new (reuses the Tycoon Pixi scene) | **shipped** 2026-10-13 (§3) |
| 4 | Charts | workbench capability | none | **shipped** 2026-10-13 (§4) |
| 5 | Whiteboard | standalone `/board` | none | **shipped** 2026-10-13 (§5) |
| 6 | CV builder | standalone `/cv` | none (reuses `lib/docx`) | print-to-PDF engine keeps it cheap (§6) |
| 7 | OCR | workbench capability | tesseract.js | last: needs lazy heavy-asset infrastructure (§7) |

Ordering note: OCR is the only tool needing lazy heavy-asset infrastructure (CSP
`'wasm-unsafe-eval'`, a cache helper); that prerequisite work can start at any
point. Everything else is dep-free. Dictation was cut (see the parking lot).

Done outside this build order (2026-10-12): **Software Tycoon** was merged in
from the standalone `software-tycoon` repo as `/tycoon` — the engine ported to
React under `lib/tycoon/`, the PixiJS office scene lazy-loaded, CSP gained
`worker-src 'self' blob:` for pixi's blob: texture workers, and saves moved to
`lab:tycoon:*` keys with a one-time migration from `software-tycoon:*`. Its
deps: `pixi.js` (lazy) + dev-only `@types/pngjs`. Docs live in README.md
(see "Software Tycoon"); its open work list is §8.

---

## 0. Workbench follow-ups — done except one optional item

Shipped 2026-10-13: **0a** the "Edit image" label and a skeleton loading state,
**0b** set-membership badges in the tray (A/B for Compare, 1..n for Merge, an
in-batch chip), **0d** tray thumbnails and kind glyphs, **0e tier A** the
`ConfirmSheet` unsaved-changes dialog (keep editing is primary). Earlier:
beforeunload guard, shared `useSeedAssets`, outputs-tray thumbnails + `Download
all`, diff patch/HTML-report export.

Dropped by the owner (2026-10-13), not to be built: **0c** paste opening Compare
(Compare needs exactly two files, so a lone paste can't land there), **0e tier B**
(drafts surviving tab switches) and **0f** the output stage (the tray,
`Download all` and the dialog are enough). If results get missed on phones, try
scrolling the outputs tray into view on the first output before building
anything bigger.

### 0g. Optional, only if wanted
- **Session restore** — refresh wipes the tray; a tiny opt-in "restore last
  tray" (names + bytes in memory only) would soften the hard reset.
- **Image print** — page-like kinds print; a photo print is a plausible ask
  if print exists for images.
- **Send to Flashcards** — an action on workbench text assets that opens the
  Flashcards import with the text (no bridge needed).


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

## 1a. Send to phone (QR link) — SHIPPED 2026-10-13

Folded into `README.md` ("Send to phone"). Built for Flashcards (send or receive
a deck) and the workbench (send a text file or text output via a phone icon on
tray rows; receive text as a new file, with a content preview). The cap is 2 200
characters at QR error-correction level **M** — not 2.5 KB at L, because jsQR
fails on every version-23 code at L while M decoded at every size. Shared pieces:
`lib/send/` (codec, `useIncomingSend`, i18n), `components/tools/SendToPhone.tsx`
and `ReceiveDialog.tsx`. To add Send to another tool: supply a `kind`, a
`getData` and a receive handler. The other direction needs no feature: export a
file and move it however you like.

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

## 3. Focus office (`/focus`) — SHIPPED 2026-10-13

Folded into `README.md` ("Focus office"). Decisions made during the build, and
what is still open:

- **Scene:** Software Tycoon's Pixi `OfficeScene`, via a synthetic game state
  and three small additions (`options.label`, `options.working`, `leave(id)`).
  No new package.
- **A day** is one run: one new office per day (seed + calendar day + run), one
  person per Pomodoro, capped at twelve (the desks). Missed Pomodoros fire people
  in a seeded order; the names are kept in the history. No merciful mode.
- **Timer honesty:** a confirm dialog names who would leave; `beforeunload`
  asks; a page that truly goes away gives the Pomodoro up; tab switches are free.
- **Not built:** the ambient WebAudio office sounds (keyboard murmur, AC hum) —
  only short cues; per-desk tap animations (a tap just names the person); a
  garden-style calendar view of history (it is a list plus totals and a streak).
- **Open ideas:** office growth over a streak of full days, notifications when
  the tab is in the background, a long-press/keyboard shortcut for Start.

---

## 4. Charts — workbench capability — SHIPPED 2026-10-13

Folded into `README.md` ("Charts"). Decisions made during the build, and what is
still open:

- **Types:** line (with an area option), bar, grouped bar, histogram, scatter —
  the UI shows four buttons because Bar becomes Grouped when more than one series
  is chosen. Auto-detected from the data's shape; every choice can be overridden.
- **Colour:** the reference data-viz palette, validated for both modes (run the
  validator script again if the hues ever change). A column keeps its colour
  whatever else is switched on; at most eight numeric columns can be plotted, six
  at a time (three on a scatter), because a ninth hue would be indistinguishable.
- **Responsive:** the chart is drawn at the width it is shown at, so a phone gets
  fewer ticks and a wrapped legend rather than shrunken text; exports are 720 wide.
- **Accessibility:** a legend for two or more series, a table twin, keyboard
  navigation of the hover details, an opt-in hatch pattern.
- **Export:** SVG and PNG go to the Outputs tray as images; the background is
  light or dark independent of the page theme.
- **Not built:** per-sheet persistence of chart settings (they reset when the
  file or sheet changes), stacked bars, secondary axes (deliberately never),
  pivoting a table, and a "Send chart to phone" action (an SVG is far over the
  QR cap; export and move it).

---

## 5. Whiteboard (`/board`) — SHIPPED 2026-10-13

Folded into `README.md` ("Whiteboard"). Decisions made during the build, and
what is still open:

- **v1 as specced:** rectangle, ellipse, arrow, text, pen; select/move/resize
  (handles), marquee and Shift multi-select; undo/redo; pan/zoom (two fingers,
  wheel, Ctrl+wheel, Space-drag, hand tool); grid; SVG and PNG export; `.json`
  board files; several boards with a switcher; autosave to `lab:board:v1`.
- **Style changes apply to the selection** (like Excalidraw), but picking a
  drawing tool lets go of it, so a colour chosen next applies to the next shape.
- **Text** is edited in place with a textarea (Ctrl+Enter finishes), which is
  the v2 "inline text editing" item done early.
- **Phones:** the toolbar is one swipeable row so the canvas stays on screen.
- **Not built (v2/never):** arrows that attach to shapes, grid snap, bring
  to front/send to back, copy/paste across boards, a shared clipboard with other
  tools. Never: shape libraries, images, collaboration.
- **Boards as workbench assets:** a board file is plain JSON, so the workbench
  already opens, saves and JSON-compares it like any JSON file; there is no
  dedicated "open in Whiteboard" action from the workbench yet.

---

## 6. CV builder (`/cv`)

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
runtime cache (the shared lazy-asset helper below). CSP needs `'wasm-unsafe-eval'`.

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
   (OCR and any future WASM tool). Screen recording, if ever built, would need a
   `display-capture` permission in `assets/_headers`. (The bridge's WebRTC and
   camera notes are in §1, which is parked.)
2. **Lazy heavy-asset pattern** for the service worker: precache never includes
   WASM cores or language data (>1 MB rule); runtime Cache Storage with
   explicit download/progress/delete UI and honest size labeling. Shared
   helper in `src/lib/apps/` — OCR is its only consumer.
3. **Settings backup coverage:** every tool persists under its `lab:<tool>:v1`
   key (flash and focus already do; board and cv will) so backup/restore carries
   state across devices. Small data can also move with Send to phone.
4. **Registry plumbing per tool:** standalone pages follow the README's
   "Adding a new tool" steps (island, page, TOOLS entry with `seo`, i18n,
   tests with `axeViolations()`); a workbench capability follows the workbench
   steps (capabilities.ts + operations/ + operations.ts). Standalone tools of the
   study/productivity kind go in the `productivity` category.
5. **Keep this file current** when each tool lands: mark its entry shipped,
   record decisions made during the build, and fold the shipped behaviour
   into `README.md`.
