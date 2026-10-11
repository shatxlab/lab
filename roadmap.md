# Roadmap — approved tools

Status: **planning** — nothing here is implemented yet. `handoff.md` remains the
source of truth for the current state; this file is the source of truth for
*what gets built next*. A tool moves out of this file only when its work is
merged and its entry is folded into `README.md` + `handoff.md`.

Owner decisions 2026-10-11 (supersede anything older in `handoff.md` §2):

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
| 1 | Device bridge | standalone `/bridge` | none | The flagship; other tools hand off to it |
| 2 | Flashcards | standalone `/flash` | none | Small, daily-use, proves the standalone pattern |
| 3 | Focus office | standalone `/focus` | none | Mood piece, perfect offline PWA shortcut |
| 4 | Whiteboard | standalone `/board` | none | SVG architecture, ~25 KB target |
| 5 | CV builder | standalone `/cv` | none (reuses `lib/docx`) | Print-to-PDF engine keeps it cheap |
| 6 | Charts | workbench capability | none | Approved 2026-10-11; cheap, high delight |
| 7 | OCR | workbench capability | tesseract.js | Last: approved 2026-10-11, see §7 |

Ordering note: **OCR (the only tool needing lazy heavy-asset infrastructure)**
can start its prerequisite work (CSP, cache helper) at any point; everything
before it is dep-free. Dictation was **cut** on 2026-10-11 — see Parking lot.

---

## 1. Device bridge (`/bridge`)

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

**Implementation.** `src/components/bridge/` (PeerCard, QRPanel, TransferList)
+ `src/lib/bridge/` (signaling codec: compress SDP with `fflate` → QR; chunked
transfer protocol; peer connection lifecycle). Zero new deps.

**Tests.** Codec round-trip, SDP compression size bounds, chunk
reassemble/integrity, i18n. Two-tab e2e is manual (jsdom has no RTC).

---

## 2. Flashcards (`/flash`)

A *"50 cards on the bus"* study app — one deck in hand, five minutes, done.
Not an Anki clone. Mobile-first, EN/RU, sounds follow the `lib/wordle/sound`
pattern.

**Storage.** `lab:flash:v1` — decks, cards, schedule, stats. Covered by the
settings backup automatically; moveable between devices via the bridge.

**Import paths.**
- CSV/TSV via the workbench (add a "Send to Flashcards" action on text assets;
  map `front,back,tags` columns);
- pasted text, one `term — definition` per line;
- manual editor; Markdown on both sides (reuses `marked`).

**Scheduling.** FSRS-lite, ~40 lines: per-card stability/difficulty, four
grades (again/hard/good/easy), next-due intervals. Plus a no-schedule **cram**
mode. Stats kept minimal: due today, streak, learned count.

**Explicitly v2/never.** v2 maybe: images, audio, `{{cloze}}`. Never: cloud
sync, accounts, plugins.

**Implementation.** `src/components/flash/` (deck list, study, editor, stats)
+ `src/lib/flash/` (fsrs.ts, deck model, import parsers, i18n, storage).

**Tests.** FSRS math (golden intervals), import parsers (CSV variants, line
format), storage round-trip, reducer, axe.

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

**Interactivity, cheap.** Canvas 2D, ~500 lines, zero deps, zero image assets.
Sway/reactions on pointer move; tap a desk for a small animation. WebAudio
ambient (keyboard murmurs, AC hum) + a completion chime, synthesized like the
alias game's sound.

**Timer honesty.** A website can't force you to stay. Leaving mid-session
asks once ("people will lose their jobs") and then applies the consequence —
advisory, never blocking. Full-screen focus mode with a minimal clock.

**PWA.** Ideal offline tool; add `focus` to the manifest shortcuts.

**Implementation.** `src/components/focus/` (Office, TimerBar, DaySetup,
History) + `src/lib/focus/` (timer reducer, poms math, scene painter, prng
avatars, sound, i18n, storage).

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
5. **Update `handoff.md`** when each tool lands: new section, decisions
   (deps policy change, terminal-rule scope) reconciled with §2.
