import type { AppLang } from "@/lib/apps/lang";
import type { FileKind } from "./file-kind";

/**
 * UI copy for the document viewer. English is the fallback for every key.
 * File-content warnings produced by the parsers stay in English on purpose:
 * they quote library internals rather than interface chrome.
 */

type StringKey =
  | "viewerTitle"
  | "viewerTagline"
  | "dropToOpen"
  | "dropPrompt"
  | "dropHint"
  | "fileTooLarge"
  | "filesUpTo"
  | "cannotOpenDoc"
  | "legacyDocHint"
  | "unsupportedType"
  | "unsupportedHint"
  | "couldNotRead"
  | "corruptedHint"
  | "loadingDetail"
  | "readingFile"
  | "edited"
  | "editedCount"
  | "downloadEdited"
  | "savesAsConverted"
  | "savesAs"
  | "discardEdits"
  | "discardEditsTitle"
  | "openFile"
  | "closeFile"
  | "findInSheet"
  | "noMatches"
  | "matchOf"
  | "previousMatch"
  | "nextMatch"
  | "doubleClickToEdit"
  | "appendRow"
  | "addRow"
  | "editCell"
  | "invalidJson"
  | "jsonDocument"
  | "emptySheet"
  | "rowsColumns"
  | "sortedBy"
  | "ascending"
  | "descending"
  | "showingFirstRows"
  | "formattingNotes"
  | "compare"
  | "compareTitle"
  | "comparing"
  | "backToDocument"
  | "compareReading"
  | "compareUnsupported"
  | "compareUnsupportedHint"
  | "comparePasswordPdf"
  | "compareFileA"
  | "compareFileB"
  | "export"
  | "exportMenu"
  | "exportCsv"
  | "exportJsonSheet"
  | "exportXlsx"
  | "exportJsonCsv"
  | "exportJsonMin"
  | "exportJsonPretty"
  | "exportHtml"
  | "exportMarkdown"
  | "exportText"
  | "exportPdfText"
  | "exportFailed"
  | "printPdf"
  | "printTitle"
  | "preview"
  | "source"
  | "viewMode"
  | "pdfPageOf"
  | "pdfZoomIn"
  | "pdfZoomOut"
  | "pdfFitWidth"
  | "pdfPrevPage"
  | "pdfNextPage"
  | "pdfPassword"
  | "pdfPasswordWrong"
  | "pdfPasswordLabel"
  | "pdfUnlock"
  | "pdfPageLabel"
  | "pdfNoText"
  | "imageSize"
  | "imageFit"
  | "imageActual"
  | "imageZoomIn"
  | "imageZoomOut"
  | "imageError";

const STRINGS: Record<AppLang, Record<StringKey, string>> = {
  en: {
    viewerTitle: "Viewer",
    viewerTagline:
      "Open PDF, Word, Excel, Markdown, HTML, JSON, text and image files right here. Everything is read in your browser — no file is ever uploaded.",
    dropToOpen: "Drop to open",
    dropPrompt: "Drop a file here, or click to browse",
    dropHint: "PDF, Word, Excel, CSV, Markdown, HTML, JSON, text and images · you can also paste a file",
    fileTooLarge: "File is too large",
    filesUpTo: "Files up to {limit} can be opened here.",
    cannotOpenDoc: "Cannot open .doc files",
    legacyDocHint:
      "Word 97-2003 files use a binary format that browsers cannot read. Open it in Word or LibreOffice and save as .docx, then try again.",
    unsupportedType: "Unsupported file type",
    unsupportedHint: "PDF, Word, Excel, CSV, Markdown, HTML, JSON, text and image files can be opened here.",
    couldNotRead: "Could not read this file",
    corruptedHint: "The file may be corrupted or password protected.",
    loadingDetail: "Loading",
    readingFile: "Reading file",
    edited: "Edited",
    editedCount: "Edited · {count}",
    downloadEdited: "Download edited",
    savesAsConverted: "Saves as .xlsx (converted)",
    savesAs: "Saves as {filename}",
    discardEdits: "Discard edits",
    discardEditsTitle: "Throw away the edits and go back to the file as it was opened",
    openFile: "Open file",
    closeFile: "Close file",
    findInSheet: "Find in sheet",
    noMatches: "No matches",
    matchOf: "{index} of {count}",
    previousMatch: "Previous match",
    nextMatch: "Next match",
    doubleClickToEdit: "Double-click to edit",
    appendRow: "Append an empty row at the bottom of this sheet",
    addRow: "+ Add row",
    editCell: "Edit cell",
    invalidJson: "Invalid JSON",
    jsonDocument: "JSON document",
    emptySheet: "This sheet is empty.",
    rowsColumns: "{rows} {rowsPlural} × {columns} {columnsPlural}",
    sortedBy: "sorted by {column}, {direction}",
    ascending: "ascending",
    descending: "descending",
    showingFirstRows: "showing the first {count} rows",
    formattingNotes: "{count} formatting {notesPlural}",
    compare: "Compare",
    compareTitle: "Compare with another file",
    comparing: "Comparing {a} with {b}",
    backToDocument: "Back to document",
    compareReading: "Reading the second file",
    compareUnsupported: "These files cannot be compared",
    compareUnsupportedHint: "Only files that contain text can be compared — images and unsupported files have none.",
    comparePasswordPdf: "A password-protected PDF cannot be compared.",
    compareFileA: "Original",
    compareFileB: "Modified",
    export: "Export",
    exportMenu: "Export as",
    exportCsv: "CSV — this sheet",
    exportJsonSheet: "JSON — this sheet",
    exportXlsx: "Excel workbook (.xlsx)",
    exportJsonCsv: "CSV (.csv)",
    exportJsonMin: "Minified JSON",
    exportJsonPretty: "Formatted JSON",
    exportHtml: "HTML page (.html)",
    exportMarkdown: "Markdown (.md)",
    exportText: "Plain text (.txt)",
    exportPdfText: "Extracted text (.txt)",
    exportFailed: "Export failed",
    printPdf: "Print / PDF",
    printTitle: "Opens the print dialog — choose “Save as PDF” as the destination",
    preview: "Preview",
    source: "Source",
    viewMode: "View",
    pdfPageOf: "Page {page} of {total}",
    pdfZoomIn: "Zoom in",
    pdfZoomOut: "Zoom out",
    pdfFitWidth: "Fit width",
    pdfPrevPage: "Previous page",
    pdfNextPage: "Next page",
    pdfPassword: "This PDF is password protected",
    pdfPasswordWrong: "That password is incorrect",
    pdfPasswordLabel: "Password",
    pdfUnlock: "Unlock",
    pdfPageLabel: "Page {page}",
    pdfNoText: "No selectable text was found in this PDF (it may be scanned images).",
    imageSize: "{width} × {height} px",
    imageFit: "Fit to window",
    imageActual: "Actual size",
    imageZoomIn: "Zoom in",
    imageZoomOut: "Zoom out",
    imageError: "This image could not be displayed.",
  },
  ru: {
    viewerTitle: "Просмотр",
    viewerTagline:
      "Открывайте файлы PDF, Word, Excel, Markdown, HTML, JSON, текст и картинки прямо здесь. Всё читается в вашем браузере — файлы никуда не загружаются.",
    dropToOpen: "Отпустите, чтобы открыть",
    dropPrompt: "Перетащите файл сюда или нажмите, чтобы выбрать",
    dropHint: "PDF, Word, Excel, CSV, Markdown, HTML, JSON, текст и картинки · файл можно вставить из буфера",
    fileTooLarge: "Файл слишком большой",
    filesUpTo: "Здесь можно открывать файлы до {limit}.",
    cannotOpenDoc: "Файлы .doc открыть нельзя",
    legacyDocHint:
      "Файлы Word 97-2003 используют бинарный формат, который браузеры не читают. Откройте файл в Word или LibreOffice, сохраните как .docx и попробуйте снова.",
    unsupportedType: "Неподдерживаемый тип файла",
    unsupportedHint: "Здесь можно открывать файлы PDF, Word, Excel, CSV, Markdown, HTML, JSON, текст и картинки.",
    couldNotRead: "Не удалось прочитать этот файл",
    corruptedHint: "Возможно, файл повреждён или защищён паролем.",
    loadingDetail: "Загрузка",
    readingFile: "Читаем файл",
    edited: "Изменён",
    editedCount: "Изменён · {count}",
    downloadEdited: "Скачать изменённый",
    savesAsConverted: "Сохранится как .xlsx (конвертация)",
    savesAs: "Сохранится как {filename}",
    discardEdits: "Отменить правки",
    discardEditsTitle: "Убрать правки и вернуться к файлу в исходном виде",
    openFile: "Открыть файл",
    closeFile: "Закрыть файл",
    findInSheet: "Найти в таблице",
    noMatches: "Нет совпадений",
    matchOf: "{index} из {count}",
    previousMatch: "Предыдущее совпадение",
    nextMatch: "Следующее совпадение",
    doubleClickToEdit: "Двойной клик — редактирование",
    appendRow: "Добавить пустую строку внизу таблицы",
    addRow: "+ Добавить строку",
    editCell: "Редактировать ячейку",
    invalidJson: "Некорректный JSON",
    jsonDocument: "JSON-документ",
    emptySheet: "Этот лист пуст.",
    rowsColumns: "{rows} строк × {columns} столб.",
    sortedBy: "сортировка по {column}, {direction}",
    ascending: "по возрастанию",
    descending: "по убыванию",
    showingFirstRows: "показаны первые {count} строк",
    formattingNotes: "Замечаний по форматированию: {count}",
    compare: "Сравнить",
    compareTitle: "Сравнить с другим файлом",
    comparing: "Сравнение: {a} и {b}",
    backToDocument: "Назад к документу",
    compareReading: "Читаем второй файл",
    compareUnsupported: "Эти файлы нельзя сравнить",
    compareUnsupportedHint: "Сравнивать можно только файлы с текстом — у картинок и неподдерживаемых файлов его нет.",
    comparePasswordPdf: "PDF с паролем сравнить нельзя.",
    compareFileA: "Оригинал",
    compareFileB: "Изменённый",
    export: "Экспорт",
    exportMenu: "Экспортировать как",
    exportCsv: "CSV — этот лист",
    exportJsonSheet: "JSON — этот лист",
    exportXlsx: "Книга Excel (.xlsx)",
    exportJsonCsv: "CSV (.csv)",
    exportJsonMin: "JSON без форматирования",
    exportJsonPretty: "JSON с форматированием",
    exportHtml: "HTML-страница (.html)",
    exportMarkdown: "Markdown (.md)",
    exportText: "Простой текст (.txt)",
    exportPdfText: "Извлечённый текст (.txt)",
    exportFailed: "Не удалось экспортировать",
    printPdf: "Печать / PDF",
    printTitle: "Откроется окно печати — выберите «Сохранить как PDF»",
    preview: "Просмотр",
    source: "Исходник",
    viewMode: "Вид",
    pdfPageOf: "Страница {page} из {total}",
    pdfZoomIn: "Увеличить",
    pdfZoomOut: "Уменьшить",
    pdfFitWidth: "По ширине",
    pdfPrevPage: "Предыдущая страница",
    pdfNextPage: "Следующая страница",
    pdfPassword: "Этот PDF защищён паролем",
    pdfPasswordWrong: "Неверный пароль",
    pdfPasswordLabel: "Пароль",
    pdfUnlock: "Открыть",
    pdfPageLabel: "Страница {page}",
    pdfNoText: "В этом PDF нет выделяемого текста (возможно, это сканы).",
    imageSize: "{width} × {height} px",
    imageFit: "По размеру окна",
    imageActual: "Реальный размер",
    imageZoomIn: "Увеличить",
    imageZoomOut: "Уменьшить",
    imageError: "Не удалось показать это изображение.",
  },
};

export type ViewerTranslationKey = StringKey;

export type ViewerTXT = Record<StringKey, string>;

export function stringsFor(lang: AppLang): ViewerTXT {
  return STRINGS[lang];
}

/** Translate a key, interpolating `{placeholders}` from `vars`. */
export function t(lang: AppLang, key: StringKey, vars?: Record<string, string | number>): string {
  const template = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

const KIND_LABELS: Record<AppLang, Record<FileKind, string>> = {
  en: {
    markdown: "Markdown",
    sheet: "Spreadsheet",
    docx: "Word",
    text: "Text",
    json: "JSON",
    html: "HTML",
    pdf: "PDF",
    image: "Image",
    "legacy-doc": "Word 97-2003",
    unsupported: "Unsupported",
  },
  ru: {
    markdown: "Markdown",
    sheet: "Таблица",
    docx: "Word",
    text: "Текст",
    json: "JSON",
    html: "HTML",
    pdf: "PDF",
    image: "Картинка",
    "legacy-doc": "Word 97-2003",
    unsupported: "Без поддержки",
  },
};

/** Human-readable file kind for the file bar badge. */
export function fileKindLabel(kind: FileKind, lang: AppLang): string {
  return KIND_LABELS[lang][kind];
}

/** English singular/plural helpers used by the stats line. */
export function rowsPlural(count: number): string {
  return count === 1 ? "row" : "rows";
}

export function columnsPlural(count: number): string {
  return count === 1 ? "column" : "columns";
}

export function notesPlural(count: number): string {
  return count === 1 ? "note" : "notes";
}
