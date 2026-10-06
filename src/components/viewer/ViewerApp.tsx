import * as React from "react";
import { ArrowLeft, FileText, FileWarning, Loader2 } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import { DropZone } from "@/components/viewer/DropZone";
import { FileBar } from "@/components/viewer/FileBar";
import { DocxView } from "@/components/viewer/viewers/DocxView";
import { JsonView } from "@/components/viewer/viewers/JsonView";
import { MarkdownView } from "@/components/viewer/viewers/MarkdownView";
import { ImageView } from "@/components/viewer/viewers/ImageView";
import { PdfView } from "@/components/viewer/viewers/PdfView";
import { SheetView, type SheetViewHandle } from "@/components/viewer/viewers/SheetView";
import { TextView } from "@/components/viewer/viewers/TextView";
import { DiffView } from "@/components/tools/DiffView";
import type { MenuItem } from "@/components/tools/MenuButton";
import { Button } from "@/components/viewer/ui/button";
import { CompareError, extractComparableText } from "@/lib/viewer/comparable";
import {
  baseFileName,
  htmlToMarkdown,
  htmlToText,
  jsonToCsv,
  rowsToXlsx,
  sheetDataToCsv,
  sheetDataToJson,
  standaloneHtml,
  workbookSheetToCsv,
  workbookSheetToJson,
  workbookToXlsx,
} from "@/lib/viewer/export";
import { printDocument } from "@/lib/viewer/print";
import { decodeMarkupBytes, decodeTextBytes } from "@/lib/viewer/charset";
import { sanitizeDocumentHtml } from "@/lib/viewer/sanitize";
import { ACCEPTED_EXTENSIONS, detectFileKind, fileExtension, resolveFileKind, type FileKind } from "@/lib/viewer/file-kind";
import { formatBytesLimit, MAX_FILE_BYTES } from "@/lib/limits";
import { parseJson, prettifyJson } from "@/lib/viewer/json";
import { parseWorkbook, workbookToSheets, columnLabel, type RawWorkbook, type SheetData } from "@/lib/viewer/sheet";
import { applyEdits, serializeWorkbook, type SheetEdit, type SheetJsWriter } from "@/lib/viewer/sheet-edit";
import { saveBlob } from "@/lib/apps/file-open";
import { useAppLang, useLangReady } from "@/lib/apps/use-app-lang";
import { stringsFor, t } from "@/lib/viewer/i18n";
import type { AppLang } from "@/lib/apps/lang";

const FILE_INPUT_ID = "docviewer-open";
const COMPARE_INPUT_ID = "docviewer-compare";

type CompareState =
  | { status: "loading" }
  | { status: "ready"; nameA: string; nameB: string; textA: string; textB: string }
  | { status: "error"; message: string; hint?: string };

/** Everything between <body> tags (or the whole markup when there are none). */
function htmlBodyMarkup(source: string): string {
  const body = /<body[^>]*>([\s\S]*?)(?:<\/body>|$)/i.exec(source)?.[1] ?? source;
  return body
    .replace(/<head[\s>][\s\S]*?<\/head>/gi, "")
    .replace(/<title[\s>][\s\S]*?<\/title>/gi, "");
}

type FileMeta = { name: string; size: number; kind: FileKind };

type LoadedDocument =
  | { kind: "markdown"; html: string; source: string }
  | { kind: "html"; html: string; source: string }
  | { kind: "pdf"; bytes: Uint8Array }
  | { kind: "image"; bytes: Uint8Array; extension: string }
  | { kind: "docx"; html: string; warnings: string[] }
  | { kind: "sheet"; sheets: SheetData[]; workbook: RawWorkbook | null }
  | { kind: "text"; text: string }
  | { kind: "json"; value: unknown; warnings: string[] };

type ViewerState =
  | { status: "idle" }
  | { status: "loading"; file: FileMeta }
  | { status: "ready"; file: FileMeta; doc: LoadedDocument }
  | { status: "error"; file: FileMeta | null; message: string; hint?: string };

/** Book types that can be written back as themselves; everything else converts. */
const SAVABLE_BOOK_TYPES = new Set(["xlsx", "xlsm"]);

const BOOK_MIME_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
};

export default function ViewerApp() {
  const lang = useAppLang();
  const readyRef = useLangReady<HTMLDivElement>();
  const [state, setState] = React.useState<ViewerState>({ status: "idle" });
  const [dragging, setDragging] = React.useState(false);
  /** Cell edits for the open spreadsheet, newest value per cell. */
  const [edits, setEdits] = React.useState<SheetEdit[]>([]);
  /** Whole-document replacement for the open JSON file. */
  const [jsonEdit, setJsonEdit] = React.useState<{ value: unknown } | null>(null);
  /*
   * Bumped whenever the JSON document is replaced from outside (a new file
   * opens, edits are discarded). The JSON view resyncs its draft on this
   * change — and deliberately NOT when an edit is applied, so the reader's
   * text is never reformatted mid-typing.
   */
  const [jsonRevision, setJsonRevision] = React.useState(0);

  /*
   * Parsing is async, so a reader who opens a second file before the first one
   * finishes would otherwise see whichever parse happened to resolve last. Each
   * open claims a token and stale results are dropped.
   */
  const requestToken = React.useRef(0);
  /** The File on screen, kept so "Compare" can read it again. */
  const currentFileRef = React.useRef<File | null>(null);
  const pdfDocRef = React.useRef<PDFDocumentProxy | null>(null);
  const compareInputRef = React.useRef<HTMLInputElement>(null);
  const [compare, setCompare] = React.useState<CompareState | null>(null);
  const [activeSheet, setActiveSheet] = React.useState<string | null>(null);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const sheetRef = React.useRef<SheetViewHandle>(null);
  const dragDepth = React.useRef(0);

  const openFile = React.useCallback(async (file: File) => {
    const token = (requestToken.current += 1);
    // A new file starts with a clean edit slate, whatever was open before.
    setEdits([]);
    setJsonEdit(null);
    setCompare(null);
    setExportError(null);
    pdfDocRef.current = null;
    currentFileRef.current = file;

    // Size is checked before reading so an oversized file never hits memory.
    if (file.size > MAX_FILE_BYTES) {
      setState({
        status: "error",
        file: { name: file.name, size: file.size, kind: detectFileKind(file.name) },
        message: t(lang, "fileTooLarge"),
        hint: t(lang, "filesUpTo", { limit: formatBytesLimit(MAX_FILE_BYTES) }),
      });
      return;
    }

    const buffer = await file.arrayBuffer();
    if (requestToken.current !== token) return;

    const bytes = new Uint8Array(buffer);
    const kind = resolveFileKind(file.name, bytes);
    const meta: FileMeta = { name: file.name, size: file.size, kind };

    if (kind === "legacy-doc") {
      setState({ status: "error", file: meta, message: t(lang, "cannotOpenDoc"), hint: t(lang, "legacyDocHint") });
      return;
    }

    if (kind === "unsupported") {
      setState({
        status: "error",
        file: meta,
        message: t(lang, "unsupportedType"),
        hint: t(lang, "unsupportedHint"),
      });
      return;
    }

    setState({ status: "loading", file: meta });

    try {
      const doc = await loadDocument(buffer, kind, fileExtension(file.name));
      if (requestToken.current !== token) return;
      // Bumped together with the new doc so the JSON view's resync effect sees
      // the FINAL document in the same render, never the transitional one.
      setJsonRevision((revision) => revision + 1);
      setState({ status: "ready", file: meta, doc });
    } catch (error) {
      if (requestToken.current !== token) return;
      setState({
        status: "error",
        file: meta,
        message: t(lang, "couldNotRead"),
        hint: error instanceof Error ? error.message : t(lang, "corruptedHint"),
      });
    }
  }, []);

  const close = React.useCallback(() => {
    requestToken.current += 1;
    currentFileRef.current = null;
    pdfDocRef.current = null;
    setCompare(null);
    setExportError(null);
    setEdits([]);
    setJsonEdit(null);
    setState({ status: "idle" });
  }, []);

  const commitCellEdit = React.useCallback(
    (sheetName: string, addr: string, value: string | number | null) => {
      // One entry per cell: re-editing B3 replaces the earlier B3 edit rather
      // than stacking, and the latest write wins inside applyEdits anyway.
      setEdits((previous) => [
        ...previous.filter((edit) => !(edit.sheetName === sheetName && edit.addr === addr)),
        { sheetName, addr, value },
      ]);
    },
    [],
  );

  const commitJsonDocument = React.useCallback((value: unknown) => {
    setJsonEdit({ value });
  }, []);

  /*
   * Writes the edited workbook or document out as bytes, entirely in the
   * browser: SheetJS serializes the in-memory copy (or the JSON tree is
   * stringified) and saveBlob hands it to the download manager. The on-disk
   * original is never opened for writing.
   */
  const downloadEdited = React.useCallback(async () => {
    if (state.status !== "ready") return;

    if (state.doc.kind === "json") {
      const edited = jsonEdit ? jsonEdit.value : state.doc.value;
      const payload = `${prettifyJson(edited)}\n`;
      saveBlob(new Blob([payload], { type: "application/json" }), `${baseFileName(state.file.name)}-edited.json`);
      return;
    }

    if (state.doc.kind !== "sheet" || !state.doc.workbook) return;

    const extension = fileExtension(state.file.name);
    const bookType = SAVABLE_BOOK_TYPES.has(extension) ? (extension as "xlsx" | "xlsm") : "xlsx";
    const filename = `${baseFileName(state.file.name)}-edited.${bookType}`;

    try {
      const XLSX = await import("xlsx");
      const edited = applyEdits(state.doc.workbook, edits);
      // The real SheetJS module satisfies the writer seam; the cast only
      // narrows its overloads down to the one call shape used here.
      const bytes = serializeWorkbook(XLSX as unknown as SheetJsWriter, edited, bookType);
      saveBlob(new Blob([bytes as unknown as BlobPart], { type: BOOK_MIME_TYPES[bookType] }), filename);
    } catch (error) {
      console.error("Saving the edited spreadsheet failed", error);
    }
  }, [state, edits, jsonEdit]);

  const discardEdits = React.useCallback(() => {
    setEdits([]);
    setJsonEdit(null);
    setJsonRevision((revision) => revision + 1);
  }, []);

  const openPicker = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const startCompare = React.useCallback(
    async (fileB: File) => {
      const fileA = currentFileRef.current;
      if (!fileA) return;
      setCompare({ status: "loading" });
      try {
        const [textA, textB] = await Promise.all([extractComparableText(fileA), extractComparableText(fileB)]);
        setCompare({ status: "ready", nameA: fileA.name, nameB: fileB.name, textA, textB });
      } catch (error) {
        const password = error instanceof CompareError && error.failure === "password";
        const tooLarge = error instanceof CompareError && error.failure === "tooLarge";
        setCompare({
          status: "error",
          message: tooLarge ? t(lang, "fileTooLarge") : t(lang, "compareUnsupported"),
          hint: password
            ? t(lang, "comparePasswordPdf")
            : tooLarge
              ? t(lang, "filesUpTo", { limit: formatBytesLimit(MAX_FILE_BYTES) })
              : error instanceof CompareError
                ? t(lang, "compareUnsupportedHint")
                : error instanceof Error
                  ? error.message
                  : t(lang, "corruptedHint"),
        });
      }
    },
    [lang],
  );

  const handleCompareInput = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.item(0);
      if (file) void startCompare(file);
      event.target.value = "";
    },
    [startCompare],
  );

  /** Run an export, surfacing any failure instead of swallowing it. */
  const runExport = React.useCallback(
    async (produce: () => Promise<{ data: BlobPart; filename: string; type: string } | null>) => {
      setExportError(null);
      try {
        const result = await produce();
        if (result) saveBlob(new Blob([result.data], { type: result.type }), result.filename);
      } catch (error) {
        console.error("Export failed", error);
        setExportError(t(lang, "exportFailed"));
      }
    },
    [lang],
  );

  const handleInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.item(0);
      if (file) void openFile(file);
      event.target.value = "";
    },
    [openFile],
  );

  React.useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = event.clipboardData?.files.item(0);
      if (file) {
        event.preventDefault();
        void openFile(file);
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [openFile]);

  React.useEffect(() => {
    const resetDrag = () => {
      dragDepth.current = 0;
      setDragging(false);
    };

    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
    };

    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) resetDrag();
    };

    const onDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      resetDrag();
      const file = event.dataTransfer?.files.item(0);
      if (file) void openFile(file);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [openFile]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === "o") {
        event.preventDefault();
        openPicker();
        return;
      }

      if (meta && event.key.toLowerCase() === "f") {
        if (state.status === "ready" && state.doc.kind === "sheet") {
          event.preventDefault();
          sheetRef.current?.focusFind();
        }
        return;
      }

      if (event.key === "Escape" && state.status !== "idle") {
        if (compare) setCompare(null);
        else close();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, compare, openPicker, close]);

  const exportItems = React.useMemo<MenuItem[]>(() => {
    if (state.status !== "ready" || compare) return [];
    const { doc, file } = state;
    const base = baseFileName(file.name);
    const item = (id: string, label: string, produce: () => Promise<{ data: BlobPart; filename: string; type: string } | null>): MenuItem => ({
      id,
      label,
      onSelect: () => void runExport(produce),
    });

    if (doc.kind === "sheet") {
      const sheetName = activeSheet ?? doc.sheets[0]?.name ?? "Sheet1";
      const sheetData = doc.sheets.find((sheet) => sheet.name === sheetName) ?? doc.sheets[0];
      const workbook = doc.workbook ? applyEdits(doc.workbook, edits) : null;
      const safe = sheetName.replace(/[\\/:*?"<>|]+/g, "_");
      const items = [
        item("csv", t(lang, "exportCsv"), async () => ({
          data: workbook ? await workbookSheetToCsv(workbook, sheetName) : sheetData ? sheetDataToCsv(sheetData) : "",
          filename: `${base}${doc.sheets.length > 1 ? `-${safe}` : ""}.csv`,
          type: "text/csv;charset=utf-8",
        })),
        item("json", t(lang, "exportJsonSheet"), async () => ({
          data: workbook ? await workbookSheetToJson(workbook, sheetName) : sheetData ? sheetDataToJson(sheetData) : "[]",
          filename: `${base}${doc.sheets.length > 1 ? `-${safe}` : ""}.json`,
          type: "application/json",
        })),
      ];
      const extension = fileExtension(file.name);
      if (!SAVABLE_BOOK_TYPES.has(extension)) {
        items.push(
          item("xlsx", t(lang, "exportXlsx"), async () => ({
            data: (workbook ? await workbookToXlsx(workbook) : await rowsToXlsx(doc.sheets)) as unknown as BlobPart,
            filename: `${base}.xlsx`,
            type: BOOK_MIME_TYPES.xlsx!,
          })),
        );
      }
      return items;
    }

    if (doc.kind === "json") {
      const value = jsonEdit ? jsonEdit.value : doc.value;
      const csv = jsonToCsv(value);
      const items = [
        item("json-pretty", t(lang, "exportJsonPretty"), async () => ({
          data: `${prettifyJson(value)}\n`,
          filename: `${base}.formatted.json`,
          type: "application/json",
        })),
        item("json-min", t(lang, "exportJsonMin"), async () => ({
          data: JSON.stringify(value),
          filename: `${base}.min.json`,
          type: "application/json",
        })),
      ];
      if (csv !== null) {
        items.push(item("csv", t(lang, "exportJsonCsv"), async () => ({ data: csv, filename: `${base}.csv`, type: "text/csv;charset=utf-8" })));
      }
      return items;
    }

    if (doc.kind === "markdown" || doc.kind === "html" || doc.kind === "docx") {
      const items = [
        item("html", t(lang, "exportHtml"), async () => ({
          data: standaloneHtml(base, doc.html, lang),
          filename: `${base}.html`,
          type: "text/html;charset=utf-8",
        })),
      ];
      if (doc.kind !== "markdown") {
        items.push(
          item("md", t(lang, "exportMarkdown"), async () => ({
            data: `${htmlToMarkdown(doc.html)}\n`,
            filename: `${base}.md`,
            type: "text/markdown;charset=utf-8",
          })),
        );
      }
      items.push(
        item("txt", t(lang, "exportText"), async () => ({
          data: `${htmlToText(doc.html)}\n`,
          filename: `${base}.txt`,
          type: "text/plain;charset=utf-8",
        })),
      );
      return items;
    }

    if (doc.kind === "pdf") {
      return [
        item("pdf-text", t(lang, "exportPdfText"), async () => {
          const pdf = pdfDocRef.current;
          if (!pdf) return null;
          const { pdfToText } = await import("@/lib/viewer/pdf");
          const text = await pdfToText(pdf);
          if (text.trim() === "") {
            setExportError(t(lang, "pdfNoText"));
            return null;
          }
          return { data: `${text}\n`, filename: `${base}.txt`, type: "text/plain;charset=utf-8" };
        }),
      ];
    }

    return [];
  }, [state, compare, activeSheet, edits, jsonEdit, lang, runExport]);

  const printable =
    state.status === "ready" &&
    !compare &&
    (state.doc.kind === "markdown" || state.doc.kind === "html" || state.doc.kind === "docx" || state.doc.kind === "text");

  const fileInput = (
    <input
      id={FILE_INPUT_ID}
      ref={fileInputRef}
      type="file"
      className="sr-file-input"
      aria-label={t(lang, "openFile")}
      accept={ACCEPTED_EXTENSIONS.join(",")}
      onChange={handleInputChange}
    />
  );

  const editedState = (() => {
    if (state.status !== "ready") return undefined;
    if (state.doc.kind === "json") {
      if (!jsonEdit) return undefined;
      return {
        count: 1,
        filename: `${baseFileName(state.file.name)}-edited.json`,
        converted: false,
      };
    }
    if (state.doc.kind !== "sheet" || edits.length === 0) return undefined;
    const extension = fileExtension(state.file.name);
    const bookType = SAVABLE_BOOK_TYPES.has(extension) ? extension : "xlsx";
    return {
      count: edits.length,
      filename: `${baseFileName(state.file.name)}-edited.${bookType}`,
      converted: !SAVABLE_BOOK_TYPES.has(extension),
    };
  })();

  return (
    /*
     * display:contents wrapper: it carries the language paint-guard markers
     * without creating a layout box, so the viewer's flex layout is untouched.
     */
    <div
      ref={readyRef}
      data-lang-sensitive=""
      className="contents"
    >
      {state.status !== "idle" && <h1 className="sr-only">{stringsFor(lang).viewerTitle}</h1>}
      {fileInput}
      <input
        id={COMPARE_INPUT_ID}
        ref={compareInputRef}
        type="file"
        className="sr-file-input"
        tabIndex={-1}
        aria-label={t(lang, "compareTitle")}
        accept={ACCEPTED_EXTENSIONS.join(",")}
        onChange={handleCompareInput}
      />

      {state.status === "idle" ? (
        <Landing lang={lang} inputId={FILE_INPUT_ID} dragging={dragging} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-print-flow="">
          <FileBar
            lang={lang}
            name={state.file?.name ?? ""}
            size={state.file?.size ?? 0}
            kind={state.file?.kind ?? "unsupported"}
            detail={state.status === "loading" ? t(lang, "loadingDetail") : undefined}
            edited={editedState}
            onOpen={openPicker}
            onClose={close}
            onDownloadEdited={downloadEdited}
            onDiscardEdits={discardEdits}
            onCompare={state.status === "ready" && !compare ? () => compareInputRef.current?.click() : undefined}
            onPrint={printable ? () => printDocument(baseFileName(state.file.name)) : undefined}
            exportItems={exportItems}
          />

          {exportError && (
            <p role="alert" data-no-print="" className="border-b border-(--border) bg-(--warning)/10 px-4 py-2 text-sm text-(--warning) sm:px-6">
              {exportError}
            </p>
          )}

          <div className="min-h-0 flex-1" data-print-flow="">
            {state.status === "loading" && <LoadingPane lang={lang} />}

            {state.status === "error" && (
              <ErrorPane lang={lang} message={state.message} hint={state.hint} inputId={FILE_INPUT_ID} dragging={dragging} />
            )}

            {state.status === "ready" && compare && (
              <ComparePane lang={lang} compare={compare} onBack={() => setCompare(null)} />
            )}

            {state.status === "ready" && !compare && (
              <DocumentPane
                lang={lang}
                doc={state.doc}
                fileName={state.file.name}
                edits={edits}
                jsonEdit={jsonEdit}
                sheetRef={sheetRef}
                resetKey={`${state.file.name}:${requestToken.current}:${jsonEdit ? "edited" : "pristine"}`}
                jsonResetKey={String(jsonRevision)}
                onEditCell={commitCellEdit}
                onApplyJson={commitJsonDocument}
                onRevertJson={discardEdits}
                onActiveSheet={setActiveSheet}
                onPdfLoaded={(pdf) => {
                  pdfDocRef.current = pdf;
                }}
              />
            )}
          </div>
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-(--bg)/80 text-lg font-medium">
          {t(lang, "dropToOpen")}
        </div>
      )}
    </div>
  );
}

async function loadDocument(
  buffer: ArrayBuffer,
  kind: Exclude<FileKind, "legacy-doc" | "unsupported">,
  extension: string,
): Promise<LoadedDocument> {
  const bytes = new Uint8Array(buffer);

  if (kind === "markdown") {
    const { renderMarkdown } = await import("@/lib/viewer/markdown");
    const source = decodeTextBytes(bytes);
    return { kind: "markdown", html: renderMarkdown(source), source };
  }

  if (kind === "html") {
    const source = decodeMarkupBytes(bytes);
    return { kind: "html", html: sanitizeDocumentHtml(htmlBodyMarkup(source)), source };
  }

  if (kind === "pdf") {
    return { kind: "pdf", bytes };
  }

  if (kind === "image") {
    return { kind: "image", bytes, extension };
  }

  if (kind === "text") {
    return { kind: "text", text: decodeTextBytes(bytes) };
  }

  if (kind === "json") {
    // decodeTextBytes first: a JSON export saved as UTF-16 must still open.
    const { value, warnings } = parseJson(decodeTextBytes(bytes));
    return { kind: "json", value, warnings };
  }

  if (kind === "sheet") {
    const workbook = await parseWorkbook({ buffer, extension });
    return { kind: "sheet", sheets: workbook.sheets, workbook: workbook.workbook };
  }

  const { renderDocx } = await import("@/lib/viewer/docx");
  const { html, warnings } = await renderDocx(buffer);
  return { kind: "docx", html, warnings };
}

function DocumentPane({
  lang,
  doc,
  fileName,
  edits,
  jsonEdit,
  sheetRef,
  resetKey,
  jsonResetKey,
  onEditCell,
  onApplyJson,
  onRevertJson,
  onActiveSheet,
  onPdfLoaded,
}: {
  lang: AppLang;
  doc: LoadedDocument;
  fileName: string;
  edits: SheetEdit[];
  jsonEdit: { value: unknown } | null;
  sheetRef: React.RefObject<SheetViewHandle | null>;
  resetKey: string;
  jsonResetKey: string;
  onEditCell: (sheetName: string, addr: string, value: string | number | null) => void;
  onApplyJson: (value: unknown) => void;
  onRevertJson: () => void;
  onActiveSheet: (name: string) => void;
  onPdfLoaded: (doc: PDFDocumentProxy) => void;
}) {
  /*
   * The rendered sheets always come from the ORIGINAL workbook plus the edit
   * list, never from mutating anything: that is what lets "discard edits"
   * just drop the list. Re-deriving per edit also keeps every display row's
   * `sourceRow` truthful, so find and sort keep working across edits.
   */
  const sheets = React.useMemo(
    () =>
      doc.kind === "sheet"
        ? doc.workbook
          ? workbookToSheets(applyEdits(doc.workbook, edits))
          : doc.sheets
        : [],
    [doc, edits],
  );

  const jsonValue = React.useMemo(
    () => (doc.kind === "json" ? (jsonEdit ? jsonEdit.value : doc.value) : undefined),
    [doc, jsonEdit],
  );

  const addRow = React.useCallback(
    (sheetName: string) => {
      // The next free row is one past the sheet's current range; writing a
      // (blank) cell there grows `!ref`, so the re-read shows the new row.
      const sheet = sheets.find((entry) => entry.name === sheetName);
      const startColumn = sheet?.range?.startColumn ?? 0;
      const endRow = sheet?.range?.endRow ?? -1;
      onEditCell(sheetName, `${columnLabel(startColumn)}${endRow + 2}`, "");
    },
    [sheets, onEditCell],
  );

  if (doc.kind === "markdown" || doc.kind === "html") return <MarkdownView lang={lang} html={doc.html} source={doc.source} />;
  if (doc.kind === "pdf") return <PdfView lang={lang} bytes={doc.bytes} onLoaded={onPdfLoaded} />;
  if (doc.kind === "image")
    return <ImageView lang={lang} bytes={doc.bytes} name={fileName} extension={doc.extension} />;
  if (doc.kind === "docx") return <DocxView lang={lang} html={doc.html} warnings={doc.warnings} />;
  if (doc.kind === "text") return <TextView text={doc.text} />;
  if (doc.kind === "json")
    return (
      <JsonView
        lang={lang}
        value={jsonValue}
        resetKey={jsonResetKey}
        onApply={onApplyJson}
        onRevert={onRevertJson}
      />
    );
  return (
    <SheetView
      ref={sheetRef}
      lang={lang}
      sheets={sheets}
      resetKey={resetKey}
      onEditCell={doc.workbook ? onEditCell : undefined}
      onAddRow={doc.workbook ? addRow : undefined}
      onActiveSheetChange={onActiveSheet}
    />
  );
}

function ComparePane({ lang, compare, onBack }: { lang: AppLang; compare: CompareState; onBack: () => void }) {
  if (compare.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-sm text-(--muted-fg)" role="status">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        {t(lang, "compareReading")}
      </div>
    );
  }

  const back = (
    <Button variant="outline" size="sm" onClick={onBack}>
      <ArrowLeft aria-hidden="true" />
      {t(lang, "backToDocument")}
    </Button>
  );

  if (compare.status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-(--warning)/15 text-(--warning)">
          <FileWarning aria-hidden="true" className="size-5" />
        </span>
        <h2 role="alert" className="font-medium">
          {compare.message}
        </h2>
        {compare.hint && <p className="max-w-md text-sm text-(--muted-fg)">{compare.hint}</p>}
        {back}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-(--border) bg-(--surface)/50 px-4 py-2 sm:px-6">
        {back}
        <p className="min-w-0 truncate text-sm text-(--muted-fg)">{t(lang, "comparing", { a: compare.nameA, b: compare.nameB })}</p>
      </div>
      <div className="min-h-0 flex-1">
        <DiffView lang={lang} leftName={compare.nameA} rightName={compare.nameB} leftText={compare.textA} rightText={compare.textB} fill />
      </div>
    </div>
  );
}

function Landing({ lang, inputId, dragging }: { lang: AppLang; inputId: string; dragging: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <header className="mb-8 text-center">
          <h1 className="flex items-center justify-center gap-2.5 text-3xl font-semibold tracking-tight">
            <FileText className="size-7 text-(--accent)" aria-hidden="true" />
            {stringsFor(lang).viewerTitle}
          </h1>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-(--muted-fg)">
            {stringsFor(lang).viewerTagline}
          </p>
        </header>

        <DropZone lang={lang} inputId={inputId} dragging={dragging} />

        <p className="mt-6 text-center text-xs text-(--muted-fg)">
          .pdf &middot; .docx &middot; .xlsx &middot; .csv &middot; .md &middot; .html &middot; .json
          &middot; .txt &middot; .png &middot; .jpg &middot; .svg &middot; .webp
        </p>
      </div>
    </div>
  );
}

function LoadingPane({ lang }: { lang: AppLang }) {
  return (
    <div className="flex h-full items-center justify-center gap-3 text-sm text-(--muted-fg)">
      <Loader2 className="size-4 animate-spin" />
      {t(lang, "readingFile")}
    </div>
  );
}

function ErrorPane({
  lang,
  message,
  hint,
  inputId,
  dragging,
}: {
  lang: AppLang;
  message: string;
  hint?: string;
  inputId: string;
  dragging: boolean;
}) {
  return (
    <div className="flex h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-(--warning)/15 text-(--warning)">
          <FileWarning className="size-5" />
        </span>

        <h2 className="font-medium">{message}</h2>
        {hint && <p className="mt-2 text-sm text-(--muted-fg)">{hint}</p>}

        <div className="mt-6">
          <DropZone lang={lang} inputId={inputId} compact dragging={dragging} />
        </div>
      </div>
    </div>
  );
}

function isFileDrag(event: DragEvent): boolean {
  return Boolean(event.dataTransfer?.types.includes("Files"));
}
