/**
 * The viewer family: the read-only `viewer.view` operation, the editor
 * (`viewer.edit`), the document export operations (`doc.convert` /
 * `sheet.convert`) and `viewer.print`.
 *
 * Viewing and printing produce no output; editing and converting publish an
 * `OperationOutput` through `onProduce` (falling back to a download when the
 * operation is rendered standalone). All of them share
 * {@link useViewerDocument} so the asset → `FileKind` → `loadDocument`
 * pipeline lives in one place.
 */

import * as React from "react";

import { DocumentPane } from "@/components/viewer/DocumentPane";
import { JsonView } from "@/components/viewer/viewers/JsonView";
import { SheetView, type SheetViewHandle } from "@/components/viewer/viewers/SheetView";
import { EditorToolbar } from "@/components/workbench/EditorToolbar";
import { SourceEditor, type SourceEditorLanguage } from "@/components/workbench/SourceEditor";
import { ActionButton, FilePicker, SelectField } from "@/components/tools/ui";
import { saveBlob } from "@/lib/apps/file-open";
import type { AppLang } from "@/lib/apps/lang";
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
import { ACCEPTED_EXTENSIONS, fileExtension, resolveFileKind, type FileKind } from "@/lib/viewer/file-kind";
import { fileKindLabel, t } from "@/lib/viewer/i18n";
import { prettifyJson } from "@/lib/viewer/json";
import { loadDocument, type LoadedDocument } from "@/lib/viewer/load";
import { openPdf, pdfToText, PdfPasswordError } from "@/lib/viewer/pdf";
import { printDocument } from "@/lib/viewer/print";
import { columnLabel, workbookToSheets } from "@/lib/viewer/sheet";
import { applyEdits, serializeWorkbook, type SheetEdit, type SheetJsWriter } from "@/lib/viewer/sheet-edit";
import { createEditSession, type EditSession } from "@/lib/workbench/editor";
import { createAssetFromFile, type Asset } from "@/lib/workbench/asset";
import { wb } from "@/lib/workbench/i18n";
import type { AssetKind } from "@/lib/workbench/kinds";
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
 * Load an asset into the viewer's document model. Shared by every viewer
 * operation so detection, cancellation and the sliced `ArrayBuffer` behave
 * identically wherever a document is opened.
 */
export function useViewerDocument(asset: Asset | null, lang: AppLang): ViewerDocumentState {
  const [state, setState] = React.useState<ViewerDocumentState>({ status: "loading" });

  // Loading keys on the asset alone: a language switch must not re-parse the
  // document and unmount an edit pane holding an unsaved draft. Errors still
  // use the live language through this ref.
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

/** Kinds `viewer.print` can lay out for the browser's print dialog. */
const PRINTABLE_KINDS: ReadonlySet<string> = new Set(["markdown", "html", "docx", "text"]);

/** Reads a standalone operation's file into a local asset. */
function useLocalAsset(): [Asset | null, (file: File) => void] {
  const [asset, setAsset] = React.useState<Asset | null>(null);
  const pick = React.useCallback((file: File) => setAsset(createAssetFromFile(file)), []);
  return [asset, pick];
}

/** The shared picker standalone operations render when no asset is supplied. */
function ViewerFilePicker({ lang, onPick }: { lang: AppLang; onPick: (file: File) => void }) {
  return (
    <FilePicker
      lang={lang}
      accept={ACCEPTED_EXTENSIONS.join(",")}
      compact
      onFiles={(files) => {
        const file = files[0];
        if (file) onPick(file);
      }}
    />
  );
}

/* --------------------------------------------------------------- viewing */

export function ViewerViewOperation({ lang, assets }: OperationProps) {
  const standalone = assets.length === 0;
  const [localAsset, pickLocal] = useLocalAsset();
  const asset = assets[0] ?? localAsset;
  const state = useViewerDocument(asset, lang);
  const sheetRef = React.useRef<SheetViewHandle | null>(null);
  const noop = React.useCallback(() => {}, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {standalone && (
        <div className="mb-4">
          <ViewerFilePicker lang={lang} onPick={pickLocal} />
        </div>
      )}

      {asset && state.status === "loading" && (
        <p role="status" className="px-2 py-6 text-center text-sm text-(--muted-fg)">
          {t(lang, "readingFile")}
        </p>
      )}

      {asset && state.status === "error" && (
        <p role="alert" className="px-2 py-6 text-center text-sm text-(--warning)">
          {state.message}
        </p>
      )}

      {asset && state.status === "ready" && (
        <DocumentPane
          lang={lang}
          doc={state.doc}
          fileName={asset.name}
          edits={EMPTY_EDITS}
          jsonEdit={null}
          sheetRef={sheetRef}
          resetKey={asset.id}
          jsonResetKey={asset.id}
          onActiveSheet={noop}
          onPdfLoaded={noop}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ converting */

type Emit = (build: () => Promise<OperationOutput | null>) => Promise<void>;

export function ViewerConvertOperation({ lang, assets, onProduce }: OperationProps) {
  const standalone = assets.length === 0;
  const [localAsset, pickLocal] = useLocalAsset();
  const asset = assets[0] ?? localAsset;
  const state = useViewerDocument(asset, lang);
  const [error, setError] = React.useState<string | null>(null);

  // A message about the previous asset must not linger over the next one.
  React.useEffect(() => {
    setError(null);
  }, [asset?.id]);

  const emit = React.useCallback<Emit>(
    async (build) => {
      setError(null);
      try {
        const output = await build();
        if (!output) return;
        if (onProduce) onProduce(output);
        else saveBlob(new Blob([output.bytes.slice().buffer], { type: output.type }), output.name);
      } catch (err) {
        console.error("Export failed", err);
        setError(t(lang, "exportFailed"));
      }
    },
    [lang, onProduce],
  );

  return (
    <div className="flex flex-col gap-3">
      {standalone && (
        <div className="mb-4">
          <ViewerFilePicker lang={lang} onPick={pickLocal} />
        </div>
      )}

      {asset && state.status === "loading" && (
        <p role="status" className="px-2 py-6 text-center text-sm text-(--muted-fg)">
          {t(lang, "readingFile")}
        </p>
      )}

      {asset && state.status === "error" && (
        <p role="alert" className="px-2 py-6 text-center text-sm text-(--warning)">
          {state.message}
        </p>
      )}

      {asset && state.status === "ready" && (
        <div className="flex flex-wrap gap-2">
          {state.doc.kind === "sheet" && <SheetExportActions asset={asset} doc={state.doc} lang={lang} emit={emit} />}
          {(state.doc.kind === "markdown" || state.doc.kind === "html" || state.doc.kind === "docx") && (
            <DocumentExportActions asset={asset} doc={state.doc} lang={lang} emit={emit} />
          )}
          {state.doc.kind === "pdf" && (
            <PdfExportActions
              asset={asset}
              lang={lang}
              emit={emit}
              onEmpty={() => setError(t(lang, "pdfNoText"))}
              onPassword={(message) => setError(message)}
            />
          )}
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

function SheetExportActions({
  asset,
  doc,
  lang,
  emit,
}: {
  asset: Asset;
  doc: Extract<LoadedDocument, { kind: "sheet" }>;
  lang: AppLang;
  emit: Emit;
}) {
  const base = baseFileName(asset.name);
  const [sheetName, setSheetName] = React.useState(() => doc.sheets[0]?.name ?? "Sheet1");
  // Opening another workbook can drop the previously chosen sheet.
  React.useEffect(() => {
    setSheetName((current) =>
      doc.sheets.some((entry) => entry.name === current) ? current : doc.sheets[0]?.name ?? "Sheet1",
    );
  }, [doc]);
  const sheet = doc.sheets.find((entry) => entry.name === sheetName) ?? doc.sheets[0];
  const safe = sheetName.replace(/[\\/:*?"<>|]+/g, "_");
  const suffix = doc.sheets.length > 1 ? `-${safe}` : "";
  const workbook = doc.workbook;

  return (
    <div className="flex w-full flex-col gap-3">
      {doc.sheets.length > 1 && (
        <SelectField
          label={fileKindLabel("sheet", lang)}
          value={sheetName}
          onChange={setSheetName}
          options={doc.sheets.map((entry) => ({ value: entry.name, label: entry.name }))}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <ActionButton
          variant="secondary"
          onClick={() =>
            void emit(async () => {
              const text = workbook ? await workbookSheetToCsv(workbook, sheetName) : sheet ? sheetDataToCsv(sheet) : "";
              return {
                name: `${base}${suffix}.csv`,
                type: "text/csv;charset=utf-8",
                bytes: new TextEncoder().encode(text),
              };
            })
          }
        >
          {t(lang, "exportCsv")}
        </ActionButton>

        <ActionButton
          variant="secondary"
          onClick={() =>
            void emit(async () => {
              const text = workbook ? await workbookSheetToJson(workbook, sheetName) : sheet ? sheetDataToJson(sheet) : "[]";
              return {
                name: `${base}${suffix}.json`,
                type: "application/json",
                bytes: new TextEncoder().encode(text),
              };
            })
          }
        >
          {t(lang, "exportJsonSheet")}
        </ActionButton>

        {!SAVABLE_BOOK_TYPES.has(asset.extension) && (
          <ActionButton
            variant="secondary"
            onClick={() =>
              void emit(async () => ({
                name: `${base}.xlsx`,
                type: BOOK_MIME_TYPES.xlsx!,
                bytes: workbook ? await workbookToXlsx(workbook) : await rowsToXlsx(doc.sheets),
                kind: "sheet",
              }))
            }
          >
            {t(lang, "exportXlsx")}
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function DocumentExportActions({
  asset,
  doc,
  lang,
  emit,
}: {
  asset: Asset;
  doc: Extract<LoadedDocument, { kind: "markdown" | "html" | "docx" }>;
  lang: AppLang;
  emit: Emit;
}) {
  const base = baseFileName(asset.name);

  return (
    <>
      <ActionButton
        variant="secondary"
        onClick={() =>
          void emit(async () => ({
            name: `${base}.html`,
            type: "text/html;charset=utf-8",
            bytes: new TextEncoder().encode(standaloneHtml(base, doc.html, lang)),
          }))
        }
      >
        {t(lang, "exportHtml")}
      </ActionButton>

      {doc.kind !== "markdown" && (
        <ActionButton
          variant="secondary"
          onClick={() =>
            void emit(async () => ({
              name: `${base}.md`,
              type: "text/markdown;charset=utf-8",
              bytes: new TextEncoder().encode(`${htmlToMarkdown(doc.html)}\n`),
            }))
          }
        >
          {t(lang, "exportMarkdown")}
        </ActionButton>
      )}

      <ActionButton
        variant="secondary"
        onClick={() =>
          void emit(async () => ({
            name: `${base}.txt`,
            type: "text/plain;charset=utf-8",
            bytes: new TextEncoder().encode(`${htmlToText(doc.html)}\n`),
          }))
        }
      >
        {t(lang, "exportText")}
      </ActionButton>
    </>
  );
}

function PdfExportActions({
  asset,
  lang,
  emit,
  onEmpty,
  onPassword,
}: {
  asset: Asset;
  lang: AppLang;
  emit: Emit;
  onEmpty: () => void;
  onPassword: (message: string) => void;
}) {
  const base = baseFileName(asset.name);

  return (
    <ActionButton
      variant="secondary"
      onClick={() =>
        void emit(async () => {
          try {
            const pdf = await openPdf(await asset.bytes());
            try {
              const text = await pdfToText(pdf);
              if (text.trim() === "") {
                onEmpty();
                return null;
              }
              return {
                name: `${base}.txt`,
                type: "text/plain;charset=utf-8",
                bytes: new TextEncoder().encode(`${text}\n`),
              };
            } finally {
              // `PDFDocumentProxy` exposes cleanup only; the loading task owns
              // `destroy`, which tears the document down.
              await pdf.loadingTask.destroy();
            }
          } catch (error) {
            if (error instanceof PdfPasswordError) {
              // The converter has no password prompt, so say so in the shared
              // error line instead of the generic export failure.
              onPassword(t(lang, error.reason === "incorrect" ? "pdfPasswordWrong" : "pdfPassword"));
              return null;
            }
            throw error;
          }
        })
      }
    >
      {t(lang, "exportPdfText")}
    </ActionButton>
  );
}

/* -------------------------------------------------------------- printing */

export function ViewerPrintOperation({ lang, assets }: OperationProps) {
  const standalone = assets.length === 0;
  const [localAsset, pickLocal] = useLocalAsset();
  const asset = assets[0] ?? localAsset;
  const state = useViewerDocument(asset, lang);
  const sheetRef = React.useRef<SheetViewHandle | null>(null);
  const noop = React.useCallback(() => {}, []);

  const printable = state.status === "ready" && PRINTABLE_KINDS.has(state.doc.kind);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {standalone && (
        <div>
          <ViewerFilePicker lang={lang} onPick={pickLocal} />
        </div>
      )}

      {asset && state.status === "loading" && (
        <p role="status" className="px-2 py-6 text-center text-sm text-(--muted-fg)">
          {t(lang, "readingFile")}
        </p>
      )}

      {asset && state.status === "error" && (
        <p role="alert" className="px-2 py-6 text-center text-sm text-(--warning)">
          {state.message}
        </p>
      )}

      {asset && state.status === "ready" && printable && (
        <>
          <div data-no-print="">
            <ActionButton onClick={() => printDocument(baseFileName(asset.name))}>{t(lang, "printPdf")}</ActionButton>
          </div>
          <div className="min-h-0 flex-1" data-print-flow="">
            <DocumentPane
              lang={lang}
              doc={state.doc}
              fileName={asset.name}
              edits={EMPTY_EDITS}
              jsonEdit={null}
              sheetRef={sheetRef}
              resetKey={asset.id}
              jsonResetKey={asset.id}
              onActiveSheet={noop}
              onPdfLoaded={noop}
            />
          </div>
        </>
      )}

      {state.status === "ready" && !printable && (
        <p className="px-2 py-6 text-center text-sm text-(--muted-fg)">{wb(lang, "reasonNeedsDocument")}</p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- editing */

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
 * `viewer.edit` — edit the open asset and save an edited copy. JSON and
 * spreadsheets reuse the viewer's own editors (`JsonView` and the
 * `sheet-edit` model), while text/Markdown/HTML get a plain source textarea.
 * Binary documents have no editor and say so.
 */
export function ViewerEditOperation({ lang, assets, onProduce }: OperationProps) {
  const standalone = assets.length === 0;
  const [localAsset, pickLocal] = useLocalAsset();
  const asset = assets[0] ?? localAsset;
  const state = useViewerDocument(asset, lang);
  const [error, setError] = React.useState<string | null>(null);

  // A message about the previous asset must not linger over the next one.
  React.useEffect(() => {
    setError(null);
  }, [asset?.id]);

  const emit = React.useCallback<Emit>(
    async (build) => {
      setError(null);
      try {
        const output = await build();
        if (!output) return;
        if (onProduce) onProduce(output);
        else saveBlob(new Blob([output.bytes.slice().buffer], { type: output.type }), output.name);
      } catch (err) {
        console.error("Edit save failed", err);
        setError(t(lang, "exportFailed"));
      }
    },
    [lang, onProduce],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {standalone && (
        <div className="mb-4">
          <ViewerFilePicker lang={lang} onPick={pickLocal} />
        </div>
      )}

      {asset && state.status === "loading" && (
        <p role="status" className="px-2 py-6 text-center text-sm text-(--muted-fg)">
          {t(lang, "readingFile")}
        </p>
      )}

      {asset && state.status === "error" && (
        <p role="alert" className="px-2 py-6 text-center text-sm text-(--warning)">
          {state.message}
        </p>
      )}

      {asset && state.status === "ready" && (
        <>
          {state.doc.kind === "json" && <JsonEditPane key={asset.id} lang={lang} asset={asset} doc={state.doc} emit={emit} />}
          {state.doc.kind === "sheet" && <SheetEditPane key={asset.id} lang={lang} asset={asset} doc={state.doc} emit={emit} />}
          {state.doc.kind === "text" && (
            <SourceEditPane key={asset.id} lang={lang} asset={asset} initial={state.doc.text} format="text" emit={emit} />
          )}
          {(state.doc.kind === "markdown" || state.doc.kind === "html") && (
            <SourceEditPane key={asset.id} lang={lang} asset={asset} initial={state.doc.source} format={state.doc.kind} emit={emit} />
          )}
          {(state.doc.kind === "pdf" || state.doc.kind === "image" || state.doc.kind === "docx") && (
            <p className="px-2 py-6 text-center text-sm text-(--muted-fg)">{wb(lang, "unavailable")}</p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-(--warning)/40 bg-(--warning)/10 p-3 text-sm text-(--warning)">
          {error}
        </p>
      )}
    </div>
  );
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
}: {
  lang: AppLang;
  asset: Asset;
  doc: Extract<LoadedDocument, { kind: "json" }>;
  emit: Emit;
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
  const bump = React.useCallback(() => setVersion((current) => current + 1), []);

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
    });
  }, [asset.name, emit, session]);

  return (
    <>
      <EditorToolbar
        lang={lang}
        dirty={session.dirty}
        canUndo={session.canUndo}
        canRedo={session.canRedo}
        formats={session.formats}
        activeFormat="json"
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
        />
      </div>
    </>
  );
}

/**
 * Sheets: edits accumulate as one entry per cell (re-editing a cell replaces
 * its earlier entry) in an `EditSession`, so the toolbar's undo/redo/discard
 * move the draft. They are re-applied to the pristine workbook on every
 * render, exactly like `ViewerApp` does.
 */
function SheetEditPane({
  lang,
  asset,
  doc,
  emit,
}: {
  lang: AppLang;
  asset: Asset;
  doc: Extract<LoadedDocument, { kind: "sheet" }>;
  emit: Emit;
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
    });
  }, [asset.name, bookType, emit, session, workbook]);

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
}: {
  lang: AppLang;
  asset: Asset;
  initial: string;
  format: SourceFormat;
  emit: Emit;
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
  const language = sourceLanguage(asset, format);

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
        name: output.name(baseFileName(asset.name)),
        type: output.mime,
        bytes: output.bytes,
        kind: format === "text" ? "text" : format,
      };
    });
  }, [asset.name, emit, format, session]);

  return (
    <>
      <EditorToolbar
        lang={lang}
        dirty={session.dirty}
        canUndo={session.canUndo}
        canRedo={session.canRedo}
        formats={session.formats}
        activeFormat={format}
        onSave={handleSave}
        onRevert={handleRevert}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
      <SourceEditor value={value} onChange={handleChange} language={language} ariaLabel={t(lang, "source")} />
    </>
  );
}
