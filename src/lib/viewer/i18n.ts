import type { AppLang } from "@/lib/apps/lang";
import type { FileKind } from "./file-kind";

/**
 * UI copy for the document viewer. English is the fallback for every key.
 * File-content warnings produced by the parsers stay in English on purpose:
 * they quote library internals rather than interface chrome.
 */

type StringKey =
  | "fileTooLarge"
  | "cannotOpenDoc"
  | "unsupportedType"
  | "couldNotRead"
  | "readingFile"
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
  | "export"
  | "exportCsv"
  | "exportJsonSheet"
  | "exportXlsx"
  | "exportHtml"
  | "exportMarkdown"
  | "exportText"
  | "exportFailed"
  | "printPdf"
  | "preview"
  | "source"
  | "pdfPassword"
  | "pdfPasswordWrong"
  | "pdfPasswordLabel"
  | "pdfUnlock"
  | "pdfPageOf"
  | "pdfZoomIn"
  | "pdfZoomOut"
  | "pdfFitWidth"
  | "pdfPrevPage"
  | "pdfNextPage"
  | "pdfPageLabel"
  | "imageSize"
  | "imageFit"
  | "imageActual"
  | "imageZoomIn"
  | "imageZoomOut"
  | "imageError";

const STRINGS: Record<AppLang, Record<StringKey, string>> = {
  en: {
    fileTooLarge: "File is too large",
    cannotOpenDoc: "Cannot open .doc files",
    unsupportedType: "Unsupported file type",
    couldNotRead: "Could not read this file",
    readingFile: "Reading file",
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
    export: "Export",
    exportCsv: "CSV — this sheet",
    exportJsonSheet: "JSON — this sheet",
    exportXlsx: "Excel workbook (.xlsx)",
    exportHtml: "HTML page (.html)",
    exportMarkdown: "Markdown (.md)",
    exportText: "Plain text (.txt)",
    exportFailed: "Export failed",
    printPdf: "Print / PDF",
    preview: "Preview",
    source: "Source",
    pdfPassword: "This PDF is password protected",
    pdfPasswordWrong: "That password is incorrect",
    pdfPasswordLabel: "Password",
    pdfUnlock: "Unlock",
    pdfPageOf: "Page {page} of {total}",
    pdfZoomIn: "Zoom in",
    pdfZoomOut: "Zoom out",
    pdfFitWidth: "Fit width",
    pdfPrevPage: "Previous page",
    pdfNextPage: "Next page",
    pdfPageLabel: "Page {page}",
    imageSize: "{width} × {height} px",
    imageFit: "Fit to window",
    imageActual: "Actual size",
    imageZoomIn: "Zoom in",
    imageZoomOut: "Zoom out",
    imageError: "This image could not be displayed.",
  },
  ru: {
    fileTooLarge: "Файл слишком большой",
    cannotOpenDoc: "Файлы .doc открыть нельзя",
    unsupportedType: "Неподдерживаемый тип файла",
    couldNotRead: "Не удалось прочитать этот файл",
    readingFile: "Читаем файл",
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
    export: "Экспорт",
    exportCsv: "CSV — этот лист",
    exportJsonSheet: "JSON — этот лист",
    exportXlsx: "Книга Excel (.xlsx)",
    exportHtml: "HTML-страница (.html)",
    exportMarkdown: "Markdown (.md)",
    exportText: "Простой текст (.txt)",
    exportFailed: "Не удалось экспортировать",
    printPdf: "Печать / PDF",
    preview: "Просмотр",
    source: "Исходник",
    pdfPassword: "Этот PDF защищён паролем",
    pdfPasswordWrong: "Неверный пароль",
    pdfPasswordLabel: "Пароль",
    pdfUnlock: "Открыть",
    pdfPageOf: "Страница {page} из {total}",
    pdfZoomIn: "Увеличить",
    pdfZoomOut: "Уменьшить",
    pdfFitWidth: "По ширине",
    pdfPrevPage: "Предыдущая страница",
    pdfNextPage: "Следующая страница",
    pdfPageLabel: "Страница {page}",
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
