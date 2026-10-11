# Workbench UX plan — the seven fixes

Companion to `workbench-review.md` (§5) and `handoff.md` §6e. Every item names
the files to touch and the new/changed `wb` i18n keys. Order: 3 → 7 → 4 → 5 →
6 → 2 → 1 (language and small chips first, the output stage last and alone).

---

## 1. The output stage (results take the stage)

Today `handleProduce` appends to `outputs` and `OutputTray` renders N rows × 3
buttons. Reshape into a **stage + tray**:

**New `src/components/workbench/ResultStage.tsx`** (rendered by the shell right
under the tab panel, above the tray):

- Shell state: `const [produced, setProduced] = useState<OutputEntry | null>(null)`.
  `handleProduce` sets `produced` to the newest entry (and still appends to the
  outputs list). Selecting a new file / switching tabs does **not** clear it —
  the stage persists until the user acts on it or produces a new result.
- Layout: panel with the produced name as the headline (large, `text-lg`),
  kind + size as the subline, a thumbnail (see item 6's `OutputThumb`),
  one **primary** `Download` button, one secondary `Open` (renamed from
  "Open as a new asset"), one × remove. Remove from the stage also removes the
  tray entry.
- **Batch runs**: when an operation publishes more than one output (image
  batch, split), the shell groups by run: tag each entry with `runId`
  (increment a ref counter in `handleProduce` when `outputs` was empty or the
  active capability changed). The stage shows the first result with a
  `+N more` chip; below it two actions: `Download` (first) and **`Download all`**
  — zip via the existing `fflate` dep (`zipSync`, one entry per output, archive
  named `<capability>-<timestamp>.zip`). "Open" in batch mode opens the first.
- The tray below shrinks to an audit list: name · size · thumb · single icon
  button per row (download icon, open icon, ×), plus the same `Download all`
  in its header when >1. No repeated text buttons.

**i18n**: `downloadAll` ("Download all" / «Скачать все»), `andMore`
("+{count} more" / «ещё {count}»), `result` ("Result" / «Результат»),
rename `openAsAsset` → `openAsFile` (see item 3).

**Tests** (`workbench-app.test.tsx`): stage appears with the produced name and
primary Download; second produce replaces the stage; batch produces the
`+N more` chip and `Download all`; remove from stage clears it.

---

## 2. Unsaved work: forgive, then confirm

Two tiers; ship tier A now, tier B when convenient.

**Tier A — in-app confirm sheet (replaces `window.confirm`).**

- Shell state: `const [pending, setPending] = useState<null | { run: () => void }>()`.
  `confirmLeave()` becomes `requestLeave(run)`: if clean → `run()`; if dirty →
  `setPending({ run })` instead of blocking.
- New `ConfirmSheet` (same file or `src/components/workbench/ConfirmSheet.tsx`):
  bottom sheet / centered dialog, `role="dialog"` + `aria-modal`, ESC and
  backdrop click = cancel, focus moves to the first button. Copy:
  - Heading: `unsavedTitle` — "Unsaved changes in {action}" (action = active
    capability label).
  - Body: `unsavedBody` — "Your edits are kept only in this browser tab."
  - Buttons: **`keepEditing`** (primary, default) · **`discardAndContinue`**
    (danger, runs `pending.run`).
- Note the inversion vs `window.confirm`: the default/primary is *keep*, and
  destructive is visually secondary. `beforeunload` stays as is (the browser
  owns that dialog's text).
- Return-to-tab drafts are still lost on unmount — that is what tier B fixes.

**Tier B (optional, later) — drafts survive tab switches.** Key
`EditSession`s by `operationKey` in shell state (a `Map` passed down as an
`initialSession` prop to the edit operations). Then leaving a tab never asks —
the draft is simply still there when you come back — and the sheet is only
needed for remove/clear (true destruction). Do not attempt in the same pass as
tier A.

**i18n**: `unsavedTitle`, `unsavedBody`, `keepEditing`, `discardAndContinue`
(en + ru). Drop `discardChanges` (its copy moves into the new keys).

**Tests**: dirty + tab switch → sheet visible, no `window.confirm`; cancel
keeps tab and dirty state; discard switches; ESC cancels; `beforeunload` still
registered while dirty.

---

## 3. Speak the user's language — no "asset"

Pure i18n sweep, no logic changes. Keys in `src/lib/workbench/i18n.ts`:

| key | now | becomes (en / ru) |
|---|---|---|
| `assets` | "Assets" / «Файлы»(check) | "Files" / «Файлы» |
| `openAsAsset` | "Open as a new asset" | "Open as a file" / «Открыть как файл» |
| `removeAsset`-style aria | "Remove {name}" — keep, it's already user-speak | — |
| `empty` | check wording for "asset" | rephrase around files |

Grep the whole `src/` for `asset` in user-visible strings (`rg '"[^"]*asset' i18n
files, plus any inline label`) — component props may say asset, that's fine;
only rendered copy matters. Update the two test assertions that key on
`openAsAsset` (e.g. `workbench-app.test.tsx:267`).

---

## 4. Show who is in the set

Set actions must be legible from the tray. The shell already computes
`current.assets` — surface it:

- `WorkbenchApp` derives `setMembers: ReadonlySet<string>` =
  `new Set(current.assets.map(a => a.id))` when `current?.capability.set` is
  truthy, else empty; passes it plus `activeId` to `AssetTray`.
- `AssetTray` renders a **badge** on member rows, left of the name:
  - `text.diff` → `A` / `B` in tray order (the order `capabilitiesFor`
    produces, which is the order the Compare panes use).
  - `pdf.merge` → `1..n` (matches the merge operation's up/down ordering).
  - `image.edit` → a small "in batch" chip is enough (no order semantics).
  - Non-member rows show nothing — absence is the information.
- Clicking a member row still selects it (file capabilities still apply);
  clicking a non-member while dirty hits the sheet from item 2 — unchanged.

**i18n**: one key `inBatch` ("in batch" / «в пакетной обработке»); A/B/numbers
are plain text, no keys.

**Tests** (`workbench-app.test.tsx`): two texts open → rows show A and B;
third text → still A/B on first two; mixed pdf+text → pdf row has no badge on
the Compare tab.

---

## 5. Paste lands where the intent is

One-line behavioral change plus a guard, in `WorkbenchApp.addText`:

```ts
const addText = (text: string) => {
  if (text === "") return;
  addAssets([createAssetFromText("paste.txt", text)]);
  // Empty screen: pasted text almost always wants Compare — the starter is
  // right there. Open stays one click away in the tab row.
  if (empty && !dirtyRef.current) setActiveId("text.diff");
};
```

- `empty` is already in scope (derived state); `dirtyRef` keeps the pin rule.
- No change needed for the non-empty case: pasting a second textual file makes
  Compare a set of exactly 2 with weight 1000 ≥ `doc.open` 800, so the default
  tab already becomes Compare.
- Guard `setActiveId("text.diff")` with a check that `text.diff` is actually
  in `STARTERS` (it is; the check keeps the code honest if the registry ever
  changes).
- Edge: `paste.txt` names collide across two pastes — `createAssetFromText`
  already assigns unique ids; leave names as is.

**Tests**: empty screen + paste → active tab is `text.diff` and the diff pane
seeds side A from `paste.txt`; paste while an edit is dirty → tab stays pinned.

---

## 6. Rows are visual: thumbnails and kind icons

New `src/components/workbench/AssetThumb.tsx` used by both trays:

- `kind === "image"` → 40×40 rounded thumbnail: `useEffect` creates an object
  URL from `new Blob([await asset.bytes()])`, `URL.revokeObjectURL` on
  unmount/change; `<img>` with explicit size + alt="".
- every other kind → a glyph chip (lucide icon on a tinted background):
  `FileText` (pdf/docx/text/md/html), `Table` (sheet), `Braces` (json/yaml/toml),
  `BookOpen` (epub), `FileQuestion` (binary).
- Use in `AssetTray` rows and `OutputTray`/stage rows (`OutputThumb` variant
  keyed on the output's `kind`/`type` — image outputs get real thumbs too).

**Tests**: jsdom can't decode images, but the `<img>` with a `blob:` src is
assertable; glyph branch asserts the icon renders.

---

## 7. Verbs over nouns, and a quiet loading state

- `capabilities.ts` — rename `image.edit` label: "Image" → **"Edit image"**
  (ru: «Редактировать изображения» or «Обработать изображения» — pick one and
  keep the hint reading "add one more file to unlock Edit image"). Check the
  other labels while there: "Read", "Open", "Compare", "Merge PDFs",
  "Split", "Sign", "Create QR code" are already verbs — good.
- `OperationHost` loading: replace the plain `<p>Loading</p>` with a skeleton
  row (two rounded bars, subtle pulse, `aria-busy="true"`, the i18n string
  moved to an `sr-only` span so a11y text remains). No layout shift: reserve
  roughly the height of a typical toolbar.

**i18n**: keep `loading` (now sr-only), no new keys; label change lives in
`capabilities.ts`, but legacy image tool tests may assert the old label —
update those assertions.

---

## Verification

```sh
npx tsc --noEmit
npx vitest run tests/workbench
npm test            # full suite, before integrating
npm run build
```

Suggested commit split: 1) i18n sweep (item 3), 2) labels + loading (7),
3) set badges (4), 4) paste intent (5), 5) thumbs (6), 6) confirm sheet (2A),
7) output stage (1). Each green before the next.
