# Handoff — intent-driven workbench

Status: **Phases 0–3 complete. `/tools` is now the only file-tools page** —
the seven tool pages (`/viewer`, `/pdf`, `/image`, `/qr`, `/text`,
`/convert`, `/reader`) were retired on 2026-10-10 and their URLs deliberately
404 (no redirects). EPUB reading is the `book.read` capability. PDF scope was
cut back on purpose: a PDF only gets Open, Merge, Split and Sign (see §2).
Second simplification pass (same day): selected-file model, View/Edit/Export/
Print merged into one **Open** tab, one **Image** tab, and every tool a
one-line terminal command covers retired (§2, §5).
Verification at handoff: `npx tsc --noEmit` clean · `npm run check` clean
(0 errors) · `npm test` → **all passing** · `npm run build` emits only `/`,
`/tools` and the games.

This document is the single source of truth for continuing the work. It is
written so that a fresh pi session (or a subagent) can pick up without the
original conversation.

---

## 1. Vision

Today the six tools are destinations you navigate to and then feed a file:
`/viewer`, `/pdf`, `/image`, `/qr`, `/text`, `/convert`. The target is the
inverse: **the file is the destination, and every applicable tool is an
operation on it.** Add a PDF → View, Extract text, Split, Merge, Organize,
Compare, Print, Compress are all offered. Add JSON → View, Edit, Diff,
Convert→YAML/TOML/CSV, Hash, Encode, QR.

Everything runs locally in the browser; no server. The existing `src/lib/*`
parsing/processing layer is reused unchanged; the work is UI composition plus a
capability registry.

**Model:** Asset → Capabilities → Operation → Output.

---

## 2. Locked decisions

| Topic | Decision |
|---|---|
| DOCX editing | Rich-text edit of the rendered HTML; save as DOCX/HTML/MD/TXT. **Lossy regenerate**, no OOXML round-trip. |
| PDF scope | **Open (view), Merge, Split, Sign only** (product decision, 2026-10-10 — too many options overwhelmed users). Only those capabilities list `pdf` in their `kinds`. Metadata, form fill/flatten, redaction and Organize pages were built and then removed (last present in commit `02a8f17`). |
| Terminal rule | **If a one-line terminal command does it, the workbench doesn't** (owner's call: "if I can use the terminal for word count — anybody can"). Retired: hash, Base64/URL/hex, UUID, regex tester, change case, word count, QR scanning, PDF→text. Kept because the terminal can't easily: document compare by content, PDF merge/split/sign, image convert/resize/strip, EPUB reading, QR creation, document view/edit. |
| Selection model | One **selected** file. File capabilities act on it; set capabilities (`set` in the registry) act on every open file of their kinds and only appear while the selected file belongs to a qualifying set (Merge 2+ PDFs, Compare exactly 2, Image 1+ batch). Mixed sets never cancel each other out. |
| Unsaved work | Operations report it via `onDirtyChange`. While dirty, adding files never switches away (the tab is pinned) and leaving (tab, file, remove, open result) asks `window.confirm`. Saving a copy calls `EditSession.markSaved()`, so a saved draft is clean. |
| Shell layout | Tabs only (≤4 per kind, so no "More" menu); no disabled/"coming soon" buttons; operations have no file pickers or remove buttons of their own — the tray is the single place files enter and leave. A one-line hint names what one more file would unlock (`unlockedByAnother`). |
| Rich-text engine | **No dependency.** `contentEditable` + existing DOMPurify + own toolbar/undo. |
| DOCX writer | **No dependency.** Hand-rolled OOXML zip via existing `fflate`/`jszip` (fallback first: save as HTML/MD/TXT). |
| Source editors | Own editor reusing `lib/viewer/highlight*` and the `JsonView` transparent-textarea trick. No CodeMirror. |
| New runtime deps | **None.** Do not add packages. |
| Routes | **Superseded 2026-10-10:** one page, `/tools`. The old tool routes and `/reader` were deleted outright (404, no redirects); PWA shortcuts are `tools` + `wordle`. File-less tools are empty-screen starters (`starter: true`): Compare (typed text) and Create QR code. |
| Save semantics | Saving always produces a copy in the Outputs tray; the original file is never modified. |

---

## 3. Current state

### Done

- **Phase 0 — foundations** (`src/lib/workbench/`)
  - `kinds.ts` — `AssetKind` taxonomy + predicates (`isEditable`, `isTextual`,
    `isComparable`, `isDataAssetKind`, `dataFormatFor`, `detectAssetKind`).
  - `asset.ts` — `Asset` with lazy cached representations (`bytes`, `text`,
    `json`, `workbook`, `pdf`); `createAsset[FromFile|FromText|FromBytes]`.
  - `capabilities.ts` — registry + `capabilitiesFor`, `suggestOperation`,
    `capabilityById`, `CAPABILITY_GROUPS`, `PRIMARY_COUNT`.
  - `operation.ts` — `OperationProps`, `OperationOutput`, `OperationComponent`,
    `EMPTY_ASSETS`.
  - `operations.ts` — lazy capability→component registry (`operationLoader`,
    `hasOperation`, `loadOperation`).
  - `i18n.ts` — `wb` translator + `MatchReason` keys.
- **Phase 1 — text family** (`components/workbench/operations/TextOperations.tsx`):
  `TextDiffOperation`, `TextCountOperation`, `TextCaseOperation`,
  `TextRegexOperation`. Asset-aware, standalone-compatible.
- **Phase 1 — data family** (`components/workbench/operations/ConvertOperations.tsx`):
  `DataConvertOperation`, `DataEncodeOperation`, `DataHashOperation`,
  `DataUuidOperation`.
- `src/components/tools/TextTools.tsx` and `ConvertTools.tsx` are now thin
  hosts rendering those operations with `EMPTY_ASSETS`. Existing behaviour and
  tests unchanged.
- Tests: `tests/workbench/{kinds,asset,capabilities}.test.ts`,
  `tests/workbench/{text-operations,convert-operations}.test.tsx`.
- **Phase 1 remainder — QR, PDF, Image** (`components/workbench/operations/`):
  `QrOperations.tsx` (`QrGenerateOperation`, `QrScanOperation`), `PdfOperations.tsx`
  (`PdfMergeOperation`, `PdfSplitOperation`, `PdfOrganizeOperation`),
  `ImageOperations.tsx` (one `ImageOperation` serving `image.convert|transform|strip`).
  `QrTools.tsx`, `PdfTools.tsx`, `ImageTools.tsx` are now thin hosts. Tests:
  `tests/workbench/{qr,pdf,image}-operations.test.tsx`.
- **Phase 1b — viewer family**: `ViewerOperations.tsx` exports
  `useViewerDocument` plus `ViewerViewOperation` (read-only `DocumentPane`),
  `ViewerEditOperation` (JSON/sheet/source editors with Save→`onProduce` and
  Discard), `ViewerConvertOperation` (serving `doc.convert` + `sheet.convert`,
  with a multi-sheet selector) and `ViewerPrintOperation`
  (`data-print-flow` + `printDocument`). `LoadedDocument`/`loadDocument` moved
  to `src/lib/viewer/load.ts`; `DocumentPane` moved to
  `src/components/viewer/DocumentPane.tsx` (edit callbacks optional, so a
  read-only mount hides the editors). Test:
  `tests/workbench/viewer-operations.test.tsx`.
- **Phase 2 — workbench shell**: `src/components/workbench/WorkbenchApp.tsx`
  (default export plus `InputBar`, `AssetTray`, `ActionBar`, `OperationHost`,
  `OutputTray`) and the `/tools` route
  (`src/pages/tools.astro`). Test: `tests/workbench/workbench-app.test.tsx`.
- `wb` i18n gained `loading`, `unavailable`, `noOutputs`, `removeOutput`.
- **Phase 2.5 — editing foundation**: `src/lib/workbench/editor.ts`
  (`EditSession<T>`: dirty / undo / redo / revert / reset / serialize / output),
  `src/components/workbench/EditorToolbar.tsx` (Save · Save as ▾ · Revert ·
  Undo · Redo · dirty badge) and `src/components/workbench/SourceEditor.tsx`
  (highlight.js overlay over a transparent textarea — JsonView's trick
  generalized). `ViewerEditOperation`'s JSON, sheet and
  text/Markdown/HTML/YAML/TOML panes now run on `EditSession` + `EditorToolbar`
  (the source pane via `SourceEditor`). Tests:
  `tests/workbench/{editor.test.ts,editor-toolbar.test.tsx,source-editor.test.tsx}`.
- **DOCX editing**: `docx.edit` capability + `operations/DocxOperations.tsx`
  (`DocxEditOperation`) — a contentEditable rich text surface over the sanitized
  rendered HTML with a formatting toolbar (localized `wb` keys), saving
  HTML/Markdown/TXT/DOCX through `EditorToolbar` + `EditSession`. A real `.docx`
  is produced by the hand-rolled OOXML writer `src/lib/docx/write.ts`
  (`htmlToDocx`, zipped with `fflate`; no new deps). Tests:
  `tests/workbench/{docx-operations,docx-write}.test.*`.
- **PDF signing**: `pdf.sign` capability + `operations/PdfSignOperations.tsx`
  (`PdfSignOperation`) — pending signature-image and text stamps drawn on Save
  (`StandardFonts.Helvetica`, `embedPng`/`embedJpg`). A dirty-gated Save
  writes `<name>-signed.pdf` via `@cantoo/pdf-lib`. Test:
  `tests/workbench/pdf-sign-operations.test.tsx`.
- `/tools` is now an entry in `src/lib/apps/tools.ts` (landing grid + sitemap).

### Not done yet

- Nothing PDF-related is planned beyond the four PDF actions (see §2).

---

## 4. Architecture (contracts)

```ts
// src/lib/workbench/asset.ts
export interface Asset {
  readonly id: string;
  readonly kind: AssetKind;      // pdf|docx|markdown|html|text|json|yaml|toml|sheet|image|binary
  readonly name: string;
  readonly size: number;
  readonly extension: string;
  readonly source: AssetSource;  // { name, size, type?, arrayBuffer() }
  bytes(): Promise<Uint8Array>;
  text(): Promise<string>;
  json(): Promise<unknown>;
  workbook(): Promise<Workbook>;
  pdf(): Promise<PDFDocumentProxy>;
}
```

```ts
// src/lib/workbench/operation.ts
export interface OperationOutput { name: string; type: string; bytes: Uint8Array; kind?: AssetKind; }
export interface OperationProps {
  lang: AppLang;
  assets: readonly Asset[];
  params?: Record<string, unknown>;
  setParams?: (patch: Record<string, unknown>) => void;
  onProduce?: (output: OperationOutput) => void;
  busy?: boolean;
}
export type OperationComponent = ComponentType<OperationProps>;
export const EMPTY_ASSETS: readonly Asset[];
```

```ts
// src/lib/workbench/operations.ts  (add entries here — do NOT let workers touch it)
const REGISTRY: Partial<Record<CapabilityId, OperationLoader>> = {
  "text.diff": async () => (await import("@/components/workbench/operations/TextOperations")).TextDiffOperation,
  // ... text.count / text.case / text.regex
  "data.convert": async () => (await import("@/components/workbench/operations/ConvertOperations")).DataConvertOperation,
  // ... data.encode / data.hash
};
```

### Established operation pattern (copy it)

- Operation takes `OperationProps` (plus optional extra props).
- Reads its draft from `assets` via a `useSeedAssets` helper that keys on
  `assets.map(a => a.id).join("|")` and only runs when the selection changes.
- `const standalone = assets.length === 0;` → renders its own `FilePicker`
  only when standalone; hides it when the workbench supplies files.
- Existing visible labels must not change (legacy tool tests assert them).

---

## 5. Capability registry (source of truth: `src/lib/workbench/capabilities.ts`)

| id | label | weight | selected file kinds | set? |
|---|---|---|---|---|
| `pdf.merge` | Merge PDFs | 1000 | pdf | 2+ PDFs |
| `text.diff` | Compare | 1000 | text, md, html, json, yaml, toml, sheet, docx | exactly 2; starter |
| `book.read` | Read | 900 | epub | — |
| `image.edit` | Image | 850 | image | 1+ images (batch) |
| `doc.open` | Open | 800 | pdf, docx, md, html, text, json, yaml, toml, sheet | — |
| `pdf.sign` | Sign | 770 | pdf | — |
| `pdf.split` | Split | 600 | pdf | — |
| `qr.generate` | Create QR code | 320 | textual kinds | starter |

The first offered capability (by weight) opens by default: two PDFs → Merge,
two texts → Compare, one PDF/document → Open, an image → Image, an EPUB → Read.
Binary files get no tabs and a "no tools for this file type" line.

`doc.open` (`OpenOperations.tsx`) is Preview | Edit. Preview renders the
document with **Save as ▾** (sheet → CSV/JSON/XLSX; md/html/docx →
HTML/Markdown/text; json/yaml/toml → the other two) and **Print** for
page-like kinds. Edit mounts the JSON/sheet/source/Word editor; Preview is
locked while an edit is unsaved. JSON, YAML and TOML drafts are parsed as you
type: the error shows under the editor and Save is disabled until it parses.
Edited copies are always named `name-edited.ext`.

---

## 6. Remaining work

### 6a. Phase 1 remainder — extract QR, PDF, Image (subagent work)

For each family, in **its own worker**, one at a time:

1. Create `src/components/workbench/operations/<Family>Operations.tsx` by moving
   the tab bodies out of `src/components/tools/<Family>Tools.tsx`.
2. Rewrite that tool page as a thin `ToolPage` + `Tabs` host rendering the
   operations with `assets={EMPTY_ASSETS}`.
3. Add `tests/workbench/<family>-operations.test.tsx` (`// @vitest-environment jsdom`,
   use `../helpers/dom` `mount`/`waitFor` — **no @testing-library**).
4. **Parent** (me) adds the registry entries in `src/lib/workbench/operations.ts`
   and runs the full suite.

Family notes:
- **QR**: `QrGenerateOperation` (extra prop `seed?: string | null`),
  `QrScanOperation` (extra prop `onUse?: (text) => void`). Seed generate text
  from a textual asset; decode an image asset in scan. Keep the scan→create
  handoff in `QrTools.tsx`.
- **PDF**: `PdfMergeOperation`, `PdfSplitOperation`, `PdfOrganizeOperation`
  (+ `PdfUnlockOperation` only if easy with `@cantoo/pdf-lib`). Adapt
  `readEntry` to accept `{ name, size, bytes }` from `asset.bytes()`.
- **Image**: single `ImageOperation` with `defaultTask?: "convert" | "strip"`;
  read `params?.task` for the initial task. Register `image.convert`,
  `image.transform`, `image.strip` all to it. Auto-add image assets; hide the
  picker. jsdom has **no canvas**, so processing fails gracefully — the item
  must still list with its filename.

### 6b. Phase 1 remainder — viewer family

Hardest extraction. `ViewerApp.tsx` owns load/detect/render plus FileBar
export/compare/print/edit. Target operations:
- `viewer.view` — the `DocumentPane` viewers.
- `viewer.edit` — JSON (`JsonView`) and sheet (`SheetView` + `sheet-edit`) first.
- `doc.convert` / `sheet.convert` / `viewer.print` — the current
  `exportItems` / `printable` logic, generalized into operations.

Recommended approach: promote the viewer's `FileBar` action switch into a
capability-driven bar, and keep `DocumentPane` as the `viewer.view` operation.

### 6c. Phase 2 — workbench shell

New `src/components/workbench/WorkbenchApp.tsx` (+ `InputBar`, `AssetTray`,
`ActionBar`, `OperationHost`, `OutputTray`). Layout: input strip; Assets tray
(one-line for a single file); "add one more file to unlock…" hint;
`ActionBar` tabs + grouped "More" menu; the active operation in the tab panel;
Outputs tray only once something was produced. Every asset change resets the
choice so the suggested action opens.

Route: add `src/pages/tools.astro` mounting the shell; convert the six existing
routes to presets (ViewerApp etc. can stay until the shell covers them).

### 6d. Phase 2.5 / 3 / 4 — editing

- `src/lib/workbench/editor.ts` — `EditSession` (draft, dirty, undo/redo,
  revert, `serialize(format)`, `saveAs[]`). **Done.**
- Shared `EditorToolbar` (Save · Save as ▾ · Revert · Undo · Redo · dirty badge).
  **Done.**
- Source editors for text/Markdown/HTML/JSON/YAML/TOML (reuse highlight engine).
  **Done** — `SourceEditor` for text/Markdown/HTML/YAML/TOML, `JsonView` for
  JSON; every pane now runs on `EditSession` + `EditorToolbar`.
- DOCX (contentEditable rich text + hand-rolled OOXML writer). **Done** —
  `DocxOperations.tsx` + `src/lib/docx/write.ts` (HTML/MD/TXT/DOCX).
- PDF: signature/text stamps only (`PdfSignOperations.tsx`). Metadata, forms
  and redaction were removed by product decision (§2).

### 6e. Follow-ups from the integration review

The first shell/operations review found and fixed three integration bugs (all
covered by tests now): the QR scan→generate handoff replaced the selection with
a text asset so `qr.generate` actually applies; `ViewerViewOperation` passes no
edit callbacks so `DocumentPane` renders read-only; `ImageOperation` only
attaches its paste listener when standalone (the shell owns paste).
Remaining minor follow-ups, none blocking: extract the copy-pasted
`useSeedAssets` into `src/lib/workbench/`; add cancellation guards to the QR/PDF
seed effects; dedupe image outputs published per settings key; add an axe smoke
test for the shell.

A second review of the viewer operations fixed: per-asset `key` on the edit
panes (draft leak), a multi-sheet selector for `sheet.convert`,
`pdf.loadingTask.destroy()` after PDF text extraction, `kind` inferred on
convert outputs (so `.csv`/`.md`/`.html`/`.json` reopen as their real kind), and
clearing stale error text on asset change. Known gaps: the asset-switch
regression test passes even without the `key` because jsdom unmounts the panes
during the loading state; `useViewerDocument` re-parses on language change;
YAML/TOML edit as plain text; convert/edit can emit after unmount mid-export.

---

## 7. Subagent orchestration

The bundled `subagent` extension is installed (requires a **fresh pi process**
to load — a new session inside the TUI is not enough):

- Extension: `~/.pi/agent/extensions/subagent/{index.ts,agents.ts}`
- Agents: `~/.pi/agent/agents/{worker,scout,planner,reviewer}.md`
  (copied with `model:` removed so they inherit the session model)
- Prompts: `~/.pi/agent/prompts/{implement,scout-and-plan,implement-and-review}.md`

Tool `subagent`, modes:
- single `{ agent, task }`
- parallel `{ tasks: [{agent, task}, …] }` (max 8, 4 concurrent)
- chain `{ chain: [{agent, task}, …] }` with `{previous}`

**Do not** run three deep refactors in parallel over the same repo. Run **one
`worker` per family**, then verify centrally. Reserve `scout` for recon and
`reviewer` for reviewing a diff before integration. Parallel mode is fine for
independent read-only scouting.

### Worker brief template

> You are a worker subagent working in `/Users/shatxme/projects/lab`.
> Read first: `src/lib/workbench/operation.ts`,
> `src/components/workbench/operations/ConvertOperations.tsx` (pattern), the
> target `src/components/tools/<Family>Tools.tsx`, and its test in
> `tests/<family>/`.
>
> Deliverables: `<Family>Operations.tsx`, thin `<Family>Tools.tsx` host, and
> `tests/workbench/<family>-operations.test.tsx`.
>
> Hard constraints: do **not** edit `src/lib/workbench/operations.ts` or
> `capabilities.ts`, or other families; do **not** change visible labels;
> do **not** add dependencies or use `@testing-library/*`; do **not** run
> `npm test` — run only `npx vitest run tests/<family>` and `npx tsc --noEmit`;
> ignore tsc errors in files you did not touch.
> Report: FILES / TESTS / DEVIATIONS.

---

## 8. Verification checklist

```sh
npm install                # if node_modules is missing
npx tsc --noEmit           # typecheck
npm test                   # full suite (was 682 passing)
npx vitest run tests/workbench   # just the workbench tests
npm run check              # astro check (templates), slower
```

A task is only "done" when typecheck is clean and the **full** suite passes.
Existing suite coverage to respect: `tests/pdf`, `tests/image`, `tests/qr`,
`tests/text`, `tests/convert`, `tests/viewer`, `tests/a11y`.

---

## 9. Known pitfalls

- **`timeout` does not exist on macOS**; use the tool's own timeout.
- **Do not background three agents and `wait`** in one bash call: the harness
  timeout kills the whole process group and leaves half-written files. (This
  already happened once; it was reverted.) Prefer one worker per call, or
  detached `nohup` + polling the log.
- **Do not add dependencies.** `@testing-library/react` is not installed; use
  `tests/helpers/dom.tsx`.
- **jsdom has no canvas.** Image/QR rendering tests must not assert pixels.
- **`EMPTY_ASSETS`** must be the shared constant, not a fresh `[]`, or seeding
  effects can loop.
- Existing tool tests query exact visible strings — keep labels identical.
- `src/components/tools/*.tsx` pages must keep working while operations are
  extracted (run `tests/<family>` after each).

---

## 10. File map (current)

```
src/lib/docx/write.ts   (hand-rolled OOXML writer)
src/lib/workbench/
  asset.ts  capabilities.ts  editor.ts  i18n.ts  kinds.ts
  operation.ts  operations.ts
src/components/workbench/
  WorkbenchApp.tsx  EditorToolbar.tsx  SourceEditor.tsx
  operations/
    OpenOperations.tsx  (doc.open: preview / Save as / print / editors)
    DocxOperations.tsx  (Word editor pane used by Open)
    TextOperations.tsx  (text.diff)   QrOperations.tsx  (qr.generate)
    PdfOperations.tsx   (merge, split) PdfSignOperations.tsx  (pdf.sign)
    ImageOperations.tsx (image.edit)  ReaderOperations.tsx  (book.read)
tests/workbench/
  asset.test.ts  capabilities.test.ts  kinds.test.ts
  editor.test.ts  editor-toolbar.test.tsx  source-editor.test.tsx
  text-operations.test.tsx  open-operations.test.tsx
  qr-operations.test.tsx    pdf-operations.test.tsx
  image-operations.test.tsx
  docx-operations.test.tsx  docx-write.test.ts
  pdf-sign-operations.test.tsx  workbench-app.test.tsx
src/lib/viewer/load.ts                 (LoadedDocument + loadDocument)
src/components/viewer/DocumentPane.tsx (document renderer used by Open's Preview)
src/components/apps/EpubReader.tsx     (reader; takes the workbench asset)
src/components/workbench/operations/ReaderOperations.tsx (book.read)
src/pages/tools.astro  (mounts <WorkbenchApp client:load />)
```

## 11. Next immediate action

Phases 0–3 are complete and the PDF scope is final (View, Merge, Split, Sign).

The open follow-ups are all §6e items (shared `useSeedAssets`,
cancellation guards, an axe smoke test for the shell, and a dedicated
“Unsaved changes” i18n key for the toolbar badge).
