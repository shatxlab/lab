/**
 * `doc.open` — one place to look at a document, edit it and save copies.
 *
 * Preview renders the document (with Save as ▾ for the export formats and
 * Print for page-like documents); Edit swaps in the matching editor (JSON
 * tree, spreadsheet grid, source editor, Word rich text). The two never
 * disagree silently: while an edit is unsaved, Preview is locked and the
 * shell is told through `onDirtyChange`.
 *
 * Saving always produces a copy in the Outputs tray; the original file is
 * never modified.
 */

import * as React from "react";

import { DocumentPane } from "@/components/viewer/DocumentPane";
import { JsonView } from "@/components/viewer/viewers/JsonView";
import { SheetView, type SheetViewHandle } from "@/components/viewer/viewers/SheetView";
import { MenuButton, type MenuItem } from "@/components/tools/MenuButton";
import { ActionButton } from "@/components/tools/ui";
import { DocxEditPane } from "@/components/workbench/operations/DocxOperations";
import { EditorToolbar } from "@/components/workbench/EditorToolbar";
import { SourceEditor, type SourceEditorLanguage } from "@/components/workbench/SourceEditor";
import type { AppLang } from "@/lib/apps/lang";
import { convertData, parseData, type DataFormat } from "@/lib/convert/data";
import {
  baseFileName,
  htmlToMarkdown,
  htmlToText,
  rowsToXlsx,
  sheetDataToCsv,
  sheetDataToJson,
  standaloneHtml,
  workbookSheetToCsv,
  workbookSheetToJson,
  workbookToXlsx,
} from "@/lib/viewer/export";
import { fileExtension, resolveFileKind, type FileKind } from "@/lib/viewer/file-kind";
import { t } from "@/lib/viewer/i18n";
import { prettifyJson } from "@/lib/viewer/json";
import { loadDocument, type LoadedDocument } from "@/lib/viewer/load";
import { printDocument } from "@/lib/viewer/print";
import { columnLabel, workbookToSheets } from "@/lib/viewer/sheet";
import { applyEdits, serializeWorkbook, type SheetEdit, type SheetJsWriter } from "@/lib/viewer/sheet-edit";
import { cn } from "@/lib/viewer/utils";
import type { Asset } from "@/lib/workbench/asset";
import { createEditSession, type EditSession } from "@/lib/workbench/editor";
import { wb } from "@/lib/workbench/i18n";
import { isDataAssetKind, type AssetKind } from "@/lib/workbench/kinds";
import type { OperationOutput, OperationProps } from "@/lib/workbench/operation";

export type ViewerDocumentState =
  | { status: "loading" }
  | { status: "ready"; doc: LoadedDocument; fileKind: FileKind }
  | { status: "error"; message: string };

/** The viewer's own taxonomy is narrower than the workbench's. */
const ASSET_TO_FILE_KIND: Record<AssetKind, FileKind> = {
  pdf: "pdf",
  docx: "docx",
  markdown: "markdown",
  html: "html",
  text: "text",
  json: "json",
  yaml: "text",
  toml: "text",
  sheet: "sheet",
  image: "image",
  epub: "unsupported",
  binary: "unsupported",
};

/**
 * The asset kind is coarse (yaml and toml are just "text" to the viewer), so
 * a filename the viewer recognizes wins. An unsupported mapping stays
 * unsupported.
 */
function fileKindForAsset(asset: Asset, bytes: Uint8Array): FileKind {
  const mapped = ASSET_TO_FILE_KIND[asset.kind];
  if (mapped === "unsupported") return mapped;
  const resolved = resolveFileKind(asset.name, bytes);
  if (resolved === "legacy-doc" || resolved === "unsupported") return mapped;
  return resolved;
}

/**
 * Load an asset into the viewer's document model, keyed on the asset alone:
 * a language switch must not re-parse the document and unmount an edit pane
 * holding an unsaved draft. Errors still use the live language.
 */
export function useViewerDocument(asset: Asset | null, lang: AppLang): ViewerDocumentState {
  const [state, setState] = React.useState<ViewerDocumentState>({ status: "loading" });
  const langRef = React.useRef(lang);
  langRef.current = lang;

  React.useEffect(() => {
    if (!asset) {
      setState({ status: "loading" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        const bytes = await asset.bytes();
        const kind = fileKindForAsset(asset, bytes);
        if (kind === "legacy-doc" || kind === "unsupported") {
          if (!cancelled) {
            setState({
              status: "error",
              message: t(langRef.current, kind === "legacy-doc" ? "cannotOpenDoc" : "unsupportedType"),
            });
          }
          return;
        }
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const doc = await loadDocument(buffer, kind, asset.extension);
        if (!cancelled) setState({ status: "ready", doc, fileKind: kind });
      } catch (error) {
        if (!cancelled) {
          setState({ status: "error", message: error instanceof Error ? error.message : t(langRef.current, "couldNotRead") });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [asset]);

  return state;
}

/** Stable empty edit list so DocumentPane's sheet memo does not re-derive. */
const EMPTY_EDITS: SheetEdit[] = [];

/**
 * `EditSession` dirty/coalesce equality for a sheet draft: cell edits are an
 * unordered set keyed by `sheetName` + `addr`, so order is irrelevant and a
 * re-typed cell replaces its earlier entry.
 */
function sheetEditEquals(a: readonly SheetEdit[], b: readonly SheetEdit[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const key = (edit: SheetEdit) => `${edit.sheetName}\u0000${edit.addr}`;
  const byCell = new Map(a.map((edit) => [key(edit), edit.value]));
  return b.every((edit) => byCell.has(key(edit)) && byCell.get(key(edit)) === edit.value);
}

/** Book types that can be written back as themselves; everything else converts. */
const SAVABLE_BOOK_TYPES = new Set(["xlsx", "xlsm"]);

const BOOK_MIME_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
};

/** Document kinds the browser's print dialog lays out as pages. */
const PRINTABLE_KINDS: ReadonlySet<string> = new Set(["markdown", "html", "docx", "text"]);

const DATA_FORMAT_LABEL: Record<DataFormat, string> = { json: "JSON (.json)", yaml: "YAML (.yaml)", toml: "TOML (.toml)" };
const DATA_FORMAT_MIME: Record<DataFormat, string> = { json: "application/json", yaml: "text/yaml", toml: "application/toml" };
const DATA_FORMATS: readonly DataFormat[] = ["json", "yaml", "toml"];

/** Produce an output; resolves `true` once something was actually published. */
type Emit = (build: () => Promise<OperationOutput | null>) => Promise<boolean>;

const utf8 = (text: string) => new TextEncoder().encode(text);

/** Whether Edit mode has an editor for this document. */
function canEdit(doc: LoadedDocument): boolean {
  if (doc.kind === "sheet") return doc.workbook !== null && doc.workbook !== undefined;
  return doc.kind === "json" || doc.kind === "text" || doc.kind === "markdown" || doc.kind === "html" || doc.kind === "docx";
}

/** The Save as ▾ entries Preview offers for a document. */
function exportItems({
  lang,
  asset,
  doc,
  sheetName,
  emit,
  onError,
}: {
  lang: AppLang;
  asset: Asset;
  doc: LoadedDocument;
  sheetName: string | null;
  emit: Emit;
  onError: (message: string) => void;
}): MenuItem[] {
  const base = baseFileName(asset.name);
  const item = (id: string, label: string, build: () => Promise<OperationOutput | null>): MenuItem => ({
    id,
    label,
    onSelect: () => void emit(build),
  });

  if (doc.kind === "sheet") {
    const name = sheetName ?? doc.sheets[0]?.name ?? "Sheet1";
    const sheet = doc.sheets.find((entry) => entry.name === name) ?? doc.sheets[0];
    const suffix = doc.sheets.length > 1 ? `-${name.replace(/[\\/:*?"<>|]+/g, "_")}` : "";
    const workbook = doc.workbook;
    const items = [
      item("csv", t(lang, "exportCsv"), async () => ({
        name: `${base}${suffix}.csv`,
        type: "text/csv;charset=utf-8",
        bytes: utf8(workbook ? await workbookSheetToCsv(workbook, name) : sheet ? sheetDataToCsv(sheet) : ""),
      })),
      item("json", t(lang, "exportJsonSheet"), async () => ({
        name: `${base}${suffix}.json`,
        type: "application/json",
        bytes: utf8(workbook ? await workbookSheetToJson(workbook, name) : sheet ? sheetDataToJson(sheet) : "[]"),
      })),
    ];
    if (!SAVABLE_BOOK_TYPES.has(asset.extension)) {
      items.push(
        item("xlsx", t(lang, "exportXlsx"), async () => ({
          name: `${base}.xlsx`,
          type: BOOK_MIME_TYPES.xlsx!,
          bytes: workbook ? await workbookToXlsx(workbook) : await rowsToXlsx(doc.sheets),
          kind: "sheet",
        })),
      );
    }
    return items;
  }

  if (doc.kind === "markdown" || doc.kind === "html" || doc.kind === "docx") {
    const items = [
      item("html", t(lang, "exportHtml"), async () => ({
        name: `${base}.html`,
        type: "text/html;charset=utf-8",
        bytes: utf8(standaloneHtml(base, doc.html, lang)),
      })),
    ];
    if (doc.kind !== "markdown") {
      items.push(
        item("md", t(lang, "exportMarkdown"), async () => ({
          name: `${base}.md`,
          type: "text/markdown;charset=utf-8",
          bytes: utf8(`${htmlToMarkdown(doc.html)}\n`),
        })),
      );
    }
    items.push(
      item("txt", t(lang, "exportText"), async () => ({
        name: `${base}.txt`,
        type: "text/plain;charset=utf-8",
        bytes: utf8(`${htmlToText(doc.html)}\n`),
      })),
    );
    return items;
  }

  // JSON, YAML and TOML convert into each other.
  if (isDataAssetKind(asset.kind)) {
    const from = asset.kind;
    return DATA_FORMATS.filter((format) => format !== from).map((to) =>
      item(to, DATA_FORMAT_LABEL[to], async () => {
        try {
          const text = convertData(from, to, await asset.text(), { indent: 2, sortKeys: false });
          return { name: `${base}.${to}`, type: DATA_FORMAT_MIME[to], bytes: utf8(text), kind: to };
        } catch (error) {
          onError(error instanceof Error ? error.message : String(error));
          return null;
        }
      }),
    );
  }

  return [];
}

type Mode = "preview" | "edit";

export function OpenOperation({ lang, assets, onProduce, onDirtyChange }: OperationProps) {
  const asset = assets[0] ?? null;
  const state = useViewerDocument(asset, lang);
  const [mode, setMode] = React.useState<Mode>("preview");
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sheetName, setSheetName] = React.useState<string | null>(null);
  const sheetRef = React.useRef<SheetViewHandle | null>(null);
  const noop = React.useCallback(() => {}, []);

  React.useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const emit = React.useCallback<Emit>(
    async (build) => {
      setError(null);
      try {
        const output = await build();
        if (!output) return false;
        onProduce?.(output);
        return true;
      } catch (err) {
        console.error("Save failed", err);
        setError(t(lang, "exportFailed"));
        return false;
      }
    },
    [lang, onProduce],
  );

  if (!asset) return null;
  if (state.status === "loading") {
    return (
      <p role="status" className="px-2 py-6 text-center text-sm text-(--muted-fg)">
        {t(lang, "readingFile")}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="px-2 py-6 text-center text-sm text-(--warning)">
        {state.message}
      </p>
    );
  }

  const doc = state.doc;
  const editable = canEdit(doc);
  const editing = editable && mode === "edit";
  const saveAs = editing ? [] : exportItems({ lang, asset, doc, sheetName, emit, onError: setError });
  const printable = !editing && PRINTABLE_KINDS.has(doc.kind);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {(editable || saveAs.length > 0 || printable) && (
        <div className="flex flex-wrap items-center gap-2" data-no-print="">
          {editable && (
            <div role="group" aria-label={wb(lang, "mode")} className="inline-flex rounded-md border border-(--border) p-0.5">
              {(["preview", "edit"] as const).map((id) => {
                const locked = id === "preview" && dirty;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={mode === id}
                    disabled={locked}
                    title={locked ? wb(lang, "previewLocked") : undefined}
                    onClick={() => setMode(id)}
                    className={cn(
                      "h-7 rounded px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) disabled:cursor-not-allowed disabled:opacity-50",
                      mode === id ? "bg-(--accent)/10 text-(--accent)" : "text-(--muted-fg) hover:text-(--fg)",
                    )}
                  >
                    {wb(lang, id === "preview" ? "modePreview" : "modeEdit")}
                  </button>
                );
              })}
            </div>
          )}
          {saveAs.length > 0 && <MenuButton label={wb(lang, "saveAs")} menuLabel={wb(lang, "saveAs")} items={saveAs} />}
          {printable && (
            <ActionButton variant="secondary" onClick={() => printDocument(baseFileName(asset.name))}>
              {t(lang, "printPdf")}
            </ActionButton>
          )}
        </div>
      )}

      {editing ? (
        <>
          {doc.kind === "json" && <JsonEditPane key={asset.id} lang={lang} asset={asset} doc={doc} emit={emit} onDirty={setDirty} />}
          {doc.kind === "sheet" && <SheetEditPane key={asset.id} lang={lang} asset={asset} doc={doc} emit={emit} onDirty={setDirty} />}
          {doc.kind === "text" && (
            <SourceEditPane key={asset.id} lang={lang} asset={asset} initial={doc.text} format="text" emit={emit} onDirty={setDirty} />
          )}
          {(doc.kind === "markdown" || doc.kind === "html") && (
            <SourceEditPane key={asset.id} lang={lang} asset={asset} initial={doc.source} format={doc.kind} emit={emit} onDirty={setDirty} />
          )}
          {doc.kind === "docx" && <DocxEditPane key={asset.id} lang={lang} asset={asset} doc={doc} emit={emit} onDirty={setDirty} />}
        </>
      ) : (
        <div className="min-h-0 flex-1" data-print-flow="">
          <DocumentPane
            lang={lang}
            doc={doc}
            fileName={asset.name}
            edits={EMPTY_EDITS}
            jsonEdit={null}
            sheetRef={sheetRef}
            resetKey={asset.id}
            jsonResetKey={asset.id}
            onActiveSheet={setSheetName}
            onPdfLoaded={noop}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-(--warning)/40 bg-(--warning)/10 p-3 text-sm text-(--warning)">
          {error}
        </p>
      )}
    </div>
  );
}

/** Report a session's dirty flag after every render that might change it. */
function useReportDirty(dirty: boolean, onDirty: (dirty: boolean) => void): void {
  React.useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  // An unmounted editor holds no draft.
  React.useEffect(() => () => onDirty(false), [onDirty]);
}

/* --------------------------------------------------------------- editors */

/** A source editor's output shape; it also drives the MIME type and file kind. */
type SourceFormat = "text" | "markdown" | "html";

/** The asset's real extension when it has one, else the format's usual one. */
function sourceExtension(asset: Asset, format: SourceFormat): string {
  if (asset.extension) return asset.extension;
  return format === "markdown" ? "md" : format === "html" ? "html" : "txt";
}

function sourceMime(format: SourceFormat, extension: string): string {
  if (format === "markdown") return "text/markdown;charset=utf-8";
  if (format === "html") return "text/html;charset=utf-8";
  // The loader maps YAML and TOML assets to the viewer's plain-text kind, so
  // the real extension is the only remaining hint at their format.
  if (extension === "yaml" || extension === "yml") return "text/yaml";
  if (extension === "toml") return "application/toml";
  return "text/plain;charset=utf-8";
}

/**
 * JSON: `JsonView` owns its text draft and reports every valid parse through
 * `onApply`; the session keeps that draft plus an undo history. `JsonView`
 * only resyncs from `resetKey`, so `revision` changes on undo/redo/discard —
 * never on a plain apply, which would reformat the text under the caret.
 */
function JsonEditPane({
  lang,
  asset,
  doc,
  emit,
  onDirty,
}: {
  lang: AppLang;
  asset: Asset;
  doc: Extract<LoadedDocument, { kind: "json" }>;
  emit: Emit;
  onDirty: (dirty: boolean) => void;
}) {
  const sessionRef = React.useRef<EditSession<unknown> | null>(null);
  if (sessionRef.current === null) {
    sessionRef.current = createEditSession<unknown>({
      initial: doc.value,
      formats: [{ id: "json", extension: "json", mime: "application/json" }],
      serialize: (value) => `${prettifyJson(value)}\n`,
    });
  }
  const session = sessionRef.current;
  /** Re-render after a session mutation; `revision` also resyncs `JsonView`. */
  const [, setVersion] = React.useState(0);
  const [revision, setRevision] = React.useState(0);
  const [invalid, setInvalid] = React.useState(false);
  const bump = React.useCallback(() => setVersion((current) => current + 1), []);
  const handleError = React.useCallback((error: string | null) => setInvalid(error !== null), []);

  const handleApply = React.useCallback(
    (next: unknown) => {
      // Coalesce keystrokes: one continuous edit is a single undo step.
      session.set(next, { coalesce: true });
      bump();
    },
    [session, bump],
  );

  const handleRevert = React.useCallback(() => {
    session.revert();
    setRevision((current) => current + 1);
    bump();
  }, [session, bump]);

  const handleUndo = React.useCallback(() => {
    session.undo();
    setRevision((current) => current + 1);
    bump();
  }, [session, bump]);

  const handleRedo = React.useCallback(() => {
    session.redo();
    setRevision((current) => current + 1);
    bump();
  }, [session, bump]);

  const handleSave = React.useCallback(() => {
    void emit(async () => {
      const output = session.output("json");
      return {
        name: output.name(`${baseFileName(asset.name)}-edited`),
        type: output.mime,
        bytes: output.bytes,
        kind: "json",
      };
    }).then((saved) => {
      if (!saved) return;
      session.markSaved();
      bump();
    });
  }, [asset.name, emit, session, bump]);
  useReportDirty(session.dirty, onDirty);

  return (
    <>
      <EditorToolbar
        lang={lang}
        dirty={session.dirty}
        canUndo={session.canUndo}
        canRedo={session.canRedo}
        formats={session.formats}
        activeFormat="json"
        canSave={!invalid}
        onSave={handleSave}
        onRevert={handleRevert}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
      <div className="min-h-0 flex-1">
        <JsonView
          lang={lang}
          value={session.value}
          resetKey={`${asset.id}:${revision}`}
          onApply={handleApply}
          onRevert={handleRevert}
          onError={handleError}
        />
      </div>
    </>
  );
}

/**
 * Sheets: edits accumulate as one entry per cell (re-editing a cell replaces
 * its earlier entry) in an `EditSession`, so the toolbar's undo/redo/discard
 * move the draft. They are re-applied to the pristine workbook on every
 * render, so discarding is just dropping the list.
 */
function SheetEditPane({
  lang,
  asset,
  doc,
  emit,
  onDirty,
}: {
  lang: AppLang;
  asset: Asset;
  doc: Extract<LoadedDocument, { kind: "sheet" }>;
  emit: Emit;
  onDirty: (dirty: boolean) => void;
}) {
  const workbook = doc.workbook;
  const extension = fileExtension(asset.name);
  const bookType: "xlsx" | "xlsm" = SAVABLE_BOOK_TYPES.has(extension) ? (extension as "xlsx" | "xlsm") : "xlsx";

  const sessionRef = React.useRef<EditSession<SheetEdit[]> | null>(null);
  if (sessionRef.current === null) {
    sessionRef.current = createEditSession<SheetEdit[]>({
      initial: EMPTY_EDITS,
      formats: [{ id: "xlsx", extension: "xlsx", mime: BOOK_MIME_TYPES[bookType]! }],
      // Saving a workbook is asynchronous (`await import("xlsx")`) and stays a
      // custom `onSave` below; `EditSession.serialize` is synchronous and unused.
      serialize: (value) => String(value.length),
      equals: sheetEditEquals,
    });
  }
  const session = sessionRef.current;
  /** Re-render after a session mutation; also re-derives the sheet rows. */
  const [version, setVersion] = React.useState(0);
  const bump = React.useCallback(() => setVersion((current) => current + 1), []);

  const sheets = React.useMemo(
    () => (workbook ? workbookToSheets(applyEdits(workbook, session.value)) : doc.sheets),
    // `session.value` is a mutable ref, so `version` is the change signal.
    [workbook, doc.sheets, session, version],
  );

  const sheetRef = React.useRef<SheetViewHandle | null>(null);

  const commitCellEdit = React.useCallback(
    (sheetName: string, addr: string, value: string | number | null) => {
      const next = [
        ...session.value.filter((edit) => !(edit.sheetName === sheetName && edit.addr === addr)),
        { sheetName, addr, value },
      ];
      // Coalesce: a run of cell edits is one undo step back to the original.
      session.set(next, { coalesce: true });
      bump();
    },
    [session, bump],
  );

  const addRow = React.useCallback(
    (sheetName: string) => {
      // One past the current range, so writing the blank cell grows `!ref`.
      const sheet = sheets.find((entry) => entry.name === sheetName);
      const startColumn = sheet?.range?.startColumn ?? 0;
      const endRow = sheet?.range?.endRow ?? -1;
      commitCellEdit(sheetName, `${columnLabel(startColumn)}${endRow + 2}`, "");
    },
    [sheets, commitCellEdit],
  );

  const handleRevert = React.useCallback(() => {
    session.revert();
    bump();
  }, [session, bump]);

  const handleUndo = React.useCallback(() => {
    session.undo();
    bump();
  }, [session, bump]);

  const handleRedo = React.useCallback(() => {
    session.redo();
    bump();
  }, [session, bump]);

  const handleSave = React.useCallback(() => {
    void emit(async () => {
      if (!workbook) return null;
      const XLSX = await import("xlsx");
      const bytes = serializeWorkbook(
        XLSX as unknown as SheetJsWriter,
        applyEdits(workbook, session.value),
        bookType,
      );
      return {
        name: `${baseFileName(asset.name)}-edited.${bookType}`,
        type: BOOK_MIME_TYPES[bookType]!,
        bytes,
        kind: "sheet",
      };
    }).then((saved) => {
      if (!saved) return;
      session.markSaved();
      bump();
    });
  }, [asset.name, bookType, emit, session, workbook, bump]);
  useReportDirty(session.dirty, onDirty);

  return (
    <>
      <EditorToolbar
        lang={lang}
        dirty={session.dirty}
        canUndo={session.canUndo}
        canRedo={session.canRedo}
        formats={session.formats}
        activeFormat="xlsx"
        onSave={handleSave}
        onRevert={handleRevert}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
      <div className="min-h-0 flex-1">
        <SheetView
          ref={sheetRef}
          lang={lang}
          sheets={sheets}
          resetKey={asset.id}
          onEditCell={workbook ? commitCellEdit : undefined}
          onAddRow={workbook ? addRow : undefined}
        />
      </div>
    </>
  );
}

/** Maps an asset to the syntax the source editor should colourise. */
function sourceLanguage(asset: Asset, format: SourceFormat): SourceEditorLanguage {
  if (format === "markdown") return "markdown";
  if (format === "html") return "html";
  switch (asset.extension) {
    case "md":
    case "markdown":
    case "mdx":
      return "markdown";
    case "html":
    case "htm":
    case "xhtml":
      return "html";
    case "yaml":
    case "yml":
      return "yaml";
    case "toml":
      return "toml";
    default:
      return "text";
  }
}

/** Text/Markdown/HTML: a plain controlled source editor over the raw text. */
function SourceEditPane({
  lang,
  asset,
  initial,
  format,
  emit,
  onDirty,
}: {
  lang: AppLang;
  asset: Asset;
  initial: string;
  format: SourceFormat;
  emit: Emit;
  onDirty: (dirty: boolean) => void;
}) {
  const [session] = React.useState(() => {
    const extension = sourceExtension(asset, format);
    return createEditSession<string>({
      initial,
      formats: [{ id: format, extension, mime: sourceMime(format, extension) }],
      serialize: (text) => text,
    });
  });
  const [value, setValue] = React.useState(session.value);
  /** Re-render after a save so the toolbar's dirty state follows the baseline. */
  const [, setSavedAt] = React.useState(0);
  const language = sourceLanguage(asset, format);
  // YAML and TOML are checked like JSON: a draft that does not parse cannot be saved.
  const checked = React.useDeferredValue(value);
  const error = React.useMemo(() => {
    if (language !== "yaml" && language !== "toml") return null;
    try {
      parseData(language, checked);
      return null;
    } catch (parseError) {
      return parseError instanceof Error ? parseError.message : String(parseError);
    }
  }, [language, checked]);

  const handleChange = React.useCallback(
    (next: string) => {
      // Coalesce keystrokes: one continuous edit is a single undo step.
      session.set(next, { coalesce: true });
      setValue(next);
    },
    [session],
  );

  const handleRevert = React.useCallback(() => {
    session.revert();
    setValue(session.value);
  }, [session]);

  const handleUndo = React.useCallback(() => {
    session.undo();
    setValue(session.value);
  }, [session]);

  const handleRedo = React.useCallback(() => {
    session.redo();
    setValue(session.value);
  }, [session]);

  const handleSave = React.useCallback(() => {
    void emit(async () => {
      const output = session.output(format);
      return {
        name: output.name(`${baseFileName(asset.name)}-edited`),
        type: output.mime,
        bytes: output.bytes,
        kind: format === "text" ? "text" : format,
      };
    }).then((saved) => {
      if (!saved) return;
      session.markSaved();
      setSavedAt((current) => current + 1);
    });
  }, [asset.name, emit, format, session]);
  useReportDirty(session.dirty, onDirty);

  return (
    <>
      <EditorToolbar
        lang={lang}
        dirty={session.dirty}
        canUndo={session.canUndo}
        canRedo={session.canRedo}
        formats={session.formats}
        activeFormat={format}
        canSave={error === null}
        onSave={handleSave}
        onRevert={handleRevert}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
      <SourceEditor value={value} onChange={handleChange} language={language} ariaLabel={t(lang, "source")} />
      {error && (
        <p role="alert" className="text-sm text-(--warning)">
          {error}
        </p>
      )}
    </>
  );
}
