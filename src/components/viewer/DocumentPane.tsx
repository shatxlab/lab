import * as React from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import { DocxView } from "@/components/viewer/viewers/DocxView";
import { JsonView } from "@/components/viewer/viewers/JsonView";
import { MarkdownView } from "@/components/viewer/viewers/MarkdownView";
import { ImageView } from "@/components/viewer/viewers/ImageView";
import { PdfView } from "@/components/viewer/viewers/PdfView";
import { SheetView, type SheetViewHandle } from "@/components/viewer/viewers/SheetView";
import { TextView } from "@/components/viewer/viewers/TextView";
import type { AppLang } from "@/lib/apps/lang";
import type { LoadedDocument } from "@/lib/viewer/load";
import { columnLabel, workbookToSheets } from "@/lib/viewer/sheet";
import { applyEdits, type SheetEdit } from "@/lib/viewer/sheet-edit";

export function DocumentPane({
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
  onEditCell?: (sheetName: string, addr: string, value: string | number | null) => void;
  onApplyJson?: (value: unknown) => void;
  onRevertJson?: () => void;
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
      if (!onEditCell) return;
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
      onAddRow={doc.workbook && onEditCell ? addRow : undefined}
      onActiveSheetChange={onActiveSheet}
    />
  );
}
