# Handoff — intent-driven workbench

Status: **Phases 0–3 complete. `/tools` is now the only file-tools page** —
the seven tool pages (`/viewer`, `/pdf`, `/image`, `/qr`, `/text`,
`/convert`, `/reader`) were retired on 2026-10-10 and their URLs deliberately
404 (no redirects). EPUB reading is the `book.read` capability. PDF scope was
cut back on purpose: a PDF only gets View, Merge, Split and Sign (see §2).
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
| PDF scope | **View, Merge, Split, Sign only** (product decision, 2026-10-10 — too many options overwhelmed users). Enforced by `PDF_CAPABILITIES` in `capabilities.ts`: any selection containing a PDF is limited to those four. Metadata, form fill/flatten and redaction were built and then removed (last present in commit `02a8f17`). Organize pages was removed along with `/pdf`. |
| Shell layout | No disabled/"coming soon" buttons. The best action opens on drop; the top `PRIMARY_COUNT` (4) renderable actions are tabs, the rest sit in a grouped "More" menu; a one-line hint names what one more file would unlock (`unlockedByAnother`). |
| Rich-text engine | **No dependency.** `contentEditable` + existing DOMPurify + own toolbar/undo. |
| DOCX writer | **No dependency.** Hand-rolled OOXML zip via existing `fflate`/`jszip` (fallback first: save as HTML/MD/TXT). |
| Source editors | Own editor reusing `lib/viewer/highlight*` and the `JsonView` transparent-textarea trick. No CodeMirror. |
| New runtime deps | **None.** Do not add packages. |
| Routes | **Superseded 2026-10-10:** one page, `/tools`. The old tool routes and `/reader` were deleted outright (404, no redirects); PWA shortcuts are `tools` + `wordle`. File-less tools survive as empty-screen starters (capabilities whose `match` accepts an empty selection: compare text, create/scan QR, UUID). |
| Save semantics | "Save a copy" always; in-place save only via File System Access `showSaveFilePicker`. |

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

| id | group | weight | applies to |
|---|---|---|---|
| `viewer.view` | view | 800 | any non-binary |
| `viewer.edit` | edit | 780 | text, markdown, html, json, yaml, toml, sheet |
| `docx.edit` | edit | 770 | docx (single) |
| `pdf.sign` | edit | 770 | pdf (single) |
| `viewer.print` | share | 640 | markdown, html, docx, text |
| `data.convert` | convert | 750 | json, yaml, toml (single) |
| `doc.convert` | convert | 680 | pdf, docx, markdown, html (single) |
| `sheet.convert` | convert | 700 | sheet (single) |
| `image.convert` | convert | 850 | image (single) |
| `data.encode` | convert | 300 | any single |
| `image.transform` | transform | 740 | image (single) |
| `text.case` | transform | 380 | textual (single) |
| `text.regex` | transform | 380 | textual (single) |
| `pdf.merge` | transform | 1000 | ≥2 pdf |
| `pdf.split` | transform | 600 | pdf (single) |
| `text.diff` | analyze | 1000 | ≥2 comparable |
| `text.count` | analyze | 420 | textual (single) |
| `data.hash` | analyze | 300 | any single |
| `image.strip` | secure | 560 | image (single) |
| `qr.generate` | create | 320 | empty, or textual single |
| `qr.scan` | create | 600 | empty, or image single |

Inference (`suggestOperation`): 2 PDFs→`pdf.merge`; 2 texts→`text.diff`;
1 image→`image.convert`; 1 pdf/json/sheet/markdown→`viewer.view`; empty→null.
`PRIMARY_COUNT = 4`. Any selection containing a PDF is limited to
`viewer.view`, `pdf.merge`, `pdf.split`, `pdf.sign` (`PDF_CAPABILITIES`).
`book.read` (view, 900) opens `.epub` assets in `EpubReader`; `viewer.view`
excludes EPUB. `data.uuid` matches only an empty selection, and `text.diff`
also matches an empty selection (two typed texts) — together with the QR pair
these are the empty screen's "Start without a file" row.

**Wired operations:** every capability in the table. Fixed per-capability
props (e.g. the image `defaultTask`) live in `operationDefaults()` in
`operations.ts`, not in the shell.

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
    TextOperations.tsx  ConvertOperations.tsx  QrOperations.tsx
    PdfOperations.tsx   ImageOperations.tsx   ViewerOperations.tsx  (view/edit/convert/print)
    DocxOperations.tsx  (docx.edit)  PdfSignOperations.tsx  (pdf.sign)
tests/workbench/
  asset.test.ts  capabilities.test.ts  kinds.test.ts
  editor.test.ts  editor-toolbar.test.tsx  source-editor.test.tsx
  text-operations.test.tsx  convert-operations.test.tsx
  qr-operations.test.tsx    pdf-operations.test.tsx
  image-operations.test.tsx viewer-operations.test.tsx
  docx-operations.test.tsx  docx-write.test.ts
  pdf-sign-operations.test.tsx  workbench-app.test.tsx
src/lib/viewer/load.ts                 (LoadedDocument + loadDocument)
src/components/viewer/DocumentPane.tsx (document renderer used by viewer.view)
src/components/apps/EpubReader.tsx     (reader; takes the workbench asset)
src/components/workbench/operations/ReaderOperations.tsx (book.read)
src/pages/tools.astro  (mounts <WorkbenchApp client:load />)
```

## 11. Next immediate action

Phases 0–3 are complete and the PDF scope is final (View, Merge, Split, Sign).

The open follow-ups are all §6e items (shared `useSeedAssets`,
cancellation guards, an axe smoke test for the shell, and a dedicated
“Unsaved changes” i18n key for the toolbar badge).
