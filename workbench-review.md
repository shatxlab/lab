# Workbench product review — `/tools`

Date: 2026-10-11 · Source of truth read: `handoff.md`, `src/lib/workbench/*`, `src/components/workbench/*`

---

## 1. The system in one picture

```
                        WORKBENCH  /tools  (one page, everything local)
 ─────────────────────────────────────────────────────────────────────────────────
  ENTER A FILE          CLASSIFY + SELECT             ACT                    TAKE AWAY
┌───────────────┐   ┌────────────────────────┐   ┌────────────────────────┐   ┌──────────────────┐
│  INPUT BAR    │   │  ASSET TRAY            │   │  ACTION BAR (tabs)     │   │  OUTPUTS TRAY    │
│ pick · drag   │   │ one row per file       │   │ offered per capability │   │ produced copies  │
│ · paste text  │──▶│ one file is SELECTED   │──▶│ registry (kinds+set)   │──▶│ · download       │
└───────────────┘   └────────────────────────┘   └────────────────────────┘   │ · open as asset ─┐
   compact once        remove · clear              unsaved-work pin            └──────────────────│
   files exist         per file                    (EditSession)                                  │
        ▲                  │                            ▲                        (loop back into  │
        │                  ▼                            │                          the tray)     │
        └─────── "no tools for this file type"          └────────────────────────────────────────┘
                  (binary dead-end line)
```

Core model: **Asset → Capability → Operation → Output.** The file is the
destination; tabs are what the *selected file's kind* offers. Set capabilities
(Merge ≥2 PDFs, Compare exactly 2 comparable, Image ≥1 batch) aggregate the
tray, never cancel each other out. Outputs are always **copies** — the original
is never modified.

---

## 2. Capability × file-kind matrix  (what a selected file can do)

| selected kind | Open | Read | Image | Merge | Split | Sign | Compare | QR | verdict |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| pdf | ✔ preview+print | – | – | ✔ (2+) | ✔ | ✔ | – | – | complete for its scope |
| docx | ✔ preview+edit+save-as | – | – | – | – | – | ✔ (as text) | – | complete |
| markdown / html / text | ✔ preview+edit+save-as | – | – | – | – | – | ✔ | ✔ (seed text) | complete |
| json / yaml / toml | ✔ preview+edit (parse-as-you-type) | – | – | – | – | – | ✔ | ✔ | complete |
| sheet (csv/xlsx) | ✔ grid preview+edit, save-as CSV/JSON/XLSX | – | – | – | – | – | ✔ (as CSV) | – | complete |
| image | – | – | ✔ convert/resize/compress/strip-EXIF, batch | – | – | – | – | – | complete |
| epub | – | ✔ reader: chapters, search, bookmarks, themes, position | – | – | – | – | – | – | complete |
| binary | ✖ “no tools for this file type” | – | – | – | – | – | – | – | dead end by design |

Open’s **Save as** targets: sheet → CSV/JSON/XLSX · md/html/docx → HTML/Markdown/text ·
json/yaml/toml → the other two · edited copies are always `name-edited.ext`.

---

## 3. User journeys

```
J1  Compare two texts (empty screen)
    empty ▶ starter "Compare" ▶ type/paste A + B ▶ line diff (side-by-side/unified)  ▶ read-only, no output

J2  Create a QR code (empty screen)
    empty ▶ starter "Create QR code" ▶ payload: text|wifi|email|phone|sms|contact|location
          ▶ style + size ▶ PNG ▶ download ▸ (or land in tray as an image asset)

J3  PDF
    pick.pdf ▶ [Open] preview ▶ Print
             ▶ [Merge]   add 2nd pdf ▶ optional page ranges ▶ merged.pdf ▸ download/keep
             ▶ [Split]   every-N / ranges ▶ part files ▸
             ▶ [Sign]    image or text stamps ▶ Save ▶ name-signed.pdf ▸
    (1 pdf + hint "add one more file to unlock Merge")

J4  Images (batch)
    pick.jpg ▶ [Image] task: convert (format·resize·quality) | strip (EXIF/GPS)
             ▶ settings remembered (lab:image:v1) ▶ add more images ▶ outputs per image ▸

J5  Documents (md/html/text)
    pick.md ▶ [Open] Preview (Save as ▾ HTML/MD/text · Print) ▸ Edit (source, undo/redo)
            ▶ Save ▶ name-edited.md ▸

J6  Sheets
    pick.xlsx ▶ [Open] grid preview ▶ Edit in sheet grid ▶ Save ▶ xlsx ▸
              ▶ Save as ▾ CSV / JSON / XLSX ▸

J7  Data (JSON/YAML/TOML)
    pick.json ▶ [Open] preview / source edit — parsed as you type, Save blocked on error
              ▶ Save ▶ json ▸ ▶ Save as ▾ yaml/toml ▸
    (+ [Compare] two JSONs pretty-printed)

J8  Word
    pick.docx ▶ [Open] rendered preview ▶ Edit (rich text, contentEditable) ▶ Save
              ▶ docx (hand-rolled OOXML) | html | md | txt ▸

J9  EPUB
    pick.epub ▶ [Read] chapters · in-book search · bookmarks · paper/sepia/night · font size
              · position remembered per book (epub-reader:)

J10 Binary/unknown (.doc, .zip, …)
    pick ▶ "no tools for this file type" ▶ remove — dead end (by design)
```

Every journey converges on the same exit: **outputs tray → download or loop back
in as a new asset** (a converted CSV can immediately be compared, etc.).

---

## 4. Where settings actually live

```
site-wide (header)                          per-operation state
├── theme  light/dark/system                ├── Compare     — none (stateless)
├── lang   en | ru                          ├── Create QR   — payload kind, style, size (per session)
├── command palette  ⌘K search+actions      ├── Merge/Split — page ranges (per session, per file)
└── settings backup  export/import          ├── Sign        — staged stamps (per session)
    (lab:* + epub-reader:* → one JSON,      ├── Image       — task/format/resize/quality REMEMBERED
     merge | replace)                          (lab:image:v1)
                                            └── Read (EPUB) — theme, font size, position, bookmarks
                                               (per book, epub-reader:*)
```

Bounds (safety, `lib/limits.ts`): 64 MB file cap · ZIP-entry 5000/64 MB/256 MB —
zip bombs become readable errors, and everything stays in the tab.

---

## 5. Completeness verdict

**The locked scope (handoff §2) is fully shipped.** Phases 0–3 are done, the
selected-file model, dirty-pin, starters, set-capability hints and outputs tray
all exist and are tested (workbench suite green at handoff). Nothing in the
matrix above is half-built.

### A. Finish first (already promised, §6e)
1. Shared `useSeedAssets` extraction · cancellation guards · axe smoke test for the shell.
2. **Unsaved-changes beforeunload guard** — refresh/close today silently loses an unsaved
   edit; the dirty-pin protects in-app actions only. Cheap, high-value.
3. “Unsaved changes” i18n key for the toolbar badge.

### B. Real product gaps (my pick, in order)
1. **Outputs tray is a dead end visually** — no preview, no size/type info, no
   “save all”. After a 10-image batch you download files one by one. A preview
   thumbnail + “download all” would close the loop for the batch journey.
2. **Compare produces nothing** — you can’t save or print the diff report. An
   “export report (HTML/text)” turns Compare from a viewer into an output
   (matches the everything-produces-a-copy model).
3. **No session restore** — refresh wipes the tray. A tiny “restore last tray”
   (names + bytes in memory only, opt-in) would respect local-first while
   softening the hard reset. Optional, don’t force it.
4. **Paste on the empty screen lands in Open, not the starters** — pasted text
   becomes a `paste.txt` asset whose first tab is Open; users who wanted Compare
   must switch tabs. Consider: pasting while empty opens Compare directly.
5. **Image tab can’t Print** — page-like kinds print; photos don’t, though a
   photo print is a plausible request. Tiny add if print exists for images.

### C. Blocked by your own terminal rule (don’t build)
hash/Base64/UUID/regex/word count/case/QR-scan/PDF→text — retired, keep retired.
`img2pdf`, `soffice --convert-to` also one-liners → image→PDF and format soup
stay out. Binary dead-end (`.doc`, `.pages`) is consistent with this.

### D. Deliberate non-features worth keeping
No accounts, no telemetry, no server, no new deps, originals never modified,
404 for old tool routes. These are the product’s spine — the verdict above is
“complete at scope, with 3 small add-ons that would make it feel finished”:
**beforeunload guard, outputs preview + download-all, diff export.**
