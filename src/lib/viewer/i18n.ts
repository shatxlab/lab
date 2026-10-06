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
  | "formattingNotes";

const STRINGS: Record<AppLang, Record<StringKey, string>> = {
  en: {
    viewerTitle: "Viewer",
    viewerTagline:
      "Open Markdown, Excel, Word, JSON and text files right here. Everything is read in your browser — no file is ever uploaded.",
    dropToOpen: "Drop to open",
    dropPrompt: "Drop a file here, or click to browse",
    dropHint: "Markdown, Excel, CSV, Word, JSON and text · you can also paste a file",
    fileTooLarge: "File is too large",
    filesUpTo: "Files up to {limit} can be opened here.",
    cannotOpenDoc: "Cannot open .doc files",
    legacyDocHint:
      "Word 97-2003 files use a binary format that browsers cannot read. Open it in Word or LibreOffice and save as .docx, then try again.",
    unsupportedType: "Unsupported file type",
    unsupportedHint: "Markdown, Excel, CSV, Word, JSON and text files can be opened here.",
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
  },
  ru: {
    viewerTitle: "Просмотр",
    viewerTagline:
      "Открывайте файлы Markdown, Excel, Word, JSON и текст прямо здесь. Всё читается в вашем браузере — файлы никуда не загружаются.",
    dropToOpen: "Отпустите, чтобы открыть",
    dropPrompt: "Перетащите файл сюда или нажмите, чтобы выбрать",
    dropHint: "Markdown, Excel, CSV, Word, JSON и текст · файл можно вставить из буфера",
    fileTooLarge: "Файл слишком большой",
    filesUpTo: "Здесь можно открывать файлы до {limit}.",
    cannotOpenDoc: "Файлы .doc открыть нельзя",
    legacyDocHint:
      "Файлы Word 97-2003 используют бинарный формат, который браузеры не читают. Откройте файл в Word или LibreOffice, сохраните как .docx и попробуйте снова.",
    unsupportedType: "Неподдерживаемый тип файла",
    unsupportedHint: "Здесь можно открывать файлы Markdown, Excel, CSV, Word, JSON и текст.",
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
    "legacy-doc": "Word 97-2003",
    unsupported: "Unsupported",
  },
  ru: {
    markdown: "Markdown",
    sheet: "Таблица",
    docx: "Word",
    text: "Текст",
    json: "JSON",
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
